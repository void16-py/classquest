/* ============================================================================
   ClassQuest — AI Question Server  (Node 18+, ZERO dependencies)
   ----------------------------------------------------------------------------
   Does two jobs:
     1. Serves the game files (ClassQuest.html, classquest.html, questions.js).
     2. POST /api/question  → calls an AI provider to generate ONE fresh
        question (MCQ / True-False / Fill-in-the-blank), keeping your API key
        safe on the SERVER. The browser never sees your key.

   If no key is set (or the AI call fails), the game falls back to the offline
   question bank automatically, so it never breaks.

   ── HOW TO RUN ───────────────────────────────────────────────────────────
   1. Get a key (pick ONE — Groq & Gemini have free tiers, no card needed):
        Groq      (free, fast): https://console.groq.com/keys
        Gemini    (free):       https://aistudio.google.com/apikey
        OpenAI    (paid):       https://platform.openai.com/api-keys
        Anthropic (paid):       https://console.anthropic.com/
   2. Set it as an env var and start the server:
        macOS / Linux:    export GROQ_API_KEY="your_key"   &&  node server.js
        Windows (PS):     $env:GROQ_API_KEY="your_key";        node server.js
   3. Open  http://localhost:3000

   ── ON RENDER ────────────────────────────────────────────────────────────
   Add one Environment Variable (whichever provider you use), e.g.
        GROQ_API_KEY = your_key
   Build: npm install   ·   Start: node server.js
   ============================================================================ */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

/* ── PROVIDER CONFIG — auto-pick whichever key is present ──
   Priority: Groq → Gemini → OpenAI → Anthropic. */
const GROQ_KEY      = process.env.GROQ_API_KEY      || '';
const GEMINI_KEY    = process.env.GEMINI_API_KEY    || '';
const OPENAI_KEY    = process.env.OPENAI_API_KEY    || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

let PROVIDER = 'none';
if      (GROQ_KEY)      PROVIDER = 'groq';
else if (GEMINI_KEY)    PROVIDER = 'gemini';
else if (OPENAI_KEY)    PROVIDER = 'openai';
else if (ANTHROPIC_KEY) PROVIDER = 'anthropic';

const GROQ_MODEL      = process.env.GROQ_MODEL      || 'llama-3.3-70b-versatile';
const GEMINI_MODEL    = process.env.GEMINI_MODEL    || 'gemini-2.0-flash';
const OPENAI_MODEL    = process.env.OPENAI_MODEL    || 'gpt-4o-mini';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022';

/* ----------------------------------------------------------------------------
   Build the prompt for ONE Class-9 question of the requested type.
   ---------------------------------------------------------------------------- */
function buildPrompt({ sub, diff, qtype, topics, recent }) {
  const chapterLine = (topics && topics.length)
    ? `Focus ONLY on these chapter(s): ${topics.join(', ')}.`
    : 'Pick any chapter from this subject.';

  const avoid = (recent && recent.length)
    ? `Do NOT repeat or closely resemble any of these recent questions: ${recent.slice(-6).map(r=>`"${r}"`).join(' | ')}.`
    : '';

  // Which JSON shape do we want back?
  let shapeRules;
  if (qtype === 'mcq') {
    shapeRules =
`Return a MULTIPLE-CHOICE question in EXACTLY this JSON shape:
{"type":"mcq","topic":"<chapter>","question":"<text>","options":["A","B","C","D"],"correct":0,"explanation":"<one short sentence>"}
- "options": exactly 4 plausible choices (plain text, no "A)" prefixes).
- "correct": the index (0,1,2,3) of the correct option.`;
  } else if (qtype === 'tf') {
    shapeRules =
`Return a TRUE/FALSE question in EXACTLY this JSON shape:
{"type":"tf","topic":"<chapter>","question":"<statement>","answer":true,"explanation":"<one short sentence>"}
- "answer": true or false (boolean).`;
  } else if (qtype === 'fill') {
    shapeRules =
`Return a FILL-IN-THE-BLANK question in EXACTLY this JSON shape:
{"type":"fill","topic":"<chapter>","question":"<text with ____ for the blank>","answer":"<correct answer>","accept":["<other accepted answers>"],"explanation":"<one short sentence>"}
- Put a blank "____" in the question text.
- "accept": optional array of other acceptable answers (can be empty []).`;
  } else {
    // mixed — let the model choose one type
    shapeRules =
`Choose ONE question type (mcq, tf, or fill) and return EXACTLY one of these JSON shapes:
MCQ : {"type":"mcq","topic":"<chapter>","question":"<text>","options":["A","B","C","D"],"correct":0,"explanation":"<one short sentence>"}
TF  : {"type":"tf","topic":"<chapter>","question":"<statement>","answer":true,"explanation":"<one short sentence>"}
FILL: {"type":"fill","topic":"<chapter>","question":"<text with ____>","answer":"<answer>","accept":[],"explanation":"<one short sentence>"}`;
  }

  return `You are a question generator for an Indian CBSE Class 9 study game.
Generate exactly ONE ${diff}-level question for the subject "${sub}".
${chapterLine}
${avoid}

${shapeRules}

Return ONLY raw JSON — no markdown, no code fences, no commentary.
Keep it factually correct and appropriate for Class 9. The "explanation" must be one short sentence.`;
}

