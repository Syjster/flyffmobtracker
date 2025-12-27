# Flyff Mob Tracker

A desktop application for tracking mobs, XP, and session statistics in Flyff Universe. Features GPT-powered XP calibration, automatic level-up detection, and Excel session logging.

![Electron](https://img.shields.io/badge/Electron-32.0-47848F?logo=electron)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Real-time mob Tracking** - Detects mobs via XP bar pixel changes
- **GPT-Powered XP Calibration** - Uses GPT-4 Vision to read exact XP percentage
- **Automatic Level-Up Detection** - Detects level ups and auto-recalibrates XP/mob
- **Mobs to Level Counter** - Live countdown updated with each mob
- **Session Statistics** - Tracks mobs, XP gained, XP/hour, elapsed time
- **Excel Session Logging** - Auto-saves sessions with start/end XP details
- **Save Prems Button** - Close game to save premium items, resume anytime
- **New Mob Button** - Switch mob types without losing session progress
- **Sanity Checks** - Periodic GPT verification to correct tracking drift

## Installation

### Download Release
1. Go to [Releases](https://github.com/Syjster/flyffmobtracker/releases)
2. Download `Flyff Mob Tracker Setup X.X.X.exe` (installer) or `Flyff Mob Tracker Portable X.X.X.exe`
3. Run and enjoy!

## Setup

### 1. GPT API Key (Required for calibration)

You need an OpenAI API key for GPT-powered XP reading. Choose one method:

**Option A: Config File (Recommended)**
1. Navigate to `Documents/FlyffMobTracker/`
2. Create `gpt-config.json`:
```json
{
  "openaiKey": "sk-your-api-key-here"
}
```

> ⚠️ **Security Note:** Never share your API key or commit it to version control. The `.env` file is in `.gitignore` by default.

### 2. Capture the XP Bar

1. Click **"▶ Capture Settings"** to expand the capture section
2. Click **"Capture"** and hover your mouse over the XP percentage text
3. Wait for the 3-second countdown
4. Click **"Fine-tune"** to adjust the capture area if needed
5. The yellow box should cover just the XP percentage digits (e.g., "54.4444%")

### 3. Calibrate XP per mob

1. Click **"GPT Auto Calibrate"** to start calibration
2. mob the specified number of mobs (default: 3)
3. The app will calculate your exact XP per mob
4. Stats reset automatically - you're ready to grind!

## Usage

### Controls

| Button | Action |
|--------|--------|
| **▶ / ⏸** | Start/Pause tracking |
| **↻** | Reset session (saves to Excel first) |
| **New Mob** | Switch to different mob type (preserves session) |
| **Save Prems** | Close game to save premium items |
| **Resume Session** | Reload game after saving prems |
| **GPT Auto Calibrate** | Calibrate XP per mob |
| **Session History** | Open Excel log folder |

### Workflow

1. **Start Session:** Capture XP bar → Calibrate → Press Play
2. **Grinding:** App tracks mobs automatically via pixel detection
3. **Switch Mobs:** Click "New Mob" → mob 3 of the new mob → Continue
4. **Save Prems:** Click "Save Prems" → Do other things → Click "Resume Session"
5. **Level Up:** Detected automatically → Auto-recalibrates → Continues tracking
6. **End Session:** Press Pause or Reset (auto-saves to Excel)

### Level-Up Detection

The app detects level-ups in two ways:
1. **Mobs to Level reaches 0** → Triggers GPT check → Confirms level up
2. **Sanity check** → If expected XP > 90% but actual < 30% → Level up detected

When a level-up is detected:
- Session log shows "🎉 LEVEL UP #X!"
- Auto-recalibration starts immediately
- Session stats (mobs, time, XP) are preserved
- Excel log notes include level-up count

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **XP per mob (%)** | XP gained per mob mob | 0.0500 |
| **Pixel diff trigger (%)** | Sensitivity for detecting changes | 0.065 |
| **Cooldown (ms)** | Minimum time between mob detections | 800 |
| **Calibration mobs** | Number of mobs for calibration | 3 |

## Session Logging

Sessions are automatically saved to Excel when you:
- Press Pause
- Press Reset
- Click Save Prems

**Log Location:** `Documents/FlyffMobTracker/sessions.xlsx`

**Logged Data:**
| Column | Description |
|--------|-------------|
| Date | Session date |
| Start Time | When session started |
| End Time | When session ended/paused |
| Duration | Total active time |
| Total mobs | Number of mobs |
| Total XP | XP gained (calculated) |
| XP/Hour | Average XP per hour |
| XP/mob | Calibrated XP per mob |
| Level Ups | Number of level-ups |
| Notes | Start/End XP (e.g., "Start: 45.32% → End: 78.91% (+1 lvl)") |

## Troubleshooting

### GPT Calibration Fails
- Check your API key in `Documents/FlyffMobTracker/gpt-config.json`
- Ensure the XP bar capture area shows clear, readable digits
- Try fine-tuning the capture area

### mobs Not Detected
- Increase "Pixel diff trigger" if missing mobs
- Decrease it if detecting false positives
- Adjust "Cooldown" for faster/slower mob rates
- Make sure the capture area is on the XP digits only

### Level-Up Not Detected
- The app checks when "Mobs to Level" reaches 0
- Also checks during periodic sanity checks (every 3 minutes)
- If XP/mob changed significantly after leveling, use "New Mob" to recalibrate

### Excel Not Saving
- Check write permissions in Documents folder
- Close Excel if the file is open
- Check `Documents/FlyffMobTracker/` folder exists

## Technical Details

- **Framework:** Electron 32
- **XP Reading:** OpenAI GPT-4 Vision API
- **mob Detection:** Pixel difference algorithm on XP bar region
- **Data Storage:** Local JSON config + XLSX session logs

### File Structure
```
Documents/FlyffMobTracker/
├── gpt-config.json    # API key (optional)
└── sessions.xlsx      # Session log
```

## Privacy & Security

- **API Key:** Stored locally, never transmitted except to OpenAI
- **Screenshots:** Only the XP bar region is captured and sent to GPT
- **No Telemetry:** The app doesn't collect or send any analytics
- **Local Storage:** All data stays on your computer

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Flyff Universe by Gala Lab
- OpenAI for GPT-4 Vision API
- Electron framework

---

**Disclaimer:** This tool is for personal use. Use responsibly and in accordance with Flyff Universe's Terms of Service.
