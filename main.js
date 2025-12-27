// main.js â€” BrowserView + classic ROI: Set-at-mouse + mouse-only reshape overlay + Session Logging
const { app, BrowserWindow, BrowserView, ipcMain, screen, shell, safeStorage } = require('electron');
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
  // Check config first (set via launcher settings)
  if (cfg.openaiKey) return cfg.openaiKey;
  
  // Then check environment variable
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  
  // Then check cached value
  if (cachedGPTKey !== null) return cachedGPTKey;

  // Finally check gpt-config.json file (with encryption support)
  try {
    const txt = fs.readFileSync(GPT_CFG_PATH, 'utf8');
    const j = JSON.parse(txt);
    
    // Check for encrypted key first
    if (j && j.encryptedKey) {
      if (safeStorage.isEncryptionAvailable()) {
        try {
          const buffer = Buffer.from(j.encryptedKey, 'base64');
          const decrypted = safeStorage.decryptString(buffer);
          if (decrypted) {
            cachedGPTKey = decrypted;
            return cachedGPTKey;
          }
        } catch (decryptError) {
          console.warn('Failed to decrypt API key:', decryptError.message);
        }
      }
    }
    
    // Handle legacy plaintext keys - migrate to encrypted
    if (j && typeof j.openaiKey === 'string') {
      const trimmed = j.openaiKey.trim();
      if (trimmed) {
        // Migrate to encrypted storage
        if (safeStorage.isEncryptionAvailable()) {
          try {
            const encrypted = safeStorage.encryptString(trimmed);
            fs.writeFileSync(GPT_CFG_PATH, JSON.stringify({
              encryptedKey: encrypted.toString('base64')
            }));
            console.log('API key migrated to encrypted storage');
          } catch (encryptError) {
            console.warn('Failed to encrypt API key:', encryptError.message);
          }
        }
        cachedGPTKey = trimmed;
        return cachedGPTKey;
      }
    }
  } catch {}

  return null;
}

// Save encrypted OpenAI key
function saveEncryptedOpenAIKey(key) {
  if (!key || typeof key !== 'string') {
    throw new Error('Invalid API key');
  }
  
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error('API key cannot be empty');
  }
  
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('Encryption not available, storing key in plaintext');
    fs.writeFileSync(GPT_CFG_PATH, JSON.stringify({ openaiKey: trimmed }));
    cachedGPTKey = trimmed;
    return;
  }
  
  try {
    const encrypted = safeStorage.encryptString(trimmed);
    fs.writeFileSync(GPT_CFG_PATH, JSON.stringify({
      encryptedKey: encrypted.toString('base64')
    }));
    cachedGPTKey = trimmed;
    console.log('API key encrypted and saved successfully');
  } catch (error) {
    console.error('Failed to encrypt API key:', error);
    throw error;
  }
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
    
    // Get character name for sheet, sanitize for Excel (max 31 chars, no special chars)
    const charName = sessionData.characterName || 'Unknown';
    const sheetName = charName.replace(/[\\\/\*\?\[\]:]/g, '_').substring(0, 31);
    const level = sessionData.level || '?';

    // Try to load existing workbook
    if (fs.existsSync(SESSION_LOG_PATH)) {
      try {
        workbook = XLSX.readFile(SESSION_LOG_PATH);
      } catch (e) {
        console.warn('Could not read existing session log, creating new one:', e.message);
        workbook = null;
      }
    }

    // Create new workbook if needed
    if (!workbook) {
      workbook = XLSX.utils.book_new();
    }

    // Get existing data from character's sheet (or create new)
    let existingData = [];
    if (workbook.Sheets[sheetName]) {
      existingData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    }

    // Add new session data
    const newRow = {
      'Date': sessionData.date,
      'Start Time': sessionData.startTime,
      'End Time': sessionData.endTime,
      'Duration': sessionData.duration,
      'Level': level,
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
      { wch: 8 },   // Level
      { wch: 12 },  // Total Kills
      { wch: 14 },  // Total XP
      { wch: 12 },  // XP/Hour
      { wch: 12 },  // XP/Kill
      { wch: 10 },  // Level Ups
      { wch: 50 },  // Notes (wider for XP details)
    ];

    // Remove old sheet if exists
    if (workbook.Sheets[sheetName]) {
      delete workbook.Sheets[sheetName];
      const idx = workbook.SheetNames.indexOf(sheetName);
      if (idx > -1) workbook.SheetNames.splice(idx, 1);
    }
    
    // Add sheet for this character
    XLSX.utils.book_append_sheet(workbook, newWorksheet, sheetName);

    // Save workbook
    XLSX.writeFile(workbook, SESSION_LOG_PATH);
    console.log(`Session saved to: ${SESSION_LOG_PATH} (sheet: ${sheetName})`);
    return true;
  } catch (e) {
    console.error('Failed to save session to Excel:', e);
    return false;
  }
}

