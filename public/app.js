const state = {
  media: [],
  filter: 'all',
  query: '',
  selected: new Set(),
  playerItems: [],
  playerIndex: 0,
  slideshow: false,
  aiSlideshow: false,
  aiInFlight: false,
  aiPromptHistory: [],
  aiFallbackItems: [],
  gothicScenes: localStorage.getItem('haunt-generator.gothicScenes') === 'true',
  slideshowTimer: null,
  aiRequestController: null,
  slideshowInterval: Number(localStorage.getItem('haunt-generator.slideshowInterval') || 5),
  activeMediaElement: null,
};

const $ = (selector) => document.querySelector(selector);
const mediaGrid = $('#mediaGrid');
const emptyState = $('#emptyState');
const fileInput = $('#fileInput');
const dropzone = $('#dropzone');
const uploadStatus = $('#uploadStatus');
const playerOverlay = $('#playerOverlay');
const stage = $('#stage');

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function kindLabel(kind, source) {
  if (source === 'ai') return 'AI SCENE';
  return ({ photo: 'PHOTO', video: 'VIDEO', gif: 'GIF', audio: 'AUDIO', other: 'FILE' }[kind] || 'FILE');
}

function visibleMedia() {
  return state.media.filter((item) => {
    const filterMatch = state.filter === 'all' || item.kind === state.filter;
    const queryMatch = !state.query || item.name.toLowerCase().includes(state.query.toLowerCase());
    return filterMatch && queryMatch;
  });
}

function updateCounts() {
  const count = (kind) => state.media.filter((item) => item.kind === kind).length;
  $('#allCount').textContent = state.media.length;
  $('#videoCount').textContent = count('video');
  $('#photoCount').textContent = count('photo');
  $('#gifCount').textContent = count('gif');
  const filterName = state.filter === 'all' ? 'All media' : `${state.filter[0].toUpperCase()}${state.filter.slice(1)}${state.filter === 'gif' ? 's' : 's'}`;
  $('#sectionTitle').firstChild.textContent = `${filterName} `;
  $('#sectionCount').textContent = visibleMedia().length;
  $('#selectionText').textContent = `${state.selected.size} selected`;
}

function renderCard(item) {
  const selected = state.selected.has(item.id);
  const mediaPreview = item.kind === 'video'
    ? `<video src="${item.url}" muted preload="metadata"></video>`
    : item.kind === 'photo' || item.kind === 'gif'
      ? `<img src="${item.url}" alt="" loading="lazy">`
      : `<div class="thumb-placeholder">${item.kind === 'audio' ? '♫' : '✦'}</div>`;
  return `<article class="media-card ${selected ? 'selected' : ''}" data-id="${item.id}">
    <div class="thumb" data-action="play">
      <span class="type-badge">${kindLabel(item.kind, item.source)}</span>
      <button class="select-check" data-action="select" aria-label="Select ${escapeHtml(item.name)}">${selected ? '✓' : ''}</button>
      ${mediaPreview}
      <span class="duration-badge" data-duration="${item.id}"></span>
      <div class="card-menu"><button class="delete-card" data-action="delete">DELETE</button></div>
    </div>
    <div class="card-info">
      <div class="card-text"><div class="card-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div><div class="card-size">${formatBytes(item.size)}</div></div>
      <button class="play-card" data-action="play" aria-label="Play ${escapeHtml(item.name)}">▶</button>
    </div>
  </article>`;
}

function renderGrid() {
  const items = visibleMedia();
  updateCounts();
  mediaGrid.innerHTML = items.map(renderCard).join('');
  emptyState.hidden = items.length > 0;
  mediaGrid.hidden = items.length === 0;
  mediaGrid.querySelectorAll('video').forEach((video) => {
    video.addEventListener('loadedmetadata', () => {
      const seconds = video.duration;
      const target = video.closest('.media-card').querySelector('[data-duration]');
      if (Number.isFinite(seconds)) target.textContent = formatDuration(seconds);
    });
  });
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

async function loadMedia() {
  try {
    const response = await fetch('/api/media', { cache: 'no-store' });
    if (!response.ok) throw new Error('Library unavailable');
    state.media = await response.json();
    state.media.forEach((item) => { if (!item.url) item.url = `/media/${item.id}`; });
    renderGrid();
    $('#connectionText').textContent = `${state.media.length} ${state.media.length === 1 ? 'SCENE' : 'SCENES'} READY`;
    return state.media;
  } catch (error) {
    $('#connectionText').textContent = 'SERVER OFFLINE';
    uploadStatus.textContent = 'Could not connect to the media server. Refresh when it is running.';
  }
}

function idForFile(file) {
  const safe = file.name.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30) || 'scene';
  return `${Date.now()}-${crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 18) : Math.random().toString(36).slice(2)}-${safe}`;
}