/* ----------------------------------------------------------------------------
   Provider callers — each returns the raw text the model produced.
   ---------------------------------------------------------------------------- */
async function callGroq(prompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, responseMimeType: 'application/json' }
    })
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
}

async function callOpenAI(prompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).map(b => b.text || '').join('');
}

/* ----------------------------------------------------------------------------
   Parse + validate the model output into a clean ClassQuest question object.
   ---------------------------------------------------------------------------- */
function parseQuestion(raw) {
  const clean = String(raw || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('No JSON in model reply');
  const p = JSON.parse(clean.slice(s, e + 1));

  if (!p.question) throw new Error('Question missing "question"');

  // infer type if the model forgot it
  let type = p.type;
  if (!type) {
    if (Array.isArray(p.options) && p.options.length) type = 'mcq';
    else if (typeof p.answer === 'boolean') type = 'tf';
    else type = 'fill';
  }
  p.type = type;

  if (type === 'mcq') {
    if (!Array.isArray(p.options) || p.options.length < 2) throw new Error('Bad MCQ options');
    // strip accidental "A) " prefixes
    p.options = p.options.map(o => String(o).replace(/^[A-Fa-f][).]\s*/, '').trim());
    let c = p.correct;
    if (typeof c === 'string') c = 'ABCDEF'.indexOf(c.trim().toUpperCase().charAt(0));
    p.correct = Math.max(0, Math.min(p.options.length - 1, parseInt(c, 10) || 0));
  } else if (type === 'tf') {
    p.answer = (p.answer === true || String(p.answer).toLowerCase() === 'true');
  } else if (type === 'fill') {
    if (p.answer == null) throw new Error('Fill question missing "answer"');
    p.answer = String(p.answer);
    if (!Array.isArray(p.accept)) p.accept = [];
  } else {
    throw new Error('Unknown question type: ' + type);
  }

  p.explanation = p.explanation || '';
  return p;
}

async function generateQuestion(body) {
  const prompt = buildPrompt(body);
  let raw;
  if      (PROVIDER === 'groq')      raw = await callGroq(prompt);
  else if (PROVIDER === 'gemini')    raw = await callGemini(prompt);
  else if (PROVIDER === 'openai')    raw = await callOpenAI(prompt);
  else if (PROVIDER === 'anthropic') raw = await callAnthropic(prompt);
  else throw new Error('No AI provider configured');
  return parseQuestion(raw);
}

/* ----------------------------------------------------------------------------
   Static file serving
   ---------------------------------------------------------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'
};

function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/ClassQuest.html';
  const filePath = path.join(__dirname, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(__dirname)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ----------------------------------------------------------------------------
   HTTP server
   ---------------------------------------------------------------------------- */
const server = http.createServer((req, res) => {
  // status endpoint → tells the browser if AI is available
  if (req.method === 'GET' && req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ai: PROVIDER !== 'none', provider: PROVIDER }));
  }

  // generate one fresh question
  if (req.method === 'POST' && req.url === '/api/question') {
    let buf = '';
    req.on('data', c => { buf += c; if (buf.length > 1e5) req.destroy(); });
    req.on('end', async () => {
      let body = {};
      try { body = JSON.parse(buf || '{}'); } catch (_) {}
      try {
        const q = await generateQuestion(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, question: q, provider: PROVIDER }));
      } catch (e) {
        console.error('AI error:', e.message);
        // tell the browser to fall back to its offline bank
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      }
    });
    return;
  }

  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405); res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  console.log('\n  📚  ClassQuest server running');
  console.log(`  →  http://localhost:${PORT}`);
  console.log(`  AI provider: ${PROVIDER === 'none' ? 'NONE (offline bank only)' : PROVIDER}`);
  if (PROVIDER === 'none') {
    console.log('\n  ℹ  No API key found. The game still works using the offline');
    console.log('     question bank. To enable UNLIMITED AI questions, set a key:');
    console.log('       export GROQ_API_KEY="your_key"     (free: https://console.groq.com/keys)');
    console.log('       export GEMINI_API_KEY="your_key"   (free: https://aistudio.google.com/apikey)');
    console.log('     then restart:  node server.js\n');
  } else {
    console.log('     Unlimited AI-generated questions are ENABLED. 🎉\n');
  }
});
