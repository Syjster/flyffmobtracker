# Flyff Mob Tracker

Electron-based XP/Mob tracker for Flyff Universe.

## Download
Grab the **Setup** or **Portable** EXE from the [Releases](https://github.com/Syjster/flyffmobtracker/releases).

## Usage
1. **Capture XP Bar** (hover your mouse over your Status Window shortcut T in Flyff U).
3. **Fine-Tune Capture** (Known bug puts window back, minimize all your open programs and you'll find it)→ adjust → Apply.

   <img width="674" height="535" alt="Skärmbild 2025-11-05 230800" src="https://github.com/user-attachments/assets/36213fa1-e9ea-4d18-9e22-7541be2516dd" />
   <img width="343" height="273" alt="Skärmbild 2025-11-05 230806" src="https://github.com/user-attachments/assets/73679835-9460-402b-856b-1d729798ac43" />
4. Make sure it Captures only the xp bar, hit "Debug" to see preview of the captured area.

   <img width="316" height="454" alt="Skärmbild 2025-11-05 231146" src="https://github.com/user-attachments/assets/5511ed37-d885-44ae-86e0-19ac28a4adec" />
5. **Start** to track, Stop=Pause, Reset=resets the counter

3. (Optional) Enable GPT XP OCR

The tracker can use GPT-4o-mini to read exact XP % from the screen.
This unlocks:

Auto-calibration of XP per kill
Accurate “Mobs to Level Up”
Real XP values instead of pixel approximations
To use this feature, add your own API key.

🔑 Step A — Create a GPT API Key
Go to: https://platform.openai.com/account/api-keys
Click Create new secret key.
Copy the key (starts with sk-...).

📁 Step B — Add your key to the program folde
In the same folder as the .exe, create a new file:
gpt-config.json (Be sure it saves as .json and not .json.txt. Best is to go into notepad > Save As> All Files (Not .txt) and save it in the folder with the exe.)
Paste the following:

{
  "OPENAI_API_KEY": "your-api-key-here"
}

Save the file and restart the tracker.

Confirmation

If the key is valid:
GPT XP will appear under "GPT XP"
Calibration and reading will work
No more “API key missing” messages
If you don’t want GPT OCR:
Simply don’t create gpt-config.json
The program works normally without it

Tips:
1. Manually calculate your xp/kill, insert number into "Total XP per Kill" to have it track "Total XP" & XP/h correcly.
2. Finetune Pixel and Capture numbers. For fast killers make the time shorter.
3. Make the Status bar not transparent. In Gold Theme Menu→Options→Interface→Opacity 100% or use Original Theme for non transparent Status window.
4. Pixel is the amount of pixel change it needs to count as kill, play around with this number, worked good for me with .5% (0.005 )

(Haven't tried AOE, Don't think it will work accurately with the method I'm using. Feel free to come with suggestions to track AOE as well!)

Happy Flyffing!