// ---------- Input Validation Helpers ----------
function validateSessionData(data) {
  if (!data || typeof data !== 'object') return false;
  
  // Required fields
  if (!data.characterName || typeof data.characterName !== 'string') return false;
  if (!data.date || typeof data.date !== 'string') return false;
  
  // Numeric validations
  if (typeof data.kills !== 'number' || data.kills < 0) return false;
  
  // Sanitize string fields (prevent excessively long strings)
  data.characterName = String(data.characterName).substring(0, 100);
  if (data.notes) {
    data.notes = String(data.notes).substring(0, 500);
  }
  
  return true;
}

// URL whitelist for game loading
const ALLOWED_GAME_URLS = [
  'https://universe.flyff.com/play',
  'about:blank'
];

function isAllowedGameURL(url) {
  return ALLOWED_GAME_URLS.includes(url);
}

// Path validation to prevent traversal attacks
function validateDocPath(requestedPath) {
  const normalized = path.normalize(requestedPath);
  const docDirNormalized = path.normalize(docDir);
  
  // Ensure path is within the allowed directory
  if (!normalized.startsWith(docDirNormalized)) {
    console.error('Path traversal attempt detected:', requestedPath);
    return null;
  }
  
  return normalized;
}

// IPC handler for saving sessions - with validation
ipcMain.handle('session:save', (_event, sessionData) => {
  if (!validateSessionData(sessionData)) {
    console.error('Invalid session data received');
    return false;
  }
  return saveSessionToExcel(sessionData);
});

// IPC handler to get the log file path
ipcMain.handle('session:get-log-path', () => {
  return SESSION_LOG_PATH;
});

// IPC handler to open the log folder in file explorer - with validation
ipcMain.handle('session:open-folder', () => {
  const validPath = validateDocPath(docDir);
  if (!validPath) return false;
  
  shell.openPath(validPath);
  return true;
});

// IPC handler to reload the game (for Save Prems feature) - with URL validation
ipcMain.handle('game:reload', (event) => {
  const result = getTrackerFromEvent(event);
  if (result && result.trackerData.gameView && result.trackerData.gameView.webContents) {
    const url = 'https://universe.flyff.com/play';
    if (!isAllowedGameURL(url)) {
      console.error('Blocked attempt to load unauthorized URL:', url);
      return false;
    }
    result.trackerData.gameView.webContents.loadURL(url);
    return true;
  }
  return false;
});

// IPC handler to close/stop the game view
ipcMain.handle('game:stop', (event) => {
  const result = getTrackerFromEvent(event);
  if (result && result.trackerData.gameView && result.trackerData.gameView.webContents) {
    result.trackerData.gameView.webContents.loadURL('about:blank');
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
  characters: [],
  openaiKey: '',
  windowBounds: {},  // Store window positions per character ID
  settings: {
    xpPerKill: 0.05,
    diffTrigger: 0.065,
    diffCooldown: 800,
    side: 'left',
    sidebarWidth: 320,
    trackingMode: '1v1',
    aoePollInterval: 25,
    aoeXpPerMob: 0.05,
    autoStartAfterCalib: true,
    autoStopIdleEnabled: true,
    autoStopIdleTimeout: 60,
    tempoWindow: 50
  }
};

function loadCfg() {
  try {
    const j = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
    if (j && typeof j === 'object') {
      cfg.settings = { ...cfg.settings, ...(j.settings || {}) };
      cfg.characters = Array.isArray(j.characters) ? j.characters : [];
      cfg.openaiKey = j.openaiKey || '';
      cfg.windowBounds = j.windowBounds || {};
      const r = j.roi;
      cfg.roi = (r && r.width >= 6 && r.height >= 6) ? r : null;
      
      // Also cache the OpenAI key
      if (cfg.openaiKey) {
        cachedGPTKey = cfg.openaiKey;
      }
    }
  } catch {}
}

function saveCfg() {
  try {
    fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2));
  } catch {}
}