async function uploadFiles(files) {
  const accepted = Array.from(files).filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/'));
  if (!accepted.length) return;
  dropzone.classList.remove('dragover');
  uploadStatus.textContent = `Uploading ${accepted.length} ${accepted.length === 1 ? 'scene' : 'scenes'}…`;
  let uploaded = 0;
  for (const file of accepted) {
    const id = idForFile(file);
    try {
      const response = await fetch(`/api/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Media-Name': encodeURIComponent(file.name) },
        body: file,
      });
      if (!response.ok) throw new Error('Upload failed');
      uploaded += 1;
      uploadStatus.textContent = `Uploaded ${uploaded} of ${accepted.length}…`;
    } catch {
      uploadStatus.textContent = `Upload stopped on ${file.name}. Check the server connection.`;
      break;
    }
  }
  await loadMedia();
  uploadStatus.textContent = uploaded ? `${uploaded} ${uploaded === 1 ? 'scene' : 'scenes'} added to the library.` : '';
  setTimeout(() => { uploadStatus.textContent = ''; }, 5000);
}

async function loadAiStatus() {
  try {
    const response = await fetch('/api/ai/status', { cache: 'no-store' });
    const status = await response.json();
    const label = $('#aiStatus');
    if (status.ready && status.prompt?.ready) {
      label.textContent = 'FASTSD + PROMPT AI READY';
      label.className = 'ai-status ready';
    } else if (status.ready) {
      label.textContent = `FASTSD READY • RUN SETUP-LLM.PS1`;
      label.className = 'ai-status warning';
    } else if (status.setupRequired) {
      label.textContent = 'RUN SETUP-FAST-SD.PS1';
      label.className = 'ai-status warning';
    } else {
      label.textContent = 'FASTSD WILL START ON GENERATE';
      label.className = 'ai-status warning';
    }
  } catch {
    $('#aiStatus').textContent = 'AI STATUS UNAVAILABLE';
    $('#aiStatus').className = 'ai-status warning';
  }
}

function aiStatusText(text) {
  $('#aiProgress').textContent = text;
}

async function requestNextAiScene() {
  if (!state.aiSlideshow || state.aiInFlight) return;
  state.aiInFlight = true;
  state.aiRequestController = new AbortController();
  aiStatusText('Local prompt model is writing the next unique Halloween scene…');
  try {
    const response = await fetch('/api/ai/generate-next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: state.aiPromptHistory.slice(-12), gothic: state.gothicScenes }),
      signal: state.aiRequestController.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'AI slideshow generation failed.');
    if (!state.aiSlideshow) return;
    state.aiPromptHistory.push(data.prompt || '');
    await loadMedia();
    state.playerItems = data.item ? [data.item] : state.playerItems;
    state.playerIndex = 0;
    aiStatusText('Fresh scene ready — generating the next one in the background.');
    showPlayerItem();
  } catch (error) {
    if (error.name === 'AbortError' || !state.aiSlideshow) return;
    aiStatusText(`AI paused: ${error.message} Falling back to uploaded scenes.`);
    if (state.aiFallbackItems.length) {
      state.playerItems = state.aiFallbackItems;
      state.playerIndex = 0;
      showPlayerItem();
    } else {
      stage.innerHTML = '<div class="stage-error">AI scene generation failed. Add uploaded photos for fallback playback.</div>';
      scheduleAiSlideshow();
    }
  } finally {
    state.aiInFlight = false;
    state.aiRequestController = null;
  }
}

function startAiSlideshow(fallbackItems) {
  state.aiSlideshow = true;
  state.slideshow = true;
  state.aiPromptHistory = [];
  state.aiFallbackItems = fallbackItems.slice();
  state.playerItems = fallbackItems.slice();
  state.playerIndex = 0;
  playerOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  $('#stopAiButton').hidden = false;
  showPlayerItem();
  requestFullscreen();
  requestNextAiScene();
}

async function generateAiScenes() {
  const prompt = $('#aiPrompt').value.trim();
  const count = Number($('#aiCount').value) || 1;
  if (!prompt) {
    $('#aiProgress').textContent = 'Enter a prompt first.';
    return;
  }
  const button = $('#generateButton');
  button.disabled = true;
  $('#aiProgress').textContent = `Generating ${count} scene${count === 1 ? '' : 's'} with FastSD CPU… first run may download the model.`;
  try {
    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, count, width: 512, height: 512 }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Generation failed.');
    await loadMedia();
    const items = data.items || [];
    $('#aiProgress').textContent = `${items.length} scene${items.length === 1 ? '' : 's'} generated and saved to the library. Starting the ${state.slideshowInterval}s loop.`;
    openPlayer(items, 0, true);
  } catch (error) {
    $('#aiProgress').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function mediaById(id) { return state.media.find((item) => item.id === id); }

function openPlayer(items, index = 0, slideshow = false, aiSlideshow = false) {
  if (!items.length && !aiSlideshow) {
    uploadStatus.textContent = slideshow ? 'Add or select some photos for a slideshow first.' : 'Add some media first.';
    return;
  }
  state.playerItems = items;
  state.playerIndex = Math.max(0, Math.min(index, items.length - 1));
  state.slideshow = slideshow;
  state.aiSlideshow = aiSlideshow;
  $('#stopAiButton').hidden = !aiSlideshow;
  playerOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  showPlayerItem();
  requestFullscreen();
}

function scheduleSlideshow() {
  clearInterval(state.slideshowTimer);
  state.slideshowTimer = null;
  if (state.slideshow) state.slideshowTimer = setInterval(() => nextItem(), state.slideshowInterval * 1000);
}

function scheduleAiSlideshow() {
  clearInterval(state.slideshowTimer);
  state.slideshowTimer = null;
  if (!state.aiSlideshow) return;
  state.slideshowTimer = setTimeout(() => {
    if (!state.aiSlideshow) return;
    const current = state.playerItems[state.playerIndex];
    if (current && current.source !== 'ai' && state.playerItems.length > 1) nextItem();
    if (!state.aiInFlight) requestNextAiScene();
    else scheduleAiSlideshow();
  }, state.slideshowInterval * 1000);
}

function setSlideshowInterval(value) {
  state.slideshowInterval = Math.max(1, Math.min(30, Number(value) || 5));
  localStorage.setItem('haunt-generator.slideshowInterval', String(state.slideshowInterval));
  $('#intervalInput').value = state.slideshowInterval;
  $('#intervalValue').textContent = `${state.slideshowInterval}s`;
  if (!playerOverlay.hidden && state.slideshow && state.activeMediaElement?.tagName === 'IMG') scheduleSlideshow();
}

function closePlayer() {
  clearInterval(state.slideshowTimer);
  state.slideshowTimer = null;
  state.aiRequestController?.abort();
  state.aiRequestController = null;
  state.aiSlideshow = false;
  state.aiFallbackItems = [];
  $('#stopAiButton').hidden = true;
  if (state.activeMediaElement) {
    state.activeMediaElement.pause?.();
    state.activeMediaElement.src = '';
  }
  state.activeMediaElement = null;
  playerOverlay.hidden = true;
  document.body.style.overflow = '';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function stopAiGeneration() {
  if (!state.aiSlideshow) return;
  clearTimeout(state.slideshowTimer);
  state.slideshowTimer = null;
  state.aiRequestController?.abort();
  state.aiRequestController = null;
  state.aiSlideshow = false;
  const fallbackItems = state.aiFallbackItems.slice();
  state.aiFallbackItems = [];
  if (!fallbackItems.length) {
    closePlayer();
    return;
  }
  state.slideshow = true;
  state.playerItems = fallbackItems;
  state.playerIndex = 0;
  $('#stopAiButton').hidden = true;
  aiStatusText('AI generation stopped — cycling through uploaded scenes.');
  showPlayerItem();
}

function showPlayerItem() {
  clearInterval(state.slideshowTimer);
  const item = state.playerItems[state.playerIndex];
  if (!item) {
    stage.innerHTML = '<div class="stage-error">Generating the first Halloween scene…</div>';
    if (state.aiSlideshow) scheduleAiSlideshow();
    return;
  }
  stage.innerHTML = '';
  state.activeMediaElement = null;
  $('#playerTitle').textContent = item.name;
  $('#playerCounter').textContent = `${state.playerIndex + 1} / ${state.playerItems.length}`;
  $('#slideshowStatus').textContent = state.slideshow ? `LOOPING • ${state.slideshowInterval}s` : '';
  let element;
  if (item.kind === 'photo' || item.kind === 'gif') {
    element = document.createElement('img');
    element.alt = item.name;
    element.src = item.url;
    if (state.aiSlideshow) scheduleAiSlideshow();
    else scheduleSlideshow();
  } else if (item.kind === 'video') {
    element = document.createElement('video');
    element.src = item.url;
    element.autoplay = true;
    element.controls = true;
    element.playsInline = true;
    element.addEventListener('ended', () => nextItem());
  } else if (item.kind === 'audio') {
    element = document.createElement('audio');
    element.src = item.url;
    element.autoplay = true;
    element.controls = true;
    element.addEventListener('ended', () => nextItem());
  } else {
    stage.innerHTML = '<div class="stage-error">This file type cannot be previewed.</div>';
    return;
  }
  element.addEventListener('error', () => { stage.innerHTML = '<div class="stage-error">This scene could not be loaded.</div>'; });
  stage.appendChild(element);
  state.activeMediaElement = element;
  if (element.play) element.play().catch(() => {});
}

function nextItem() {
  if (!state.playerItems.length) return;
  state.playerIndex = (state.playerIndex + 1) % state.playerItems.length;
  showPlayerItem();
}

function previousItem() {
  if (!state.playerItems.length) return;
  state.playerIndex = (state.playerIndex - 1 + state.playerItems.length) % state.playerItems.length;
  showPlayerItem();
}

function togglePlay() {
  const element = state.activeMediaElement;
  if (!element || !element.play) return;
  if (element.paused) element.play().catch(() => {});
  else element.pause();
}

async function requestFullscreen() {
  try {
    if (!document.fullscreenElement) await playerOverlay.requestFullscreen();
    else await document.exitFullscreen();
  } catch { /* browser may block fullscreen outside a direct click */ }
}

mediaGrid.addEventListener('click', async (event) => {
  const actionTarget = event.target.closest('[data-action]');
  const card = event.target.closest('.media-card');
  if (!card || !actionTarget) return;
  const item = mediaById(card.dataset.id);
  if (!item) return;
  const action = actionTarget.dataset.action;
  if (action === 'play') openPlayer([item]);
  if (action === 'select') {
    event.stopPropagation();
    if (state.selected.has(item.id)) state.selected.delete(item.id); else state.selected.add(item.id);
    renderGrid();
  }
  if (action === 'delete') {
    event.stopPropagation();
    if (!confirm(`Delete “${item.name}” from the library?`)) return;
    await fetch(`/api/media/${item.id}`, { method: 'DELETE' });
    state.selected.delete(item.id);
    await loadMedia();
  }
});

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  state.filter = button.dataset.filter;
  renderGrid();
}));

fileInput.addEventListener('change', () => uploadFiles(fileInput.files));
$('#browseButton').addEventListener('click', () => fileInput.click());
$('#emptyBrowseButton').addEventListener('click', () => fileInput.click());
['dragenter', 'dragover'].forEach((eventName) => dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach((eventName) => dropzone.addEventListener(eventName, (event) => { event.preventDefault(); if (eventName === 'drop') uploadFiles(event.dataTransfer.files); else dropzone.classList.remove('dragover'); }));
$('#searchInput').addEventListener('input', (event) => { state.query = event.target.value.trim(); renderGrid(); });
$('#clearSelectionButton').addEventListener('click', () => { state.selected.clear(); renderGrid(); });
$('#intervalInput').addEventListener('input', (event) => setSlideshowInterval(event.target.value));
$('#gothicScenes').checked = state.gothicScenes;
$('#gothicScenes').addEventListener('change', (event) => {
  state.gothicScenes = event.target.checked;
  localStorage.setItem('haunt-generator.gothicScenes', String(state.gothicScenes));
});
$('#generateButton').addEventListener('click', generateAiScenes);
$('#slideshowButton').addEventListener('click', () => {
  const selectedPhotos = state.media.filter((item) => state.selected.has(item.id) && (item.kind === 'photo' || item.kind === 'gif'));
  const photos = selectedPhotos.length ? selectedPhotos : state.media.filter((item) => item.kind === 'photo' || item.kind === 'gif');
  if ($('#aiSlideshowToggle').checked) startAiSlideshow(photos);
  else openPlayer(photos, 0, true);
});
$('#previousButton').addEventListener('click', previousItem);
$('#nextButton').addEventListener('click', nextItem);
$('#pauseButton').addEventListener('click', togglePlay);
$('#closePlayer').addEventListener('click', closePlayer);
$('#stopAiButton').addEventListener('click', stopAiGeneration);
$('#playerFullscreenButton').addEventListener('click', requestFullscreen);
$('#helpButton').addEventListener('click', () => $('#helpDialog').showModal());
$('#closeHelp').addEventListener('click', () => $('#helpDialog').close());

document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement.tagName !== 'INPUT') { event.preventDefault(); $('#searchInput').focus(); return; }
  if (playerOverlay.hidden) return;
  if (event.key === 'ArrowRight') { event.preventDefault(); nextItem(); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); previousItem(); }
  if (event.key === ' ') { event.preventDefault(); togglePlay(); }
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); requestFullscreen(); }
  if (event.key === 'Escape' && !document.fullscreenElement) closePlayer();
});

setSlideshowInterval(state.slideshowInterval);
loadMedia();
loadAiStatus();
