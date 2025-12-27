// launcher-preload.js - Secure preload script for launcher window
const { contextBridge, ipcRenderer } = require('electron');

// Expose ONLY the APIs that the launcher renderer needs
contextBridge.exposeInMainWorld('launcherAPI', {
  // Config operations
  getConfig: () => ipcRenderer.invoke('cfg:get'),
  setConfig: (data) => ipcRenderer.invoke('cfg:set', data),
  
  // Tracker operations
  getOpenTrackers: () => ipcRenderer.invoke('launcher:get-open-trackers'),
  startTracker: (char) => ipcRenderer.invoke('launcher:start-tracker', char),
  focusTracker: (charId) => ipcRenderer.invoke('launcher:focus-tracker', charId),
  closeTracker: (charId) => ipcRenderer.invoke('launcher:close-tracker', charId),
  
  // Session/logging
  getLogPath: () => ipcRenderer.invoke('session:get-log-path'),
  openDataFolder: () => ipcRenderer.invoke('session:open-folder'),
  
  // Plugin windows
  openCooldown: () => ipcRenderer.invoke('launcher:open-cooldown'),
  openKeyforward: () => ipcRenderer.invoke('launcher:open-keyforward'),
  
  // Event listener for tracker state changes
  onTrackerStateChanged: (callback) => {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('launcher:tracker-state-changed', subscription);
    
    return () => {
      ipcRenderer.removeListener('launcher:tracker-state-changed', subscription);
    };
  }
});