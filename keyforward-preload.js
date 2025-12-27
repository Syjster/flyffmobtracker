// keyforward-preload.js - Secure preload script for keyforward window
// This replaces the need for nodeIntegration: true

const { contextBridge, ipcRenderer } = require('electron');

// Expose ONLY the APIs that the keyforward renderer actually needs
contextBridge.exposeInMainWorld('keyforwardAPI', {
  // Data operations
  getData: () => ipcRenderer.invoke('keyforward:get-data'),
  setData: (data) => ipcRenderer.invoke('keyforward:set-data', data),
  
  // Character operations
  getCharacters: () => ipcRenderer.invoke('keyforward:get-characters')
});

// Note: The keyforward renderer needs even LESS access than cooldown
// It only needs to read/write its own configuration and get the character list
// 
// This dramatically reduces the attack surface compared to nodeIntegration: true