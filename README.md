# 📚 ClassQuest — Class 9 CBSE Quiz Game

A gamified quiz app for **Class 9 (CBSE / NCERT)** — neon UI, MCQ / True-False /
Fill-in-the-blank questions, lives, streaks, and **AI-generated questions** via
Grok (xAI).

---

## 🚀 Deploy on Render (recommended — AI works!)

Render runs the Node server, so AI question generation works (unlike GitHub
Pages, which is static-only).

1. **Push this folder to a GitHub repo.**
2. On <https://render.com> → **New +** → **Web Service** → connect your repo.
3. Render auto-detects the settings (from `render.yaml` / `package.json`):
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. In the service's **Environment** tab, add a secret:
   - **Key:** `XAI_API_KEY`  **Value:** your `xai-...` key from <https://console.x.ai>
   - (optional) `XAI_MODEL` = `grok-3-mini`
5. Click **Deploy**. When it's live, open the Render URL — you'll see
   **"🤖 AI questions ON"**. Done! ✅

> Don't put your key in the code. Set it only in Render's Environment tab.
> The free plan may "sleep" when idle and take ~30s to wake on the first visit.

---

## Run it locally

### 1) Simple — just the file (offline bank)
Double-click **`ClassQuest.html`** to open it in a browser. It works fully
offline using the questions in the bank. No internet, no setup.

> The single file already has the questions embedded, so you only need this one
> file for offline mode.

### 2) With AI questions — run the server locally
This serves the app **and** generates fresh questions every round using Grok.

**Step 1 — get a key:** sign in at <https://console.x.ai> and create an API key
(it starts with `xai-...`).

**Step 2 — run the server with your key:**

```bash
# Linux / macOS
XAI_API_KEY="xai-xxxxxxxx" node server.js

# Windows (PowerShell)
$env:XAI_API_KEY="xai-xxxxxxxx"; node server.js

# Windows (CMD)
set XAI_API_KEY=xai-xxxxxxxx && node server.js
```

**Step 3 — open** <http://localhost:3000> in your browser.

You'll see **"🤖 AI questions ON"** on the home screen. Pick a subject, chapter,
difficulty and question type, and every question is generated live. ✅

> Needs **Node 18+** (uses built-in `fetch`). Zero npm packages to install.
> No key set? The server still runs and just uses the offline bank.

---

## Optional settings (environment variables)
| Variable       | Default       | What it does                       |
|----------------|---------------|------------------------------------|
| `XAI_API_KEY`  | *(none)*      | Your xAI key — turns AI on         |
| `XAI_MODEL`    | `grok-3-mini` | Which Grok model to use            |
| `PORT`         | `3000`        | Port the server listens on         |

---

## Subjects & books
- 📐 **Maths** — Ganita Manjari (8 chapters)
- 🔬 **Science** — Exploration (Physics / Chemistry / Biology / General groups)
- 📖 **English** — Kaveri (16 chapters)
- 🪔 **Hindi** — Ganga (12 chapters)
- 🏛️ History · 🌍 Geography · ⚖️ Civics · 💰 Economics (chapters via question bank)

## Question types
- 🔘 **MCQ** — 4 options
- ✅ **True / False**
- ✍️ **Fill in the blank** — type the answer (case-insensitive)

## Adding your own offline questions
Open **`questions.js`** and add entries to `window.QUESTION_BANK`. The format for
all three types is documented at the top of that file. If you use the single
`ClassQuest.html` file, edit the questions inside its `<script>` block (or
re-run the build step below).

## Rebuilding the single file
If you edit `classquest.html` or `questions.js`, regenerate the combined file:
```bash
python3 - <<'EOF'
html=open('classquest.html').read(); js=open('questions.js').read()
open('ClassQuest.html','w').write(html.replace('<script src="questions.js"></script>','<script>\n'+js+'\n</script>'))
EOF
```

## Files
| File              | What it is                                        |
|-------------------|---------------------------------------------------|
| `ClassQuest.html` | The single-file app (offline-ready)               |
| `classquest.html` | Source HTML (loads `questions.js` separately)     |
| `questions.js`    | Chapter lists + offline question bank             |
| `server.js`       | Tiny Node server + Grok AI endpoint               |
| `package.json`    | Node config (Render uses this to start the app)   |
| `render.yaml`     | Render deploy blueprint                           |
| `.gitignore`      | Keeps `node_modules` / secrets out of git         |
| `README.md`       | This file                                         |
