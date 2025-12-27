(function() {
  'use strict';
  
  // cooldown-renderer.js - Flyff Buff Cooldown Timer
  // SECURE: Uses contextBridge API via window.cooldownAPI
  
  const api = window.cooldownAPI;
  
  if (!api) {
    console.error('cooldownAPI not available! Preload script may not have loaded correctly.');
    return;
  }
  
  // State
  let timers = [];
  let characters = [];
  let activeTimers = new Map(); // id -> { interval, endTime, completed }
  let editingTimerId = null;
  let isCapturingHotkey = false;
  let isCapturingAutoPress = false;
  let settings = {
    alwaysOnTop: true,
    flashOnComplete: true,
    soundOnComplete: false,
    flashDuration: 2000
  };
  
  // Elements
  const timersContainer = document.getElementById('timersContainer');
  const addTimerBtn = document.getElementById('addTimerBtn');
  const stopAllBtn = document.getElementById('stopAllBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const statusText = document.getElementById('statusText');
  const hotkeyStatus = document.getElementById('hotkeyStatus');
  
  const timerModal = document.getElementById('timerModal');
  const timerModalTitle = document.getElementById('timerModalTitle');
  const timerNameInput = document.getElementById('timerName');
  const timerHotkeyInput = document.getElementById('timerHotkey');
  const captureHotkeyBtn = document.getElementById('captureHotkeyBtn');
  const timerCharacterSelect = document.getElementById('timerCharacter');
  const timerDurationInput = document.getElementById('timerDuration');
  const cancelTimerBtn = document.getElementById('cancelTimerBtn');
  const deleteTimerBtn = document.getElementById('deleteTimerBtn');
  const saveTimerBtn = document.getElementById('saveTimerBtn');
  
  const autoPressEnabled = document.getElementById('autoPressEnabled');
  const autoPressOptions = document.getElementById('autoPressOptions');
  const autoPressCharSelect = document.getElementById('autoPressChar');
  const autoPressKeyInput = document.getElementById('autoPressKey');
  const captureAutoPressBtn = document.getElementById('captureAutoPressBtn');
  
  const settingsModal = document.getElementById('settingsModal');
  const alwaysOnTopChk = document.getElementById('alwaysOnTopChk');
  const flashOnCompleteChk = document.getElementById('flashOnCompleteChk');
  const soundOnCompleteChk = document.getElementById('soundOnCompleteChk');
  const flashDurationInput = document.getElementById('flashDuration');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  
  // Load/Save
  async function loadData() {
    try {
      characters = await api.getCharacters() || [];
      populateCharacterSelect();
      
      const data = await api.getData();
      timers = data.timers || [];
      settings = { ...settings, ...(data.settings || {}) };
      
      alwaysOnTopChk.checked = settings.alwaysOnTop;
      flashOnCompleteChk.checked = settings.flashOnComplete;
      soundOnCompleteChk.checked = settings.soundOnComplete;
      flashDurationInput.value = settings.flashDuration;
      
      await api.setAlwaysOnTop(settings.alwaysOnTop);
      
      renderTimers();
      registerAllHotkeys();
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }
  
  async function saveData() {
    try {
      await api.setData({ timers, settings });
    } catch (err) {
      console.error('Failed to save data:', err);
    }
  }
  
  function populateCharacterSelect() {
    timerCharacterSelect.innerHTML = '<option value="">All Characters</option>';
    autoPressCharSelect.innerHTML = '<option value="">Same as bound character</option>';
    
    characters.forEach(char => {
      const option1 = document.createElement('option');
      option1.value = char.id;
      option1.textContent = char.name;
      timerCharacterSelect.appendChild(option1);
      
      const option2 = document.createElement('option');
      option2.value = char.id;
      option2.textContent = char.name;
      autoPressCharSelect.appendChild(option2);
    });
  }
  
  function getCharacterName(charId) {
    if (!charId) return 'All';
    const char = characters.find(c => c.id === charId);
    return char ? char.name : 'Unknown';
  }
  
  // Hotkey Registration
  async function registerAllHotkeys() {
    try {
      await api.unregisterAllHotkeys();
      
      for (const timer of timers) {
        if (timer.hotkey) {
          await api.registerHotkey(timer.id, timer.hotkey);
        }
      }
      
      updateStatus();
    } catch (err) {
      console.error('Failed to register hotkeys:', err);
    }
  }
  
  function updateStatus() {
    const count = timers.filter(t => t.hotkey).length;
    statusText.textContent = count > 0 
      ? `Listening for ${count} hotkey${count > 1 ? 's' : ''}...`
      : 'No hotkeys configured';
    hotkeyStatus.classList.toggle('active', count > 0);
  }
  
  // Timer Rendering - Original styled UI
  function renderTimers() {
    if (timers.length === 0) {
      timersContainer.innerHTML = `
        <div class="empty-state">
          <p>No timers configured</p>
          <p class="hint">Click + to add a buff timer</p>
        </div>
      `;
      return;
    }
    
    timersContainer.innerHTML = timers.map(timer => {
      const state = activeTimers.get(timer.id);
      const isRunning = !!state;
      const remaining = isRunning ? Math.max(0, state.endTime - Date.now()) : timer.duration * 1000;
      const isComplete = isRunning && remaining <= 0;
      
      const progress = isRunning ? ((timer.duration * 1000 - remaining) / (timer.duration * 1000)) * 100 : 0;
      
      let countdownClass = 'idle';
      if (isRunning) {
        if (isComplete) countdownClass = 'complete';
        else if (remaining < 10000) countdownClass = 'low';
        else countdownClass = 'running';
      }
      
      const charName = getCharacterName(timer.boundCharId);
      const statusLabel = isComplete ? 'READY!' : isRunning ? 'Running' : '';
      
      return `
        <div class="timer-card ${isRunning ? 'running' : ''} ${isComplete && settings.flashOnComplete ? 'complete' : ''}" 
             data-id="${timer.id}">
          <div class="timer-progress" style="width: ${progress}%; background: ${timer.color || '#4a9eff'}20;"></div>
          <div class="timer-header">
            <span class="timer-name">
              <span class="timer-color-dot" style="background: ${timer.color || '#4a9eff'}"></span>
              ${escapeHtml(timer.name)}
              ${timer.autoPress?.enabled ? '<span class="auto-badge" title="Auto-press enabled">⚡</span>' : ''}
            </span>
            <div class="timer-badges">
              <span class="timer-hotkey">${timer.hotkey || '-'}</span>
              ${timer.boundCharId ? `<span class="timer-char-badge">${escapeHtml(charName)}</span>` : ''}
            </div>
          </div>
          <div class="timer-display">
            <div class="timer-countdown ${countdownClass}" data-timer-id="${timer.id}">
              ${formatTime(remaining)}
            </div>
            ${statusLabel ? `<div class="timer-status">${statusLabel}</div>` : ''}
          </div>
          <div class="timer-actions">
            <button class="edit" title="Edit timer">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </button>
            <button class="reset" title="Reset timer">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers
    timersContainer.querySelectorAll('.timer-card').forEach(card => {
      const timerId = card.dataset.id;
      
      const editBtn = card.querySelector('button.edit');
      const resetBtn = card.querySelector('button.reset');
      
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          openEditModal(timerId);
        });
      }
      
      if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          resetTimer(timerId);
        });
      }
      
      card.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
          triggerTimer(timerId);
        }
      });
    });
  }
  
  function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
  
  // Timer Logic
  function triggerTimer(timerId) {
    const timer = timers.find(t => t.id === timerId);
    if (!timer) return;
    
    // If already running, reset it
    if (activeTimers.has(timerId)) {
      stopTimerInterval(timerId);
    }
    
    // Start new countdown
    const endTime = Date.now() + (timer.duration * 1000);
    const interval = setInterval(() => {
      updateTimerDisplay(timerId);
    }, 100);
    
    activeTimers.set(timerId, { interval, endTime, completed: false });
    renderTimers();
    
    statusText.textContent = `Started: ${timer.name}`;
  }
  
  function resetTimer(timerId) {
    stopTimerInterval(timerId);
    renderTimers();
    statusText.textContent = 'Timer reset';
  }
  
  // Stop All Timers
  function stopAllTimers() {
    const count = activeTimers.size;
    
    for (const [timerId] of activeTimers) {
      stopTimerInterval(timerId);
    }
    
    renderTimers();
    statusText.textContent = count > 0 ? `Stopped ${count} timer${count > 1 ? 's' : ''}` : 'No active timers';
  }
  
  function stopTimerInterval(timerId) {
    const state = activeTimers.get(timerId);
    if (state) {
      clearInterval(state.interval);
      activeTimers.delete(timerId);
    }
  }
  
  function updateTimerDisplay(timerId) {
    const state = activeTimers.get(timerId);
    if (!state) return;
    
    const remaining = Math.max(0, state.endTime - Date.now());
    const countdownEl = document.querySelector(`[data-timer-id="${timerId}"]`);
    
    if (countdownEl) {
      countdownEl.textContent = formatTime(remaining);
      
      countdownEl.classList.remove('idle', 'running', 'low', 'complete');
      if (remaining <= 0) {
        countdownEl.classList.add('complete');
      } else if (remaining < 10000) {
        countdownEl.classList.add('low');
      } else {
        countdownEl.classList.add('running');
      }
    }
    
    // Check if complete - use completed flag to prevent multiple triggers
    if (remaining <= 0 && !state.completed) {
      state.completed = true; // Prevent multiple triggers
      
      const timer = timers.find(t => t.id === timerId);
      const card = document.querySelector(`.timer-card[data-id="${timerId}"]`);
      
      if (card && settings.flashOnComplete && !card.classList.contains('complete')) {
        card.classList.add('complete');
        
        setTimeout(() => {
          card?.classList.remove('complete');
        }, settings.flashDuration);
      }
      
      if (settings.soundOnComplete) {
        playAlertSound();
      }
      
      // Auto-press if enabled
      if (timer && timer.autoPress?.enabled) {
        executeAutoPress(timer);
      }
      
      // Stop the interval but keep in activeTimers to show complete state
      clearInterval(state.interval);
      
      statusText.textContent = `${timer?.name || 'Timer'} ready!`;
    }
  }
  
  async function executeAutoPress(timer) {
    try {
      const targetCharId = timer.autoPress.charId || timer.boundCharId;
      const keyToSend = timer.autoPress.key || timer.hotkey;
      
      if (!targetCharId || !keyToSend) {
        console.warn('[AutoPress] Missing target character or key');
        return;
      }
      
      console.log(`[AutoPress] Sending ${keyToSend} to character ${targetCharId}`);
      const success = await api.sendKey(targetCharId, keyToSend);
      
      if (success) {
        statusText.textContent = `Auto-pressed: ${keyToSend}`;
      } else {
        statusText.textContent = `Auto-press failed (window not open?)`;
      }
    } catch (err) {
      console.error('[AutoPress] Error:', err);
    }
  }
  
  function playAlertSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) {}
  }
  
  function buildHotkeyString(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    
    let key = e.key;
    if (key === ' ') key = 'Space';
    else if (key.length === 1) key = key.toUpperCase();
    else if (key.startsWith('Arrow')) key = key.replace('Arrow', '');
    
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
      parts.push(key);
    }
    
    return parts.join('+');
  }
  
  // Modal Functions
  function openAddModal() {
    editingTimerId = null;
    timerModalTitle.textContent = 'Add Timer';
    timerNameInput.value = '';
    timerHotkeyInput.value = '';
    timerCharacterSelect.value = '';
    timerDurationInput.value = '120';
    autoPressEnabled.checked = false;
    autoPressOptions.classList.add('hidden');
    autoPressCharSelect.value = '';
    autoPressKeyInput.value = '';
    deleteTimerBtn.style.display = 'none';
    
    // Reset color to default
    const defaultColor = document.querySelector('input[name="timerColor"][value="#ffd800"]');
    if (defaultColor) defaultColor.checked = true;
    
    timerModal.classList.remove('hidden');
    timerNameInput.focus();
  }
  
  function openEditModal(timerId) {
    const timer = timers.find(t => t.id === timerId);
    if (!timer) return;
    
    editingTimerId = timerId;
    timerModalTitle.textContent = 'Edit Timer';
    timerNameInput.value = timer.name;
    timerHotkeyInput.value = timer.hotkey || '';
    timerCharacterSelect.value = timer.boundCharId || '';
    timerDurationInput.value = timer.duration;
    
    // Set color
    const colorRadio = document.querySelector(`input[name="timerColor"][value="${timer.color || '#ffd800'}"]`);
    if (colorRadio) colorRadio.checked = true;
    
    if (timer.autoPress) {
      autoPressEnabled.checked = timer.autoPress.enabled || false;
      autoPressOptions.classList.toggle('hidden', !timer.autoPress.enabled);
      autoPressCharSelect.value = timer.autoPress.charId || '';
      autoPressKeyInput.value = timer.autoPress.key || '';
    } else {
      autoPressEnabled.checked = false;
      autoPressOptions.classList.add('hidden');
    }
    
    // Show delete button when editing
    deleteTimerBtn.style.display = 'block';
    
    timerModal.classList.remove('hidden');
    timerNameInput.focus();
  }
  
  function closeTimerModal() {
    timerModal.classList.add('hidden');
    isCapturingHotkey = false;
    isCapturingAutoPress = false;
    captureHotkeyBtn.classList.remove('capturing');
    captureHotkeyBtn.textContent = 'Capture';
    timerHotkeyInput.classList.remove('capturing');
    captureAutoPressBtn.classList.remove('capturing');
    captureAutoPressBtn.textContent = 'Capture';
    autoPressKeyInput.classList.remove('capturing');
  }
  
  async function saveTimer() {
    const name = timerNameInput.value.trim();
    const hotkey = timerHotkeyInput.value.trim();
    const boundCharId = timerCharacterSelect.value || null;
    const duration = parseInt(timerDurationInput.value, 10) || 120;
    const color = document.querySelector('input[name="timerColor"]:checked')?.value || '#ffd800';
    
    if (!name) {
      timerNameInput.focus();
      return;
    }
    
    const autoPress = {
      enabled: autoPressEnabled.checked,
      charId: autoPressCharSelect.value || null,
      key: autoPressKeyInput.value.trim() || null
    };
    
    if (editingTimerId) {
      const timer = timers.find(t => t.id === editingTimerId);
      if (timer) {
        timer.name = name;
        timer.hotkey = hotkey;
        timer.boundCharId = boundCharId;
        timer.duration = duration;
        timer.autoPress = autoPress;
        timer.color = color;
      }
    } else {
      timers.push({
        id: Date.now().toString(),
        name,
        hotkey,
        boundCharId,
        duration,
        autoPress,
        color
      });
    }
    
    await saveData();
    await registerAllHotkeys();
    renderTimers();
    closeTimerModal();
  }
  
  async function deleteTimer() {
    if (!editingTimerId) return;
    
    const timer = timers.find(t => t.id === editingTimerId);
    const timerName = timer?.name || 'this timer';
    
    if (!confirm(`Delete "${timerName}"?`)) return;
    
    stopTimerInterval(editingTimerId);
    timers = timers.filter(t => t.id !== editingTimerId);
    
    await saveData();
    await registerAllHotkeys();
    renderTimers();
    closeTimerModal();
    
    statusText.textContent = `Deleted: ${timerName}`;
  }
  
  // Hotkey Capture
  function startHotkeyCapture() {
    isCapturingHotkey = true;
    isCapturingAutoPress = false;
    captureHotkeyBtn.classList.add('capturing');
    captureHotkeyBtn.textContent = 'Press key...';
    timerHotkeyInput.classList.add('capturing');
    timerHotkeyInput.value = 'Press a key...';
  }
  
  function startAutoPressCapture() {
    isCapturingAutoPress = true;
    isCapturingHotkey = false;
    captureAutoPressBtn.classList.add('capturing');
    captureAutoPressBtn.textContent = 'Press key...';
    autoPressKeyInput.classList.add('capturing');
    autoPressKeyInput.value = 'Press a key...';
  }
  
  function handleKeyCapture(e) {
    if (!isCapturingHotkey && !isCapturingAutoPress) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    if (e.key === 'Escape') {
      if (isCapturingHotkey) {
        isCapturingHotkey = false;
        captureHotkeyBtn.classList.remove('capturing');
        captureHotkeyBtn.textContent = 'Capture';
        timerHotkeyInput.classList.remove('capturing');
        timerHotkeyInput.value = '';
      }
      if (isCapturingAutoPress) {
        isCapturingAutoPress = false;
        captureAutoPressBtn.classList.remove('capturing');
        captureAutoPressBtn.textContent = 'Capture';
        autoPressKeyInput.classList.remove('capturing');
        autoPressKeyInput.value = '';
      }
      return;
    }
    
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
    
    const hotkeyStr = buildHotkeyString(e);
    
    if (isCapturingHotkey) {
      timerHotkeyInput.value = hotkeyStr;
      timerHotkeyInput.classList.remove('capturing');
      captureHotkeyBtn.classList.remove('capturing');
      captureHotkeyBtn.textContent = 'Capture';
      isCapturingHotkey = false;
    }
    
    if (isCapturingAutoPress) {
      autoPressKeyInput.value = hotkeyStr;
      autoPressKeyInput.classList.remove('capturing');
      captureAutoPressBtn.classList.remove('capturing');
      captureAutoPressBtn.textContent = 'Capture';
      isCapturingAutoPress = false;
    }
  }
  
  // Settings Modal
  function openSettingsModal() {
    settingsModal.classList.remove('hidden');
  }
  
  function closeSettingsModal() {
    settingsModal.classList.add('hidden');
  }
  
  async function saveSettings() {
    try {
      settings.alwaysOnTop = alwaysOnTopChk.checked;
      settings.flashOnComplete = flashOnCompleteChk.checked;
      settings.soundOnComplete = soundOnCompleteChk.checked;
      settings.flashDuration = Math.max(500, parseInt(flashDurationInput.value, 10) || 2000);
      
      await api.setAlwaysOnTop(settings.alwaysOnTop);
      await saveData();
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }
  
  // IPC Listeners
  let hotkeyUnsubscribe = null;
  
  function setupHotkeyListener() {
    try {
      if (hotkeyUnsubscribe) hotkeyUnsubscribe();
      
      hotkeyUnsubscribe = api.onHotkeyPressed((data) => {
        const { hotkey, charId, charName } = data;
        
        const timer = timers.find(t => {
          if (t.hotkey !== hotkey) return false;
          if (t.boundCharId && t.boundCharId !== charId) return false;
          return true;
        });
        
        if (timer) {
          console.log(`Hotkey ${hotkey} from ${charName} triggered timer: ${timer.name}`);
          triggerTimer(timer.id);
        }
      });
    } catch (err) {
      console.error('Failed to setup hotkey listener:', err);
    }
  }
  
  window.addEventListener('beforeunload', () => {
    if (hotkeyUnsubscribe) hotkeyUnsubscribe();
  });
  
  function handleHotkeyPress(e) {
    if (isCapturingHotkey || isCapturingAutoPress) return;
    if (!timerModal.classList.contains('hidden') || !settingsModal.classList.contains('hidden')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    
    const hotkeyStr = buildHotkeyString(e);
    
    const timer = timers.find(t => t.hotkey === hotkeyStr && !t.boundCharId);
    if (timer) {
      e.preventDefault();
      triggerTimer(timer.id);
    }
  }
  
  // Event Listeners
  addTimerBtn.addEventListener('click', openAddModal);
  stopAllBtn.addEventListener('click', stopAllTimers);
  settingsBtn.addEventListener('click', openSettingsModal);
  cancelTimerBtn.addEventListener('click', closeTimerModal);
  saveTimerBtn.addEventListener('click', saveTimer);
  deleteTimerBtn.addEventListener('click', deleteTimer);
  captureHotkeyBtn.addEventListener('click', startHotkeyCapture);
  timerHotkeyInput.addEventListener('click', startHotkeyCapture);
  captureAutoPressBtn.addEventListener('click', startAutoPressCapture);
  autoPressKeyInput.addEventListener('click', startAutoPressCapture);
  
  autoPressEnabled.addEventListener('change', () => {
    autoPressOptions.classList.toggle('hidden', !autoPressEnabled.checked);
  });
  
  closeSettingsBtn.addEventListener('click', async () => {
    await saveSettings();
    closeSettingsModal();
  });
  
  timerModal.addEventListener('click', (e) => {
    if (e.target === timerModal) closeTimerModal();
  });
  
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      saveSettings();
      closeSettingsModal();
    }
  });
  
  document.addEventListener('keydown', handleKeyCapture, true);
  document.addEventListener('keydown', handleHotkeyPress, false);
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isCapturingHotkey) {
        isCapturingHotkey = false;
        captureHotkeyBtn.classList.remove('capturing');
        captureHotkeyBtn.textContent = 'Capture';
        timerHotkeyInput.classList.remove('capturing');
        return;
      }
      if (isCapturingAutoPress) {
        isCapturingAutoPress = false;
        captureAutoPressBtn.classList.remove('capturing');
        captureAutoPressBtn.textContent = 'Capture';
        autoPressKeyInput.classList.remove('capturing');
        return;
      }
      if (!timerModal.classList.contains('hidden')) closeTimerModal();
      if (!settingsModal.classList.contains('hidden')) {
        saveSettings();
        closeSettingsModal();
      }
    }
  });
  
  timerNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveTimer();
  });
  
  // Initialize
  setupHotkeyListener();
  loadData();
  console.log('Cooldown renderer initialized successfully');
  
})();