/* ============================================================================
   ClassQuest — tiny backend server  (Node 18+, ZERO dependencies)
   ----------------------------------------------------------------------------
   What it does:
     • Serves ClassQuest.html (and the static files) on http://localhost:3000
     • GET  /api/status   → tells the app whether AI is configured
     • POST /api/question → asks Grok (xAI) for ONE fresh question and returns it

   The xAI API key stays on the SERVER (never sent to the browser).

   ── Setup ──────────────────────────────────────────────────────────────────
     1) Get a key from  https://console.x.ai   (starts with "xai-...")
     2) Set it as an environment variable and run:

          Windows (PowerShell):
            $env:XAI_API_KEY="xai-xxxxxxxx"; node server.js

          Windows (CMD):
            set XAI_API_KEY=xai-xxxxxxxx && node server.js

          Linux / macOS:
            XAI_API_KEY="xai-xxxxxxxx" node server.js

     3) Open  http://localhost:3000  in your browser.

   If no key is set, the app still runs and just uses the offline question bank.
   ============================================================================ */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT     = process.env.PORT || 3000;
const API_KEY  = process.env.XAI_API_KEY || '';
const MODEL    = process.env.XAI_MODEL || 'grok-3-mini';   // change if you like
const XAI_URL  = 'https://api.x.ai/v1/chat/completions';

const ROOT = __dirname;
const MIME = {
  '.html':'text/html; charset=utf-8',
  '.js'  :'application/javascript; charset=utf-8',
  '.css' :'text/css; charset=utf-8',
  '.png' :'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.json':'application/json; charset=utf-8'
};

/* ── helper: read the JSON body of a POST request ── */
function readBody(req){
  return new Promise((resolve)=>{
    let data='';
    req.on('data', c => { data += c; if(data.length > 1e6) req.destroy(); });
    req.on('end', ()=>{ try{ resolve(JSON.parse(data||'{}')); }catch{ resolve({}); } });
  });
}

/* ── helper: send JSON ── */
function sendJSON(res, code, obj){
  const body = JSON.stringify(obj);
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8'});
  res.end(body);
}

/* ── Build the prompt we send to Grok ── */
function buildPrompt({sub, diff, qtype, topics, recent}){
  const typeWord = ({
    mcq :'a multiple-choice question with exactly 4 options',
    tf  :'a true/false question',
    fill:'a fill-in-the-blank question (use ____ in the text for the blank)'
  })[qtype] || 'either a multiple-choice (4 options), true/false, or fill-in-the-blank question';

  const chapterLine = (topics && topics.length)
    ? `Focus on these chapter(s): ${topics.join(', ')}.`
    : `Pick any chapter from this subject.`;

  const avoid = (recent && recent.length)
    ? `Do NOT repeat or closely resemble any of these recent questions: ${recent.map(r=>`"${r}"`).join('; ')}.`
    : '';

  return `You are a question generator for an Indian CBSE Class 9 study game.
Create ${typeWord} for the subject "${sub}" at "${diff}" difficulty.
${chapterLine}
${avoid}

Reply with ONLY a JSON object (no markdown, no backticks) in EXACTLY one of these shapes:

For MCQ:
{"type":"mcq","topic":"<chapter>","question":"<text>","options":["A","B","C","D"],"correct":<0-3>,"explanation":"<short why>"}

For True/False:
{"type":"tf","topic":"<chapter>","question":"<statement>","answer":<true|false>,"explanation":"<short why>"}

For Fill in the blank:
{"type":"fill","topic":"<chapter>","question":"<text with ____>","answer":"<correct answer>","accept":["<other accepted answers>"],"explanation":"<short why>"}

Keep it factually correct and appropriate for Class 9. The "explanation" must be one short sentence.`;
}

/* ── Call Grok and return a parsed question object (or throw) ── */
async function askGrok(params){
  const r = await fetch(XAI_URL, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization':`Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages:[
        {role:'system', content:'You output only valid JSON. No prose, no markdown.'},
        {role:'user',   content: buildPrompt(params)}
      ],
      temperature: 0.8
    })
  });

  if(!r.ok){
    const t = await r.text().catch(()=> '');
    throw new Error(`xAI ${r.status}: ${t.slice(0,200)}`);
  }
  const j = await r.json();
  let txt = j?.choices?.[0]?.message?.content || '';

  // strip accidental code fences, then grab the JSON object
  txt = txt.replace(/```json/gi,'').replace(/```/g,'').trim();
  const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
  if(s===-1 || e===-1) throw new Error('No JSON in model reply');
  const q = JSON.parse(txt.slice(s, e+1));

  // minimal validation / cleanup
  if(!q.question) throw new Error('Question missing "question"');
  if(q.type==='mcq'){
    if(!Array.isArray(q.options) || q.options.length<2) throw new Error('Bad MCQ options');
    q.correct = Math.max(0, Math.min(q.options.length-1, parseInt(q.correct,10)||0));
  } else if(q.type==='tf'){
    q.answer = (q.answer===true || String(q.answer).toLowerCase()==='true');
  } else if(q.type==='fill'){
    if(q.answer==null) throw new Error('Fill question missing "answer"');
    if(!Array.isArray(q.accept)) q.accept = [];
  } else {
    throw new Error('Unknown question type: '+q.type);
  }
  return q;
}

/* ── static file server ── */
function serveStatic(req, res){
  let url = decodeURIComponent(req.url.split('?')[0]);
  if(url==='/' ) url = '/ClassQuest.html';
  // prevent path traversal
  const filePath = path.normalize(path.join(ROOT, url));
  if(!filePath.startsWith(ROOT)){ res.writeHead(403); return res.end('Forbidden'); }

  fs.readFile(filePath, (err, buf)=>{
    if(err){ res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
    res.end(buf);
  });
}

/* ── main request handler ── */
const server = http.createServer(async (req, res)=>{
  // tell the front-end whether AI is on
  if(req.url === '/api/status'){
    return sendJSON(res, 200, { ai: !!API_KEY, model: API_KEY ? MODEL : null });
  }

  // generate one fresh question
  if(req.url === '/api/question' && req.method === 'POST'){
    if(!API_KEY) return sendJSON(res, 200, { error:'no-key' });
    try {
      const body = await readBody(req);
      const q = await askGrok({
        sub:    body.sub    || 'Science',
        diff:   body.diff   || 'Beginner',
        qtype:  body.qtype  || 'mixed',
        topics: body.topics || [],
        recent: body.recent || []
      });
      return sendJSON(res, 200, { question: q });
    } catch(e){
      console.error('AI error:', e.message);
      return sendJSON(res, 200, { error: e.message });
    }
  }

  // everything else → static files
  serveStatic(req, res);
});

server.listen(PORT, ()=>{
  console.log(`\n  ClassQuest running →  http://localhost:${PORT}`);
  console.log(`  AI questions: ${API_KEY ? 'ON  (model: '+MODEL+')' : 'OFF (set XAI_API_KEY to enable)'}\n`);
});
