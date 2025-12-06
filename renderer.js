// renderer.js – Flyff Mob Tracker v2
// Features: Play/Pause toggle, New Mob button, cleaner logs, detailed sanity checks

const A = window.electronAPI;

// ---- Constants ----
const SANITY_CHECK_MINUTES = 5;

// ---- DOM ----
const sidebar = document.getElementById("sidebar");
const gameContainer = document.getElementById("gameContainer");

const playPauseBtn = document.getElementById("playPauseBtn");
const resetBtn = document.getElementById("resetBtn");
const newMobBtn = document.getElementById("newMobBtn");
const savePremsBtn = document.getElementById("savePremsBtn");

const captureBtn = document.getElementById("captureBtn");
const fineTuneBtn = document.getElementById("fineTuneBtn");
const showCaptureChk = document.getElementById("showCaptureChk");

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
const sessionLogEl = document.getElementById("sessionLog");

const debugChk = document.getElementById("debugChk");
const debugContent = document.getElementById("debugContent");
const rawC = document.getElementById("rawC");
const miniC = document.getElementById("miniC");
const diffC = document.getElementById("diffC");
const historyBtn = document.getElementById("historyBtn");

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

function fmtTime(date) {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function fmtDate(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
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

// ---- Session Log (only important events) ----
function addLogEntry(message, type = 'info') {
  if (!sessionLogEl) return;
  
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  
  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = fmtTime(new Date());
  
  const msg = document.createElement('span');
  msg.className = `log-message ${type}`;
  msg.textContent = message;
  
  entry.appendChild(time);
  entry.appendChild(msg);
  
  if (sessionLogEl.firstChild) {
    sessionLogEl.insertBefore(entry, sessionLogEl.firstChild);
  } else {
    sessionLogEl.appendChild(entry);
  }
  
  while (sessionLogEl.children.length > 50) {
    sessionLogEl.removeChild(sessionLogEl.lastChild);
  }
}

function clearLog() {
  if (sessionLogEl) {
    sessionLogEl.innerHTML = '';
  }
}

// ---- State ----
let roi = null;
let xpPerKill = 0.05;
let diffTrigger = 0.065;
let diffCooldown = 800;

let kills = 0;
let xpSum = 0;
let running = false;

let prevMini = null;
let lastChangeAt = 0;
let loopId = null;
let clockId = null;
let sanityCheckInterval = null;

let activeMsBase = 0;
let sessionStartedAt = null;
let sessionStartTime = null;

const DIFF_W = 96;
const DIFF_H = 22;

// GPT calibration state
let calibActive = false;
let calibStartKills = 0;
let calibTargetKills = 0;
let calibStartXp = null;
let calibIsNewMob = false;  // true = New Mob (don't reset), false = initial calibration (reset after)

// GPT reading state
let lastXpFromGPT = null;
let lastGptReadTime = null;
let killsAtLastGPT = 0;  // Track kills at time of last GPT reading for accurate Mobs to Level
let sessionStartXp = null;  // XP at start of session for logging

// Level tracking
let levelUpCount = 0;
let xpAtLevelStart = null;

// Game state for Save Prems
let gameStopped = false;

// ---- UI State ----
function updatePlayPauseButton() {
  const playIcon = playPauseBtn.querySelector('.play-icon');
  const pauseIcon = playPauseBtn.querySelector('.pause-icon');
  
  if (running) {
    playPauseBtn.classList.add('is-playing');
    playPauseBtn.title = 'Pause tracking';
    playIcon.style.display = 'none';
    pauseIcon.style.display = 'block';
  } else {
    playPauseBtn.classList.remove('is-playing');
    playPauseBtn.title = 'Start tracking';
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
  }
}

function updateSavePremsButton() {
  const textEl = savePremsBtn.querySelector('.save-prems-text');
  if (gameStopped) {
    savePremsBtn.classList.add('is-saved');
    textEl.textContent = 'Resume Session';
    savePremsBtn.title = 'Reload game and continue';
  } else {
    savePremsBtn.classList.remove('is-saved');
    textEl.textContent = 'Save Prems';
    savePremsBtn.title = 'Close game to save premium items';
  }
}

function updateCalibButton() {
  const textEl = calibBtn.querySelector('.calib-text');
  if (calibActive) {
    calibBtn.classList.add('is-calibrating');
    const remaining = calibTargetKills - kills;
    textEl.textContent = remaining > 0 
      ? `Calibrating... (${remaining} kills left)` 
      : 'Finish Calibration';
  } else {
    calibBtn.classList.remove('is-calibrating');
    textEl.textContent = 'GPT Auto Calibrate';
  }
}

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

  setTimeout(fitGameToContent, 150);

  if (roi) {
    debugChk.checked = true;
    toggleDebug(true);
    await previewOnce();
  }
  
  updatePlayPauseButton();
  addLogEntry('Tracker ready', 'info');
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

window.addEventListener("resize", fitGameToContent);

// ---- Debug toggle ----
function toggleDebug(on) {
  if (debugContent) {
    debugContent.style.display = on ? "block" : "none";
  }
  rawC.style.display = on ? "block" : "none";
  miniC.style.display = on ? "block" : "none";
  diffC.style.display = on ? "block" : "none";
}

debugChk.addEventListener("change", () => {
  toggleDebug(debugChk.checked);
});

// ---- History Button ----
historyBtn.addEventListener("click", async () => {
  btnFlash(historyBtn);
  await A.openLogFolder();
});

// ---- Save Prems Button ----
savePremsBtn.addEventListener("click", async () => {
  btnFlash(savePremsBtn);
  
  if (gameStopped) {
    // Resume - reload the game
    addLogEntry('Resuming session - reloading game...', 'info');
    await A.reloadGame();
    gameStopped = false;
    updateSavePremsButton();
  } else {
    // Save prems - get XP reading before closing game
    if (roi && lastXpFromGPT !== null) {
      const endXp = await readXpWithGPT();
      if (endXp !== null) {
        lastXpFromGPT = endXp;
        killsAtLastGPT = kills;
        gptXpEl.textContent = endXp.toFixed(4) + "%";
      }
    }
    
    // Pause tracking if running
    if (running) {
      running = false;
      if (sessionStartedAt != null) {
        activeMsBase += Date.now() - sessionStartedAt;
        sessionStartedAt = null;
      }
      clearInterval(loopId);
      loopId = null;
      clearInterval(clockId);
      clockId = null;
      stopSanityCheck();
      updatePlayPauseButton();
    }
    
    // Stop the game
    await A.stopGame();
    gameStopped = true;
    updateSavePremsButton();
    
    addLogEntry('Game closed to save prems - click Resume to continue', 'warning');
  }
});

// ---- Inputs ----
xpPerKillInput.addEventListener("change", async () => {
  const v = num(xpPerKillInput.value, xpPerKill);
  if (v >= 0) xpPerKill = v;
  xpPerKillInput.value = xpPerKill.toFixed(4);
  await A.setCfg({ settings: { xpPerKill } });
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

// ---- Stats refresh ----
function refreshStats() {
  const now = Date.now();
  const elapsed =
    activeMsBase + (running && sessionStartedAt ? now - sessionStartedAt : 0);

  elapsedEl.textContent = fmtDuration(elapsed);

  const hours = elapsed / 3600000 || 0;
  const xpHr = hours > 0 ? xpSum / hours : 0;

  xphrEl.textContent = xpHr.toFixed(4) + "%";
  killsEl.textContent = String(kills);
  xpEl.textContent = xpSum.toFixed(4) + "%";
}

// ---- Mobs to Level ----
let levelUpCheckPending = false;  // Prevent multiple checks

function updateMobsToLevel() {
  if (lastXpFromGPT == null || xpPerKill <= 0) {
    mobsToLevelEl.textContent = "--";
    return;
  }
  
  // Calculate current XP: last GPT reading + XP from kills since that reading
  const xpGainedSinceGPT = (kills - killsAtLastGPT) * xpPerKill;
  const currentXp = lastXpFromGPT + xpGainedSinceGPT;
  
  const remaining = Math.max(0, 100 - currentXp);
  const mobs = remaining / xpPerKill;
  const mobsRounded = Number.isFinite(mobs) ? Math.round(mobs) : null;
  
  mobsToLevelEl.textContent = mobsRounded !== null ? String(mobsRounded) : "--";
  
  // If mobs to level reaches 0 or below, trigger level up verification
  if (mobsRounded !== null && mobsRounded <= 0 && running && !levelUpCheckPending && !calibActive) {
    levelUpCheckPending = true;
    checkForLevelUp().finally(() => {
      levelUpCheckPending = false;
    });
  }
}

// ---- Level Up Check (triggered when mobs to level reaches 0) ----
async function checkForLevelUp() {
  console.log('Mobs to level reached 0 - checking for level up...');
  
  const currentGptXp = await readXpWithGPT();
  if (currentGptXp === null) {
    addLogEntry('Level check failed: GPT read error', 'error');
    return;
  }
  
  // Calculate what we expected vs what we got
  const expectedXp = lastXpFromGPT + (kills - killsAtLastGPT) * xpPerKill;
  
  // If current XP is much lower than expected (dropped by 50%+), we leveled up
  if (currentGptXp < 50 && expectedXp > 90) {
    // Confirmed level up!
    levelUpCount++;
    
    addLogEntry(`🎉 LEVEL UP #${levelUpCount}! XP reset to ${currentGptXp.toFixed(4)}%`, 'level-up');
    
    // Update GPT readings
    lastXpFromGPT = currentGptXp;
    lastGptReadTime = Date.now();
    killsAtLastGPT = kills;
    gptXpEl.textContent = currentGptXp.toFixed(4) + "%";
    
    // Start auto-recalibration (like New Mob but for level up)
    const n = Math.max(1, Math.min(20, parseInt(calibKillsInput.value || "3", 10)));
    calibActive = true;
    calibIsNewMob = true;  // Keep stats, just recalibrate
    calibStartKills = kills;
    calibTargetKills = kills + n;
    calibStartXp = currentGptXp;
    xpAtLevelStart = currentGptXp;
    
    updateMobsToLevel();
    updateCalibButton();
    
    addLogEntry(`Auto-recalibrating (${n} kills)...`, 'info');
  } else {
    // Not a level up - just update readings
    lastXpFromGPT = currentGptXp;
    lastGptReadTime = Date.now();
    killsAtLastGPT = kills;
    gptXpEl.textContent = currentGptXp.toFixed(4) + "%";
    updateMobsToLevel();
    
    console.log('Not a level up - XP sanity check passed');
  }
}

// ---- Kill registration (no log spam) ----
function registerKill() {
  kills += 1;
  xpSum += xpPerKill;

  refreshStats();
  updateMobsToLevel();

  if (calibActive) {
    updateCalibButton();
    if (kills >= calibTargetKills) {
      finishCalibrationWithGPT().catch(console.error);
    }
  }
}

// ---- Auto-save session to Excel ----
async function saveSessionToExcel() {
  if (kills === 0 && xpSum === 0) return false;

  const now = new Date();
  const elapsed = activeMsBase + (sessionStartedAt ? Date.now() - sessionStartedAt : 0);
  const hours = elapsed / 3600000 || 0;
  const xpHr = hours > 0 ? xpSum / hours : 0;
  
  // Calculate end XP (current GPT reading or estimate)
  const endXp = lastXpFromGPT !== null ? lastXpFromGPT : null;
  
  // Build notes with XP details
  let notes = '';
  if (sessionStartXp !== null && endXp !== null) {
    // Calculate actual XP gain including level ups
    const rawGain = endXp - sessionStartXp;
    const totalGain = rawGain + (levelUpCount * 100);
    notes = `Start: ${sessionStartXp.toFixed(2)}% → End: ${endXp.toFixed(2)}%`;
    if (levelUpCount > 0) {
      notes += ` (+${levelUpCount} lvl)`;
    }
  } else if (endXp !== null) {
    notes = `End: ${endXp.toFixed(2)}%`;
  }

  const sessionData = {
    date: fmtDate(sessionStartTime || now),
    startTime: sessionStartTime ? fmtTime(sessionStartTime) : '--:--:--',
    endTime: fmtTime(now),
    duration: fmtDuration(elapsed),
    kills: kills,
    xpSum: xpSum.toFixed(4),
    xpPerHour: xpHr.toFixed(4),
    xpPerKill: xpPerKill.toFixed(4),
    levelUps: levelUpCount,
    notes: notes
  };

  try {
    const success = await A.saveSession(sessionData);
    if (success) {
      addLogEntry('Session saved to Excel', 'success');
      return true;
    }
  } catch (e) {
    console.error('Failed to save session:', e);
  }
  return false;
}

// ---- Sanity Check (detailed logging) ----
function startSanityCheck() {
  if (sanityCheckInterval) clearInterval(sanityCheckInterval);
  
  sanityCheckInterval = setInterval(async () => {
    if (!running || xpPerKill <= 0) return;
    
    const currentGptXp = await readXpWithGPT();
    
    if (currentGptXp === null) {
      addLogEntry('Sanity check failed: GPT read error', 'error');
      return;
    }
    
    lastXpFromGPT = currentGptXp;
    lastGptReadTime = Date.now();
    killsAtLastGPT = kills;  // Track kills at this GPT reading
    gptXpEl.textContent = currentGptXp.toFixed(4) + "%";
    
    // Check for level-up (sanity check backup - primary detection is via Mobs to Level)
    const previousExpected = xpAtLevelStart !== null 
      ? xpAtLevelStart + (kills - calibStartKills) * xpPerKill 
      : null;
    
    if (previousExpected !== null && previousExpected > 90 && currentGptXp < 30 && !calibActive) {
      levelUpCount++;
      
      addLogEntry(`🎉 LEVEL UP #${levelUpCount}! XP reset to ${currentGptXp.toFixed(4)}%`, 'level-up');
      
      // Start auto-recalibration
      const n = Math.max(1, Math.min(20, parseInt(calibKillsInput.value || "3", 10)));
      calibActive = true;
      calibIsNewMob = true;  // Keep stats
      calibStartKills = kills;
      calibTargetKills = kills + n;
      calibStartXp = currentGptXp;
      xpAtLevelStart = currentGptXp;
      
      updateMobsToLevel();
      updateCalibButton();
      
      addLogEntry(`Auto-recalibrating (${n} kills)...`, 'info');
      return;
    }
    
    // Detailed sanity check
    if (xpAtLevelStart !== null) {
      const killsSinceRef = kills - calibStartKills;
      const expectedXp = xpAtLevelStart + killsSinceRef * xpPerKill;
      const totalGain = currentGptXp - xpAtLevelStart;
      const expectedKillsFromXp = totalGain / xpPerKill;
      const xpDiff = Math.abs(currentGptXp - expectedXp);
      const killDiff = Math.abs(killsSinceRef - expectedKillsFromXp);
      
      // Build detailed log message
      let logMsg = `GPT: ${currentGptXp.toFixed(4)}% | Start: ${xpAtLevelStart.toFixed(4)}% | Gain: ${totalGain.toFixed(4)}%\n`;
      logMsg += `${totalGain.toFixed(4)}% ÷ ${xpPerKill.toFixed(4)}% = ${expectedKillsFromXp.toFixed(1)} kills\n`;
      logMsg += `Tracked: ${killsSinceRef} kills`;
      
      if (xpDiff > (xpPerKill * 3) && xpDiff < 50 && killDiff >= 2) {
        const correctedKills = calibStartKills + Math.round(expectedKillsFromXp);
        const oldKills = kills;
        const correction = correctedKills - kills;
        
        if (correctedKills > 0 && Math.abs(correction) < 50) {
          xpSum += correction * xpPerKill;
          kills = correctedKills;
          refreshStats();
          
          logMsg += ` | Diff: ${correction > 0 ? '+' : ''}${correction}\n`;
          logMsg += `⚠️ Corrected: ${oldKills} → ${correctedKills}`;
          addLogEntry(logMsg, 'warning');
        } else {
          logMsg += ` | OK ✓`;
          addLogEntry(logMsg, 'sanity');
        }
      } else {
        logMsg += ` | OK ✓`;
        addLogEntry(logMsg, 'sanity');
      }
    } else {
      addLogEntry(`GPT: ${currentGptXp.toFixed(4)}% (no baseline yet)`, 'sanity');
    }
    
    updateMobsToLevel();
  }, SANITY_CHECK_MINUTES * 60 * 1000);
}

function stopSanityCheck() {
  if (sanityCheckInterval) {
    clearInterval(sanityCheckInterval);
    sanityCheckInterval = null;
  }
}

// ---- Capture + diff ----
async function previewOnce() {
  if (!roi) return;
  const dataURL = await A.captureROIFromGame();
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

// ---- Play/Pause Toggle ----
playPauseBtn.addEventListener("click", async () => {
  btnFlash(playPauseBtn);
  
  if (running) {
    // PAUSE
    running = false;
    
    if (sessionStartedAt != null) {
      activeMsBase += Date.now() - sessionStartedAt;
      sessionStartedAt = null;
    }
    
    clearInterval(loopId);
    loopId = null;
    clearInterval(clockId);
    clockId = null;
    stopSanityCheck();
    
    updatePlayPauseButton();
    
    // Get current XP via GPT for Excel logging
    let endXp = null;
    if (roi && lastXpFromGPT !== null) {
      endXp = await readXpWithGPT();
      if (endXp !== null) {
        lastXpFromGPT = endXp;
        killsAtLastGPT = kills;
        gptXpEl.textContent = endXp.toFixed(4) + "%";
      }
    }
    
    // Auto-save on pause if we have data
    if (kills > 0) {
      await saveSessionToExcel();
    }
  } else {
    // PLAY
    if (!roi) {
      alert("Please capture the XP bar first.\nClick '▶ Capture Settings' below to expand.");
      showCaptureChk.checked = true;
      return;
    }
    
    running = true;
    
    if (sessionStartTime == null) {
      sessionStartTime = new Date();
    }
    
    if (sessionStartedAt == null) sessionStartedAt = Date.now();

    if (!loopId) loopId = setInterval(runDiff, 180);
    if (!clockId) clockId = setInterval(refreshStats, 250);
    
    startSanityCheck();
    updatePlayPauseButton();
  }
});

// ---- Reset ----
resetBtn.addEventListener("click", async () => {
  btnFlash(resetBtn);
  
  // Save before reset if we have data
  if (kills > 0) {
    await saveSessionToExcel();
  }
  
  running = false;
  kills = 0;
  xpSum = 0;
  activeMsBase = 0;
  sessionStartedAt = null;
  sessionStartTime = null;
  prevMini = null;
  lastChangeAt = 0;
  calibActive = false;
  calibStartXp = null;
  calibTargetKills = 0;
  calibStartKills = 0;
  lastXpFromGPT = null;
  lastGptReadTime = null;
  killsAtLastGPT = 0;
  sessionStartXp = null;
  xpAtLevelStart = null;
  levelUpCount = 0;
  
  clearInterval(loopId);
  loopId = null;
  clearInterval(clockId);
  clockId = null;
  stopSanityCheck();
  
  refreshStats();
  gptXpEl.textContent = "--.--%";
  mobsToLevelEl.textContent = "--";
  
  updatePlayPauseButton();
  clearLog();
  addLogEntry('Session reset', 'info');
});

// ---- New Mob Button ----
newMobBtn.addEventListener("click", async () => {
  btnFlash(newMobBtn);
  
  if (!roi) {
    alert("Please capture the XP bar first.");
    return;
  }
  
  // If already calibrating, just inform user
  if (calibActive) {
    alert("Already calibrating! Finish current calibration first or wait for it to complete.");
    return;
  }
  
  addLogEntry('New mob - reading GPT...', 'info');
  
  const currentXp = await readXpWithGPT();
  if (currentXp === null) {
    addLogEntry('New mob failed: GPT read error', 'error');
    return;
  }
  
  // Update GPT reading (don't reset any stats!)
  lastXpFromGPT = currentXp;
  lastGptReadTime = Date.now();
  killsAtLastGPT = kills;  // Track kills at this GPT reading
  gptXpEl.textContent = currentXp.toFixed(4) + "%";
  
  // Start calibration for new mob - track from current kill count
  const n = Math.max(1, Math.min(20, parseInt(calibKillsInput.value || "3", 10)));
  calibActive = true;
  calibIsNewMob = true;  // This is new mob - don't reset stats after
  calibStartKills = kills;  // Start from current kills
  calibTargetKills = kills + n;
  calibStartXp = currentXp;
  xpAtLevelStart = currentXp;
  
  updateMobsToLevel();
  updateCalibButton();
  
  // Auto-start tracking if not already running
  if (!running) {
    running = true;
    if (sessionStartTime == null) {
      sessionStartTime = new Date();
    }
    if (sessionStartedAt == null) {
      sessionStartedAt = Date.now();
    }
    
    if (!loopId) loopId = setInterval(runDiff, 180);
    if (!clockId) clockId = setInterval(refreshStats, 250);
    
    startSanityCheck();
    updatePlayPauseButton();
  }
  
  addLogEntry(`New mob! XP: ${currentXp.toFixed(4)}% - Kill ${n} to calibrate`, 'success');
});

// ---- ROI capture / fine-tune ----
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
    for (let i = 3; i > 0; i--) {
      captureBtn.textContent = `Capturing in ${i}…`;
      await new Promise(r => setTimeout(r, 1000));
    }

    const p = await A.getCursorInGame();
    if (!p) {
      alert("Mouse wasn't detected over the game.\nHover over the XP % text during countdown.");
      return;
    }

    const W = 220;
    const H = 40;

    const x = Math.max(0, Math.round(p.x - W / 2));
    const y = Math.max(0, Math.round(p.y - H / 2));

    roi = { x, y, width: W, height: H };
    await A.setCfg({ roi });

    debugChk.checked = true;
    toggleDebug(true);
    await previewOnce();
    
    addLogEntry('XP bar captured successfully', 'success');
  } finally {
    captureBtn.textContent = original;
    captureBtn.disabled = false;
  }
}

async function fineTuneROI() {
  await A.openReshapeOverlay();
  const cfg = await A.getCfg();
  roi = cfg.roi || null;

  if (roi) {
    debugChk.checked = true;
    toggleDebug(true);
    await previewOnce();
  }
}

// ---- GPT Calibration ----
calibBtn.addEventListener("click", async () => {
  btnFlash(calibBtn);
  
  // If already calibrating, finish early
  if (calibActive) {
    await finishCalibrationWithGPT();
    return;
  }
  
  if (!roi) {
    alert("Capture the XP bar first.");
    return;
  }

  const n = Math.max(1, Math.min(20, parseInt(calibKillsInput.value || "3", 10)));
  calibKillsInput.value = String(n);

  addLogEntry('Starting calibration - reading GPT...', 'info');
  
  const xpStart = await readXpWithGPT();
  if (xpStart == null) {
    addLogEntry('Calibration failed: GPT read error', 'error');
    return;
  }
  
  // Reset stats for fresh calibration
  kills = 0;
  xpSum = 0;
  activeMsBase = 0;
  sessionStartedAt = null;
  sessionStartTime = null;
  prevMini = null;
  lastChangeAt = 0;
  levelUpCount = 0;
  
  // Set up calibration
  lastXpFromGPT = xpStart;
  lastGptReadTime = Date.now();
  killsAtLastGPT = 0;  // Reset since kills are also reset
  gptXpEl.textContent = xpStart.toFixed(4) + "%";
  
  calibActive = true;
  calibIsNewMob = false;  // This is initial calibration - will reset after
  calibStartKills = 0;
  calibTargetKills = n;
  calibStartXp = xpStart;
  xpAtLevelStart = xpStart;
  
  refreshStats();
  updateMobsToLevel();
  updateCalibButton();
  
  // Auto-start tracking
  if (!running) {
    running = true;
    sessionStartTime = new Date();
    sessionStartedAt = Date.now();
    
    if (!loopId) loopId = setInterval(runDiff, 180);
    if (!clockId) clockId = setInterval(refreshStats, 250);
    
    updatePlayPauseButton();
  }
  
  addLogEntry(`Calibrating at ${xpStart.toFixed(4)}% - kill ${n} mobs`, 'info');
});

async function finishCalibrationWithGPT() {
  const xpEnd = await readXpWithGPT();
  if (xpEnd == null) {
    addLogEntry('Calibration end failed: GPT read error', 'error');
    calibActive = false;
    updateCalibButton();
    return;
  }

  lastXpFromGPT = xpEnd;
  lastGptReadTime = Date.now();
  killsAtLastGPT = kills;  // Track kills at this GPT reading
  gptXpEl.textContent = xpEnd.toFixed(4) + "%";

  const dKills = kills - calibStartKills;
  const dXp = xpEnd - calibStartXp;

  if (dKills <= 0 || dXp <= 0) {
    addLogEntry('Calibration failed: no XP progress detected', 'error');
    calibActive = false;
    updateCalibButton();
    return;
  }

  // Calculate new XP per kill
  const newXpPerKill = dXp / dKills;
  
  xpPerKill = newXpPerKill;
  xpPerKillInput.value = xpPerKill.toFixed(4);
  await A.setCfg({ settings: { xpPerKill } });
  
  addLogEntry(`✓ Calibrated! XP/kill: ${xpPerKill.toFixed(4)}% (${dKills} kills = ${dXp.toFixed(4)}%)`, 'success');
  
  // Update baseline for sanity checks
  xpAtLevelStart = xpEnd;
  
  const wasNewMob = calibIsNewMob;
  
  // End calibration
  calibActive = false;
  calibIsNewMob = false;
  updateCalibButton();
  
  // For initial calibration (not New Mob): pause and reset for fresh start
  if (!wasNewMob) {
    // Pause tracking
    running = false;
    if (sessionStartedAt != null) {
      activeMsBase += Date.now() - sessionStartedAt;
      sessionStartedAt = null;
    }
    clearInterval(loopId);
    loopId = null;
    clearInterval(clockId);
    clockId = null;
    stopSanityCheck();
    updatePlayPauseButton();
    
    // Reset stats for fresh start
    kills = 0;
    xpSum = 0;
    activeMsBase = 0;
    sessionStartedAt = null;
    sessionStartTime = null;
    prevMini = null;
    lastChangeAt = 0;
    levelUpCount = 0;
    calibStartKills = 0;
    killsAtLastGPT = 0;  // Reset since kills are reset
    sessionStartXp = xpEnd;  // Record session start XP for Excel logging
    
    refreshStats();
    addLogEntry('Stats reset - ready to start fresh!', 'info');
  } else {
    // For New Mob: just update the reference point, keep everything running
    calibStartKills = kills;
    killsAtLastGPT = kills;  // Update reference point
    addLogEntry('Continuing session with new XP/kill rate', 'info');
  }
  
  updateMobsToLevel();
}

async function readXpWithGPT() {
  if (!roi) return null;
  const dataUrl = await A.captureROIFromGame();
  if (!dataUrl) return null;
  try {
    const xp = await A.readXpWithGPT(dataUrl);
    if (!Number.isFinite(xp)) return null;
    return xp;
  } catch (err) {
    console.error("readXpWithGPT error:", err);
    return null;
  }
}