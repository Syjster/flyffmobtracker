(function() {
  'use strict';
  
  // launcher-renderer.js - Flyff Mob Tracker Launcher UI
  // SECURE: Uses contextBridge API via window.launcherAPI
  
  const api = window.launcherAPI;
  
  if (!api) {
    console.error('launcherAPI not available! Preload script may not have loaded correctly.');
    return;
  }
  
  // Elements
  const characterList = document.getElementById('characterList');
  const addCharBtn = document.getElementById('addCharBtn');
  const launchSelectedBtn = document.getElementById('launchSelectedBtn');
  const launchAllBtn = document.getElementById('launchAllBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  
  // Character Modal elements
  const charModal = document.getElementById('charModal');
  const modalTitle = document.getElementById('modalTitle');
  const charNameInput = document.getElementById('charName');
  const charServerSelect = document.getElementById('charServer');
  const charClassSelect = document.getElementById('charClass');
  const charTrackingModeSelect = document.getElementById('charTrackingMode');
  const cancelCharBtn = document.getElementById('cancelCharBtn');
  const saveCharBtn = document.getElementById('saveCharBtn');
  
  // Settings Modal elements
  const settingsModal = document.getElementById('settingsModal');
  const openaiKeyInput = document.getElementById('openaiKey');
  const dataPathEl = document.getElementById('dataPath');
  const openDataFolderBtn = document.getElementById('openDataFolderBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  
  // State
  let characters = [];
  let selectedCharId = null;
  let editingCharId = null;
  let openTrackers = [];
  
  // ---- Character Management ----
  
  async function loadCharacters() {
    try {
      const cfg = await api.getConfig();
      characters = cfg.characters || [];
      openTrackers = await api.getOpenTrackers() || [];
      renderCharacters();
    } catch (err) {
      console.error('Failed to load characters:', err);
    }
  }
  
  function renderCharacters() {
    if (characters.length === 0) {
      characterList.innerHTML = `
        <div class="no-characters">
          <p>No characters added yet.</p>
          <p class="hint">Click "Add Character" to get started.</p>
        </div>
      `;
      launchSelectedBtn.disabled = true;
      launchAllBtn.disabled = true;
      return;
    }
    
    launchAllBtn.disabled = false;
    
    characterList.innerHTML = characters.map(char => {
      const isOpen = openTrackers.includes(char.id);
      const trackingMode = char.trackingMode || '1v1';
      
      const modeBadgeClass = `mode-${trackingMode}`;
      const modeBadgeText = trackingMode === '1v1' ? '1v1' : 
                            trackingMode === 'aoe' ? 'AOE' : 'Game Only';
      
      return `
        <div class="character-card ${selectedCharId === char.id ? 'selected' : ''} ${isOpen ? 'running' : ''}" data-id="${char.id}">
          <div class="char-color" style="background: ${char.color || '#ffd800'}"></div>
          <div class="char-info">
            <div class="char-name">
              ${escapeHtml(char.name)}
              ${isOpen ? '<span class="running-badge">Running</span>' : ''}
              <span class="mode-badge ${modeBadgeClass}">${modeBadgeText}</span>
            </div>
            <div class="char-details">${escapeHtml(char.server || 'Unknown')} • ${escapeHtml(char.class || 'No class')}</div>
          </div>
          <div class="char-actions">
            ${isOpen ? `
              <button class="focus" title="Focus Window" data-action="focus">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.89-2-2-2zm0 14H5V8h14v10z"/>
                </svg>
              </button>
              <button class="stop" title="Stop" data-action="stop">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M6 6h12v12H6z"/>
                </svg>
              </button>
            ` : `
              <button class="edit" title="Edit" data-action="edit">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
              </button>
            `}
            <button class="delete" title="Delete" data-action="delete">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers
    characterList.querySelectorAll('.character-card').forEach(card => {
      card.addEventListener('click', async (e) => {
        const action = e.target.closest('button')?.dataset.action;
        const charId = card.dataset.id;
        
        if (action === 'edit') {
          openEditModal(charId);
        } else if (action === 'delete') {
          deleteCharacter(charId);
        } else if (action === 'focus') {
          await launchCharacter(charId);
        } else if (action === 'stop') {
          await stopTracker(charId);
        } else {
          selectCharacter(charId);
        }
      });
    });
  }
  
  function selectCharacter(charId) {
    selectedCharId = charId;
    launchSelectedBtn.disabled = false;
    renderCharacters();
  }
  
  function openAddModal() {
    editingCharId = null;
    modalTitle.textContent = 'Add Character';
    charNameInput.value = '';
    charServerSelect.value = 'Mushpoie';
    charClassSelect.value = '';
    charTrackingModeSelect.value = '1v1';
    document.querySelector('input[name="charColor"][value="#ffd800"]').checked = true;
    charModal.classList.remove('hidden');
    charNameInput.focus();
  }
  
  function openEditModal(charId) {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    
    editingCharId = charId;
    modalTitle.textContent = 'Edit Character';
    charNameInput.value = char.name;
    charServerSelect.value = char.server || 'Mushpoie';
    charClassSelect.value = char.class || '';
    charTrackingModeSelect.value = char.trackingMode || '1v1';
    
    const colorRadio = document.querySelector(`input[name="charColor"][value="${char.color || '#ffd800'}"]`);
    if (colorRadio) colorRadio.checked = true;
    
    charModal.classList.remove('hidden');
    charNameInput.focus();
  }
  
  function closeCharModal() {
    charModal.classList.add('hidden');
    editingCharId = null;
  }
  
  async function saveCharacter() {
    const name = charNameInput.value.trim();
    if (!name) {
      charNameInput.focus();
      return;
    }
    
    const charData = {
      name,
      server: charServerSelect.value,
      class: charClassSelect.value,
      color: document.querySelector('input[name="charColor"]:checked').value,
      trackingMode: charTrackingModeSelect.value
    };
    
    if (editingCharId) {
      const charIndex = characters.findIndex(c => c.id === editingCharId);
      if (charIndex !== -1) {
        characters[charIndex] = { ...characters[charIndex], ...charData };
      }
    } else {
      characters.push({
        id: Date.now().toString(),
        ...charData
      });
    }
    
    await api.setConfig({ characters });
    closeCharModal();
    await loadCharacters();
    
    if (characters.length === 1) {
      selectCharacter(characters[0].id);
    }
  }
  
  async function deleteCharacter(charId) {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    
    if (openTrackers.includes(charId)) {
      alert('Please close the window first before deleting this character.');
      return;
    }
    
    const confirmed = confirm(`Delete "${char.name}"?`);
    if (!confirmed) return;
    
    characters = characters.filter(c => c.id !== charId);
    await api.setConfig({ characters });
    
    if (selectedCharId === charId) {
      selectedCharId = null;
      launchSelectedBtn.disabled = true;
    }
    
    await loadCharacters();
  }
  
  // ---- Settings Modal ----
  
  async function openSettingsModal() {
    try {
      const cfg = await api.getConfig();
      openaiKeyInput.value = cfg.openaiKey || '';
      dataPathEl.textContent = await api.getLogPath() || 'Documents/FlyffMobTracker';
      settingsModal.classList.remove('hidden');
    } catch (err) {
      console.error('Failed to open settings:', err);
    }
  }
  
  function closeSettingsModal() {
    settingsModal.classList.add('hidden');
  }
  
  async function saveSettings() {
    try {
      await api.setConfig({ 
        openaiKey: openaiKeyInput.value.trim() 
      });
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }
  
  // ---- Launch Functions ----
  
  async function launchCharacter(charId) {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    
    try {
      if (openTrackers.includes(charId)) {
        await api.focusTracker(charId);
      } else {
        await api.startTracker(char);
      }
      
      setTimeout(loadCharacters, 300);
    } catch (err) {
      console.error('Failed to launch character:', err);
    }
  }
  
  async function launchSelected() {
    if (!selectedCharId) return;
    await launchCharacter(selectedCharId);
  }
  
  async function launchAll() {
    for (const char of characters) {
      if (!openTrackers.includes(char.id)) {
        await api.startTracker(char);
        await new Promise(r => setTimeout(r, 800));
      }
    }
  }
  
  async function stopTracker(charId) {
    try {
      await api.closeTracker(charId);
      setTimeout(loadCharacters, 300);
    } catch (err) {
      console.error('Failed to stop tracker:', err);
    }
  }
  
  // ---- Utilities ----
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
  
  // ---- Event Listeners ----
  
  addCharBtn.addEventListener('click', openAddModal);
  cancelCharBtn.addEventListener('click', closeCharModal);
  saveCharBtn.addEventListener('click', saveCharacter);
  launchSelectedBtn.addEventListener('click', launchSelected);
  launchAllBtn.addEventListener('click', launchAll);
  
  charModal.addEventListener('click', (e) => {
    if (e.target === charModal) closeCharModal();
  });
  
  settingsBtn.addEventListener('click', openSettingsModal);
  closeSettingsBtn.addEventListener('click', async () => {
    await saveSettings();
    closeSettingsModal();
  });
  openDataFolderBtn.addEventListener('click', () => api.openDataFolder());
  
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      saveSettings();
      closeSettingsModal();
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!charModal.classList.contains('hidden')) closeCharModal();
      if (!settingsModal.classList.contains('hidden')) {
        saveSettings();
        closeSettingsModal();
      }
    }
  });
  
  characterList.addEventListener('dblclick', (e) => {
    const card = e.target.closest('.character-card');
    if (card && !e.target.closest('button')) {
      launchCharacter(card.dataset.id);
    }
  });
  
  charNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveCharacter();
  });
  
  // Cooldown timer button
  const cooldownBtn = document.getElementById('cooldownBtn');
  if (cooldownBtn) {
    cooldownBtn.addEventListener('click', async () => {
      await api.openCooldown();
    });
  }
  
  // Key forwarder button
  const keyforwardBtn = document.getElementById('keyforwardBtn');
  if (keyforwardBtn) {
    keyforwardBtn.addEventListener('click', async () => {
      await api.openKeyforward();
    });
  }
  
  // Refresh open trackers periodically
  setInterval(async () => {
    try {
      const newOpenTrackers = await api.getOpenTrackers() || [];
      if (JSON.stringify(newOpenTrackers) !== JSON.stringify(openTrackers)) {
        openTrackers = newOpenTrackers;
        renderCharacters();
      }
    } catch (err) {
      // Silently ignore periodic refresh errors
    }
  }, 2000);
  
  // ---- Initialize ----
  loadCharacters();
  console.log('Launcher renderer initialized successfully');
  
})();