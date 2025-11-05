const { app, BrowserWindow, BrowserView, ipcMain, screen } = require('electron');
const path = require('path');
const os   = require('os');
const fs   = require('fs');

const cacheBase = path.join(os.tmpdir(), 'mobxp-onewindow');
try { fs.mkdirSync(cacheBase, { recursive: true }); } catch {}
app.setPath('userData', path.join(cacheBase, 'userData'));
app.setPath('cache',    path.join(cacheBase, 'Cache'));

app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disk-cache-dir', path.join(cacheBase, 'NetCache'));
app.commandLine.appendSwitch('disk-cache-size', '1');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('gpu-program-cache-size', '1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('use-angle', 'd3d11');
app.commandLine.appendSwitch('enable-zero-copy');

const CFG_PATH = path.join(app.getPath('userData'), 'config.json');
let cfg = {
  roi: null,
  settings: {
    xpPerKill: 0.05,
    diffTrigger: 0.065,
    diffCooldown: 800,
    sidebarWidth: 380
  }
};
function loadCfg(){ try {
  const j = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
  if (j && typeof j === 'object') {
    cfg.settings = { ...cfg.settings, ...(j.settings || {}) };
    const r = j.roi;
    cfg.roi = (r && r.width >= 6 && r.height >= 6) ? r : null;
  }
} catch {} }
function saveCfg(){ try { fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2)); } catch {} }

let win;
let gameView;
let lastGameRect = { x:0, y:0, width: 800, height: 600 };

let roiOverlay = null;
let reshapeResolve = null;
let overlayOpen = false;

function createWindow(){
  win = new BrowserWindow({
    width: 1600,
    height: 950,
    backgroundColor: '#0b0b0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.setMenuBarVisibility(false);
  win.webContents.setIgnoreMenuShortcuts(true);
  win.loadFile('index.html');

  gameView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      javascript: true
    }
  });
  win.setBrowserView(gameView);

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  gameView.webContents.setUserAgent(ua);
  gameView.webContents.loadURL('https://universe.flyff.com/play');

  gameView.setBounds(lastGameRect);
}

ipcMain.handle('cfg:get', () => cfg);
ipcMain.handle('cfg:set', (_e, patch) => {
  if (patch && typeof patch === 'object') {
    if (patch.settings && typeof patch.settings === 'object') {
      const s = patch.settings;
      if (typeof s.xpPerKill   === 'number' && s.xpPerKill   >= 0) cfg.settings.xpPerKill   = s.xpPerKill;
      if (typeof s.diffTrigger === 'number' && s.diffTrigger >  0 && s.diffTrigger < 1) cfg.settings.diffTrigger = s.diffTrigger;
      if (typeof s.diffCooldown=== 'number' && s.diffCooldown>=  0) cfg.settings.diffCooldown= Math.round(s.diffCooldown);
      if (typeof s.sidebarWidth === 'number') {
        const w = Math.max(260, Math.min(800, Math.round(s.sidebarWidth)));
        cfg.settings.sidebarWidth = w;
      }
    }
    if (patch.roi === null) cfg.roi = null;
    else if (patch.roi && patch.roi.width >= 6 && patch.roi.height >= 6) cfg.roi = patch.roi;
    saveCfg();
  }
  return cfg;
});

ipcMain.handle('game:set-rect', (_e, rect) => {
  if (!gameView || !rect) return false;
  try {
    lastGameRect = {
      x: Math.max(0, Math.floor(rect.x)),
      y: Math.max(0, Math.floor(rect.y)),
      width: Math.max(1, Math.floor(rect.width)),
      height: Math.max(1, Math.floor(rect.height))
    };
    gameView.setBounds(lastGameRect);
    return true;
  } catch (e) {
    console.error('game:set-rect failed', e);
    return false;
  }
});

ipcMain.handle('game:capture-roi', async () => {
  if (!gameView || !cfg.roi) return null;
  try {
    const img = await gameView.webContents.capturePage(cfg.roi);
    return img.toDataURL();
  } catch (e) { console.error('capture-roi failed:', e); return null; }
});

