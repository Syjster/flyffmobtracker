const A = window.electronAPI;

const divider = document.getElementById('divider');
const contentEl = document.getElementById('content');

const captureBtn      = document.getElementById('setRoiAtMouseBtn');
const fineTuneBtn     = document.getElementById('reshapeBtn');
const finishFineBtn   = document.getElementById('finishReshapeBtn');
const startBtn        = document.getElementById('startBtn');
const stopBtn         = document.getElementById('stopBtn');
const resetBtn        = document.getElementById('resetBtn');
const debugChk        = document.getElementById('debugChk');

const xpPerKillInput   = document.getElementById('xpPerKill');
const diffTriggerInput = document.getElementById('diffTrigger');
const diffCooldownInput= document.getElementById('diffCooldown');

const elElapsed = document.getElementById('elapsed');
const elKills   = document.getElementById('kills');
const elXp      = document.getElementById('xp');
const elXphr    = document.getElementById('xphr');
const elMobsHr  = document.getElementById('mobsHr');

const rawC   = document.getElementById('rawC');
const miniC  = document.getElementById('miniC');
const diffC  = document.getElementById('diffC');
const debugRow = document.getElementById('debugRow');

const num = (v, def = 0) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : def; };
function fmtDuration(ms){ const s = Math.max(0, Math.floor((ms||0)/1000)); const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60; return [h,m,ss].map(x=>String(x).padStart(2,'0')).join(':'); }
function setSidebarWidth(px){ const clamped = Math.max(260, Math.min(800, Math.round(px))); document.documentElement.style.setProperty('--sidebar-w', clamped + 'px'); }
function fitGameToContent(){ const r = contentEl.getBoundingClientRect(); A.setGameRect({ x:Math.round(r.left), y:Math.round(r.top), width:Math.round(r.width), height:Math.round(r.height) }); }

let running=false, roiReady=false, loopId=null, clockId=null;
let kills=0, xpSum=0;
let xpPerKill=0.05, DIFF_TRIGGER=0.065, DIFF_COOLDOWN_MS=800;
let prevMini=null, lastChangeAt=0;
let activeMsBase=0, sessionStartedAt=null;
let roi=null;
const DIFF_W=96, DIFF_H=22;

(async () => {
  const cfg = await A.getCfg();
  xpPerKill       = num(cfg.settings?.xpPerKill ?? 0.05, 0.05);
  DIFF_TRIGGER    = num(cfg.settings?.diffTrigger ?? 0.065, 0.065);
  DIFF_COOLDOWN_MS= Math.round(num(cfg.settings?.diffCooldown ?? 800, 800));
  const sbw       = Number(cfg.settings?.sidebarWidth ?? 380);
  setSidebarWidth(sbw);

  xpPerKillInput.value = xpPerKill.toFixed(4);
  diffTriggerInput.value = DIFF_TRIGGER.toFixed(3);
  diffCooldownInput.value= String(DIFF_COOLDOWN_MS);

  roi = cfg.roi || null;
  roiReady = !!roi;

  requestAnimationFrame(fitGameToContent);
  await syncOverlayUI();

  if (roi) { debugChk.checked = true; await previewOnce(); }
})();

let dragging=false, startX=0, startW=0;
divider.addEventListener('mousedown', (e)=>{ dragging=true; startX=e.clientX; const sb=getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim(); startW=parseInt(sb.replace('px','')||'380',10); document.body.style.userSelect='none'; e.preventDefault(); });
window.addEventListener('mousemove', (e)=>{ if(!dragging) return; const delta = (e.clientX-startX); setSidebarWidth(startW+delta); fitGameToContent(); });
window.addEventListener('mouseup', async ()=>{ if(!dragging) return; dragging=false; document.body.style.userSelect=''; const sb=getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim(); const px=parseInt(sb.replace('px','')||'380',10); await A.setCfg({ settings:{ sidebarWidth:px } }); fitGameToContent(); });

