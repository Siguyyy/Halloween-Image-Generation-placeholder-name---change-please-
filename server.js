const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');
const { URL } = require('url');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const MEDIA_DIR = path.join(ROOT, 'media');
const DATA_DIR = path.join(ROOT, 'data');
const INDEX_FILE = path.join(DATA_DIR, 'media.json');
const AI_TEMP_DIR = path.join(DATA_DIR, 'ai-temp');
const FASTSD_DIR = path.join(ROOT, 'fastsdcpu');
const FASTSD_APP = path.join(FASTSD_DIR, 'src', 'app.py');
const FASTSD_ENV_PYTHON = process.platform === 'win32'
  ? path.join(FASTSD_DIR, 'env', 'Scripts', 'python.exe')
  : path.join(FASTSD_DIR, 'env', 'bin', 'python');
const FASTSD_API_URL = process.env.FASTSD_API_URL || 'http://127.0.0.1:8000';
const FASTSD_PORT = Number(process.env.FASTSD_PORT || 8000);
const AI_MODEL = 'FastSD CPU / SD Turbo';
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:0.5b';
const OLLAMA_EXECUTABLE = process.env.OLLAMA_EXECUTABLE || (process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe')
  : 'ollama');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const HOST = getArg('--host', process.env.HOST || '0.0.0.0');
const PORT = Number(getArg('--port', process.env.PORT || 8080));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

let mediaIndex = [];
const transientMedia = new Map();
let indexWrite = Promise.resolve();
let fastSdProcess = null;
let ollamaProcess = null;

const HALLOWEEN_SUBJECTS = [
  { label: 'a glowing jack-o-lantern', terms: ['jack-o-lantern', 'pumpkin'] },
  { label: 'a bat swarm around a bell tower', terms: ['bat', 'bell tower'] },
  { label: 'a friendly cartoon ghost', terms: ['ghost'] },
  { label: 'a playful black cat', terms: ['black cat', 'cat'] },
  { label: 'a crooked haunted mansion', terms: ['haunted mansion', 'mansion'] },
  { label: 'a witch apothecary shelf', terms: ['apothecary', 'potion'] },
  { label: 'a raven perched on an iron gate', terms: ['raven', 'iron gate'] },
  { label: 'a moonlit pumpkin patch', terms: ['pumpkin patch'] },
  { label: 'a curious spooky owl', terms: ['owl'] },
  { label: 'a friendly Halloween spider', terms: ['spider'] },
  { label: 'a dancing skeleton', terms: ['skeleton'] },
  { label: 'a haunted carousel', terms: ['carousel'] },
  { label: 'a mysterious spellbook', terms: ['spellbook', 'spell book'] },
  { label: 'a spooky old train', terms: ['train'] },
  { label: 'a trio of trick-or-treaters', terms: ['trick-or-treat', 'trick or treat'] },
  { label: 'a gothic cemetery fountain', terms: ['cemetery', 'fountain'] },
  { label: 'a tiny vampire bat cottage', terms: ['vampire', 'cottage'] },
];
const SCENE_SETTINGS = [
  { label: 'on a foggy forest footbridge', terms: ['forest footbridge'] },
  { label: 'inside an abandoned theater', terms: ['abandoned theater'] },
  { label: 'above a quiet seaside village', terms: ['seaside village'] },
  { label: 'in a candlelit library', terms: ['candlelit library'] },
  { label: 'at a rainy village crossroads', terms: ['village crossroads'] },
  { label: 'inside a glass greenhouse at midnight', terms: ['glass greenhouse'] },
  { label: 'beside a crooked stone well', terms: ['stone well'] },
  { label: 'on a rooftop under drifting clouds', terms: ['rooftop'] },
  { label: 'in a lantern-lit autumn orchard', terms: ['autumn orchard'] },
  { label: 'at the edge of a silent lake', terms: ['silent lake'] },
  { label: 'inside a dusty attic window', terms: ['dusty attic'] },
  { label: 'along a winding hedge maze', terms: ['hedge maze'] },
];
const SCENE_PALETTES = [
  { label: 'indigo and teal moonlight', terms: ['indigo', 'teal'] },
  { label: 'deep plum and silver', terms: ['deep plum', 'silver'] },
  { label: 'moss green and candle gold', terms: ['moss green'] },
  { label: 'midnight blue and crimson', terms: ['midnight blue', 'crimson'] },
  { label: 'dusty rose and charcoal', terms: ['dusty rose'] },
  { label: 'cobalt blue and pale mint', terms: ['cobalt', 'pale mint'] },
  { label: 'smoky gray and muted copper', terms: ['smoky gray'] },
  { label: 'violet and icy blue', terms: ['violet', 'icy blue'] },
  { label: 'forest green and warm cream', terms: ['forest green'] },
  { label: 'navy and muted lavender', terms: ['muted lavender'] },
];
const SCENE_COMPOSITIONS = [
  { label: 'wide establishing view', terms: ['wide establishing'] },
  { label: 'close-up character portrait', terms: ['close-up'] },
  { label: 'symmetrical doorway composition', terms: ['symmetrical doorway'] },
  { label: 'winding path into the distance', terms: ['winding path'] },
  { label: 'overhead storybook view', terms: ['overhead'] },
  { label: 'low-angle silhouette', terms: ['low-angle'] },
  { label: 'quiet side-profile scene', terms: ['side-profile'] },
  { label: 'layered foreground and background depth', terms: ['layered foreground'] },
  { label: 'storybook vignette with a decorative border', terms: ['decorative border'] },
  { label: 'dramatic window-framed composition', terms: ['window-framed'] },
];
const SAFE_HALLOWEEN_ACTIONS = [
  'smiling beneath a starry sky',
  'dancing among glowing autumn leaves',
  'peeking around a crooked wooden fence',
  'reading a tiny mysterious map',
  'watching paper lanterns drift upward',
  'curiously opening an antique door',
  'following a trail of silver footprints',
  'balancing a small glowing orb',
  'hiding behind velvet curtains',
  'listening to distant music',
  'admiring constellations through the clouds',
  'crossing a bridge in the mist',
  'guarding a secret garden',
  'floating beside a weathered signpost',
  'discovering a forgotten key',
];

