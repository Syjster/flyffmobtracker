// renderer.js Ã¢â‚¬â€œ Flyff Mob Tracker v2 with AOE Mode & Tempo Stats
// Features: 1v1 mode (pixel diff), AOE mode (GPT-only), Tempo stats, Time to level

const A = window.electronAPI;

// ---- Constants ----
const SANITY_CHECK_MINUTES = 5;
const DEFAULT_TEMPO_WINDOW = 50;  // Default rolling window size for tempo stats
const MIN_TEMPO_WINDOW = 5;
const MAX_TEMPO_WINDOW = 200;

// ---- DOM ----
const sidebar = document.getElementById("sidebar");
const gameContainer = document.getElementById("gameContainer");

const playPauseBtn = document.getElementById("playPauseBtn");
const resetBtn = document.getElementById("resetBtn");
const newMobBtn = document.getElementById("newMobBtn");
const savePremsBtn = document.getElementById("savePremsBtn");

// Mode buttons
const mode1v1Btn = document.getElementById("mode1v1Btn");
const modeAoeBtn = document.getElementById("modeAoeBtn");
const settings1v1 = document.getElementById("settings1v1");
const settingsAoe = document.getElementById("settingsAoe");

const captureBtn = document.getElementById("captureBtn");
const fineTuneBtn = document.getElementById("fineTuneBtn");
const showCaptureChk = document.getElementById("showCaptureChk");

// 1v1 Settings
const xpPerKillInput = document.getElementById("xpPerKill");
const diffTriggerInput = document.getElementById("diffTrigger");
const diffCooldownInput = document.getElementById("diffCooldown");
const calibKillsInput = document.getElementById("calibKills");
const calibBtn = document.getElementById("calibBtn");

// AOE Settings
const aoePollIntervalInput = document.getElementById("aoePollInterval");
const aoeXpPerMobInput = document.getElementById("aoeXpPerMob");
const aoeCalibBtn = document.getElementById("aoeCalibBtn");
const aoeMobCountSection = document.getElementById("aoeMobCountSection");
const aoeMobCountInput = document.getElementById("aoeMobCount");

// Auto tracking settings
const autoStartChk = document.getElementById("autoStartChk");
const autoStopChk = document.getElementById("autoStopChk");
const autoStopTimeoutInput = document.getElementById("autoStopTimeout");

// Level tracking
const charLevelInput = document.getElementById("charLevel");
const lastSessionXpEl = document.getElementById("lastSessionXp");

// Session Stats
const elapsedEl = document.getElementById("elapsed");
const killsEl = document.getElementById("kills");
const xpEl = document.getElementById("xp");
const xphrEl = document.getElementById("xphr");
const gptXpEl = document.getElementById("gptXp");
const mobsToLevelEl = document.getElementById("mobsToLevel");
const timeToLevelEl = document.getElementById("timeToLevel");
const estLevelTimeEl = document.getElementById("estLevelTime");
const sessionLogEl = document.getElementById("sessionLog");

// Tempo Stats
const tempoXphrEl = document.getElementById("tempoXphr");
const tempoMobshrEl = document.getElementById("tempoMobshr");
const tempoXpPerKillEl = document.getElementById("tempoXpPerKill");
const tempoAvgTimeEl = document.getElementById("tempoAvgTime");

// Debug & GPT correction stats
const debugChk = document.getElementById("debugChk");
const debugContent = document.getElementById("debugContent");
const gptCorrectionsEl = document.getElementById("gptCorrections");
const correctionRateEl = document.getElementById("correctionRate");
const calibrationWarning = document.getElementById("calibrationWarning");
const rawC = document.getElementById("rawC");
const miniC = document.getElementById("miniC");
const diffC = document.getElementById("diffC");
const historyBtn = document.getElementById("historyBtn");
const backToLauncherBtn = document.getElementById("backToLauncherBtn");

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