// ---------- Windows & BrowserView ----------
let launcherWin = null;
let trackerWindows = new Map();  // charId -> { win, gameView }
let lastGameRect = { x: 0, y: 0, width: 800, height: 600 };

let roiOverlay = null;
let reshapeResolve = null;
let overlayOpen = false;

let currentCharacter = null;  // For the focused tracker window

function createLauncherWindow() {
  // Get saved launcher bounds
  const savedBounds = cfg.windowBounds?.launcher;
  
  const windowOptions = {
    width: savedBounds?.width || 480,
    height: savedBounds?.height || 520,
    minWidth: 400,
    minHeight: 400,
    backgroundColor: '#05050a',
    resizable: true,
    webPreferences: {
      contextIsolation: true,           // SECURE: Enable isolation
      nodeIntegration: false,            // SECURE: Disable node access
      sandbox: false,                    // Disabled for preload compatibility
      preload: path.join(__dirname, 'launcher-preload.js')
    }
  };
  
  // Apply saved position if available
  if (savedBounds?.x !== undefined && savedBounds?.y !== undefined) {
    windowOptions.x = savedBounds.x;
    windowOptions.y = savedBounds.y;
  }
  
  launcherWin = new BrowserWindow(windowOptions);

  launcherWin.setMenuBarVisibility(false);
  launcherWin.loadFile('launcher.html');
  
  // Function to save window bounds
  const saveWindowBounds = () => {
    if (launcherWin.isDestroyed()) return;
    const bounds = launcherWin.getBounds();
    if (!cfg.windowBounds) cfg.windowBounds = {};
    cfg.windowBounds.launcher = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    };
    saveCfg();
  };
  
  // Save bounds on move and resize (debounced)
  let saveTimeout = null;
  const debouncedSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveWindowBounds, 500);
  };
  
  launcherWin.on('move', debouncedSave);
  launcherWin.on('resize', debouncedSave);
  
  launcherWin.on('closed', () => {
    saveWindowBounds();
    launcherWin = null;
    // Close all tracker windows when launcher closes
    trackerWindows.forEach(({ win }) => {
      if (win && !win.isDestroyed()) win.close();
    });
    trackerWindows.clear();
  });
}

