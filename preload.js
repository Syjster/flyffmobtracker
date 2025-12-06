// preload.js – bridge between renderer and main
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // ----- Config -----
  getCfg: () => ipcRenderer.invoke("cfg:get"),
  setCfg: (patch) => ipcRenderer.invoke("cfg:set", patch),

  // ----- Layout / BrowserView rect -----
  setGameRect: (rect) => ipcRenderer.invoke("game:set-rect", rect),

  // ----- Captures -----
  captureFullFromGame: () => ipcRenderer.invoke("game:capture-full"),
  captureROIFromGame: (roi) => ipcRenderer.invoke("game:capture-roi", roi),
  getCursorInGame: () => ipcRenderer.invoke("game:get-cursor-in-game"),
  openReshapeOverlay: () => ipcRenderer.invoke("roi:open-reshape"),

  // ----- GPT XP OCR -----
  readXpWithGPT: (dataUrl) => ipcRenderer.invoke("gpt:read-xp", dataUrl),

  // ----- Session Logging -----
  saveSession: (sessionData) => ipcRenderer.invoke("session:save", sessionData),
  getSessionLogPath: () => ipcRenderer.invoke("session:get-log-path"),
  openLogFolder: () => ipcRenderer.invoke("session:open-folder"),

  // ----- Game Control -----
  reloadGame: () => ipcRenderer.invoke("game:reload"),
  stopGame: () => ipcRenderer.invoke("game:stop"),
});