async function ensureFolders() {
  await Promise.all([
    fsp.mkdir(MEDIA_DIR, { recursive: true }),
    fsp.mkdir(DATA_DIR, { recursive: true }),
    fsp.rm(AI_TEMP_DIR, { recursive: true, force: true }).then(() => fsp.mkdir(AI_TEMP_DIR, { recursive: true })),
  ]);
  try {
    mediaIndex = JSON.parse(await fsp.readFile(INDEX_FILE, 'utf8'));
    if (!Array.isArray(mediaIndex)) mediaIndex = [];
  } catch {
    mediaIndex = [];
    await writeIndex();
  }
  await migrateAiFiles();
}

async function migrateAiFiles() {
  let changed = false;
  for (const item of mediaIndex.filter((entry) => entry.source === 'ai')) {
    const oldPath = filePathFor(item.id);
    const jpgPath = path.join(MEDIA_DIR, `${item.id}.jpg`);
    if (fs.existsSync(oldPath) && !fs.existsSync(jpgPath)) await fsp.rename(oldPath, jpgPath);
    if (!String(item.name || '').toLowerCase().endsWith('.jpg')) {
      item.name = `${item.name || `AI-${item.id}`}.jpg`;
      changed = true;
    }
  }
  if (changed) await writeIndex();
}

function writeIndex() {
  indexWrite = indexWrite.then(async () => {
    const temp = `${INDEX_FILE}.tmp`;
    await fsp.writeFile(temp, JSON.stringify(mediaIndex, null, 2));
    await fsp.rename(temp, INDEX_FILE);
  });
  return indexWrite;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
  return true;
}

function readRequestBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error('Request body is too large.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function fastSdConfigStatus() {
  return {
    model: AI_MODEL,
    repo: fs.existsSync(FASTSD_DIR),
    script: fs.existsSync(FASTSD_APP),
    environment: fs.existsSync(FASTSD_ENV_PYTHON),
    api: FASTSD_API_URL,
  };
}

async function fastSdPing() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(`${FASTSD_API_URL}/api/info`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureFastSdApi() {
  if (await fastSdPing()) return true;
  const configured = fastSdConfigStatus();
  if (!configured.script || !configured.environment) return false;
  if (!fastSdProcess) {
    const fastSdPath = path.join(FASTSD_DIR, 'env', 'Lib', 'site-packages', 'openvino', 'libs');
    fastSdProcess = spawn(FASTSD_ENV_PYTHON, [FASTSD_APP, '--api', '--port', String(FASTSD_PORT)], {
      cwd: FASTSD_DIR,
      windowsHide: true,
      stdio: 'ignore',
      env: { ...process.env, PATH: `${fastSdPath}${path.delimiter}${process.env.PATH || ''}` },
    });
    fastSdProcess.on('exit', () => { fastSdProcess = null; });
  }
  for (let attempt = 0; attempt < 45; attempt += 1) {
    if (await fastSdPing()) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function aiRuntimeStatus() {
  const configured = fastSdConfigStatus();
  const ready = await fastSdPing();
  const prompt = await promptRuntimeStatus();
  return { ...configured, ready, setupRequired: !configured.repo || !configured.environment, prompt };
}

async function ollamaTags() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(`${OLLAMA_API_URL}/api/tags`, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function ollamaModelNames(tags) {
  return Array.isArray(tags?.models) ? tags.models.map((model) => String(model.name || '')) : [];
}

async function ensureOllamaApi() {
  if (await ollamaTags()) return true;
  if (!ollamaProcess) {
    try {
      ollamaProcess = spawn(OLLAMA_EXECUTABLE, ['serve'], {
        windowsHide: true,
        stdio: 'ignore',
        env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434' },
      });
      ollamaProcess.on('error', () => { ollamaProcess = null; });
      ollamaProcess.on('exit', () => { ollamaProcess = null; });
    } catch {
      ollamaProcess = null;
    }
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await ollamaTags()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function promptRuntimeStatus() {
  const tags = await ollamaTags();
  const names = ollamaModelNames(tags);
  const installed = process.platform !== 'win32' || fs.existsSync(OLLAMA_EXECUTABLE) || OLLAMA_EXECUTABLE === 'ollama';
  return {
    model: OLLAMA_MODEL,
    api: OLLAMA_API_URL,
    installed,
    running: Boolean(tags),
    ready: names.some((name) => name === OLLAMA_MODEL || name.startsWith(`${OLLAMA_MODEL}:`)),
  };
}

function cleanGeneratedPrompt(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    return String(parsed.prompt || '').trim().slice(0, 420);
  } catch {
    return text.replace(/^['"`]+|['"`]+$/g, '').replace(/^prompt\s*:\s*/i, '').trim().slice(0, 420);
  }
}

function pickUnusedOption(options, history) {
  const previous = (Array.isArray(history) ? history : []).join(' ').toLowerCase();
  const unused = options.filter((option) => !option.terms.some((term) => previous.includes(term)));
  const choices = unused.length ? unused : options;
  return choices[crypto.randomInt(choices.length)];
}

function pickSceneRecipe(history) {
  return {
    subject: pickUnusedOption(HALLOWEEN_SUBJECTS, history),
    setting: pickUnusedOption(SCENE_SETTINGS, history),
    palette: pickUnusedOption(SCENE_PALETTES, history),
    composition: pickUnusedOption(SCENE_COMPOSITIONS, history),
  };
}

async function generateNextPrompt(history, gothic = false, signal) {
  if (!(await ensureOllamaApi())) throw new Error('Ollama is not running. Install/start Ollama, then run setup-llm.ps1.');
  const tags = await ollamaTags();
  const names = ollamaModelNames(tags);
  if (!names.some((name) => name === OLLAMA_MODEL || name.startsWith(`${OLLAMA_MODEL}:`))) {
    throw new Error(`The local prompt model is missing. Run setup-llm.ps1 to download ${OLLAMA_MODEL}.`);
  }
  const previous = Array.isArray(history) ? history.map((item) => String(item).slice(0, 220)).slice(-12) : [];
  const recipe = pickSceneRecipe(previous);
  const mood = gothic
    ? 'gothic dark-fairytale illustration, elegant eerie mood, dramatic shadows, old-world details, restrained colors'
    : 'playful hand-drawn storybook cartoon, whimsical Halloween mood, expressive shapes, varied jewel-tone colors';
  const request = {
    model: OLLAMA_MODEL,
    system: 'You write one concise action phrase for a Halloween image. Return JSON only: {"prompt":"..."}. Return 6 to 18 simple words, one sentence, with no style instructions, no camera directions, no words like projector or slideshow, and no text/logos/gore. Do not change the provided subject, setting, palette, or composition. Avoid repeating previous ideas.',
    prompt: `Create a fresh action for this exact scene recipe. Subject: ${recipe.subject.label}. Setting: ${recipe.setting.label}. Palette: ${recipe.palette.label}. Composition: ${recipe.composition.label}. Mood: ${mood}. Do not name another subject. Previous recipes to avoid repeating:\n${previous.length ? previous.map((item, index) => `${index + 1}. ${item}`).join('\n') : '(none yet)'}`,
    stream: false,
    format: 'json',
    options: { temperature: 0.95, top_p: 0.9, num_predict: 120 },
  };
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${OLLAMA_API_URL}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || `Ollama returned HTTP ${response.status}.`);
    let idea = cleanGeneratedPrompt(data.response);
    if (!idea) throw new Error('The local prompt model returned no prompt.');
    const lowerIdea = idea.toLowerCase();
    const anySubjectMentioned = HALLOWEEN_SUBJECTS.some((candidate) => candidate.terms.some((term) => lowerIdea.includes(term)));
    if (anySubjectMentioned || /projector|slideshow|camera|story|script|gore|text|logo/i.test(idea)) {
      idea = SAFE_HALLOWEEN_ACTIONS[crypto.randomInt(SAFE_HALLOWEEN_ACTIONS.length)];
    }
    return `${recipe.subject.label} ${idea}, ${recipe.setting.label}, ${recipe.palette.label}, ${recipe.composition.label}, ${mood}, clean composition, no text, no logos, no gore`.slice(0, 420);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

function generatedRecord(id, name, prompt, size) {
  return {
    id, name, type: 'image/jpeg', size, kind: 'photo', source: 'ai', prompt, uploadedAt: new Date().toISOString(),
  };
}

async function generateScenes(prompt, count, width, height, persist = true, signal) {
  if (!(await ensureFastSdApi())) throw new Error('FastSD CPU is not installed or could not start. Run setup-fast-sd.ps1, then try again.');
  const body = {
    lcm_model_id: 'stabilityai/sd-turbo',
    openvino_lcm_model_id: 'rupeshs/sd-turbo-openvino',
    use_openvino: process.env.FASTSD_OPENVINO === '1',
    prompt, negative_prompt: '', init_image: null,
    image_height: height, image_width: width, inference_steps: 1,
    guidance_scale: 1, number_of_images: count, seed: -1, use_seed: false,
    use_safety_checker: false, diffusion_task: 'text_to_image',
    use_lcm_lora: false, use_tiny_auto_encoder: process.env.FASTSD_TAESD === '1',
  };
  const response = await fetch(`${FASTSD_API_URL}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || `FastSD returned HTTP ${response.status}.`);
  if (!Array.isArray(data.images) || !data.images.length) throw new Error('FastSD finished without returning an image.');
  const prefix = `ai-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const records = [];
  for (const [index, encoded] of data.images.entries()) {
    const id = `${prefix}-${String(index + 1).padStart(2, '0')}`;
    const buffer = Buffer.from(encoded, 'base64');
    const targetPath = persist ? aiFilePath(id) : aiFilePath(id, true);
    await fsp.writeFile(targetPath, buffer);
    records.push(generatedRecord(id, `AI-${id}.jpg`, prompt, buffer.length));
  }
  if (persist) {
    mediaIndex.push(...records);
    await writeIndex();
  } else {
    for (const record of records) transientMedia.set(record.id, record);
    while (transientMedia.size > 12) {
      const oldestId = transientMedia.keys().next().value;
      transientMedia.delete(oldestId);
      await fsp.rm(aiFilePath(oldestId, true), { force: true });
    }
  }
  return records.map((record) => ({ ...record, url: `/media/${record.id}` }));
}

function safeId(value) {
  return /^[a-zA-Z0-9_-]{8,100}$/.test(value) ? value : null;
}

function safeFilename(value) {
  const cleaned = String(value || 'untitled').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return (cleaned || 'untitled').slice(0, 240);
}

function mediaKind(type, name) {
  const lower = `${type} ${name}`.toLowerCase();
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'image/gif' || lower.endsWith('.gif')) return 'gif';
  if (type.startsWith('image/')) return 'photo';
  return 'other';
}

function filePathFor(id) {
  return path.join(MEDIA_DIR, id);
}

function aiFilePath(id, temporary = false) {
  return path.join(temporary ? AI_TEMP_DIR : MEDIA_DIR, `${id}.jpg`);
}

function publicFilePath(urlPath) {
  const relative = decodeURIComponent(urlPath.replace(/^\//, ''));
  const resolved = path.resolve(PUBLIC_DIR, relative);
  return resolved.startsWith(path.resolve(PUBLIC_DIR) + path.sep) ? resolved : null;
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/media') {
    return json(res, 200, mediaIndex.map(({ id, name, type, size, kind, source, prompt, uploadedAt }) => ({
      id, name, type, size, kind, source, prompt, uploadedAt, url: `/media/${id}`,
    })));
  }

  if (req.method === 'GET' && url.pathname === '/api/ai/status') {
    return json(res, 200, await aiRuntimeStatus());
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/generate-next') {
    let body;
    try { body = JSON.parse(await readRequestBody(req)); } catch { return json(res, 400, { error: 'Invalid JSON request.' }); }
    const persist = true;
    const requestController = new AbortController();
    req.once('aborted', () => requestController.abort());
    try {
      const prompt = await generateNextPrompt(body.history, body.gothic === true, requestController.signal);
      const generated = await generateScenes(prompt, 1, 512, 512, persist, requestController.signal);
      return json(res, 201, { prompt, item: generated[0] });
    } catch (error) {
      if (requestController.signal.aborted || error.name === 'AbortError') return;
      console.error(error);
      return json(res, 503, { error: error.message || 'AI slideshow generation failed.' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/generate') {
    let body;
    try { body = JSON.parse(await readRequestBody(req)); } catch { return json(res, 400, { error: 'Invalid JSON request.' }); }
    const prompt = String(body.prompt || '').trim().slice(0, 1000);
    const count = Math.max(1, Math.min(8, Number(body.count) || 1));
    const width = Math.max(256, Math.min(768, Number(body.width) || 512));
    const height = Math.max(256, Math.min(768, Number(body.height) || 512));
    const persist = true;
    if (!prompt) return json(res, 400, { error: 'Enter a prompt first.' });
    const status = await aiRuntimeStatus();
    if (status.setupRequired && !status.ready) return json(res, 503, { error: 'FastSD CPU is not installed. Run setup-fast-sd.ps1, then try again.', status });
    try {
      const generated = await generateScenes(prompt, count, width, height, persist);
      return json(res, 201, { items: generated });
    } catch (error) {
      console.error(error);
      return json(res, 500, { error: error.message || 'Image generation failed.' });
    }
  }

  const match = url.pathname.match(/^\/api\/media\/([^/]+)$/);
  if (!match) return false;
  const id = safeId(match[1]);
  if (!id) return json(res, 400, { error: 'Invalid media id.' });

  if (req.method === 'DELETE') {
    const existing = mediaIndex.find((item) => item.id === id) || transientMedia.get(id);
    if (!existing) return json(res, 404, { error: 'Media not found.' });
    const isTransient = transientMedia.has(id);
    await fsp.rm(isTransient ? aiFilePath(id, true) : (existing.source === 'ai' ? aiFilePath(id) : filePathFor(id)), { force: true });
    if (isTransient) transientMedia.delete(id);
    else {
      mediaIndex = mediaIndex.filter((item) => item.id !== id);
      await writeIndex();
    }
    return json(res, 200, { ok: true });
  }

  if (req.method === 'PUT') {
    const nameHeader = req.headers['x-media-name'];
    let name = 'untitled';
    try { name = decodeURIComponent(String(nameHeader || 'untitled')); } catch { name = String(nameHeader || 'untitled'); }
    name = safeFilename(name);
    const type = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0];
    const target = filePathFor(id);
    const temp = `${target}.uploading`;
    await new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(temp);
      req.pipe(stream);
      req.on('error', reject);
      stream.on('error', reject);
      stream.on('finish', resolve);
    });
    const stat = await fsp.stat(temp);
    await fsp.rename(temp, target);
    mediaIndex = mediaIndex.filter((item) => item.id !== id);
    const record = {
      id, name, type, size: stat.size, kind: mediaKind(type, name), uploadedAt: new Date().toISOString(),
    };
    mediaIndex.push(record);
    await writeIndex();
    return json(res, 201, { ...record, url: `/media/${id}` });
  }
  return false;
}

async function serveMedia(req, res, url) {
  const match = url.pathname.match(/^\/media\/([^/]+)$/);
  if (!match || req.method !== 'GET') return false;
  const id = safeId(match[1]);
  const item = mediaIndex.find((entry) => entry.id === id) || transientMedia.get(id);
  if (!id || !item) {
    res.writeHead(404); res.end('Media not found.'); return true;
  }
  try {
    const filename = transientMedia.has(id) ? aiFilePath(id, true) : (item.source === 'ai' ? aiFilePath(id) : filePathFor(id));
    const stat = await fsp.stat(filename);
    res.writeHead(200, {
      'Content-Type': item.type || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(item.name)}`,
    });
    fs.createReadStream(filename).pipe(res);
  } catch {
    res.writeHead(404); res.end('Media file not found.');
  }
  return true;
}

async function servePublic(req, res, url) {
  let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filename = publicFilePath(pathname);
  if (!filename) { res.writeHead(403); res.end('Forbidden.'); return true; }
  try {
    const stat = await fsp.stat(filename);
    if (!stat.isFile()) throw new Error('Not a file');
    const noCache = ['/index.html', '/app.js', '/styles.css'].includes(pathname);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': noCache ? 'no-store' : 'public, max-age=3600',
    });
    fs.createReadStream(filename).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found.');
  }
  return true;
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (handled) return;
      return json(res, 404, { error: 'API route not found.' });
    }
    if (await serveMedia(req, res, url)) return;
    await servePublic(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, 500, { error: 'Server error.' });
    else res.end();
  }
}

async function start() {
  await ensureFolders();
  const server = http.createServer(requestHandler);
  server.listen(PORT, HOST, () => {
    const lan = Object.values(os.networkInterfaces()).flat().find((entry) => entry && entry.family === 'IPv4' && !entry.internal);
    console.log(`Haunt Generator running at http://localhost:${PORT}`);
    if (lan) console.log(`LAN access: http://${lan.address}:${PORT}`);
    console.log(`Media folder: ${MEDIA_DIR}`);
  });
}

start().catch((error) => { console.error(error); process.exit(1); });
