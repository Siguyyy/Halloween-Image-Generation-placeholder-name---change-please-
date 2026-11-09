# Haunt Generator

A local procedural Halloween image generator and projector player.

A portable, self-hosted media player for a Halloween projector. The player itself runs with Node.js only — no npm install and no database setup. Optional AI slideshow mode uses FastSD CPU plus Ollama.

## Start it on Windows

1. Install Node.js 18+ if it is not already installed.
2. Double-click `start-all.ps1` (or the desktop shortcut created for this folder) to start the web server, FastSD CPU, and browser together. To run it from PowerShell:

   ```powershell
   .\start-all.ps1
   ```

   The simpler `start.bat` and `start.ps1` launch only the web server.

3. Open `http://localhost:8080` on the hosting laptop.

To stop Haunt Generator and the RAM-heavy FastSD process, double-click `stop-all.bat`. From PowerShell, run `.\stop-all.ps1`. Add `-StopOllama` if you also want to stop Ollama's local service: `.\stop-all.ps1 -StopOllama`.

To randomize/shuffle all images in `media/` for USB projector playback, run `.\shuffle-media.ps1`. This numbers the files randomly (`001_...` through `095_...`), updates timestamps sequentially so projectors that sort by filename or date both display in shuffled order, and synchronizes `data/media.json`. You can also copy them sequentially to a USB drive with `.\shuffle-media.ps1 -CopyTo "E:\"`.

The server binds to `0.0.0.0`, so other devices on the same Wi-Fi/LAN can use the LAN URL printed in the terminal. If you use Tailscale, open the same port on the laptop's Tailscale IP, for example `http://100.x.y.z:8080`.

You can choose another port with `.\start.ps1 -Port 8090` or `start.bat 8090`.

## How it works

- Uploaded files are stored in the sibling `media/` folder on the host computer.
- The media library is shared by every browser/device connected to this server.
- Upload photos, videos, GIFs, and audio; drag-and-drop is supported.
- Click any card to start it. The player attempts to enter fullscreen immediately.
- Use Left/Right arrows to change scenes, Space to play/pause, F to fullscreen, and Esc to close.
- Select photos/GIFs and choose **Play slideshow**. If nothing is selected, all photos/GIFs are looped using the current interval (five seconds by default).
- Set the slideshow interval from 1–30 seconds in the **Local Generator** panel; the setting is remembered by the browser.
- The **Local Generator** panel can create a batch of scenes with FastSD CPU, save them into the shared library, and immediately start them looping.
- To move the app to another computer, copy this whole folder and run the same start script. Copy `media/` too if you want to bring the existing library.

## Projector setup

On the laptop connected to HDMI, open the player in the browser and click a scene or slideshow. Use the browser's fullscreen mode and set the projector to extend or mirror the display as desired. Keep the terminal/server window running while the party is live.

## Optional local FastSD CPU generator

The AI panel is optional; the normal media player works without FastSD CPU. To enable it on the hosting computer:

1. Install Python 3.10+ and make sure the computer has internet access for the one-time setup/model download.
2. Run `.\setup-fast-sd.ps1` from this folder. It downloads the FastSD CPU repository, installs `uv`, creates its environment, and installs the CPU runtime.
3. Run `start-all.ps1` again, then use **Generate & play** in the Local Generator panel.

## AI-generated slideshow mode

Install Ollama on the host computer, then run `.\setup-llm.ps1` once. This downloads the small `qwen2.5:0.5b` local model used only to write the next scene prompt. FastSD CPU still creates the image.

Click **AI scenes**, set the slideshow interval, and click **Play slideshow**. The player generates one fresh Halloween scene at a time, saves each image directly into the `media/` folder and library as a `.jpg`, switches as soon as it is ready, remembers recent recipes to reduce repetition, and falls back to uploaded photos/GIFs if either local model fails. The **Gothic mood** toggle changes the local LLM instructions to darker dark-fairytale scenes; both modes rotate through varied subjects, settings, palettes, actions, and compositions. The interval is also the maximum fallback wait between checks, capped at 30 seconds. While the AI slideshow is running, use **Stop AI** in the player controls to cancel generation and continue looping through uploaded scenes.

FastSD CPU's local API runs on port 8000 and uses its SD Turbo model at 512×512, one step by default. FastSD CPU supports Windows, Linux, and macOS and has a REST API with `/api/generate`; the launcher starts that local API ahead of time, while Haunt Generator can also start it automatically when needed. See the [FastSD CPU project](https://github.com/rupeshs/fastsdcpu) for the upstream runtime and model options.

