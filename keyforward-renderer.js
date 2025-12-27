(function() {
  'use strict';
  
  // keyforward-renderer.js - Key Forwarder Plugin
  // SECURE: Uses contextBridge API via window.keyforwardAPI
  
  const api = window.keyforwardAPI;
  
  if (!api) {
    console.error('keyforwardAPI not available! Preload script may not have loaded correctly.');
    return;
  }
  
  // State
  let rules = [];
  let characters = [];
  let editingRuleId = null;
  let isCapturingKeys = false;
  let capturedKeys = [];
  let globalEnabled = true;
  
  // Elements
  const rulesContainer = document.getElementById('rulesContainer');
  const addRuleBtn = document.getElementById('addRuleBtn');
  const statusText = document.getElementById('statusText');
  const enabledToggle = document.getElementById('enabledToggle');
  
  const ruleModal = document.getElementById('ruleModal');
  const ruleModalTitle = document.getElementById('ruleModalTitle');
  const ruleNameInput = document.getElementById('ruleName');
  const sourceCharSelect = document.getElementById('sourceChar');
  const targetCharSelect = document.getElementById('targetChar');
  const forwardKeysInput = document.getElementById('forwardKeys');
  const captureKeysBtn = document.getElementById('captureKeysBtn');
  const cancelRuleBtn = document.getElementById('cancelRuleBtn');
  const deleteRuleBtn = document.getElementById('deleteRuleBtn');
  const saveRuleBtn = document.getElementById('saveRuleBtn');
  
  // Load/Save
  async function loadData() {
    try {
      characters = await api.getCharacters() || [];
      populateCharacterSelects();
      
      const data = await api.getData();
      rules = data.rules || [];
      globalEnabled = data.enabled !== false;
      
      enabledToggle.checked = globalEnabled;
      renderRules();
      updateStatus();
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }
  
  async function saveData() {
    try {
      await api.setData({ rules, enabled: globalEnabled });
    } catch (err) {
      console.error('Failed to save data:', err);
    }
  }
  
  function populateCharacterSelects() {
    const defaultOption = '<option value="">Select character...</option>';
    const charOptions = characters.map(char => 
      `<option value="${char.id}">${escapeHtml(char.name)}</option>`
    ).join('');
    
    sourceCharSelect.innerHTML = defaultOption + charOptions;
    targetCharSelect.innerHTML = defaultOption + charOptions;
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
  
  function getCharacterName(charId) {
    const char = characters.find(c => c.id === charId);
    return char ? char.name : 'Unknown';
  }
  
  function updateStatus() {
    const enabledRules = rules.filter(r => r.enabled !== false).length;
    if (!globalEnabled) {
      statusText.textContent = 'Forwarding disabled';
    } else if (enabledRules === 0) {
      statusText.textContent = 'No active rules';
    } else {
      const totalKeys = rules.filter(r => r.enabled !== false).reduce((sum, r) => sum + (r.keys?.length || 0), 0);
      statusText.textContent = `${enabledRules} rule${enabledRules > 1 ? 's' : ''}, ${totalKeys} key${totalKeys > 1 ? 's' : ''}`;
    }
  }
  
  // Render Rules - Original styled UI
  function renderRules() {
    if (rules.length === 0) {
      rulesContainer.innerHTML = `
        <div class="empty-state">
          <p>No forwarding rules</p>
          <p class="hint">Click + to add a key forwarding rule</p>
        </div>
      `;
      return;
    }
    
    rulesContainer.innerHTML = rules.map(rule => {
      const sourceName = getCharacterName(rule.sourceCharId);
      const targetName = getCharacterName(rule.targetCharId);
      const keysHtml = (rule.keys || []).map(k => `<span class="key-badge">${escapeHtml(k)}</span>`).join('');
      
      return `
        <div class="rule-card ${rule.enabled === false ? 'disabled' : ''}" data-id="${rule.id}">
          <div class="rule-header">
            <span class="rule-name">${escapeHtml(rule.name || 'Unnamed Rule')}</span>
            <div class="rule-toggle">
              <input type="checkbox" ${rule.enabled !== false ? 'checked' : ''} data-action="toggle" />
            </div>
          </div>
          <div class="rule-flow">
            <span class="char-badge source">${escapeHtml(sourceName)}</span>
            <span class="flow-arrow">→</span>
            <span class="char-badge target">${escapeHtml(targetName)}</span>
          </div>
          <div class="keys-list">
            ${keysHtml || '<span class="no-keys">No keys</span>'}
          </div>
          <div class="rule-actions">
            <button class="edit" title="Edit rule">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </button>
            <button class="delete" title="Delete rule">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    // Add event handlers
    rulesContainer.querySelectorAll('.rule-card').forEach(card => {
      const ruleId = card.dataset.id;
      
      const toggleChk = card.querySelector('input[data-action="toggle"]');
      if (toggleChk) {
        toggleChk.addEventListener('change', async (e) => {
          e.stopPropagation();
          const rule = rules.find(r => r.id === ruleId);
          if (rule) {
            rule.enabled = toggleChk.checked;
            await saveData();
            renderRules();
            updateStatus();
          }
        });
      }
      
      const editBtn = card.querySelector('button.edit');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openEditModal(ruleId);
        });
      }
      
      const deleteBtn = card.querySelector('button.delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const rule = rules.find(r => r.id === ruleId);
          if (confirm(`Delete rule "${rule?.name || 'Unnamed'}"?`)) {
            rules = rules.filter(r => r.id !== ruleId);
            await saveData();
            renderRules();
            updateStatus();
          }
        });
      }
    });
  }
  
  // Modal Functions
  function openAddModal() {
    editingRuleId = null;
    ruleModalTitle.textContent = 'Add Forwarding Rule';
    ruleNameInput.value = '';
    sourceCharSelect.value = '';
    targetCharSelect.value = '';
    forwardKeysInput.value = '';
    capturedKeys = [];
    deleteRuleBtn.style.display = 'none';
    ruleModal.classList.remove('hidden');
    ruleNameInput.focus();
  }
  
  function openEditModal(ruleId) {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;
    
    editingRuleId = ruleId;
    ruleModalTitle.textContent = 'Edit Forwarding Rule';
    ruleNameInput.value = rule.name || '';
    sourceCharSelect.value = rule.sourceCharId || '';
    targetCharSelect.value = rule.targetCharId || '';
    capturedKeys = [...(rule.keys || [])];
    forwardKeysInput.value = capturedKeys.join(', ');
    deleteRuleBtn.style.display = 'block';
    ruleModal.classList.remove('hidden');
    ruleNameInput.focus();
  }
  
  function closeModal() {
    ruleModal.classList.add('hidden');
    isCapturingKeys = false;
    captureKeysBtn.classList.remove('capturing');
    captureKeysBtn.textContent = 'Capture';
    forwardKeysInput.classList.remove('capturing');
  }
  
  async function saveRule() {
    const name = ruleNameInput.value.trim();
    const sourceCharId = sourceCharSelect.value;
    const targetCharId = targetCharSelect.value;
    
    if (!name || !sourceCharId || !targetCharId) {
      if (!name) ruleNameInput.focus();
      else if (!sourceCharId) sourceCharSelect.focus();
      else targetCharSelect.focus();
      return;
    }
    
    if (sourceCharId === targetCharId) {
      alert('Source and target must be different characters');
      return;
    }
    
    if (editingRuleId) {
      const rule = rules.find(r => r.id === editingRuleId);
      if (rule) {
        rule.name = name;
        rule.sourceCharId = sourceCharId;
        rule.targetCharId = targetCharId;
        rule.keys = capturedKeys;
      }
    } else {
      rules.push({
        id: Date.now().toString(),
        name,
        sourceCharId,
        targetCharId,
        keys: capturedKeys,
        enabled: true
      });
    }
    
    await saveData();
    renderRules();
    updateStatus();
    closeModal();
  }
  
  async function deleteRule(ruleId) {
    rules = rules.filter(r => r.id !== ruleId);
    await saveData();
    renderRules();
    updateStatus();
    if (editingRuleId === ruleId) closeModal();
  }
  
  // Key Capture
  function startKeyCapture() {
    isCapturingKeys = true;
    capturedKeys = [];
    captureKeysBtn.classList.add('capturing');
    captureKeysBtn.textContent = 'Press keys... (Enter to finish)';
    forwardKeysInput.classList.add('capturing');
    forwardKeysInput.value = 'Press keys...';
  }
  
  function handleKeyCapture(e) {
    if (!isCapturingKeys) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    if (e.key === 'Escape') {
      isCapturingKeys = false;
      captureKeysBtn.classList.remove('capturing');
      captureKeysBtn.textContent = 'Capture';
      forwardKeysInput.classList.remove('capturing');
      forwardKeysInput.value = capturedKeys.join(', ');
      return;
    }
    
    if (e.key === 'Enter') {
      isCapturingKeys = false;
      captureKeysBtn.classList.remove('capturing');
      captureKeysBtn.textContent = 'Capture';
      forwardKeysInput.classList.remove('capturing');
      forwardKeysInput.value = capturedKeys.join(', ');
      return;
    }
    
    let key = e.key;
    if (key === ' ') key = 'Space';
    else if (key.length === 1) key = key.toUpperCase();
    
    if (!capturedKeys.includes(key) && !['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
      capturedKeys.push(key);
      forwardKeysInput.value = capturedKeys.join(', ');
    }
  }
  
  // Event Listeners
  addRuleBtn.addEventListener('click', openAddModal);
  cancelRuleBtn.addEventListener('click', closeModal);
  saveRuleBtn.addEventListener('click', saveRule);
  deleteRuleBtn.addEventListener('click', () => {
    if (editingRuleId) deleteRule(editingRuleId);
  });
  
  captureKeysBtn.addEventListener('click', startKeyCapture);
  forwardKeysInput.addEventListener('click', startKeyCapture);
  
  enabledToggle.addEventListener('change', async () => {
    globalEnabled = enabledToggle.checked;
    await saveData();
    updateStatus();
  });
  
  ruleModal.addEventListener('click', (e) => {
    if (e.target === ruleModal) closeModal();
  });
  
  document.addEventListener('keydown', handleKeyCapture, true);
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !isCapturingKeys) {
      if (!ruleModal.classList.contains('hidden')) closeModal();
    }
  });
  
  ruleNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveRule();
  });
  
  // Initialize
  loadData();
  console.log('Keyforward renderer initialized successfully');
  
})();