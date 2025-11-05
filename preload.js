// preload.js — safe bridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // config
  getCfg:  () => ipcRenderer.invoke('cfg:get'),
  setCfg:  (patch) => ipcRenderer.invoke('cfg:set', patch),

  // layout
  setGameRect: (rect) => ipcRenderer.invoke('game:set-rect', rect),

  // capture
  captureROIFromGame: () => ipcRenderer.invoke('game:capture-roi'),
  getCursorInGame:   () => ipcRenderer.invoke('game:get-cursor-in-game'),

  // fine-tune overlay
  openReshapeOverlay: () => ipcRenderer.invoke('roi:open-reshape'),
  isReshapeOpen:      () => ipcRenderer.invoke('roi:reshape:is-open'),
  forceApplyReshape:  () => ipcRenderer.invoke('roi:reshape:force-apply'),
  forceCancelReshape: () => ipcRenderer.invoke('roi:reshape:force-cancel')
});