xpPerKillInput.onchange = async ()=>{ const v=num(xpPerKillInput.value,xpPerKill); if(v>=0) xpPerKill=v; await A.setCfg({settings:{xpPerKill}}); xpSum=kills*xpPerKill; elXp.textContent=`${xpSum.toFixed(4)}%`; refreshRates(); };
diffTriggerInput.onchange = async ()=>{ const v=num(diffTriggerInput.value,DIFF_TRIGGER); if(v>0&&v<1) DIFF_TRIGGER=v; await A.setCfg({settings:{diffTrigger:DIFF_TRIGGER}}); };
diffCooldownInput.onchange = async ()=>{ const v=Math.round(num(diffCooldownInput.value,DIFF_COOLDOWN_MS)); if(v>=0) DIFF_COOLDOWN_MS=v; await A.setCfg({settings:{diffCooldown:DIFF_COOLDOWN_MS}}); };

debugChk.onchange = async ()=>{ debugRow.classList.toggle('hidden', !debugChk.checked); if (debugChk.checked && roi) await previewOnce(); };

startBtn.onclick = async ()=>{ if(!roiReady){ alert('Capture/Fine-tune the XP bar first.'); return; } running=true; startBtn.disabled=true; if(sessionStartedAt==null) sessionStartedAt=Date.now(); if(!clockId) clockId=setInterval(refreshRates,250); if(!loopId) loopId=setInterval(runDiff,180); };
stopBtn.onclick  = ()=>{ running=false; if(sessionStartedAt!=null){ activeMsBase+=(Date.now()-sessionStartedAt); sessionStartedAt=null; } clearInterval(loopId); loopId=null; clearInterval(clockId); clockId=null; prevMini=null; startBtn.disabled=false; refreshRates(); };
resetBtn.onclick = ()=>{ kills=0; xpSum=0; activeMsBase=0; sessionStartedAt=running?Date.now():null; prevMini=null; lastChangeAt=0; elKills.textContent='0'; elXp.textContent='0.0000%'; elXphr.textContent='0.0000%'; elMobsHr.textContent='0.0 mobs/hr'; elElapsed.textContent='00:00:00'; };

captureBtn.onclick = async () => {
  captureBtn.disabled = true;
  const old = captureBtn.textContent;
  try{
    for(let i=3;i>0;i--){ captureBtn.textContent=`Hover on XP % — capturing in ${i}…`; await new Promise(r=>setTimeout(r,1000)); }
    const p = await A.getCursorInGame();
    if(!p){ alert('Mouse wasn’t detected over the game area. Keep it over the XP digits while the countdown runs.'); return; }
    const r = contentEl.getBoundingClientRect();
    const W = Math.max(180, Math.floor(r.width * 0.22));
    const H = Math.max(36,  Math.floor(r.height * 0.06));
    const x = Math.max(0, Math.min(r.width  - W, p.x - Math.floor(W/2)));
    const y = Math.max(0, Math.min(r.height - H, p.y - Math.floor(H/2)));
    await applyROI({ x:Math.round(x), y:Math.round(y), width:Math.round(W), height:Math.round(H) });
    debugChk.checked=true; await previewOnce();
  } finally { captureBtn.textContent = old; captureBtn.disabled=false; }
};

async function syncOverlayUI(){
  const open = await A.isReshapeOpen().catch(()=>false);
  finishFineBtn.setAttribute('data-hidden', open ? 'false' : 'true');
  fineTuneBtn.textContent = open ? 'Fine-tuning… (use Finish below)' : 'Fine-Tune Capture';
}

fineTuneBtn.onclick = async () => {
  const open = await A.isReshapeOpen().catch(()=>false);
  if (!open) {
    await syncOverlayUI();
    fineTuneBtn.disabled = true;
    try {
      await A.openReshapeOverlay(); 
      const cfgNow = await A.getCfg();
      roi = cfgNow.roi || null; roiReady = !!roi;
      if (roi) { if(!debugChk.checked) debugChk.checked = true; await previewOnce(); }
    } finally {
      fineTuneBtn.disabled = false;
      await syncOverlayUI();
    }
  } else {
    finishFineBtn.click();
  }
};

finishFineBtn.onclick = async () => {
  finishFineBtn.disabled = true;
  try {
    const newRoi = await A.forceApplyReshape();
    if (newRoi) { roi = newRoi; roiReady = true; if(!debugChk.checked) debugChk.checked = true; await previewOnce(); }
  } finally {
    finishFineBtn.disabled = false;
    await syncOverlayUI();
  }
};

window.addEventListener('resize', () => { fitGameToContent(); });

