// renderer.js – Flyff Mob Tracker (slim sidebar + pixel diff + GPT calibration)
// Updated to use: getCursorInGame + external reshape overlay (no in-HTML ROI overlay)

const A = window.electronAPI;

// ---- DOM ----
const sidebar = document.getElementById("sidebar");
const gameContainer = document.getElementById("gameContainer");

const captureBtn = document.getElementById("captureBtn");
const fineTuneBtn = document.getElementById("fineTuneBtn");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const resetBtn = document.getElementById("resetBtn");

const xpPerKillInput = document.getElementById("xpPerKill");
const diffTriggerInput = document.getElementById("diffTrigger");
const diffCooldownInput = document.getElementById("diffCooldown");
const calibKillsInput = document.getElementById("calibKills");
const calibBtn = document.getElementById("calibBtn");

const elapsedEl = document.getElementById("elapsed");
const killsEl = document.getElementById("kills");
const xpEl = document.getElementById("xp");
const xphrEl = document.getElementById("xphr");
const gptXpEl = document.getElementById("gptXp");
const mobsToLevelEl = document.getElementById("mobsToLevel");

const debugChk = document.getElementById("debugChk");
const rawC = document.getElementById("rawC");
const miniC = document.getElementById("miniC");
const diffC = document.getElementById("diffC");

// ---- Helpers ----
function num(v, def = 0) {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : def;
}

function fmtDuration(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [h, m, ss].map(x => String(x).padStart(2, "0")).join(":");
}

function btnFlash(btn) {
  if (!btn) return;
  btn.classList.add("btn-flash");
  setTimeout(() => btn.classList.remove("btn-flash"), 120);
}

function loadImage(url) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

// ---- State ----
let roi = null; // {x,y,width,height} in game BrowserView coords
let xpPerKill = 0.05;
let diffTrigger = 0.065;
let diffCooldown = 800;

let kills = 0;
let xpSum = 0; // accumulated XP this session (never recomputed)
let running = false;

let prevMini = null;
let lastChangeAt = 0;
let loopId = null;
let clockId = null;

let activeMsBase = 0;
let sessionStartedAt = null;

const DIFF_W = 96;
const DIFF_H = 22;

// GPT calibration state
let calibActive = false;
let calibStartKills = 0;
let calibTargetKills = 0;
let calibStartXp = null;
let lastXpFromGPT = null;

// ---- Init ----
(async () => {
  const cfg = await A.getCfg();
  roi = cfg.roi || null;

  xpPerKill = num(cfg.settings?.xpPerKill ?? 0.05, 0.05);
  diffTrigger = num(cfg.settings?.diffTrigger ?? 0.065, 0.065);
  diffCooldown = Math.round(num(cfg.settings?.diffCooldown ?? 800, 800));

  xpPerKillInput.value = xpPerKill.toFixed(4);
  diffTriggerInput.value = diffTrigger.toFixed(3);
  diffCooldownInput.value = String(diffCooldown);

  // Fit game view once UI is ready
  setTimeout(fitGameToContent, 150);

  // If we already have an ROI from previous runs, show preview
  if (roi) {
    debugChk.checked = true;
    await previewOnce();
  }
})();

// ---- Game BrowserView sizing ----
function fitGameToContent() {
  const rect = gameContainer.getBoundingClientRect();
  A.setGameRect({
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  });
}

window.addEventListener("resize", () => {
  fitGameToContent();
});

// ---- Inputs ----
xpPerKillInput.addEventListener("change", async () => {
  const v = num(xpPerKillInput.value, xpPerKill);
  if (v >= 0) xpPerKill = v;
  xpPerKillInput.value = xpPerKill.toFixed(4);
  await A.setCfg({ settings: { xpPerKill } });
  xpEl.textContent = xpSum.toFixed(4) + "%";
  updateMobsToLevel();
});

diffTriggerInput.addEventListener("change", async () => {
  const v = num(diffTriggerInput.value, diffTrigger);
  if (v > 0 && v < 1) diffTrigger = v;
  diffTriggerInput.value = diffTrigger.toFixed(3);
  await A.setCfg({ settings: { diffTrigger } });
});

diffCooldownInput.addEventListener("change", async () => {
  const v = Math.round(num(diffCooldownInput.value, diffCooldown));
  if (v >= 0) diffCooldown = v;
  diffCooldownInput.value = String(diffCooldown);
  await A.setCfg({ settings: { diffCooldown } });
});

// ---- Debug toggle ----
debugChk.addEventListener("change", () => {
  const on = debugChk.checked;
  rawC.style.display = on ? "block" : "none";
  miniC.style.display = on ? "block" : "none";
  diffC.style.display = on ? "block" : "none";
});