function createTrackerWindow(character) {
  const charId = character.id;
  const trackingMode = character.trackingMode || '1v1';
  
  // If already open, focus it
  if (trackerWindows.has(charId)) {
    const { win } = trackerWindows.get(charId);
    if (win && !win.isDestroyed()) {
      win.focus();
      return;
    }
  }
  
  // Create new window for this character
  const isGameOnly = trackingMode === 'none';
  
  // Get saved window bounds for this character
  const savedBounds = cfg.windowBounds?.[charId];
  const defaultWidth = isGameOnly ? 1200 : 1400;
  const defaultHeight = 900;
  
  const windowOptions = {
    width: savedBounds?.width || defaultWidth,
    height: savedBounds?.height || defaultHeight,
    backgroundColor: '#05050a',
    title: `Flyff - ${character.name}`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
  
  // Apply saved position if available
  if (savedBounds?.x !== undefined && savedBounds?.y !== undefined) {
    windowOptions.x = savedBounds.x;
    windowOptions.y = savedBounds.y;
  }
  
  const win = new BrowserWindow(windowOptions);

  win.setMenuBarVisibility(false);
  
  // Function to save window bounds
  const saveWindowBounds = () => {
    if (win.isDestroyed()) return;
    const bounds = win.getBounds();
    if (!cfg.windowBounds) cfg.windowBounds = {};
    cfg.windowBounds[charId] = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    };
    saveCfg();
  };
  
  // Save bounds on move and resize (debounced)
  let saveTimeout = null;
  const debouncedSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveWindowBounds, 500);
  };
  
  win.on('move', debouncedSave);
  win.on('resize', debouncedSave);
  
  // Create game view for this window
  const gameView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      javascript: true,
      partition: `persist:char-${charId}`  // Separate session per character
    }
  });

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  gameView.webContents.setUserAgent(ua);
  
  // Store reference with initial gameRect
  const trackerData = { 
    win, 
    gameView, 
    character,
    gameRect: { x: 0, y: 0, width: 800, height: 600 }  // Will be updated by renderer
  };
  trackerWindows.set(charId, trackerData);
  
  if (isGameOnly) {
    // Game only mode - just show game fullscreen
    win.setBrowserView(gameView);
    gameView.webContents.loadURL('https://universe.flyff.com/play');
    
    const updateBounds = () => {
      if (win.isDestroyed()) return;
      const bounds = win.getContentBounds();
      const gameRect = { x: 0, y: 0, width: bounds.width, height: bounds.height };
      gameView.setBounds(gameRect);
      trackerData.gameRect = gameRect;
    };
    
    updateBounds();
    win.on('resize', updateBounds);
  } else {
    // Tracker mode - load tracker UI, then attach game view
    win.loadFile('index.html');
    
    win.webContents.once('did-finish-load', () => {
      win.setBrowserView(gameView);
      gameView.webContents.loadURL('https://universe.flyff.com/play');
      
      // Set initial bounds based on sidebar
      const bounds = win.getContentBounds();
      const sidebarWidth = cfg.settings?.sidebarWidth || 320;
      const initialGameRect = {
        x: sidebarWidth,
        y: 0,
        width: bounds.width - sidebarWidth,
        height: bounds.height
      };
      gameView.setBounds(initialGameRect);
      trackerData.gameRect = initialGameRect;
      console.log('[Tracker] Initial gameRect:', initialGameRect);
    });
    
    // Also handle window resize
    win.on('resize', () => {
      // Let the renderer handle the resize via fitGameToContent
    });
  }
  
  // Track focus for IPC routing
  win.on('focus', () => {
    currentCharacter = character;
  });
  
  win.on('closed', () => {
    // Save final position before cleanup
    saveWindowBounds();
    trackerWindows.delete(charId);
    if (currentCharacter?.id === charId) {
      currentCharacter = null;
    }
  });
  
  // Setup global hotkey listener for cooldown timers and key forwarding on the game view
  gameView.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      // Build hotkey string
      let keyName = input.key;
      if (keyName === ' ') keyName = 'Space';
      if (keyName.length === 1) keyName = keyName.toUpperCase();
      
      const modifiers = [];
      if (input.control) modifiers.push('Ctrl');
      if (input.alt) modifiers.push('Alt');
      if (input.shift && !['Shift'].includes(input.key)) modifiers.push('Shift');
      
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(input.key)) return;
      
      const fullKey = modifiers.length > 0 
        ? `${modifiers.join('+')}+${keyName}`
        : keyName;
      
      // Handle cooldown timer hotkeys
      if (cooldownWin && !cooldownWin.isDestroyed()) {
        const timerId = registeredHotkeys.get(fullKey);
        if (timerId) {
          cooldownWin.webContents.send('cooldown:hotkey-pressed', {
            timerId,
            hotkey: fullKey,
            charId: charId,
            charName: character.name
          });
        }
      }
      
      // Handle key forwarding
      handleKeyForwarding(charId, fullKey);
    }
  });
  
  console.log(`[Launcher] Opened ${isGameOnly ? 'game' : 'tracker'} for: ${character.name}`);
}

function closeTrackerWindow(charId) {
  if (trackerWindows.has(charId)) {
    const { win } = trackerWindows.get(charId);
    if (win && !win.isDestroyed()) {
      win.close();
    }
    trackerWindows.delete(charId);
  }
}

function focusTrackerWindow(charId) {
  if (trackerWindows.has(charId)) {
    const { win } = trackerWindows.get(charId);
    if (win && !win.isDestroyed()) {
      win.focus();
    }
  }
}

function getOpenTrackerIds() {
  const ids = [];
  trackerWindows.forEach((_, charId) => {
    ids.push(charId);
  });
  return ids;
}

// Get the tracker data for the window that sent the IPC message
function getTrackerFromEvent(event) {
  for (const [charId, trackerData] of trackerWindows) {
    if (trackerData.win && !trackerData.win.isDestroyed() && trackerData.win.webContents === event.sender) {
      return { charId, trackerData };
    }
  }
  return null;
}

// ---------- Launcher IPC handlers ----------
ipcMain.handle('launcher:start-tracker', (_e, character) => {
  createTrackerWindow(character);
  return true;
});

ipcMain.handle('launcher:close-tracker', (_e, charId) => {
  closeTrackerWindow(charId);
  return true;
});

ipcMain.handle('launcher:focus-tracker', (_e, charId) => {
  focusTrackerWindow(charId);
  return true;
});

ipcMain.handle('launcher:get-open-trackers', () => {
  return getOpenTrackerIds();
});