function fmtTimeShort(date) {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
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

// ---- Session Log ----
function addLogEntry(message, type = 'info') {
  if (!sessionLogEl) return;
  
  // Skip individual kill messages to reduce spam
  // Only show important events: corrections, errors, calibration, level ups
  if (type === 'kill') return;
  
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
  if (sessionLogEl) sessionLogEl.innerHTML = '';
}

// ---- State ----
let roi = null;
let currentMode = '1v1';  // '1v1' or 'aoe'

// 1v1 Mode settings
let xpPerKill = 0.05;
let diffTrigger = 0.065;
let diffCooldown = 800;

// AOE Mode settings
let aoePollInterval = 25;  // seconds
let aoeXpPerMob = 0.05;

// Auto tracking settings
let autoStartAfterCalib = true;
let autoStopIdleEnabled = true;
let autoStopIdleTimeout = 60;  // seconds
let lastKillTime = null;
let idleCheckId = null;

// Tempo stats settings
let tempoWindow = DEFAULT_TEMPO_WINDOW;  // Rolling window for tempo calculations

// Session stats
let kills = 0;
let xpSum = 0;
let running = false;

// Pixel diff (1v1 mode)
let prevMini = null;
let lastChangeAt = 0;
let loopId = null;
let clockId = null;
let sanityCheckInterval = null;

// AOE Mode
let aoeLoopId = null;
let aoeCalibActive = false;
let aoeCalibStartXp = null;
let aoeCalibStartTime = null;

// Timing
let activeMsBase = 0;
let sessionStartedAt = null;
let sessionStartTime = null;

const DIFF_W = 96;
const DIFF_H = 22;

// GPT calibration state (1v1)
let calibActive = false;
let calibStartKills = 0;
let calibTargetKills = 0;
let calibStartXp = null;
let calibIsNewMob = false;

// GPT reading state
let lastXpFromGPT = null;
let lastGptReadTime = null;
let killsAtLastGPT = 0;
let sessionStartXp = null;

// Level tracking
let levelUpCount = 0;
let xpAtLevelStart = null;
let characterLevel = 1;
let lastSessionEndXp = null;  // For detecting level ups between sessions

// GPT correction stats
let gptCorrections = 0;  // Number of times GPT corrected kills this session
let pixelKillCount = 0;  // Kills detected by pixel change

// Tempo tracking (last N kills)
let killTimestamps = [];  // Array of { time: Date, xp: number }
let lastKillXp = null;

// Game state
let gameStopped = false;

// ---- UI State Updates ----
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

function updateAoeCalibButton() {
  const textEl = aoeCalibBtn.querySelector('.aoe-calib-text');
  if (aoeCalibActive) {
    aoeCalibBtn.classList.add('is-calibrating');
    textEl.textContent = 'Finish Calibration';
    aoeMobCountSection.classList.remove('hidden');
  } else {
    aoeCalibBtn.classList.remove('is-calibrating');
    textEl.textContent = 'Start AOE Calibration';
    aoeMobCountSection.classList.add('hidden');
  }
}

function updateModeUI() {
  if (currentMode === '1v1') {
    mode1v1Btn.classList.add('active');
    modeAoeBtn.classList.remove('active');
    settings1v1.style.display = 'block';
    settingsAoe.style.display = 'none';
    newMobBtn.style.display = 'flex';
  } else {
    mode1v1Btn.classList.remove('active');
    modeAoeBtn.classList.add('active');
    settings1v1.style.display = 'none';
    settingsAoe.style.display = 'block';
    newMobBtn.style.display = 'none';  // Not needed in AOE mode
  }
}

function updateCorrectionStats() {
  if (!gptCorrectionsEl || !correctionRateEl) return;
  
  gptCorrectionsEl.textContent = gptCorrections.toString();
  
  const totalChecks = pixelKillCount > 0 ? pixelKillCount : 1;
  const rate = (gptCorrections / totalChecks) * 100;
  correctionRateEl.textContent = rate.toFixed(1) + '%';
  
  // Show warning if correction rate is too high (>30%)
  if (calibrationWarning) {
    if (rate > 30 && pixelKillCount >= 10) {
      calibrationWarning.classList.remove('hidden');
    } else {
      calibrationWarning.classList.add('hidden');
    }
  }
}

// ---- Init ----
(async () => {
  const cfg = await A.getCfg();
  roi = cfg.roi || null;

  // Get current character's tracking mode if available
  const currentChar = await A.getCurrentChar();
  if (currentChar && currentChar.trackingMode) {
    currentMode = currentChar.trackingMode;
  } else {
    currentMode = cfg.settings?.trackingMode || '1v1';
  }

  xpPerKill = num(cfg.settings?.xpPerKill ?? 0.05, 0.05);
  diffTrigger = num(cfg.settings?.diffTrigger ?? 0.065, 0.065);
  diffCooldown = Math.round(num(cfg.settings?.diffCooldown ?? 800, 800));
  aoePollInterval = num(cfg.settings?.aoePollInterval ?? 25, 25);
  aoeXpPerMob = num(cfg.settings?.aoeXpPerMob ?? 0.05, 0.05);
  
  // Auto tracking settings
  autoStartAfterCalib = cfg.settings?.autoStartAfterCalib !== false;  // Default true
  autoStopIdleEnabled = cfg.settings?.autoStopIdleEnabled !== false;  // Default true
  autoStopIdleTimeout = Math.round(num(cfg.settings?.autoStopIdleTimeout ?? 60, 60));
  
  // Tempo stats settings
  tempoWindow = Math.round(num(cfg.settings?.tempoWindow ?? DEFAULT_TEMPO_WINDOW, DEFAULT_TEMPO_WINDOW));
  tempoWindow = Math.max(MIN_TEMPO_WINDOW, Math.min(MAX_TEMPO_WINDOW, tempoWindow));
  
  // Level tracking
  characterLevel = Math.round(num(cfg.settings?.characterLevel ?? 1, 1));
  lastSessionEndXp = cfg.settings?.lastSessionEndXp ?? null;

  xpPerKillInput.value = xpPerKill.toFixed(5);
  diffTriggerInput.value = diffTrigger.toFixed(3);
  diffCooldownInput.value = String(diffCooldown);
  aoePollIntervalInput.value = String(aoePollInterval);
  aoeXpPerMobInput.value = aoeXpPerMob.toFixed(5);
  
  // Set level input
  if (charLevelInput) charLevelInput.value = String(characterLevel);
  if (lastSessionXpEl) {
    lastSessionXpEl.textContent = lastSessionEndXp !== null ? lastSessionEndXp.toFixed(2) + '%' : '--';
  }
  
  // Set checkbox states
  if (autoStartChk) autoStartChk.checked = autoStartAfterCalib;
  if (autoStopChk) autoStopChk.checked = autoStopIdleEnabled;
  if (autoStopTimeoutInput) autoStopTimeoutInput.value = String(autoStopIdleTimeout);
  
  // Set tempo window input
  const tempoWindowInput = document.getElementById('tempoWindowInput');
  if (tempoWindowInput) tempoWindowInput.value = String(tempoWindow);

  updateModeUI();
  setTimeout(fitGameToContent, 150);

  if (roi) {
    debugChk.checked = true;
    toggleDebug(true);
    await previewOnce();
  }
  
  updatePlayPauseButton();
  
  // Log with character name if available
  if (currentChar) {
    addLogEntry(`Tracker ready for ${currentChar.name} (${currentMode.toUpperCase()})`, 'info');
  } else {
    addLogEntry('Tracker ready', 'info');
  }
  
  // Check for level up between sessions
  checkForLevelUpBetweenSessions();
})();

// ---- Game BrowserView sizing ----
function fitGameToContent() {
  const rect = gameContainer.getBoundingClientRect();
  const gameRect = {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
  console.log('[Renderer] fitGameToContent:', gameRect);
  A.setGameRect(gameRect);
}

window.addEventListener("resize", fitGameToContent);

// ---- Debug toggle ----
function toggleDebug(on) {
  if (debugContent) debugContent.style.display = on ? "block" : "none";
  rawC.style.display = on ? "block" : "none";
  miniC.style.display = on ? "block" : "none";
  diffC.style.display = on ? "block" : "none";
}

debugChk.addEventListener("change", () => toggleDebug(debugChk.checked));

// ---- History Button ----
historyBtn.addEventListener("click", async () => {
  btnFlash(historyBtn);
  await A.openLogFolder();
});

// ---- Back to Launcher ----
backToLauncherBtn?.addEventListener("click", async () => {
  btnFlash(backToLauncherBtn);
  if (kills > 0) await saveSessionToExcel();
  await A.backToLauncher?.();
});

// ---- Save Prems Button ----
savePremsBtn.addEventListener("click", async () => {
  btnFlash(savePremsBtn);
  
  if (gameStopped) {
    addLogEntry('Resuming session - reloading game...', 'info');
    await A.reloadGame();
    gameStopped = false;
    updateSavePremsButton();
  } else {
    if (roi && lastXpFromGPT !== null) {
      const endXp = await readXpWithGPT();
      if (endXp !== null) {
        lastXpFromGPT = endXp;
        killsAtLastGPT = kills;
        gptXpEl.textContent = endXp.toFixed(5) + "%";
      }
    }
    
    if (running) {
      running = false;
      if (sessionStartedAt != null) {
        activeMsBase += Date.now() - sessionStartedAt;
        sessionStartedAt = null;
      }
      clearAllIntervals();
      updatePlayPauseButton();
    }
    
    await A.stopGame();
    gameStopped = true;
    updateSavePremsButton();
    
    addLogEntry('Game closed to save prems - click Resume to continue', 'warning');
  }
});

// ---- Mode Toggle ----
mode1v1Btn.addEventListener("click", async () => {
  if (currentMode === '1v1') return;
  if (running) {
    alert('Please pause tracking before switching modes.');
    return;
  }
  currentMode = '1v1';
  updateModeUI();
  await A.setCfg({ settings: { trackingMode: currentMode } });
  addLogEntry('Switched to 1v1 Mode', 'info');
});

modeAoeBtn.addEventListener("click", async () => {
  if (currentMode === 'aoe') return;
  if (running) {
    alert('Please pause tracking before switching modes.');
    return;
  }
  currentMode = 'aoe';
  updateModeUI();
  await A.setCfg({ settings: { trackingMode: currentMode } });
  addLogEntry('Switched to AOE Mode', 'info');
});

// ---- Inputs ----
xpPerKillInput.addEventListener("change", async () => {
  const v = num(xpPerKillInput.value, xpPerKill);
  if (v >= 0) xpPerKill = v;
  xpPerKillInput.value = xpPerKill.toFixed(5);
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

aoePollIntervalInput.addEventListener("change", async () => {
  const v = Math.round(num(aoePollIntervalInput.value, aoePollInterval));
  if (v >= 10 && v <= 60) aoePollInterval = v;
  aoePollIntervalInput.value = String(aoePollInterval);
  await A.setCfg({ settings: { aoePollInterval } });
});

aoeXpPerMobInput.addEventListener("change", async () => {
  const v = num(aoeXpPerMobInput.value, aoeXpPerMob);
  if (v >= 0) aoeXpPerMob = v;
  aoeXpPerMobInput.value = aoeXpPerMob.toFixed(5);
  await A.setCfg({ settings: { aoeXpPerMob } });
});

// Auto tracking settings handlers
if (autoStartChk) {
  autoStartChk.addEventListener("change", async () => {
    autoStartAfterCalib = autoStartChk.checked;
    await A.setCfg({ settings: { autoStartAfterCalib } });
  });
}

if (autoStopChk) {
  autoStopChk.addEventListener("change", async () => {
    autoStopIdleEnabled = autoStopChk.checked;
    await A.setCfg({ settings: { autoStopIdleEnabled } });
    
    // Start/stop idle check based on current state
    if (running && autoStopIdleEnabled && !idleCheckId) {
      startIdleCheck();
    } else if (!autoStopIdleEnabled && idleCheckId) {
      clearInterval(idleCheckId);
      idleCheckId = null;
    }
  });
}

if (autoStopTimeoutInput) {
  autoStopTimeoutInput.addEventListener("change", async () => {
    const v = parseInt(autoStopTimeoutInput.value, 10);
    if (v >= 10 && v <= 600) {
      autoStopIdleTimeout = v;
      await A.setCfg({ settings: { autoStopIdleTimeout } });
    }
    autoStopTimeoutInput.value = String(autoStopIdleTimeout);
  });
}

// Tempo window setting handler
const tempoWindowInput = document.getElementById('tempoWindowInput');
if (tempoWindowInput) {
  tempoWindowInput.addEventListener("change", async () => {
    const v = parseInt(tempoWindowInput.value, 10);
    if (v >= MIN_TEMPO_WINDOW && v <= MAX_TEMPO_WINDOW) {
      tempoWindow = v;
      await A.setCfg({ settings: { tempoWindow } });
      updateTempoStats();  // Recalculate with new window
    }
    tempoWindowInput.value = String(tempoWindow);
  });
}

// ---- Stats refresh ----
function refreshStats() {
  const now = Date.now();
  const elapsed = activeMsBase + (running && sessionStartedAt ? now - sessionStartedAt : 0);

  elapsedEl.textContent = fmtDuration(elapsed);

  const hours = elapsed / 3600000 || 0;
  const currentXpPerKill = currentMode === 'aoe' ? aoeXpPerMob : xpPerKill;
  const xpHr = hours > 0 ? xpSum / hours : 0;

  xphrEl.textContent = xpHr.toFixed(5) + "%";
  killsEl.textContent = String(kills);
  xpEl.textContent = xpSum.toFixed(5) + "%";
  
  // Time to level calculations
  updateTimeToLevel(xpHr);
}

// ---- Time to Level ----
function updateTimeToLevel(xpHr) {
  if (lastXpFromGPT === null || xpHr <= 0) {
    timeToLevelEl.textContent = "--:--:--";
    estLevelTimeEl.textContent = "--:--";
    return;
  }
  
  const currentXpPerKill = currentMode === 'aoe' ? aoeXpPerMob : xpPerKill;
  const xpGainedSinceGPT = (kills - killsAtLastGPT) * currentXpPerKill;
  const currentXp = lastXpFromGPT + xpGainedSinceGPT;
  const remaining = Math.max(0, 100 - currentXp);
  
  // Time to level in hours
  const hoursToLevel = remaining / xpHr;
  const msToLevel = hoursToLevel * 3600000;
  
  timeToLevelEl.textContent = fmtDuration(msToLevel);
  
  // Estimated level up time
  const estTime = new Date(Date.now() + msToLevel);
  estLevelTimeEl.textContent = fmtTimeShort(estTime);
}

// ---- Tempo Stats (rolling window) ----
function updateTempoStats() {
  // Show stats starting from the first kill
  if (killTimestamps.length < 1) {
    tempoXphrEl.textContent = "--";
    tempoMobshrEl.textContent = "--";
    tempoXpPerKillEl.textContent = "--";
    tempoAvgTimeEl.textContent = "--";
    return;
  }
  
  // For just 1 kill, calculate based on time since session started
  if (killTimestamps.length === 1) {
    const singleKill = killTimestamps[0];
    const timeFromStart = sessionStartedAt ? (singleKill.time - sessionStartedAt) : 0;
    
    if (timeFromStart > 0) {
      const hours = timeFromStart / 3600000;
      const tempoXpHr = singleKill.xp / hours;
      const tempoMobsHr = 1 / hours;
      
      tempoXphrEl.textContent = tempoXpHr.toFixed(2) + "%";
      tempoMobshrEl.textContent = Math.round(tempoMobsHr).toString();
      tempoXpPerKillEl.textContent = singleKill.xp.toFixed(5) + "%";
      tempoAvgTimeEl.textContent = (timeFromStart / 1000).toFixed(1) + "s";
    } else {
      tempoXphrEl.textContent = "--";
      tempoMobshrEl.textContent = "--";
      tempoXpPerKillEl.textContent = singleKill.xp.toFixed(5) + "%";
      tempoAvgTimeEl.textContent = "--";
    }
    return;
  }
  
  // Get last N kills (up to tempoWindow setting)
  const recentKills = killTimestamps.slice(-tempoWindow);
  
  // Calculate time span between first and last kill in window
  const timeSpan = recentKills[recentKills.length - 1].time - recentKills[0].time;
  const killCount = recentKills.length - 1;  // -1 because we're measuring between kills
  
  if (timeSpan <= 0 || killCount <= 0) {
    // All kills happened at the same moment - use session start time
    const firstKillTime = recentKills[0].time;
    const timeFromStart = sessionStartedAt ? (firstKillTime - sessionStartedAt) : 1000;
    const avgTimePerKill = timeFromStart / recentKills.length;
    const xpGained = recentKills.reduce((sum, k) => sum + (k.xp || 0), 0);
    const avgXpPerKill = xpGained / recentKills.length;
    
    if (avgTimePerKill > 0) {
      const hours = avgTimePerKill / 3600000;
      tempoXphrEl.textContent = (avgXpPerKill / hours).toFixed(2) + "%";
      tempoMobshrEl.textContent = Math.round(1 / hours).toString();
    } else {
      tempoXphrEl.textContent = "--";
      tempoMobshrEl.textContent = "--";
    }
    tempoXpPerKillEl.textContent = avgXpPerKill.toFixed(5) + "%";
    tempoAvgTimeEl.textContent = (avgTimePerKill / 1000).toFixed(1) + "s";
    return;
  }
  
  // Calculate XP gained in this window (excluding first as baseline reference point)
  const xpGained = recentKills.reduce((sum, k, i) => {
    if (i === 0) return 0;
    return sum + (k.xp || 0);
  }, 0);
  
  const hours = timeSpan / 3600000;
  const tempoXpHr = xpGained / hours;
  const tempoMobsHr = killCount / hours;
  const avgXpPerKill = xpGained / killCount;
  const avgKillTime = timeSpan / killCount / 1000;  // seconds
  
  tempoXphrEl.textContent = tempoXpHr.toFixed(2) + "%";
  tempoMobshrEl.textContent = Math.round(tempoMobsHr).toString();
  tempoXpPerKillEl.textContent = avgXpPerKill.toFixed(5) + "%";
  tempoAvgTimeEl.textContent = avgKillTime.toFixed(1) + "s";
}

// ---- Mobs to Level ----
let levelUpCheckPending = false;

function updateMobsToLevel() {
  const currentXpPerKill = currentMode === 'aoe' ? aoeXpPerMob : xpPerKill;
  
  if (lastXpFromGPT == null || currentXpPerKill <= 0) {
    mobsToLevelEl.textContent = "--";
    return;
  }
  
  const xpGainedSinceGPT = (kills - killsAtLastGPT) * currentXpPerKill;
  const currentXp = lastXpFromGPT + xpGainedSinceGPT;
  
  const remaining = Math.max(0, 100 - currentXp);
  const mobs = remaining / currentXpPerKill;
  const mobsRounded = Number.isFinite(mobs) ? Math.round(mobs) : null;
  
  mobsToLevelEl.textContent = mobsRounded !== null ? String(mobsRounded) : "--";
  
  if (mobsRounded !== null && mobsRounded <= 0 && running && !levelUpCheckPending && !calibActive && !aoeCalibActive) {
    levelUpCheckPending = true;
    checkForLevelUp().finally(() => {
      levelUpCheckPending = false;
    });
  }
}

// ---- Level Up Check ----
async function checkForLevelUp() {
  console.log('Mobs to level reached 0 - checking for level up...');
  
  const currentGptXp = await readXpWithGPT();
  if (currentGptXp === null) {
    addLogEntry('Level check failed: GPT read error', 'error');
    return;
  }
  
  const currentXpPerKill = currentMode === 'aoe' ? aoeXpPerMob : xpPerKill;
  const expectedXp = lastXpFromGPT + (kills - killsAtLastGPT) * currentXpPerKill;
  
  if (currentGptXp < 50 && expectedXp > 90) {
    levelUpCount++;
    incrementLevelDuringSession();
    addLogEntry(`ðŸŽ‰ LEVEL UP #${levelUpCount}! XP reset to ${currentGptXp.toFixed(5)}%`, 'level-up');
    
    lastXpFromGPT = currentGptXp;
    lastGptReadTime = Date.now();
    killsAtLastGPT = kills;
    gptXpEl.textContent = currentGptXp.toFixed(5) + "%";
    
    // Auto recalibrate
    if (currentMode === '1v1') {
      const n = Math.max(1, Math.min(20, parseInt(calibKillsInput.value || "3", 10)));
      calibActive = true;
      calibIsNewMob = true;
      calibStartKills = kills;
      calibTargetKills = kills + n;
      calibStartXp = currentGptXp;
      xpAtLevelStart = currentGptXp;
      updateCalibButton();
      addLogEntry(`Auto-recalibrating (${n} kills)...`, 'info');
    }
    
    updateMobsToLevel();
  } else {
    lastXpFromGPT = currentGptXp;
    lastGptReadTime = Date.now();
    killsAtLastGPT = kills;
    gptXpEl.textContent = currentGptXp.toFixed(5) + "%";
    updateMobsToLevel();
  }
}

// ---- Kill registration ----
function registerKill(xpGained = null) {
  const currentXpPerKill = currentMode === 'aoe' ? aoeXpPerMob : xpPerKill;
  const xp = xpGained !== null ? xpGained : currentXpPerKill;
  
  kills += 1;
  xpSum += xp;
  recordKillTime();  // For idle check

  // Record for tempo tracking
  killTimestamps.push({
    time: Date.now(),
    xp: xp
  });
  
  // Keep only last 100 kills in memory
  if (killTimestamps.length > 100) {
    killTimestamps = killTimestamps.slice(-100);
  }

  refreshStats();
  updateMobsToLevel();
  updateTempoStats();

  if (calibActive) {
    updateCalibButton();
    if (kills >= calibTargetKills) {
      finishCalibrationWithGPT().catch(console.error);
    }
  }
}

// Register multiple kills at once (AOE mode)
function registerMultipleKills(count, totalXp) {
  const xpPerMob = count > 0 ? totalXp / count : aoeXpPerMob;
  
  for (let i = 0; i < count; i++) {
    kills += 1;
    xpSum += xpPerMob;
    
    killTimestamps.push({
      time: Date.now() - (count - i - 1) * 100,  // Spread timestamps slightly
      xp: xpPerMob
    });
  }
  
  recordKillTime();  // For idle check
  
  if (killTimestamps.length > 100) {
    killTimestamps = killTimestamps.slice(-100);
  }

  refreshStats();
  updateMobsToLevel();
  updateTempoStats();
  
  addLogEntry(`Kill #${kills} (+${count} mobs, +${totalXp.toFixed(5)}%)`, 'kill');
}

// ---- Auto-save session to Excel ----
async function saveSessionToExcel() {
  if (kills === 0 && xpSum === 0) return false;

  const now = new Date();
  const elapsed = activeMsBase + (sessionStartedAt ? Date.now() - sessionStartedAt : 0);
  const hours = elapsed / 3600000 || 0;
  const xpHr = hours > 0 ? xpSum / hours : 0;
  
  const currentXpPerKill = currentMode === 'aoe' ? aoeXpPerMob : xpPerKill;
  const endXp = lastXpFromGPT !== null ? lastXpFromGPT : null;
  
  // Get current character name
  const currentChar = await A.getCurrentChar();
  const charName = currentChar?.name || 'Unknown';
  
  let notes = `Mode: ${currentMode.toUpperCase()}`;
  if (sessionStartXp !== null && endXp !== null) {
    notes += ` | Start: ${sessionStartXp.toFixed(2)}% -> End: ${endXp.toFixed(2)}%`;
    if (levelUpCount > 0) {
      notes += ` (+${levelUpCount} lvl)`;
    }
  }
  
  // Add GPT correction info
  if (gptCorrections > 0) {
    notes += ` | GPT corrections: ${gptCorrections}`;
  }

  const sessionData = {
    date: fmtDate(sessionStartTime || now),
    startTime: sessionStartTime ? fmtTime(sessionStartTime) : '--:--:--',
    endTime: fmtTime(now),
    duration: fmtDuration(elapsed),
    kills: kills,
    xpSum: xpSum.toFixed(5),
    xpPerHour: xpHr.toFixed(5),
    xpPerKill: currentXpPerKill.toFixed(5),
    levelUps: levelUpCount,
    notes: notes,
    characterName: charName,
    level: characterLevel
  };

  try {
    const success = await A.saveSession(sessionData);
    if (success) {
      addLogEntry('Session saved to Excel', 'success');
      
      // Save last session end XP for detecting level ups between sessions
      if (endXp !== null) {
        lastSessionEndXp = endXp;
        if (lastSessionXpEl) lastSessionXpEl.textContent = endXp.toFixed(2) + '%';
        await A.setCfg({ settings: { lastSessionEndXp: endXp } });
      }
      
      return true;
    }
  } catch (e) {
    console.error('Failed to save session:', e);
  }
  return false;
}

// ---- Clear all intervals helper ----
function clearAllIntervals() {
  if (loopId) { clearInterval(loopId); loopId = null; }
  if (clockId) { clearInterval(clockId); clockId = null; }
  if (aoeLoopId) { clearInterval(aoeLoopId); aoeLoopId = null; }
  if (sanityCheckInterval) { clearInterval(sanityCheckInterval); sanityCheckInterval = null; }
  if (idleCheckId) { clearInterval(idleCheckId); idleCheckId = null; }
}

// ---- Start/Stop Tracking (can be called programmatically) ----
function startTracking() {
  if (running) return;
  if (!roi) {
    addLogEntry('Cannot start: ROI not set', 'error');
    return;
  }
  
  running = true;
  lastKillTime = Date.now();  // Reset idle timer
  
  if (sessionStartTime == null) {
    sessionStartTime = new Date();
  }
  
  if (sessionStartedAt == null) sessionStartedAt = Date.now();

  if (currentMode === '1v1') {
    if (!loopId) loopId = setInterval(runDiff, 180);
    if (!clockId) clockId = setInterval(refreshStats, 250);
    startSanityCheck();
  } else {
    // AOE mode
    if (!clockId) clockId = setInterval(refreshStats, 250);
    startAoeLoop();
  }
  
  // Start idle check if enabled
  if (autoStopIdleEnabled && !idleCheckId) {
    startIdleCheck();
  }
  
  updatePlayPauseButton();
}

async function stopTracking(reason = 'Paused') {
  if (!running) return;
  
  running = false;
  
  if (sessionStartedAt != null) {
    activeMsBase += Date.now() - sessionStartedAt;
    sessionStartedAt = null;
  }
  
  clearAllIntervals();
  updatePlayPauseButton();
  
  // Get final XP reading
  if (roi && lastXpFromGPT !== null) {
    const endXp = await readXpWithGPT();
    if (endXp !== null) {
      lastXpFromGPT = endXp;
      killsAtLastGPT = kills;
      gptXpEl.textContent = endXp.toFixed(5) + "%";
    }
  }
  
  addLogEntry(`Tracking stopped: ${reason}`, 'info');
  
  // Auto-save on stop
  if (kills > 0) {
    await saveSessionToExcel();
  }
}

// ---- Idle Check (auto-stop if no kills) ----
function startIdleCheck() {
  if (idleCheckId) clearInterval(idleCheckId);
  
  idleCheckId = setInterval(() => {
    if (!running || !autoStopIdleEnabled) return;
    
    const now = Date.now();
    const idleMs = now - (lastKillTime || now);
    const idleThresholdMs = autoStopIdleTimeout * 1000;
    
    if (idleMs >= idleThresholdMs) {
      const idleSec = Math.round(idleMs / 1000);
      stopTracking(`No kills for ${idleSec}s (auto-stop)`);
    }
  }, 5000);  // Check every 5 seconds
}

// ---- Record kill time for idle tracking ----
function recordKillTime() {
  lastKillTime = Date.now();
}

// ---- Sanity Check (1v1 mode) ----
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
    killsAtLastGPT = kills;
    gptXpEl.textContent = currentGptXp.toFixed(5) + "%";
    
    // Check for level-up
    const previousExpected = xpAtLevelStart !== null 
      ? xpAtLevelStart + (kills - calibStartKills) * xpPerKill 
      : null;
    
    if (previousExpected !== null && previousExpected > 90 && currentGptXp < 30 && !calibActive) {
      levelUpCount++;
    incrementLevelDuringSession();
      addLogEntry(`ðŸŽ‰ LEVEL UP #${levelUpCount}! XP reset to ${currentGptXp.toFixed(5)}%`, 'level-up');
      
      const n = Math.max(1, Math.min(20, parseInt(calibKillsInput.value || "3", 10)));
      calibActive = true;
      calibIsNewMob = true;
      calibStartKills = kills;
      calibTargetKills = kills + n;
      calibStartXp = currentGptXp;
      xpAtLevelStart = currentGptXp;
      
      updateMobsToLevel();
      updateCalibButton();
      addLogEntry(`Auto-recalibrating (${n} kills)...`, 'info');
      return;
    }
    
    // Sanity check
    if (xpAtLevelStart !== null) {
      const killsSinceRef = kills - calibStartKills;
      const expectedXp = xpAtLevelStart + killsSinceRef * xpPerKill;
      const totalGain = currentGptXp - xpAtLevelStart;
      const expectedKillsFromXp = totalGain / xpPerKill;
      const xpDiff = Math.abs(currentGptXp - expectedXp);
      const killDiff = Math.abs(killsSinceRef - expectedKillsFromXp);
      
      let logMsg = `GPT: ${currentGptXp.toFixed(5)}% | Gain: ${totalGain.toFixed(5)}%`;
      
      if (xpDiff > (xpPerKill * 3) && xpDiff < 50 && killDiff >= 2) {
        const correctedKills = calibStartKills + Math.round(expectedKillsFromXp);
        const correction = correctedKills - kills;
        
        if (correctedKills > 0 && Math.abs(correction) < 50) {
          xpSum += correction * xpPerKill;
          kills = correctedKills;
          refreshStats();
          logMsg += ` | Corrected: ${correction > 0 ? '+' : ''}${correction}`;
          // Track GPT correction
          gptCorrections++;
          updateCorrectionStats();
          addLogEntry(logMsg, 'warning');
        } else {
          addLogEntry(logMsg + ' | OK', 'sanity');
        }
      } else {
        addLogEntry(logMsg + ' | OK', 'sanity');
      }
    }
    
    updateMobsToLevel();
  }, SANITY_CHECK_MINUTES * 60 * 1000);
}

// ---- AOE Mode Loop ----
let lastAoeXp = null;

function startAoeLoop() {
  if (aoeLoopId) clearInterval(aoeLoopId);
  
  // Initial GPT read
  readXpWithGPT().then(xp => {
    if (xp !== null) {
      lastAoeXp = xp;
      lastXpFromGPT = xp;
      killsAtLastGPT = kills;
      gptXpEl.textContent = xp.toFixed(5) + "%";
      addLogEntry(`AOE started at ${xp.toFixed(5)}%`, 'info');
    }
  });
  
  aoeLoopId = setInterval(async () => {
    if (!running) return;
    
    const currentXp = await readXpWithGPT();
    if (currentXp === null) {
      addLogEntry('AOE poll failed: GPT read error', 'error');
      return;
    }
    
    gptXpEl.textContent = currentXp.toFixed(5) + "%";
    
    // Check for level up
    if (lastAoeXp !== null && lastAoeXp > 90 && currentXp < 30) {
      levelUpCount++;
    incrementLevelDuringSession();
      addLogEntry(`ðŸŽ‰ LEVEL UP #${levelUpCount}! XP reset to ${currentXp.toFixed(5)}%`, 'level-up');
      lastAoeXp = currentXp;
      lastXpFromGPT = currentXp;
      killsAtLastGPT = kills;
      updateMobsToLevel();
      return;
    }
    
    // Calculate XP gained
    if (lastAoeXp !== null) {
      let xpGained = currentXp - lastAoeXp;
      
      // Handle level up wrap
      if (xpGained < 0) {
        xpGained += 100;
      }
      
      if (xpGained > 0.001) {  // Threshold to avoid noise
        const mobsKilled = Math.round(xpGained / aoeXpPerMob);
        
        if (mobsKilled > 0) {
          registerMultipleKills(mobsKilled, xpGained);
          
          // Update XP per mob estimate if in calibration
          if (aoeCalibActive && aoeCalibStartXp !== null) {
            const totalXpSinceCalib = currentXp - aoeCalibStartXp;
            if (totalXpSinceCalib > 0 && kills > 0) {
              // Will update on finish
            }
          }
        }
      }
    }
    
    lastAoeXp = currentXp;
    lastXpFromGPT = currentXp;
    killsAtLastGPT = kills;
    updateMobsToLevel();
    
  }, aoePollInterval * 1000);
}

// ---- Capture + diff (1v1 mode) ----
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
      pixelKillCount++;  // Track pixel-detected kills
      
      // Log kill with XP info
      const xpGainedSinceGPT = (kills - killsAtLastGPT) * xpPerKill;
      const estXp = lastXpFromGPT !== null ? (lastXpFromGPT + xpGainedSinceGPT).toFixed(5) : '??';
      addLogEntry(`Kill #${kills} (+${xpPerKill.toFixed(5)}%)`, 'kill');
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
    await stopTracking('Paused by user');
  } else {
    // PLAY
    if (!roi) {
      alert("Please capture the XP bar first.\nClick 'Ã¢â€“Â¶ Capture Settings' below to expand.");
      showCaptureChk.checked = true;
      return;
    }
    
    startTracking();
    addLogEntry('Tracking started', 'info');
  }
});