// ---- Stats refresh ----
function refreshStats() {
  const now = Date.now();
  const elapsed =
    activeMsBase + (running && sessionStartedAt ? now - sessionStartedAt : 0);

  elapsedEl.textContent = fmtDuration(elapsed);

  const hours = elapsed / 3600000 || 0;
  const xpHr = hours > 0 ? xpSum / hours : 0;
  const mobsHr = hours > 0 ? kills / hours : 0;

  xphrEl.textContent = xpHr.toFixed(4) + "%";
  killsEl.textContent = String(kills);
  xpEl.textContent = xpSum.toFixed(4) + "%";
}

// ---- Kill registration ----
function registerKill() {
  kills += 1;
  xpSum += xpPerKill;

  refreshStats();
  updateMobsToLevel();

  if (calibActive && kills >= calibTargetKills) {
    finishCalibrationWithGPT().catch(console.error);
  }
}

// ---- Capture + diff ----
async function previewOnce() {
  if (!roi) return;
  const dataURL = await A.captureROIFromGame(); // uses cfg.roi in main
  if (!dataURL) return;

  const img = await loadImage(dataURL);
  if (!img) return;

  const grab = document.createElement("canvas");
  grab.width = img.naturalWidth;
  grab.height = img.naturalHeight;
  const gctx = grab.getContext("2d", { willReadFrequently: true });
  gctx.drawImage(img, 0, 0);

  rawC.width = grab.width;
  rawC.height = grab.height;
  rawC.getContext("2d").drawImage(grab, 0, 0);

  const src = gctx.getImageData(0, 0, grab.width, grab.height);
  const mini = toMini(src, DIFF_W, DIFF_H);
  renderMini(mini);
  renderDiff(null);
}

async function runDiff() {
  if (!running || !roi) return;
  const dataURL = await A.captureROIFromGame();
  if (!dataURL) return;

  const img = await loadImage(dataURL);
  if (!img) return;

  const grab = document.createElement("canvas");
  grab.width = img.naturalWidth;
  grab.height = img.naturalHeight;
  const gctx = grab.getContext("2d", { willReadFrequently: true });
  gctx.drawImage(img, 0, 0);

  const src = gctx.getImageData(0, 0, grab.width, grab.height);

  if (debugChk.checked) {
    rawC.width = grab.width;
    rawC.height = grab.height;
    rawC.getContext("2d").putImageData(src, 0, 0);
  }

  const mini = toMini(src, DIFF_W, DIFF_H);

  if (prevMini) {
    let diff = 0;
    const heat = new Uint8ClampedArray(mini.length);
    for (let i = 0; i < mini.length; i++) {
      const d = Math.abs(mini[i] - prevMini[i]);
      diff += d;
      heat[i] = d;
    }
    const norm = diff / (mini.length * 255);

    const now = performance.now();
    if (norm > diffTrigger && now - lastChangeAt > diffCooldown) {
      lastChangeAt = now;
      registerKill();
    }

    if (debugChk.checked) {
      renderMini(mini);
      renderDiff(heat);
    }
  } else if (debugChk.checked) {
    renderMini(mini);
    renderDiff(null);
  }

  prevMini = mini;
  refreshStats();
}

// ---- Downscale to mini plane ----
function toMini(imgData, W, H) {
  const out = new Uint8Array(W * H);
  const w = imgData.width, h = imgData.height, d = imgData.data;
  const sx = w / W, sy = h / H;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ix = Math.min(w - 1, Math.floor((x + 0.5) * sx));
      const iy = Math.min(h - 1, Math.floor((y + 0.5) * sy));
      const p = (iy * w + ix) * 4;
      const r = d[p], g = d[p+1], b = d[p+2];
      out[y * W + x] = (r*0.299 + g*0.587 + b*0.114) | 0;
    }
  }
  return out;
}

