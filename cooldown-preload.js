// cooldown-preload.js - Secure preload script for cooldown window
// This replaces the need for nodeIntegration: true

const { contextBridge, ipcRenderer } = require('electron');

// Expose ONLY the APIs that the cooldown renderer actually needs
// Never expose entire require() or Node.js APIs
contextBridge.exposeInMainWorld('cooldownAPI', {
  // Data operations
  getData: () => ipcRenderer.invoke('cooldown:get-data'),
  setData: (data) => ipcRenderer.invoke('cooldown:set-data', data),
  
  // Window operations
  setAlwaysOnTop: (value) => ipcRenderer.invoke('cooldown:set-always-on-top', value),
  
  // Hotkey operations
  registerHotkey: (timerId, hotkey) => ipcRenderer.invoke('cooldown:register-hotkey', timerId, hotkey),
  unregisterHotkey: (timerId) => ipcRenderer.invoke('cooldown:unregister-hotkey', timerId),
  unregisterAllHotkeys: () => ipcRenderer.invoke('cooldown:unregister-all-hotkeys'),
  
  // Auto-press operations
  sendKey: (charId, key) => ipcRenderer.invoke('cooldown:send-key', charId, key),
  
  // Character operations
  getCharacters: () => ipcRenderer.invoke('cooldown:get-characters'),
  
  // Event listeners - returns an unsubscribe function
  onHotkeyPressed: (callback) => {
    // Validate callback is a function
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    
    const subscription = (_event, timerId) => callback(timerId);
    ipcRenderer.on('cooldown:hotkey-pressed', subscription);
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('cooldown:hotkey-pressed', subscription);
    };
  }
});

// Note: By using contextBridge, the renderer process cannot:
// - Access require()
// - Access Node.js APIs directly
// - Execute arbitrary system commands
// - Read/write files without going through IPC handlers
// 
// This is MUCH more secure than nodeIntegration: true