ipcMain.handle('launcher:back', (event) => {
  // Close the tracker window that sent this
  const result = getTrackerFromEvent(event);
  if (result) {
    closeTrackerWindow(result.charId);
  }
  // Focus launcher
  if (launcherWin && !launcherWin.isDestroyed()) {
    launcherWin.focus();
  }
  return true;
});

ipcMain.handle('launcher:get-current-char', (event) => {
  const result = getTrackerFromEvent(event);
  return result ? result.trackerData.character : null;
});

// ---------- IPC: config & layout ----------
ipcMain.handle('cfg:get', () => cfg);

ipcMain.handle('cfg:set', (_e, patch) => {
  if (patch && typeof patch === 'object') {
    // Handle characters array
    if (Array.isArray(patch.characters)) {
      cfg.characters = patch.characters;
    }
    
    // Handle OpenAI key - save encrypted
    if (typeof patch.openaiKey === 'string') {
      const trimmedKey = patch.openaiKey.trim();
      if (trimmedKey) {
        try {
          saveEncryptedOpenAIKey(trimmedKey);
          cfg.openaiKey = trimmedKey;
        } catch (e) {
          console.error('Failed to save encrypted API key:', e);
          // Fallback to config
          cfg.openaiKey = trimmedKey;
          cachedGPTKey = trimmedKey;
        }
      } else {
        cfg.openaiKey = '';
        cachedGPTKey = null;
      }
    }
    
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
      
      // AOE Mode settings
      if (s.trackingMode === '1v1' || s.trackingMode === 'aoe')
        cfg.settings.trackingMode = s.trackingMode;
      
      if (typeof s.aoePollInterval === 'number' && s.aoePollInterval >= 10 && s.aoePollInterval <= 60)
        cfg.settings.aoePollInterval = Math.round(s.aoePollInterval);
      
      if (typeof s.aoeXpPerMob === 'number' && s.aoeXpPerMob >= 0)
        cfg.settings.aoeXpPerMob = s.aoeXpPerMob;
      
      // Auto tracking settings
      if (typeof s.autoStartAfterCalib === 'boolean')
        cfg.settings.autoStartAfterCalib = s.autoStartAfterCalib;
      
      if (typeof s.autoStopIdleEnabled === 'boolean')
        cfg.settings.autoStopIdleEnabled = s.autoStopIdleEnabled;
      
      if (typeof s.autoStopIdleTimeout === 'number' && s.autoStopIdleTimeout >= 10 && s.autoStopIdleTimeout <= 600)
        cfg.settings.autoStopIdleTimeout = Math.round(s.autoStopIdleTimeout);
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

ipcMain.handle('game:set-rect', (event, rect) => {
  const result = getTrackerFromEvent(event);
  if (!result || !result.trackerData.gameView || !rect) {
    console.log('[game:set-rect] No tracker or rect:', { hasResult: !!result, rect });
    return false;
  }

  const { trackerData } = result;

  try {
    const gameRect = {
      x: Math.max(0, Math.floor(rect.x)),
      y: Math.max(0, Math.floor(rect.y)),
      width: Math.max(1, Math.floor(rect.width)),
      height: Math.max(1, Math.floor(rect.height))
    };

    trackerData.gameView.setBounds(gameRect);
    // Store directly on the trackerData object in the Map
    trackerData.gameRect = gameRect;
    console.log('[game:set-rect] Set gameRect:', gameRect);
    return true;
  } catch (e) {
    console.error('game:set-rect failed', e);
    return false;
  }
});

ipcMain.handle('game:capture-roi', async (event) => {
  const result = getTrackerFromEvent(event);
  if (!result || !result.trackerData.gameView || !cfg.roi) return null;
  try {
    const img = await result.trackerData.gameView.webContents.capturePage(cfg.roi);
    return img.toDataURL();
  } catch (e) {
    console.error('capture-roi failed:', e);
    return null;
  }
});

ipcMain.handle('game:get-cursor-in-game', (event) => {
  const result = getTrackerFromEvent(event);
  if (!result || !result.trackerData.win) return null;

  const { trackerData } = result;
  const gameRect = trackerData.gameRect || { x: 0, y: 0, width: 800, height: 600 };
  const mouse = screen.getCursorScreenPoint();
  const content = trackerData.win.getContentBounds();

  const x = mouse.x - content.x - gameRect.x;
  const y = mouse.y - content.y - gameRect.y;

  if (x < 0 || y < 0 || x >= gameRect.width || y >= gameRect.height)
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

// Store the current reshape context
let reshapeContext = null;

ipcMain.handle('roi:open-reshape', (event) => {
  const result = getTrackerFromEvent(event);
  if (!result || !result.trackerData.win || !result.trackerData.gameView) return false;

  const { trackerData } = result;

  if (roiOverlay) {
    try { roiOverlay.close(); } catch {}
    roiOverlay = null;
  }

  reshapeContext = trackerData;
  
  // Get gameRect directly from the gameView's current bounds
  let gameRect;
  try {
    gameRect = trackerData.gameView.getBounds();
    console.log('[ROI] Got gameRect from gameView.getBounds():', gameRect);
  } catch (e) {
    console.error('[ROI] Failed to get gameView bounds:', e);
    gameRect = trackerData.gameRect || { x: 0, y: 0, width: 800, height: 600 };
  }
  
  // Make sure we have valid dimensions
  if (!gameRect || gameRect.width < 100 || gameRect.height < 100) {
    console.warn('[ROI] Invalid gameRect, using fallback');
    gameRect = { x: 320, y: 0, width: 800, height: 600 };
  }
  
  const contentBounds = trackerData.win.getContentBounds();
  const overlayBounds = {
    x: contentBounds.x + Math.floor(gameRect.x),
    y: contentBounds.y + Math.floor(gameRect.y),
    width: Math.floor(gameRect.width),
    height: Math.floor(gameRect.height)
  };
  
  console.log('[ROI] Creating overlay:', { contentBounds, gameRect, overlayBounds });

  roiOverlay = new BrowserWindow({
    parent: trackerData.win,
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
      contextIsolation: true,           // SECURE: Enable isolation
      nodeIntegration: false,            // SECURE: Disable node access
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

  // SECURE: No require('electron') - uses global result variable that main process reads
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
        // SECURE: No require() - uses window.__roiResult for main process to read
        const frame = document.getElementById('frame');
        const hud   = document.getElementById('hud');
        let box = { x:${r.x}, y:${r.y}, w:${r.width}, h:${r.height} };
        const minW=16, minH=12;

        // Result storage for main process to read via executeJavaScript
        window.__roiResult = null;
        window.__roiDone = false;
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

        // SECURE: Set result and mark done - main process polls for completion
        document.getElementById('applyBtn').onclick = () => {
          window.__roiResult = window.__getBox();
          window.__roiDone = true;
        };
        document.getElementById('cancelBtn').onclick = () => {
          window.__roiResult = null;
          window.__roiDone = true;
        };

        render();
      </script>
    </body></html>
  `;

  roiOverlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  roiOverlay.once('ready-to-show', () => {
    // Check if overlay still exists (could be closed before ready)
    if (!roiOverlay || roiOverlay.isDestroyed()) {
      return;
    }
    
    roiOverlay.setIgnoreMouseEvents(false);
    roiOverlay.showInactive();
    
    // SECURE: Poll for completion instead of using IPC
    const pollInterval = setInterval(async () => {
      if (!roiOverlay || roiOverlay.isDestroyed()) {
        clearInterval(pollInterval);
        return;
      }
      
      try {
        const done = await roiOverlay.webContents.executeJavaScript('window.__roiDone', true);
        if (done) {
          clearInterval(pollInterval);
          const result = await roiOverlay.webContents.executeJavaScript('window.__roiResult', true);
          finalizeReshape(result);
        }
      } catch (e) {
        // Window may have been destroyed
        clearInterval(pollInterval);
      }
    }, 100);
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

// Legacy handler removed - ROI now uses polling
// ipcMain.handle('roi:reshape:return', ...) no longer needed

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
      console.error('Value outside 0â€“100 range:', value);
      return null;
    }

    return value;
  } catch (err) {
    console.error('gpt:read-xp failed:', err);
    return null;
  }
});

// ---------- Cooldown Timer Window ----------
let cooldownWin = null;
let cooldownData = {
  timers: [],
  settings: {
    alwaysOnTop: true,
    flashOnComplete: true,
    soundOnComplete: false,
    flashDuration: 2000
  }
};
const COOLDOWN_CFG_PATH = path.join(docDir, 'cooldown-config.json');

// Load cooldown data
function loadCooldownData() {
  try {
    const data = JSON.parse(fs.readFileSync(COOLDOWN_CFG_PATH, 'utf8'));
    if (data) {
      cooldownData = { ...cooldownData, ...data };
    }
  } catch {}
}

function saveCooldownData() {
  try {
    fs.writeFileSync(COOLDOWN_CFG_PATH, JSON.stringify(cooldownData, null, 2));
  } catch (e) {
    console.error('Failed to save cooldown data:', e);
  }
}

function createCooldownWindow() {
  if (cooldownWin && !cooldownWin.isDestroyed()) {
    cooldownWin.focus();
    return;
  }

  loadCooldownData();

  cooldownWin = new BrowserWindow({
    width: 300,
    height: 400,
    minWidth: 260,
    minHeight: 200,
    backgroundColor: '#05050a',
    alwaysOnTop: false, // We'll set this properly below with the right level
    frame: true,
    resizable: true,
    webPreferences: {
      contextIsolation: true,         // SECURE: Enable isolation
      nodeIntegration: false,          // SECURE: Disable Node access
      sandbox: false,                  // Disabled - contextIsolation provides security
      preload: path.join(__dirname, 'cooldown-preload.js')
    }
  });

  // Set always on top with 'pop-up-menu' level - higher than game overlay's default level
  if (cooldownData.settings.alwaysOnTop) {
    cooldownWin.setAlwaysOnTop(true, 'pop-up-menu');
  }

  cooldownWin.setMenuBarVisibility(false);
  cooldownWin.loadFile('cooldown.html');

  cooldownWin.on('closed', () => {
    // Unregister all hotkeys when window closes
    unregisterAllCooldownHotkeys();
    cooldownWin = null;
  });
}

// Global hotkey handling for cooldown timers
const registeredHotkeys = new Map(); // hotkey -> timerId

function registerCooldownHotkey(timerId, hotkey) {
  if (!hotkey) return false;
  
  // Store the mapping
  registeredHotkeys.set(hotkey, timerId);
  return true;
}

function unregisterAllCooldownHotkeys() {
  registeredHotkeys.clear();
}

// Listen for keyboard events in the app
// We'll use a different approach - listen at the renderer level and forward
// For true global hotkeys, we'd need uiohook-napi, but for in-app we can use before-input-event

function setupGlobalHotkeyListeners() {
  // This sets up listeners on all tracker windows to forward key presses to cooldown
  trackerWindows.forEach(({ win }) => {
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && cooldownWin && !cooldownWin.isDestroyed()) {
          // Build hotkey string
          let keyName = input.key;
          if (keyName === ' ') keyName = 'Space';
          if (keyName.length === 1) keyName = keyName.toUpperCase();
          
          const modifiers = [];
          if (input.control) modifiers.push('Ctrl');
          if (input.alt) modifiers.push('Alt');
          if (input.shift && !['Shift'].includes(input.key)) modifiers.push('Shift');
          
          if (['Control', 'Alt', 'Shift', 'Meta'].includes(input.key)) return;
          
          const fullKey = modifiers.length > 0 
            ? `${modifiers.join('+')}+${keyName}`
            : keyName;
          
          // Check if this hotkey is registered
          const timerId = registeredHotkeys.get(fullKey);
          if (timerId) {
            cooldownWin.webContents.send('cooldown:hotkey-pressed', timerId);
          }
        }
      });
    }
  });
}

// IPC Handlers for cooldown
ipcMain.handle('cooldown:get-data', () => {
  loadCooldownData();
  return cooldownData;
});

ipcMain.handle('cooldown:set-data', (_e, data) => {
  cooldownData = { ...cooldownData, ...data };
  saveCooldownData();
  return true;
});

ipcMain.handle('cooldown:set-always-on-top', (_e, value) => {
  if (cooldownWin && !cooldownWin.isDestroyed()) {
    cooldownWin.setAlwaysOnTop(value, 'pop-up-menu');
  }
  return true;
});

ipcMain.handle('cooldown:register-hotkey', (_e, timerId, hotkey) => {
  return registerCooldownHotkey(timerId, hotkey);
});

// Auto-press: Send a key to a specific character's game window
ipcMain.handle('cooldown:send-key', (_e, charId, key) => {
  if (!charId || !key) return false;
  return forwardKeyToCharacter(charId, key);
});

ipcMain.handle('cooldown:unregister-all-hotkeys', () => {
  unregisterAllCooldownHotkeys();
  return true;
});

// Launcher IPC for opening cooldown window
ipcMain.handle('launcher:open-cooldown', () => {
  createCooldownWindow();
  return true;
});

// Get characters list for cooldown window
ipcMain.handle('cooldown:get-characters', () => {
  return cfg.characters || [];
});

// ---------- Key Forwarder Window ----------
let keyforwardWin = null;
let keyforwardData = {
  rules: [],
  enabled: true
};
const KEYFORWARD_CFG_PATH = path.join(docDir, 'keyforward-config.json');

function loadKeyforwardData() {
  try {
    const data = JSON.parse(fs.readFileSync(KEYFORWARD_CFG_PATH, 'utf8'));
    if (data) {
      keyforwardData = { ...keyforwardData, ...data };
    }
  } catch {}
}

function saveKeyforwardData() {
  try {
    fs.writeFileSync(KEYFORWARD_CFG_PATH, JSON.stringify(keyforwardData, null, 2));
  } catch (e) {
    console.error('Failed to save keyforward data:', e);
  }
}

function createKeyforwardWindow() {
  if (keyforwardWin && !keyforwardWin.isDestroyed()) {
    keyforwardWin.focus();
    return;
  }

  loadKeyforwardData();

  keyforwardWin = new BrowserWindow({
    width: 380,
    height: 500,
    minWidth: 320,
    minHeight: 400,
    backgroundColor: '#05050a',
    frame: true,
    resizable: true,
    webPreferences: {
      contextIsolation: true,         // SECURE: Enable isolation
      nodeIntegration: false,          // SECURE: Disable Node access
      sandbox: false,                  // Disabled - contextIsolation provides security
      preload: path.join(__dirname, 'keyforward-preload.js')
    }
  });

  keyforwardWin.setMenuBarVisibility(false);
  keyforwardWin.loadFile('keyforward.html');

  keyforwardWin.on('closed', () => {
    keyforwardWin = null;
  });
}

// Key forward IPC handlers
ipcMain.handle('keyforward:get-data', () => {
  loadKeyforwardData();
  return keyforwardData;
});

ipcMain.handle('keyforward:set-data', (_e, data) => {
  keyforwardData = { ...keyforwardData, ...data };
  saveKeyforwardData();
  return true;
});

ipcMain.handle('keyforward:get-characters', () => {
  return cfg.characters || [];
});

ipcMain.handle('launcher:open-keyforward', () => {
  createKeyforwardWindow();
  return true;
});

// Key forwarding function - sends a key to a target game window
function forwardKeyToCharacter(targetCharId, key) {
  const trackerData = trackerWindows.get(targetCharId);
  if (!trackerData || !trackerData.gameView) return false;
  
  const { gameView } = trackerData;
  if (gameView.webContents.isDestroyed()) return false;
  
  // Parse the key string
  const parts = key.split('+');
  let keyCode = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  
  // Convert key name back to actual key
  if (keyCode === 'Space') keyCode = ' ';
  if (keyCode.length === 1) keyCode = keyCode.toLowerCase();
  
  // Build modifier flags
  const hasCtrl = modifiers.includes('Ctrl');
  const hasAlt = modifiers.includes('Alt');
  const hasShift = modifiers.includes('Shift');
  
  // Send keydown and keyup events
  const keyEvent = {
    type: 'keyDown',
    keyCode: keyCode,
    modifiers: []
  };
  
  if (hasCtrl) keyEvent.modifiers.push('control');
  if (hasAlt) keyEvent.modifiers.push('alt');
  if (hasShift) keyEvent.modifiers.push('shift');
  
  gameView.webContents.sendInputEvent(keyEvent);
  
  // Also send keyup
  setTimeout(() => {
    if (!gameView.webContents.isDestroyed()) {
      gameView.webContents.sendInputEvent({ ...keyEvent, type: 'keyUp' });
    }
  }, 50);
  
  return true;
}

// Check if a key should be forwarded and do so
function handleKeyForwarding(sourceCharId, keyString) {
  if (!keyforwardData.enabled) return;
  
  for (const rule of keyforwardData.rules) {
    if (rule.enabled === false) continue;
    if (rule.sourceCharId !== sourceCharId) continue;
    if (!rule.keys.includes(keyString)) continue;
    
    // Forward this key to the target
    const success = forwardKeyToCharacter(rule.targetCharId, keyString);
    if (success) {
      console.log(`[KeyForward] ${keyString} from ${sourceCharId} -> ${rule.targetCharId}`);
    }
  }
}

// ---------- App lifecycle ----------
app.whenReady().then(() => {
  loadCfg();
  createLauncherWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createLauncherWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});