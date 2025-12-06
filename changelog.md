# Changelog

All notable changes to Flyff Mob Tracker will be documented in this file.

## [1.2.0] - 2025-12-07

### Added
- **Excel Session Logging** - Sessions auto-save to `Documents/FlyffMobTracker/sessions.xlsx`
  - Saves on Pause, Reset, or when closing
  - Tracks: Date, Time, Duration, Kills, XP, XP/Hour, XP/Kill, Level Ups
- **New Mob Button** - Switch to different mob type mid-session
  - Triggers recalibration for new XP/kill rate
  - Preserves session statistics
- **Collapsible Settings Section** - Clean UI, expand when needed
- **Session Log Panel** - See recent events (calibration, level-ups, errors)
- **Play/Pause Toggle** - Single button with visual state indicator
- **Auto-Start Calibration** - Tracking starts automatically during calibration
- **Save Prems Button** - Close game to save premium items without losing session progress
  - Click "Save Prems" to close the game and pause tracking
  - Button changes to "Resume Session" - click to reload and continue
  - Session stats (kills, XP, time) are fully preserved
- **Automatic Level-Up Detection & Recalibration**
  - Detects level-up when "Mobs to Level" counter reaches 0
  - Triggers GPT verification to confirm level-up
  - Auto-starts recalibration (like New Mob) to get new XP/kill rate
  - Session continues without interruption
- **Enhanced Excel Logging**
  - Notes column now shows start and end XP: "Start: 45.32% → End: 78.91%"
  - Level-ups indicated in notes: "Start: 95.12% → End: 23.45% (+1 lvl)"
  - Wider Notes column (40 characters) for better readability
- **Session History Button** - Quick access to Excel log folder

### Changed
- Level-up detection now uses dual approach:
  1. Primary: Mobs to Level reaches 0 → triggers verification
  2. Backup: Sanity check detects XP reset (>90% expected, <30% actual)
- Both detection methods trigger auto-recalibration
- UI reorganized: Stats first, then Controls, then Session Log
- Settings section collapsible (starts expanded)
- Capture Settings collapsible (starts collapsed)
- Cleaner session log - only important events shown
- Improved button styling with gradients and hover effects

### Fixed
- Window position and size now saved between sessions
- Calibration workflow streamlined
- **Mobs to Level Counter** - Now updates in real-time with each kill
  - Previously only updated on GPT readings
  - Tracks kills since last GPT reading for accurate countdown
- **New Mob Button** - No longer resets session stats
  - Preserves kills, XP, and elapsed time
  - Only recalibrates XP/kill rate for the new mob type


## [1.1.0] - 2025-12-03

### Added
- **GPT-Powered XP Calibration** - Uses GPT-4 Vision to read exact XP percentage
- **Automatic Sanity Checks** - Periodic GPT verification every 3 minutes
- **Level-Up Detection** - Detects when XP resets after leveling
- **Mobs to Level Counter** - Shows estimated kills remaining to level up
- **GPT XP Display** - Shows last GPT-read XP percentage

### Changed
- Improved pixel difference algorithm for better kill detection
- Added configurable calibration kill count (1-20)

## [1.0.0] - 2025-11-06

### Initial Release
- Real-time kill tracking via XP bar pixel detection
- Session statistics: kills, XP, XP/hour, elapsed time
- Configurable settings: XP per kill, pixel sensitivity, cooldown
- XP bar capture with fine-tune overlay
- Debug mode with visual previews
- Embedded Flyff Universe browser