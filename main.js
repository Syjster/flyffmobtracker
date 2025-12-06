// main.js — BrowserView + classic ROI: Set-at-mouse + mouse-only reshape overlay + Session Logging
const { app, BrowserWindow, BrowserView, ipcMain, screen, shell } = require('electron');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// --- GPT key from env OR Documents/FlyffMobTracker/gpt-config.json ---
const docDir = path.join(os.homedir(), 'Documents', 'FlyffMobTracker');
const GPT_CFG_PATH = path.join(docDir, 'gpt-config.json');
const SESSION_LOG_PATH = path.join(docDir, 'session_log.xlsx');
let cachedGPTKey = null;

// Ensure the Documents/FlyffMobTracker folder exists
try {
  fs.mkdirSync(docDir, { recursive: true });
} catch {}

function getOpenAIKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (cachedGPTKey !== null) return cachedGPTKey;

  try {
    const txt = fs.readFileSync(GPT_CFG_PATH, 'utf8');
    const j = JSON.parse(txt);
    if (j && typeof j.openaiKey === 'string') {
      const trimmed = j.openaiKey.trim();
      if (trimmed) {
        cachedGPTKey = trimmed;
        return cachedGPTKey;
      }
    }
  } catch {}

  return null;
}

// ---------- Excel Session Logging ----------
let XLSX;
try {
  XLSX = require('xlsx');
} catch (e) {
  console.warn('xlsx module not found. Session logging to Excel will be disabled.');
  console.warn('To enable, run: npm install xlsx');
  XLSX = null;
}

function saveSessionToExcel(sessionData) {
  if (!XLSX) {
    console.warn('Cannot save session: xlsx module not available');
    return false;
  }

  try {
    let workbook;
    let worksheet;
    let existingData = [];

    // Try to load existing workbook
    if (fs.existsSync(SESSION_LOG_PATH)) {
      try {
        workbook = XLSX.readFile(SESSION_LOG_PATH);
        worksheet = workbook.Sheets['Sessions'];
        if (worksheet) {
          existingData = XLSX.utils.sheet_to_json(worksheet);
        }
      } catch (e) {
        console.warn('Could not read existing session log, creating new one:', e.message);
        workbook = null;
      }
    }

    // Create new workbook if needed
    if (!workbook) {
      workbook = XLSX.utils.book_new();
    }

    // Add new session data
    const newRow = {
      'Date': sessionData.date,
      'Start Time': sessionData.startTime,
      'End Time': sessionData.endTime,
      'Duration': sessionData.duration,
      'Total Kills': sessionData.kills,
      'Total XP (%)': sessionData.xpSum,
      'XP/Hour (%)': sessionData.xpPerHour,
      'XP/Kill (%)': sessionData.xpPerKill,
      'Level Ups': sessionData.levelUps,
      'Notes': sessionData.notes || ''
    };

    existingData.push(newRow);

    // Create new worksheet with all data
    const newWorksheet = XLSX.utils.json_to_sheet(existingData);

    // Set column widths
    newWorksheet['!cols'] = [
      { wch: 12 },  // Date
      { wch: 10 },  // Start Time
      { wch: 10 },  // End Time
      { wch: 10 },  // Duration
      { wch: 12 },  // Total Kills
      { wch: 14 },  // Total XP
      { wch: 12 },  // XP/Hour
      { wch: 12 },  // XP/Kill
      { wch: 10 },  // Level Ups
      { wch: 40 },  // Notes (wider for XP details)
    ];

    // Remove old sheet if exists and add new one
    if (workbook.Sheets['Sessions']) {
      delete workbook.Sheets['Sessions'];
      const idx = workbook.SheetNames.indexOf('Sessions');
      if (idx > -1) workbook.SheetNames.splice(idx, 1);
    }
    XLSX.utils.book_append_sheet(workbook, newWorksheet, 'Sessions');

    // Save workbook
    XLSX.writeFile(workbook, SESSION_LOG_PATH);
    console.log('Session saved to:', SESSION_LOG_PATH);
    return true;
  } catch (e) {
    console.error('Failed to save session to Excel:', e);
    return false;
  }
}

// IPC handler for saving sessions
ipcMain.handle('session:save', (_event, sessionData) => {
  return saveSessionToExcel(sessionData);
});

// IPC handler to get the log file path
ipcMain.handle('session:get-log-path', () => {
  return SESSION_LOG_PATH;
});

// IPC handler to open the log folder in file explorer
ipcMain.handle('session:open-folder', () => {
  shell.openPath(docDir);
  return true;
});

// IPC handler to reload the game (for Save Prems feature)
ipcMain.handle('game:reload', () => {
  if (gameView && gameView.webContents) {
    gameView.webContents.loadURL('https://universe.flyff.com/play');
    return true;
  }
  return false;
});

// IPC handler to close/stop the game view
ipcMain.handle('game:stop', () => {
  if (gameView && gameView.webContents) {
    gameView.webContents.loadURL('about:blank');
    return true;
  }
  return false;
});

// ---------- Writable cache (avoid Windows 0x5 issues) ----------
const cacheBase = path.join(os.tmpdir(), 'flyffmobtracker-cache');
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

