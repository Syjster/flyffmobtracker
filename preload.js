// preload.js – bridge between renderer and main
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // ----- Config -----
  getCfg: () => ipcRenderer.invoke("cfg:get"),
  setCfg: (patch) => ipcRenderer.invoke("cfg:set", patch),

  // ----- Layout / BrowserView rect -----
  setGameRect: (rect) => ipcRenderer.invoke("game:set-rect", rect),

  // ----- Captures -----
  // (not actually used right now, but fine to keep)
  captureFullFromGame: () => ipcRenderer.invoke("game:capture-full"),

  // ROI-only capture (used by diff loop + GPT OCR)
  // renderer passes nothing, main falls back to cfg.roi
  captureROIFromGame: (roi) => ipcRenderer.invoke("game:capture-roi", roi),

  // 🔹 used by captureAtMouse()
  getCursorInGame: () => ipcRenderer.invoke("game:get-cursor-in-game"),

  // 🔹 used by fineTuneROI()
  openReshapeOverlay: () => ipcRenderer.invoke("roi:open-reshape"),

  // ----- GPT XP OCR -----
  readXpWithGPT: (dataUrl) => ipcRenderer.invoke("gpt:read-xp", dataUrl),
});
