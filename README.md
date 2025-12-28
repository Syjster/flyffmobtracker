# Flyff Mob Tracker

A desktop application for tracking mobs, XP, and session statistics in Flyff Universe. Features a multi-character launcher, buff cooldown timers with auto-press macros, key forwarding between game windows, and GPT-powered XP calibration.

![Electron](https://img.shields.io/badge/Electron-32.0-47848F?logo=electron)
![License](https://img.shields.io/badge/License-MIT-green)
![Version](https://img.shields.io/badge/Version-2.1.0-blue)

## ✨ Features

### 🚀 Multi-Character Launcher
- **Central Hub** - Manage all your Flyff characters from one place
- **Character Profiles** - Save name, server, class, and color for each character
- **Tracking Modes** - Choose 1v1, AOE, or Game Only mode per character
- **Quick Launch** - Start individual characters or all at once
- **Session Isolation** - Each character runs in its own isolated browser session

### ⏱️ Buff Cooldown Timer
- **Visual Timers** - Track buff durations with color-coded progress bars
- **Hotkey Triggers** - Timers auto-start when you press buff keys in-game
- **Character Binding** - Link timers to specific characters
- **Auto-Press Macro** - Automatically re-cast buffs when timer expires
- **Stop All** - Reset all active timers with one click
- **Always on Top** - Keep timers visible while playing

### ⌨️ Key Forwarder
- **Mirror Keystrokes** - Send key presses from one character to another
- **Custom Rules** - Create forwarding rules for specific keys
- **Toggle On/Off** - Enable or disable rules without deleting them
- **Multi-Client Support** - Perfect for dual-boxing setups

### 📊 Mob Tracking & Statistics
- **Real-time Kill Tracking** - Detects kills via XP bar pixel changes
- **GPT-Powered XP Calibration** - Uses GPT-4 Vision to read exact XP percentage
- **Automatic Level-Up Detection** - Detects level ups and auto-recalibrates
- **Mobs to Level Counter** - Live countdown updated with each kill
- **Tempo Stats** - Recent performance over last X kills
- **Session Statistics** - Tracks kills, XP gained, XP/hour, elapsed time
- **Excel Session Logging** - Auto-saves sessions with start/end XP details

## 📥 Installation

### Download Release
1. Go to [Releases](https://github.com/Syjster/flyffmobtracker/releases)
2. Download `Flyff Session Launcher Setup X.X.X.exe` (installer) or the portable version
3. Run and enjoy!

## 🔧 Setup

### 1. Configure API Key (Required for XP calibration)

You need an OpenAI API key for GPT-powered XP reading.

1. Open the launcher
2. Click the **⚙️ Settings** button (gear icon)
3. Enter your OpenAI API key
4. Close settings - key is saved automatically

> 🔒 **Security:** Your API key is encrypted using Electron's safeStorage and stored locally. It's never transmitted except to OpenAI's API.

### 2. Add Characters

1. Click **"+ Add Character"**
2. Enter character name, server, and class
3. Choose a color for easy identification
4. Select tracking mode:
   - **1v1 Mode** - For single-target grinding
   - **AOE Mode** - For area-of-effect grinding
   - **Game Only** - Just the browser, no tracking
5. Click **Save**

### 3. Launch & Configure Tracking

1. Double-click a character or click **Launch Selected**
2. Log into Flyff Universe
3. Click **"▶ Capture Settings"** to expand capture options
4. Click **"Capture"** and hover over the XP percentage text
5. Wait for countdown, then click **"Fine-tune"** if needed
6. Click **"GPT Auto Calibrate"** to calibrate XP per kill

## 📖 Usage Guide

### Launcher Controls

| Button | Action |
|--------|--------|
| **+ Add Character** | Create new character profile |
| **Launch Selected** | Start selected character |
| **Launch All** | Start all characters |
| **⏱️ Cooldowns** | Open buff cooldown timer |
| **⌨️ Key Forward** | Open key forwarder |
| **⚙️ Settings** | Configure API key |

### Tracker Controls

| Button | Action |
|--------|--------|
| **▶ / ⏸** | Start/Pause tracking |
| **↻** | Reset session (saves to Excel first) |
| **New Mob** | Switch to different mob type |
| **Save Prems** | Close game to save premium items |
| **1v1 / AOE** | Switch tracking mode |
| **Session History** | Open Excel log folder |

### Buff Cooldown Timer

1. Click **⏱️ Cooldowns** in the launcher
2. Click **+** to add a new timer
3. Configure:
   - **Name** - Buff name (e.g., "Haste")
   - **Hotkey** - Key that triggers this buff
   - **Character** - Which character this applies to
   - **Duration** - Buff duration in seconds
   - **Auto-press** - Optionally auto-recast when timer ends
4. Play the game - timers start automatically when you press the hotkey!

### Key Forwarder

1. Click **⌨️ Key Forward** in the launcher
2. Click **+ Add Rule**
3. Configure:
   - **Source Character** - Character that sends keys
   - **Target Character** - Character that receives keys
   - **Keys** - Which keys to forward
4. Enable the rule with the toggle switch
5. Now when you press those keys in the source window, they're sent to the target!

## ⚙️ Settings

### Tracking Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **XP per Kill (%)** | XP gained per kill | 0.0500 |
| **Pixel diff trigger (%)** | Sensitivity for detecting changes | 0.065 |
| **Cooldown (ms)** | Minimum time between kill detections | 800 |
| **Calibration Kills** | Number of kills for calibration | 3 |

### Cooldown Timer Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Always on top** | Keep timer window above others | On |
| **Flash on complete** | Visual flash when timer ends | On |
| **Sound alert** | Play sound when timer ends | Off |
| **Flash duration** | How long the flash lasts | 2000ms |

## 📁 File Locations

```
Documents/FlyffMobTracker/
├── sessions.xlsx      # Session log (auto-created)
└── gpt-config.json    # Legacy API key location (optional)

%APPDATA%/flyff-session-launcher/
└── config.json        # App settings & characters
```

## 🔒 Privacy & Security

- **Context Isolation** - Renderer processes are sandboxed
- **Encrypted Storage** - API key encrypted with OS-level encryption
- **No Node in Renderer** - Secure IPC communication only
- **Local Only** - All data stays on your computer
- **No Telemetry** - No analytics or tracking
- **Minimal Capture** - Only XP bar region sent to GPT

## 🐛 Troubleshooting

### Launcher Shows Black Screen
- Make sure `launcher-preload.js` exists in the app folder
- Check DevTools console (Ctrl+Shift+I) for errors

### GPT Calibration Fails
- Verify API key in Settings
- Ensure XP bar capture shows clear, readable digits
- Try fine-tuning the capture area

### Kills Not Detected
- Increase "Pixel diff trigger" if missing kills
- Decrease it if detecting false positives
- Make sure capture area covers only the XP digits

### Buff Timer Not Starting
- Check that the hotkey matches exactly
- Ensure the timer is bound to the correct character
- Verify the game window has focus when pressing keys

### Key Forward Not Working
- Both source and target characters must be running
- Check that the rule is enabled (toggle on)
- Verify the correct keys are captured

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Flyff Universe by Gala Lab
- OpenAI for GPT-4 Vision API
- Electron framework

---

**Disclaimer:** This tool is for personal use. Use responsibly and in accordance with Flyff Universe's Terms of Service.
