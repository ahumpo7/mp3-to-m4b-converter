# MP3 to M4B Audiobook Studio 🎧

A fast, modern web application designed to convert MP3 audiobooks and podcasts into native `.m4b` audiobooks while **100% preserving all chapters, metadata, and embedded cover art**.

---

## ✨ Features

- **100% Chapter Preservation**: Reads ID3v2 `CHAP` and `CTOC` frames from your MP3 and writes native QuickTime chapter tracks + Nero chapter atoms into the output `.m4b`. Compatible with Apple Books, iTunes, VLC, Smart AudioBook Player, Audiobookshelf, Voice, and Prologue.
- **Embedded Cover Art**: Automatically extracts front cover artwork and embeds it into the `.m4b` container with proper `attached_pic` disposition. Also supports uploading a replacement cover image or removing cover.
- **Complete Metadata Retention**: Preserves Title, Author/Artist, Narrator/Composer, Series/Album, Year/Date, Genre, and Description/Comments. Allows editing all fields before converting.
- **Interactive Chapter Timeline & Editor**:
  - Visual color-coded timeline bar with hover tooltips and jump-to-chapter clicks.
  - Inline editing of chapter titles and timestamps (`HH:MM:SS`).
  - Add or delete chapter markers manually.
  - **Import Chapters**: Paste timestamped tracklists (e.g. `00:00 Intro`, `05:30 Chapter 1`) or CUE sheets.
  - **Auto-Split Tool**: Automatically divide audio into equal chapters (e.g., every 15, 30, 45, or 60 minutes).
- **Customizable Audio Encoding**:
  - Presets: Voice Optimized (64 kbps mono), Standard Audiobook (128 kbps), High Fidelity (192 kbps), Audiophile (256 kbps).
  - Channels: Auto, Mono (saves 50% file size for voice), Stereo.
  - Sample Rate: Auto, 44.1 kHz, 48 kHz.
- **Real-Time Live Progress**:
  - Server-Sent Events (SSE) streaming percentage, conversion speed (e.g. `85x`), elapsed time, and remaining ETA.
- **In-Browser Audio Player**:
  - Test chapter navigation and seek timestamps directly inside the browser before or after downloading.
- **Faststart Streaming**:
  - Places the `moov` atom at the beginning of the M4B file (`-movflags +faststart`) so it starts playing immediately without buffering delays.
- **Large File Support**:
  - Streams uploads directly to disk and supports multi-gigabyte audiobooks.

---

## 🚀 Run From Anywhere (Phone, Tablet, or PC)

### Option 1: 1-Click Free Cloud Deployment (Access from any phone or browser)

Deploy this app to **Render** directly from your GitHub repo with 1 click:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ahumpo7/mp3-to-m4b-converter)

Once deployed, you get a public HTTPS URL (e.g. `https://mp3-to-m4b.onrender.com`) that you can open in Safari or Chrome on your phone, tablet, or any computer.

---

### Option 2: Run on your phone over Local Wi-Fi (Instant)

If your computer is running this app (`npm start` or `docker compose up -d`), you can open it on your phone right now:
1. Make sure your phone is connected to the same Wi-Fi network as your computer.
2. Open Safari / Chrome on your phone and go to:
   `http://<your-computer-ip>:3000` (e.g. `http://192.168.1.13:3000`)

---

### Option 3: Run with Docker

```bash
docker compose up -d
```
Then open [http://localhost:3000](http://localhost:3000).

---

### Option 4: Run Locally with Node.js

#### Prerequisites
- [Node.js](https://nodejs.org) (v18+)
- [FFmpeg](https://ffmpeg.org/download.html) (Ensure `ffmpeg` and `ffprobe` are installed and in your PATH, or installed via winget: `winget install Gyan.FFmpeg`)

#### Installation & Startup

```bash
# 1. Install dependencies
npm install

# 2. Start the web server
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

### 3. Convert an Audiobook

1. **Drag and drop** your MP3 file onto the dropzone (or click to browse).
2. The server will immediately parse and display all detected metadata, chapters, and cover art.
3. Review or customize any tags, chapters, or audio bitrate settings.
4. Click **Convert to M4B Audiobook**.
5. Once conversion is complete, click **Download M4B Audiobook** or listen with the built-in chapter player!

---

## 🧪 Running the End-to-End Test

To verify that metadata, chapters, cover art, and encoding work seamlessly:

```bash
npm test
```

This generates a test MP3 with embedded chapters and cover artwork, passes it through the server API, converts it to M4B, and runs `ffprobe` to verify that every chapter and tag is 100% intact.

---

## 🛠 Tech Stack

- **Backend**: Node.js, Express, Multer, `music-metadata`, `ffprobe` / `ffmpeg`
- **Frontend**: Modern Vanilla JavaScript, CSS Glassmorphism, Native `<dialog>` Modals, Server-Sent Events (SSE), HTML5 `<audio>` with HTTP Range 206 streaming.
- **Engine**: FFmpeg 9.x Essentials with native AAC encoding, QuickTime chapter text muxer, and faststart MP4 container generation.