// ---------- Persisted config ----------
const CFG_PATH = path.join(app.getPath('userData'), 'config.json');

let cfg = {
  roi: null,
  settings: {
    xpPerKill: 0.05,
    diffTrigger: 0.065,
    diffCooldown: 800,
    side: 'left',
    sidebarWidth: 320
  }
};

function loadCfg() {
  try {
    const j = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
    if (j && typeof j === 'object') {
      cfg.settings = { ...cfg.settings, ...(j.settings || {}) };
      const r = j.roi;
      cfg.roi = (r && r.width >= 6 && r.height >= 6) ? r : null;
    }
  } catch {}
}

function saveCfg() {
  try {
    fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2));
  } catch {}
}

// ---------- Windows & BrowserView ----------
let win;
let gameView;
let lastGameRect = { x: 0, y: 0, width: 800, height: 600 };

let roiOverlay = null;
let reshapeResolve = null;
let overlayOpen = false;

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 950,
    backgroundColor: '#05050a',
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

  const ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  gameView.webContents.setUserAgent(ua);

  gameView.webContents.loadURL('https://universe.flyff.com/play');
  gameView.setBounds(lastGameRect);
}

// ---------- IPC: config & layout ----------
ipcMain.handle('cfg:get', () => cfg);

ipcMain.handle('cfg:set', (_e, patch) => {
  if (patch && typeof patch === 'object') {
    if (patch.settings && typeof patch.settings === 'object') {
      const s = patch.settings;
      if (typeof s.xpPerKill === 'number' && s.xpPerKill >= 0)
        cfg.settings.xpPerKill = s.xpPerKill;

      if (typeof s.diffTrigger === 'number' && s.diffTrigger > 0 && s.diffTrigger < 1)
        cfg.settings.diffTrigger = s.diffTrigger;

      if (typeof s.diffCooldown === 'number' && s.diffCooldown >= 0)
        cfg.settings.diffCooldown = Math.round(s.diffCooldown);

      if (s.side === 'left' || s.side === 'right')
        cfg.settings.side = s.side;

      if (typeof s.sidebarWidth === 'number') {
        const w = Math.max(260, Math.min(800, Math.round(s.sidebarWidth)));
        cfg.settings.sidebarWidth = w;
      }
    }

    if (patch.roi === null) {
      cfg.roi = null;
    } else if (patch.roi && patch.roi.width >= 6 && patch.roi.height >= 6) {
      cfg.roi = patch.roi;
    }

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
  } catch (e) {
    console.error('capture-roi failed:', e);
    return null;
  }
});

ipcMain.handle('game:get-cursor-in-game', () => {
  if (!win) return null;

  const mouse   = screen.getCursorScreenPoint();
  const content = win.getContentBounds();

  const x = mouse.x - content.x - lastGameRect.x;
  const y = mouse.y - content.y - lastGameRect.y;

  if (x < 0 || y < 0 || x >= lastGameRect.width || y >= lastGameRect.height)
    return null;

  return { x: Math.round(x), y: Math.round(y) };
});

// ---------- ROI reshape overlay ----------
function finalizeReshape(rect) {
  if (roiOverlay) {
    try { roiOverlay.close(); } catch {}
    roiOverlay = null;
  }
  overlayOpen = false;

  let out = null;
  if (rect && rect.width >= 6 && rect.height >= 6) {
    cfg.roi = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
    saveCfg();
    out = cfg.roi;
  }

  if (reshapeResolve) {
    try { reshapeResolve(out); } catch {}
    reshapeResolve = null;
  }

  return out;
}

ipcMain.handle('roi:reshape:is-open', () => overlayOpen);