// ---- Reset ----
resetBtn.addEventListener("click", async () => {
  btnFlash(resetBtn);
  
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
  lastAoeXp = null;
  aoeCalibActive = false;
  aoeCalibStartXp = null;
  killTimestamps = [];
  
  // Reset GPT correction stats
  gptCorrections = 0;
  pixelKillCount = 0;
  updateCorrectionStats();
  
  clearAllIntervals();
  
  refreshStats();
  updateTempoStats();
  gptXpEl.textContent = "--.--%";
  mobsToLevelEl.textContent = "--";
  timeToLevelEl.textContent = "--:--:--";
  estLevelTimeEl.textContent = "--:--";
  
  updatePlayPauseButton();
  updateCalibButton();
  updateAoeCalibButton();
  clearLog();
  addLogEntry('Session reset', 'info');
});

// ---- New Mob Button (1v1 mode) ----
newMobBtn.addEventListener("click", async () => {
  btnFlash(newMobBtn);
  
  if (!roi) {
    alert("Please capture the XP bar first.");
    return;
  }
  
  if (calibActive) {
    alert("Already calibrating! Finish current calibration first.");
    return;
  }
  
  addLogEntry('New mob - reading GPT...', 'info');
  
  const currentXp = await readXpWithGPT();
  if (currentXp === null) {
    addLogEntry('New mob failed: GPT read error', 'error');
    return;
  }
  
  lastXpFromGPT = currentXp;
  lastGptReadTime = Date.now();
  killsAtLastGPT = kills;
  gptXpEl.textContent = currentXp.toFixed(5) + "%";
  
  const n = Math.max(1, Math.min(20, parseInt(calibKillsInput.value || "3", 10)));
  calibActive = true;
  calibIsNewMob = true;
  calibStartKills = kills;
  calibTargetKills = kills + n;
  calibStartXp = currentXp;
  xpAtLevelStart = currentXp;
  
  updateMobsToLevel();
  updateCalibButton();
  
  if (!running) {
    running = true;
    if (sessionStartTime == null) sessionStartTime = new Date();
    if (sessionStartedAt == null) sessionStartedAt = Date.now();
    
    if (!loopId) loopId = setInterval(runDiff, 180);
    if (!clockId) clockId = setInterval(refreshStats, 250);
    
    startSanityCheck();
    updatePlayPauseButton();
  }
  
  addLogEntry(`New mob! XP: ${currentXp.toFixed(5)}% - Kill ${n} to calibrate`, 'success');
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
      captureBtn.textContent = `Capturing in ${i}Ã¢â‚¬Â¦`;
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

// ---- GPT Calibration (1v1 Mode) ----
calibBtn.addEventListener("click", async () => {
  btnFlash(calibBtn);
  
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
  killTimestamps = [];
  
  lastXpFromGPT = xpStart;
  lastGptReadTime = Date.now();
  killsAtLastGPT = 0;
  gptXpEl.textContent = xpStart.toFixed(5) + "%";
  
  calibActive = true;
  calibIsNewMob = false;
  calibStartKills = 0;
  calibTargetKills = n;
  calibStartXp = xpStart;
  xpAtLevelStart = xpStart;
  
  refreshStats();
  updateTempoStats();
  updateMobsToLevel();
  updateCalibButton();
  
  if (!running) {
    running = true;
    sessionStartTime = new Date();
    sessionStartedAt = Date.now();
    
    if (!loopId) loopId = setInterval(runDiff, 180);
    if (!clockId) clockId = setInterval(refreshStats, 250);
    
    updatePlayPauseButton();
  }
  
  addLogEntry(`Calibrating at ${xpStart.toFixed(5)}% - kill ${n} mobs`, 'info');
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
  killsAtLastGPT = kills;
  gptXpEl.textContent = xpEnd.toFixed(5) + "%";

  const dKills = kills - calibStartKills;
  const dXp = xpEnd - calibStartXp;

  if (dKills <= 0 || dXp <= 0) {
    addLogEntry('Calibration failed: no XP progress detected', 'error');
    calibActive = false;
    updateCalibButton();
    return;
  }

  const newXpPerKill = dXp / dKills;
  
  xpPerKill = newXpPerKill;
  xpPerKillInput.value = xpPerKill.toFixed(5);
  await A.setCfg({ settings: { xpPerKill } });
  
  addLogEntry(`Ã¢Å“â€œ Calibrated! XP/kill: ${xpPerKill.toFixed(5)}% (${dKills} kills = ${dXp.toFixed(5)}%)`, 'success');
  
  xpAtLevelStart = xpEnd;
  
  const wasNewMob = calibIsNewMob;
  
  calibActive = false;
  calibIsNewMob = false;
  updateCalibButton();
  
  if (!wasNewMob) {
    // Stop current tracking
    running = false;
    if (sessionStartedAt != null) {
      activeMsBase += Date.now() - sessionStartedAt;
      sessionStartedAt = null;
    }
    clearAllIntervals();
    updatePlayPauseButton();
    
    // Reset stats
    kills = 0;
    xpSum = 0;
    activeMsBase = 0;
    sessionStartedAt = null;
    sessionStartTime = null;
    prevMini = null;
    lastChangeAt = 0;
    levelUpCount = 0;
    calibStartKills = 0;
    killsAtLastGPT = 0;
    sessionStartXp = xpEnd;
    killTimestamps = [];
    
    refreshStats();
    updateTempoStats();
    addLogEntry('Stats reset - ready to start fresh!', 'info');
    
    // Auto-start if enabled
    if (autoStartAfterCalib) {
      startTracking();
      addLogEntry('Auto-started tracking after calibration', 'info');
    }
  } else {
    calibStartKills = kills;
    killsAtLastGPT = kills;
    addLogEntry('Continuing session with new XP/kill rate', 'info');
  }
  
  updateMobsToLevel();
}

// ---- AOE Calibration ----
aoeCalibBtn.addEventListener("click", async () => {
  btnFlash(aoeCalibBtn);
  
  if (aoeCalibActive) {
    // Finish calibration
    await finishAoeCalibration();
    return;
  }
  
  if (!roi) {
    alert("Capture the XP bar first.");
    return;
  }
  
  addLogEntry('Starting AOE calibration - reading GPT...', 'info');
  
  const xpStart = await readXpWithGPT();
  if (xpStart == null) {
    addLogEntry('AOE calibration failed: GPT read error', 'error');
    return;
  }
  
  // Reset stats
  kills = 0;
  xpSum = 0;
  activeMsBase = 0;
  sessionStartedAt = null;
  sessionStartTime = null;
  levelUpCount = 0;
  killTimestamps = [];
  lastAoeXp = xpStart;
  
  lastXpFromGPT = xpStart;
  killsAtLastGPT = 0;
  gptXpEl.textContent = xpStart.toFixed(5) + "%";
  
  aoeCalibActive = true;
  aoeCalibStartXp = xpStart;
  aoeCalibStartTime = Date.now();
  
  refreshStats();
  updateTempoStats();
  updateAoeCalibButton();
  
  addLogEntry(`AOE Calibration started at ${xpStart.toFixed(5)}% - kill mobs then press Finish`, 'info');
});

async function finishAoeCalibration() {
  const xpEnd = await readXpWithGPT();
  if (xpEnd == null) {
    addLogEntry('AOE calibration finish failed: GPT read error', 'error');
    aoeCalibActive = false;
    updateAoeCalibButton();
    return;
  }
  
  lastXpFromGPT = xpEnd;
  killsAtLastGPT = kills;
  gptXpEl.textContent = xpEnd.toFixed(5) + "%";
  
  const xpGained = xpEnd - aoeCalibStartXp;
  
  if (xpGained <= 0) {
    addLogEntry('AOE calibration failed: no XP gained', 'error');
    aoeCalibActive = false;
    updateAoeCalibButton();
    return;
  }
  
  
  // Get mob count from input field
  const mobs = parseInt(aoeMobCountInput.value) || 3;
  
  if (mobs <= 0) {
    addLogEntry('AOE calibration failed: invalid mob count', 'error');
    aoeCalibActive = false;
    updateAoeCalibButton();
    return;
  }
  
  const newXpPerMob = xpGained / mobs;
  
  aoeXpPerMob = newXpPerMob;
  aoeXpPerMobInput.value = aoeXpPerMob.toFixed(5);
  await A.setCfg({ settings: { aoeXpPerMob } });
  
  addLogEntry(`âœ“ AOE Calibrated! XP/mob: ${aoeXpPerMob.toFixed(5)}% (${mobs} mobs = ${xpGained.toFixed(5)}%)`, 'success');
  
  // Reset for fresh start
  kills = 0;
  xpSum = 0;
  activeMsBase = 0;
  sessionStartedAt = null;
  sessionStartTime = null;
  lastAoeXp = xpEnd;
  killTimestamps = [];
  
  aoeCalibActive = false;
  aoeCalibStartXp = null;
  
  refreshStats();
  updateTempoStats();
  updateAoeCalibButton();
  
  addLogEntry('Ready to start AOE tracking!', 'info');
}

// ---- GPT Read XP ----
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

// ---- Level Tracking ----
async function checkForLevelUpBetweenSessions() {
  if (lastSessionEndXp === null) return;
  
  // Read current XP
  const currentXp = await readXpWithGPT();
  if (currentXp === null) return;
  
  // If current XP is significantly lower than last session end XP, we likely leveled up
  // (e.g., ended at 96%, now at 20% = level up happened)
  if (lastSessionEndXp > 50 && currentXp < lastSessionEndXp - 30) {
    // Calculate how many level ups might have occurred
    const estimatedLevelUps = Math.ceil((lastSessionEndXp - currentXp + 100) / 100);
    if (estimatedLevelUps > 0 && estimatedLevelUps < 10) {
      characterLevel += estimatedLevelUps;
      if (charLevelInput) charLevelInput.value = String(characterLevel);
      await A.setCfg({ settings: { characterLevel } });
      
      const xpGainedOutside = (100 - lastSessionEndXp) + currentXp + ((estimatedLevelUps - 1) * 100);
      addLogEntry(`Detected ${estimatedLevelUps} level up(s) outside session! (+${xpGainedOutside.toFixed(1)}% quest/dungeon XP)`, 'level-up');
      addLogEntry(`Level updated: ${characterLevel - estimatedLevelUps} â†’ ${characterLevel}`, 'success');
      
      // Save this as quest/dungeon XP for Excel
      await saveOutsideXpToExcel(xpGainedOutside, estimatedLevelUps);
    }
  }
  
  // Update last session XP display
  if (lastSessionXpEl) {
    lastSessionXpEl.textContent = currentXp.toFixed(2) + '%';
  }
}

async function saveOutsideXpToExcel(xpGained, levelUps) {
  const now = new Date();
  const sessionData = {
    date: fmtDate(now),
    startTime: '--:--:--',
    endTime: fmtTime(now),
    duration: '--:--:--',
    kills: 0,
    xpSum: xpGained.toFixed(5),
    xpPerHour: '0.00000',
    xpPerKill: '0.00000',
    levelUps: levelUps,
    notes: 'Quest/Dungeon XP (outside session)'
  };
  
  try {
    await A.saveSession(sessionData);
  } catch (e) {
    console.error('Failed to save outside XP:', e);
  }
}

// Level input change listener
if (charLevelInput) {
  charLevelInput.addEventListener('change', async () => {
    characterLevel = Math.max(1, Math.round(parseInt(charLevelInput.value) || 1));
    charLevelInput.value = String(characterLevel);
    await A.setCfg({ settings: { characterLevel } });
  });
}

// Update level on level up during session
function incrementLevelDuringSession() {
  characterLevel++;
  if (charLevelInput) charLevelInput.value = String(characterLevel);
  A.setCfg({ settings: { characterLevel } }).catch(console.error);
}