function renderMini(mini) {
  miniC.width = DIFF_W;
  miniC.height = DIFF_H;
  const ctx = miniC.getContext("2d");
  const img = ctx.createImageData(DIFF_W, DIFF_H);
  for (let i = 0, p = 0; i < mini.length; i++, p += 4) {
    const v = mini[i];
    img.data[p] = img.data[p+1] = img.data[p+2] = v;
    img.data[p+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function renderDiff(heat) {
  diffC.width = DIFF_W;
  diffC.height = DIFF_H;
  const ctx = diffC.getContext("2d");
  const img = ctx.createImageData(DIFF_W, DIFF_H);
  for (let i = 0, p = 0; i < DIFF_W * DIFF_H; i++, p += 4) {
    const v = heat ? Math.min(255, heat[i] * 2) : 0;
    img.data[p] = img.data[p+1] = img.data[p+2] = v;
    img.data[p+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// ---- Start / Stop / Reset ----
startBtn.addEventListener("click", () => {
  if (!roi) {
    alert("Please capture and fine-tune the XP bar first.");
    return;
  }
  btnFlash(startBtn);
  running = true;
  if (sessionStartedAt == null) sessionStartedAt = Date.now();

  if (!loopId) loopId = setInterval(runDiff, 180);
  if (!clockId) clockId = setInterval(refreshStats, 250);
});

stopBtn.addEventListener("click", () => {
  btnFlash(stopBtn);
  running = false;
  if (sessionStartedAt != null) {
    activeMsBase += Date.now() - sessionStartedAt;
    sessionStartedAt = null;
  }
  clearInterval(loopId);
  loopId = null;
  clearInterval(clockId);
  clockId = null;
});

resetBtn.addEventListener("click", () => {
  btnFlash(resetBtn);
  running = false;
  kills = 0;
  xpSum = 0;
  activeMsBase = 0;
  sessionStartedAt = null;
  prevMini = null;
  lastChangeAt = 0;
  calibActive = false;
  calibStartXp = null;
  calibTargetKills = 0;
  lastXpFromGPT = null;
  refreshStats();
  gptXpEl.textContent = "--.--%";
  mobsToLevelEl.textContent = "--";
});

// ---- ROI capture / fine-tune (NEW) ----

// Hover mouse over XP % digits, 3-second countdown, then auto-ROI
captureBtn.addEventListener("click", async () => {
  btnFlash(captureBtn);
  await captureAtMouse();
});

fineTuneBtn.addEventListener("click", async () => {
  btnFlash(fineTuneBtn);
  await fineTuneROI();
});

async function captureAtMouse() {
  const original = captureBtn.textContent;
  captureBtn.disabled = true;

  try {
    // 3-second countdown so you can hover exactly over XP text
    for (let i = 3; i > 0; i--) {
      captureBtn.textContent = `Hover XP % — capturing in ${i}…`;
      await new Promise(r => setTimeout(r, 1000));
    }

    const p = await A.getCursorInGame();
    if (!p) {
      alert("Mouse wasn’t detected over the game. Keep it over the XP digits while the countdown runs.");
      return;
    }

    // Define a reasonable ROI box around the mouse position.
    // Width/height tuned for Flyff XP digits.
    const W = 220; // px inside game
    const H = 40;

    const x = Math.max(0, Math.round(p.x - W / 2));
    const y = Math.max(0, Math.round(p.y - H / 2));

    roi = { x, y, width: W, height: H };
    await A.setCfg({ roi });

    // Show preview & enable debug
    debugChk.checked = true;
    await previewOnce();
  } finally {
    captureBtn.textContent = original;
    captureBtn.disabled = false;
  }
}

// Open external yellow-box overlay for fine-tuning
async function fineTuneROI() {
  // Open overlay; resolves when user hits Apply/Cancel there
  await A.openReshapeOverlay();

  // Read whatever ROI main.js saved
  const cfg = await A.getCfg();
  roi = cfg.roi || null;

  if (roi) {
    debugChk.checked = true;
    await previewOnce();
  }
}

// ---- GPT Calibration ----
calibBtn.addEventListener("click", async () => {
  btnFlash(calibBtn);
  if (!roi) {
    alert("Fine-tune the XP digits area first.");
    return;
  }

  const n = Math.max(1, Math.min(20, parseInt(calibKillsInput.value || "3", 10)));
  calibKillsInput.value = String(n);

  const xpStart = await readXpWithGPT();
  if (xpStart == null) {
    alert("GPT could not read XP to start calibration.");
    return;
  }

  calibActive = true;
  calibStartKills = kills;
  calibTargetKills = kills + n;
  calibStartXp = xpStart;
  lastXpFromGPT = xpStart;

  gptXpEl.textContent = xpStart.toFixed(4) + "%";
});

async function finishCalibrationWithGPT() {
  calibActive = false;

  const xpEnd = await readXpWithGPT();
  if (xpEnd == null) {
    alert("GPT failed to read XP at end of calibration.");
    return;
  }

  lastXpFromGPT = xpEnd;
  gptXpEl.textContent = xpEnd.toFixed(4) + "%";

  const dKills = kills - calibStartKills;
  const dXp = xpEnd - calibStartXp;

  if (dKills <= 0 || dXp <= 0) {
    alert("Calibration failed (no XP progress detected).");
    return;
  }

  xpPerKill = dXp / dKills;
  xpPerKillInput.value = xpPerKill.toFixed(4);
  await A.setCfg({ settings: { xpPerKill } });

  updateMobsToLevel();
}

async function readXpWithGPT() {
  if (!roi) return null;
  const dataUrl = await A.captureROIFromGame();
  if (!dataUrl) return null;
  try {
    const xp = await A.readXpWithGPT(dataUrl); // bridge via preload/main
    if (!Number.isFinite(xp)) return null;
    return xp;
  } catch (err) {
    console.error("readXpWithGPT error:", err);
    return null;
  }
}

// ---- Mobs to Level ----
function updateMobsToLevel() {
  if (lastXpFromGPT == null || xpPerKill <= 0) {
    mobsToLevelEl.textContent = "--";
    return;
  }
  const remaining = Math.max(0, 100 - lastXpFromGPT);
  const mobs = remaining / xpPerKill;
  mobsToLevelEl.textContent = Number.isFinite(mobs) ? mobs.toFixed(0) : "--";
}