ipcMain.handle('roi:open-reshape', () => {
  if (!win || !gameView) return false;

  if (roiOverlay) {
    try { roiOverlay.close(); } catch {}
    roiOverlay = null;
  }

  const contentBounds = win.getContentBounds();
  const overlayBounds = {
    x: contentBounds.x + Math.floor(lastGameRect.x),
    y: contentBounds.y + Math.floor(lastGameRect.y),
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
    width: overlayBounds.width,
    height: overlayBounds.height,
    x: overlayBounds.x,
    y: overlayBounds.y,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    }
  });

  const r = (cfg.roi && cfg.roi.width >= 6 && cfg.roi.height >= 6)
    ? cfg.roi
    : {
        x: 40,
        y: 40,
        width: Math.max(60, Math.floor(overlayBounds.width * 0.25)),
        height: 40
      };

  const html = `
    <!doctype html><html><head><meta charset="utf-8">
    <style>
      html,body{margin:0;height:100%;background:rgba(0,0,0,0.06)}
      .frame{position:absolute;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;
             outline:2px dashed #ffde00; box-shadow:0 0 0 9999px rgba(0,0,0,0.12) inset;}
      .handle{position:absolute;width:10px;height:10px;background:#ffde00;border:1px solid #000;box-sizing:border-box}
      .h-nw{left:-6px;top:-6px;cursor:nwse-resize}.h-ne{right:-6px;top:-6px;cursor:nesw-resize}
      .h-sw{left:-6px;bottom:-6px;cursor:nesw-resize}.h-se{right:-6px;bottom:-6px;cursor:nwse-resize}
      .drag{position:absolute;left:0;top:0;right:0;bottom:0;cursor:move}
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
      <div class="frame" id="frame">
        <div class="drag" id="dragArea"></div>
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
        const frame = document.getElementById('frame');
        const hud   = document.getElementById('hud');
        let box = { x:${r.x}, y:${r.y}, w:${r.width}, h:${r.height} };
        const minW=16, minH=12;

        window.__getBox = () => ({ x:box.x, y:box.y, width:box.w, height:box.h });

        function render(){
          frame.style.left=box.x+'px';
          frame.style.top=box.y+'px';
          frame.style.width=box.w+'px';
          frame.style.height=box.h+'px';
          hud.textContent = 'ROI: x=' + box.x + ' y=' + box.y + ' w=' + box.w + ' h=' + box.h;
        }
        function clamp(){
          const W=window.innerWidth, H=window.innerHeight;
          if(box.w<minW) box.w=minW;
          if(box.h<minH) box.h=minH;
          if(box.x<0) box.x=0;
          if(box.y<0) box.y=0;
          if(box.x+box.w>W) box.x=Math.max(0,W-box.w);
          if(box.y+box.h>H) box.y=Math.max(0,H-box.h);
        }
        function beginDrag(type, ev0){
          ev0.preventDefault();
          const start={ mx:ev0.clientX, my:ev0.clientY, ...box };
          const move=(ev)=>{
            const dx=ev.clientX-start.mx;
            const dy=ev.clientY-start.my;
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

        document.getElementById('dragArea')
          .addEventListener('mousedown', e => beginDrag('move', e));

        document.querySelectorAll('.handle')
          .forEach(h => h.addEventListener('mousedown',
            e => beginDrag(e.target.dataset.h, e)));

        document.querySelectorAll('.edge')
          .forEach(h => h.addEventListener('mousedown',
            e => beginDrag('edge-' + e.target.dataset.edge, e)));

        document.getElementById('applyBtn').onclick  =
          () => ipcRenderer.invoke('roi:reshape:return', window.__getBox());
        document.getElementById('cancelBtn').onclick =
          () => ipcRenderer.invoke('roi:reshape:return', null);

        render();
      </script>
    </body></html>
  `;

  roiOverlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  roiOverlay.once('ready-to-show', () => {
    roiOverlay.setIgnoreMouseEvents(false);
    roiOverlay.showInactive();
  });

  roiOverlay.on('closed', () => {
    roiOverlay = null;
    overlayOpen = false;
  });

  overlayOpen = true;

  return new Promise((resolve) => {
    reshapeResolve = resolve;
  });
});

ipcMain.handle('roi:reshape:return', (_e, rect) => finalizeReshape(rect));

ipcMain.handle('roi:reshape:force-apply', async () => {
  if (!roiOverlay) return finalizeReshape(null);
  try {
    const rect = await roiOverlay.webContents
      .executeJavaScript('window.__getBox && window.__getBox()', true);
    return finalizeReshape(rect);
  } catch {
    return finalizeReshape(null);
  }
});

ipcMain.handle('roi:reshape:force-cancel', async () => finalizeReshape(null));

// ---------- GPT XP OCR ----------
ipcMain.handle('gpt:read-xp', async (_event, dataUrl) => {
  try {
    const apiKey = getOpenAIKey();
    if (!apiKey) {
      console.error('OPENAI_API_KEY / gpt-config.json is not set.');
      return null;
    }

    if (!dataUrl || typeof dataUrl !== 'string') {
      console.error('gpt:read-xp called without dataUrl');
      return null;
    }

    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;

    const body = {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an OCR helper for a game XP bar. ' +
            'You ONLY output the numeric XP percentage between 0 and 100 with 4 decimals, no percent sign, no extra text.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Read the white XP percentage text (e.g. "54.4444%") in this image. ' +
                'Return only a number like 54.4444 (no %). If you truly cannot read it, answer -1.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64}`
              }
            }
          ]
        }
      ],
      max_tokens: 20,
      temperature: 0
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      console.error('OpenAI HTTP error', res.status, await res.text());
      return null;
    }

    const json = await res.json();
    const text = (json.choices?.[0]?.message?.content || '').trim();
    if (!text) {
      console.error('OpenAI returned empty message');
      return null;
    }

    const match = text.match(/-?\d+(?:[\.,]\d+)?/);
    if (!match) {
      console.error('Could not parse number from GPT reply:', text);
      return null;
    }

    const value = Number(match[0].replace(',', '.'));
    if (!Number.isFinite(value)) {
      console.error('Parsed value is not finite:', match[0]);
      return null;
    }

    if (value < 0 || value > 100) {
      console.error('Value outside 0–100 range:', value);
      return null;
    }

    return value;
  } catch (err) {
    console.error('gpt:read-xp failed:', err);
    return null;
  }
});

// ---------- App lifecycle ----------
app.whenReady().then(() => {
  loadCfg();
  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});