ipcMain.handle('game:get-cursor-in-game', () => {
  if (!win) return null;
  const mouse   = screen.getCursorScreenPoint(); 
  const content = win.getContentBounds();
  const x = mouse.x - content.x - lastGameRect.x;
  const y = mouse.y - content.y - lastGameRect.y;
  if (x < 0 || y < 0 || x >= lastGameRect.width || y >= lastGameRect.height) return null;
  return { x: Math.round(x), y: Math.round(y) };
});

function finalizeReshape(rect){
  if (roiOverlay) { try { roiOverlay.close(); } catch {} roiOverlay = null; }
  overlayOpen = false;

  let out = null;
  if (rect && rect.width >= 6 && rect.height >= 6) {
    cfg.roi = { x:Math.round(rect.x), y:Math.round(rect.y), width:Math.round(rect.width), height:Math.round(rect.height) };
    saveCfg();
    out = cfg.roi;
  }
  if (reshapeResolve) { try { reshapeResolve(out); } catch {} reshapeResolve = null; }
  return out;
}

ipcMain.handle('roi:open-reshape', () => {
  if (!win || !gameView) return false;
  if (roiOverlay) { try { roiOverlay.close(); } catch {} roiOverlay = null; }

  const contentScreen = win.getContentBounds();
  const display = screen.getDisplayMatching(win.getBounds());
  const sf = Math.max(1, display.scaleFactor || 1);
  const contentDipX = Math.round(contentScreen.x / sf);
  const contentDipY = Math.round(contentScreen.y / sf);

  const overlayDip = {
    x: contentDipX + Math.floor(lastGameRect.x),
    y: contentDipY + Math.floor(lastGameRect.y),
    width:  Math.floor(lastGameRect.width),
    height: Math.floor(lastGameRect.height)
  };

  roiOverlay = new BrowserWindow({
    parent: win,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    acceptFirstMouse: true,
    x: overlayDip.x,
    y: overlayDip.y,
    width: overlayDip.width,
    height: overlayDip.height,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    }
  });

  const r = (cfg.roi && cfg.roi.width >= 6 && cfg.roi.height >= 6)
    ? cfg.roi
    : { x: 40, y: 40, width: Math.max(60, Math.floor(overlayDip.width * 0.25)), height: 40 };

  const html = `
  <!doctype html><html><head><meta charset="utf-8">
  <style>
    html,body{margin:0;height:100%;background:rgba(0,0,0,0.06)}
    .frame{position:absolute;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;
           outline:2px dashed #ffde00; box-shadow:0 0 0 9999px rgba(0,0,0,0.12) inset;}
    .handle{position:absolute;width:10px;height:10px;background:#ffde00;border:1px solid #000;box-sizing:border-box}
    .h-nw{left:-6px;top:-6px;cursor:nwse-resize}.h-ne{right:-6px;top:-6px;cursor:nesw-resize}
    .h-sw{left:-6px;bottom:-6px;cursor:nesw-resize}.h-se{right:-6px;bottom:-6px;cursor:nwse-resize}
    .e{position:absolute;left:0;top:0;right:0;bottom:0;cursor:move}
    .edge{position:absolute;background:transparent}
    .edge-t{left:8px;right:8px;top:-4px;height:8px;cursor:ns-resize}
    .edge-b{left:8px;right:8px;bottom:-4px;height:8px;cursor:ns-resize}
    .edge-l{top:8px;bottom:8px;left:-4px;width:8px;cursor:ew-resize}
    .edge-r{top:8px;bottom:8px;right:-4px;width:8px;cursor:ew-resize}
    .hud{position:absolute;top:8px;left:8px;background:rgba(0,0,0,.6);color:#fff;font:12px system-ui;padding:6px 8px;border-radius:8px}
    .bar{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);display:flex;gap:8px}
    .btn{background:#ffd800;color:#000;border:none;border-radius:10px;padding:8px 12px;font:12px system-ui;cursor:pointer}
    .btn:hover{filter:brightness(0.95)}
  </style></head><body>
    <div class="hud" id="hud"></div>
    <div class="frame" id="f">
      <div class="e" id="dragArea"></div>
      <div class="edge edge-t" data-edge="t"></div>
      <div class="edge edge-b" data-edge="b"></div>
      <div class="edge edge-l" data-edge="l"></div>
      <div class="edge edge-r" data-edge="r"></div>
      <div class="handle h-nw" data-h="nw"></div>
      <div class="handle h-ne" data-h="ne"></div>
      <div class="handle h-sw" data-h="sw"></div>
      <div class="handle h-se" data-h="se"></div>
    </div>
    <div class="bar">
      <button class="btn" id="applyBtn">Apply</button>
      <button class="btn" id="cancelBtn">Cancel</button>
    </div>
    <script>
      const { ipcRenderer } = require('electron');
      const frame = document.getElementById('f');
      const hud   = document.getElementById('hud');
      let box = { x:${r.x}, y:${r.y}, w:${r.width}, h:${r.height} };
      const minW=16, minH=12;

      // expose for force-apply
      window.__getBox = () => ({ x:box.x, y:box.y, width:box.w, height:box.h });

      function render(){
        frame.style.left=box.x+'px'; frame.style.top=box.y+'px';
        frame.style.width=box.w+'px'; frame.style.height=box.h+'px';
        hud.textContent = 'ROI: x=' + box.x + ' y=' + box.y + ' w=' + box.w + ' h=' + box.h;
      }
      function clamp(){
        const W=window.innerWidth, H=window.innerHeight;
        if(box.w<minW) box.w=minW; if(box.h<minH) box.h=minH;
        if(box.x<0) box.x=0; if(box.y<0) box.y=0;
        if(box.x+box.w>W) box.x=Math.max(0,W-box.w);
        if(box.y+box.h>H) box.y=Math.max(0,H-box.h);
      }
      function beginDrag(type, ev0){
        ev0.preventDefault();
        const start = { mx:ev0.clientX, my:ev0.clientY, ...box };
        const move = (ev)=>{
          const dx=ev.clientX-start.mx, dy=ev.clientY-start.my;
          if(type==='move'){ box.x=start.x+dx; box.y=start.y+dy; }
          else if(type==='edge-t'){ box.y=start.y+dy; box.h=start.h-dy; }
          else if(type==='edge-b'){ box.h=start.h+dy; }
          else if(type==='edge-l'){ box.x=start.x+dx; box.w=start.w-dx; }
          else if(type==='edge-r'){ box.w=start.w+dx; }
          else {
            if(type.includes('n')){ box.y=start.y+dy; box.h=start.h-dy; }
            if(type.includes('s')){ box.h=start.h+dy; }
            if(type.includes('w')){ box.x=start.x+dx; box.w=start.w-dx; }
            if(type.includes('e')){ box.w=start.w+dx; }
          }
          clamp(); render();
        };
        const up=()=>{ window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up); };
        window.addEventListener('mousemove',move);
        window.addEventListener('mouseup',up);
      }
      document.getElementById('dragArea').addEventListener('mousedown', e=>beginDrag('move',e));
      document.querySelectorAll('.handle').forEach(h=>h.addEventListener('mousedown', e=>beginDrag(e.target.dataset.h, e)));
      document.querySelectorAll('.edge').forEach(h=>h.addEventListener('mousedown', e=>beginDrag('edge-'+e.target.dataset.edge, e)));

      document.getElementById('applyBtn').onclick  = () => ipcRenderer.invoke('roi:reshape:return', window.__getBox());
      document.getElementById('cancelBtn').onclick = () => ipcRenderer.invoke('roi:reshape:return', null);
      render();
    </script>
  </body></html>`;
  roiOverlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  roiOverlay.once('ready-to-show', () => {
    roiOverlay.setIgnoreMouseEvents(false);
    roiOverlay.showInactive();
  });
  roiOverlay.on('closed', () => { roiOverlay = null; overlayOpen = false; });

  overlayOpen = true;
  return new Promise((resolve) => { reshapeResolve = resolve; });
});

ipcMain.handle('roi:reshape:return', (_e, rect) => finalizeReshape(rect));
ipcMain.handle('roi:reshape:is-open', () => overlayOpen);

ipcMain.handle('roi:reshape:force-apply', async () => {
  if (!roiOverlay) return finalizeReshape(null);
  try {
    const rect = await roiOverlay.webContents.executeJavaScript('window.__getBox && window.__getBox()', true);
    return finalizeReshape(rect);
  } catch { return finalizeReshape(null); }
});
ipcMain.handle('roi:reshape:force-cancel', async () => finalizeReshape(null));

app.whenReady().then(() => { loadCfg(); createWindow(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