async function applyROI(newROI){ roi=newROI; roiReady=!!roi; await A.setCfg({ roi }); }
function refreshRates(){
  const now = Date.now();
  const elapsed = activeMsBase + (running && sessionStartedAt ? now - sessionStartedAt : 0);
  elElapsed.textContent = fmtDuration(elapsed);
  const hours = elapsed/3600000 || 0;
  elMobsHr.textContent = `${(hours>0 ? kills/hours : 0).toFixed(1)} mobs/hr`;
  elXphr.textContent   = `${(hours>0 ? xpSum/hours : 0).toFixed(4)}%`;
}

async function previewOnce(){
  if(!roi) return;
  const dataURL = await A.captureROIFromGame(); if(!dataURL) return;
  const img = new Image(); await new Promise(res=>{ img.onload=img.onerror=res; img.src=dataURL; });
  const grab = document.createElement('canvas'); grab.width=img.naturalWidth; grab.height=img.naturalHeight;
  const gctx = grab.getContext('2d',{willReadFrequently:true}); gctx.drawImage(img,0,0);
  const src = gctx.getImageData(0,0,grab.width,grab.height);
  rawC.width=grab.width; rawC.height=grab.height; rawC.getContext('2d').putImageData(src,0,0);
  const mini = toMini(src, DIFF_W, DIFF_H); renderMini(mini); renderDiff(null);
  debugRow.classList.remove('hidden');
}

async function runDiff(){
  if(!running || !roi) return;
  const dataURL = await A.captureROIFromGame(); if(!dataURL) return;
  const img=new Image(); await new Promise(res=>{ img.onload=img.onerror=res; img.src=dataURL; });
  const grab=document.createElement('canvas'); grab.width=img.naturalWidth; grab.height=img.naturalHeight;
  const gctx=grab.getContext('2d',{willReadFrequently:true}); gctx.drawImage(img,0,0);
  const src=gctx.getImageData(0,0,grab.width,grab.height);

  if(debugChk.checked){ rawC.width=grab.width; rawC.height=grab.height; rawC.getContext('2d').putImageData(src,0,0); }

  const mini = toMini(src, DIFF_W, DIFF_H);
  if(prevMini){
    let diff=0; const heat=new Uint8ClampedArray(mini.length);
    for(let i=0;i<mini.length;i++){ const d=Math.abs(mini[i]-prevMini[i]); diff+=d; heat[i]=d; }
    const norm = diff/(mini.length*255);
    if(norm>DIFF_TRIGGER && (performance.now()-lastChangeAt)>DIFF_COOLDOWN_MS){
      lastChangeAt=performance.now(); kills+=1; xpSum=kills*xpPerKill;
      elKills.textContent=String(kills); elXp.textContent=`${xpSum.toFixed(4)}%`;
    }
    if(debugChk.checked){ renderMini(mini); renderDiff(heat); }
  } else if(debugChk.checked){ renderMini(mini); renderDiff(null); }

  prevMini=mini; refreshRates();
}

function toMini(imgData, W, H){
  const mini=new Uint8Array(W*H), w=imgData.width,h=imgData.height,d=imgData.data, sx=w/W, sy=h/H;
  for(let y=0;y<H;y++){ for(let x=0;x<W;x++){
    const ix=Math.min(w-1,Math.floor((x+0.5)*sx)), iy=Math.min(h-1,Math.floor((y+0.5)*sy)), p=(iy*w+ix)*4;
    const r=d[p], g=d[p+1], b=d[p+2]; mini[y*W+x]=(r*0.299+g*0.587+b*0.114)|0;
  }} return mini;
}
function renderMini(mini){
  miniC.width=DIFF_W; miniC.height=DIFF_H; const ctx=miniC.getContext('2d'); const img=ctx.createImageData(DIFF_W,DIFF_H);
  for(let i=0,p=0;i<mini.length;i++,p+=4){ const v=mini[i]; img.data[p]=img.data[p+1]=img.data[p+2]=v; img.data[p+3]=255; }
  ctx.putImageData(img,0,0);
}
function renderDiff(heat){
  const W=DIFF_W,H=DIFF_H; diffC.width=W; diffC.height=H; const ctx=diffC.getContext('2d'); const img=ctx.createImageData(W,H);
  for(let i=0,p=0;i<W*H;i++,p+=4){ const v = heat ? Math.min(255, heat[i]*2) : 0; img.data[p]=img.data[p+1]=img.data[p+2]=v; img.data[p+3]=255; }
  ctx.putImageData(img,0,0);
}
