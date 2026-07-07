// State, storage, rendering, and event wiring for Dinger.

const PROGRESS_KEY_PREFIX = 'dinger_progress_v1_';
const STATS_KEY = 'dinger_stats_v1';
const HELP_SEEN_KEY = 'dinger_help_seen_v1';

function loadProgress(dateStr) {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY_PREFIX + dateStr);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveProgress(dateStr, state) {
  localStorage.setItem(PROGRESS_KEY_PREFIX + dateStr, JSON.stringify(state));
}

function defaultStats() {
  return { played: 0, wins: 0, currentStreak: 0, maxStreak: 0, history: {} };
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? JSON.parse(raw) : defaultStats();
  } catch {
    return defaultStats();
  }
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function recalcStreaksFromHistory(stats) {
  const dates = Object.keys(stats.history).sort();
  let currentStreak = 0;
  let maxStreak = 0;
  let prevDate = null;
  dates.forEach((date) => {
    const entry = stats.history[date];
    if (entry.solved) {
      currentStreak = prevDate && daysBetween(prevDate, date) === 1 ? currentStreak + 1 : 1;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
    prevDate = date;
  });
  stats.currentStreak = currentStreak;
  stats.maxStreak = maxStreak;
}

function recordResult(dateStr, solved, score, cluesUsed, misses) {
  const stats = loadStats();
  if (stats.history[dateStr]) return stats; // already recorded, don't double-count reloads
  stats.history[dateStr] = { solved, score, cluesUsed, misses };
  stats.played += 1;
  if (solved) stats.wins += 1;
  recalcStreaksFromHistory(stats);
  saveStats(stats);
  return stats;
}

function defaultProgress() {
  return { clueIndex: 1, misses: 0, finished: false, solved: false, score: CONFIG.basePoints };
}

const SURVIVAL_BEST_KEY = 'dinger_survival_best_v1';
const TIMED_BEST_KEY = 'dinger_timed_best_v1';

function loadSurvivalBest() {
  try {
    const val = Number(localStorage.getItem(SURVIVAL_BEST_KEY));
    return Number.isFinite(val) && val > 0 ? val : 0;
  } catch {
    return 0;
  }
}

function saveSurvivalBest(best) {
  try {
    localStorage.setItem(SURVIVAL_BEST_KEY, String(best));
  } catch {
    // Best score stays in memory only if storage is unavailable.
  }
}

function loadTimedBest() {
  try {
    const val = Number(localStorage.getItem(TIMED_BEST_KEY));
    return Number.isFinite(val) && val > 0 ? val : 0;
  } catch {
    return 0;
  }
}

function saveTimedBest(best) {
  try {
    localStorage.setItem(TIMED_BEST_KEY, String(best));
  } catch {
    // Best score stays in memory only if storage is unavailable.
  }
}

const PHOTO_BLITZ_BEST_KEY = 'dinger_photo_blitz_best_v1';

function loadPhotoBlitzBest() {
  try {
    const val = Number(localStorage.getItem(PHOTO_BLITZ_BEST_KEY));
    return Number.isFinite(val) && val > 0 ? val : 0;
  } catch {
    return 0;
  }
}

function savePhotoBlitzBest(best) {
  try {
    localStorage.setItem(PHOTO_BLITZ_BEST_KEY, String(best));
  } catch {
    // Best score stays in memory only if storage is unavailable.
  }
}

function defaultSurvivalProgress() {
  return { queue: [], currentPlayerId: null, clueIndex: 1, solved: 0, timeLeft: CONFIG.survivalStartTime, running: false, finished: false };
}

function defaultTimedProgress() {
  return { queue: [], currentPlayerId: null, clueIndex: 1, solved: 0, timeLeft: CONFIG.timedStartTime, running: false, finished: false };
}

// currentEntry is {id, url} for the photo on screen right now (or null while
// the very first photo of a run is still loading). skipped collects
// {id, name, url} for the end-of-run "players you skipped" recap.
function defaultPhotoBlitzProgress() {
  return { queue: [], currentEntry: null, skipped: [], solved: 0, timeLeft: CONFIG.photoBlitzStartTime, running: false, finished: false };
}

const dom = {};
let today = null;
let currentDateStr = null;
let progress = null;
let countdownTimer = null;
let gameMode = null;
let survivalProgress = defaultSurvivalProgress();
let timedProgress = defaultTimedProgress();
let photoBlitzProgress = defaultPhotoBlitzProgress();
let survivalTimer = null;
let timedTimer = null;
let photoBlitzTimer = null;
let survivalBest = 0;
let timedBest = 0;
let photoBlitzBest = 0;
let survivalRevealTimer = null;

const SURVIVAL_REVEAL_MS = 1400; // how long the solved player's photo stays up, paused off the clock

function cacheDom() {
  [
    'puzzle-number', 'score-value', 'score-label', 'clue-list', 'guess-form', 'guess-input',
    'feedback', 'pass-btn', 'giveup-btn', 'game-screen', 'result-screen',
    'result-title', 'result-player', 'result-score', 'result-grid', 'result-clues',
    'result-summary', 'share-btn', 'next-puzzle-timer', 'stats-modal', 'stats-grid', 'help-modal',
    'stats-btn', 'help-btn', 'close-stats', 'close-stats-2', 'close-help', 'close-help-2',
    'player-photo-wrap', 'player-photo', 'player-photo-placeholder',
    'survival-start-btn', 'survival-again-btn', 'intro-title', 'intro-copy', 'action-row', 'game-intro', 'mode-menu-btn',
    'survival-reveal-overlay', 'survival-reveal-photo', 'survival-reveal-placeholder', 'survival-reveal-name', 'survival-reveal-bonus',
    'home-btn', 'home-screen', 'home-daily-btn', 'home-survival-btn', 'home-timed-btn', 'home-daily-meta', 'home-survival-meta', 'home-timed-meta',
    'home-photoblitz-btn', 'home-photoblitz-meta',
    'photo-blitz-photo-wrap', 'photo-blitz-photo', 'photo-blitz-placeholder',
    'result-skipped', 'mystery-player',
  ].forEach(id => { dom[id] = document.getElementById(id); });
}

const PHOTO_CACHE_KEY = 'dinger_photo_cache_v1';

function loadPhotoCache() {
  try {
    const raw = localStorage.getItem(PHOTO_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistPhotoCache() {
  try {
    localStorage.setItem(PHOTO_CACHE_KEY, JSON.stringify(photoCache));
  } catch {
    // Storage full or unavailable — cache just stays in-memory for this session.
  }
}

const photoCache = loadPhotoCache();

async function fetchWikipediaSummary(title) {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/g, '_'))}`);
  if (!res.ok) return null;
  return res.json();
}

function looksLikeBaseballBio(summary) {
  if (!summary || summary.type === 'disambiguation') return false;
  const text = `${summary.description || ''} ${summary.extract || ''}`.toLowerCase();
  return text.includes('baseball');
}

// Common names (e.g. "Frank Thomas") collide with unrelated Wikipedia
// articles, so if the direct lookup isn't a baseball bio, retry against a
// search scoped to "<name> baseball" before giving up.
async function findBaseballWikipediaTitle(name) {
  const query = encodeURIComponent(`${name} baseball`);
  const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=${query}`);
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data && data.query && data.query.search && data.query.search[0];
  return hit ? hit.title : null;
}

async function fetchPlayerPhoto(name) {
  if (Object.prototype.hasOwnProperty.call(photoCache, name)) return photoCache[name];
  try {
    let summary = await fetchWikipediaSummary(name);
    if (!looksLikeBaseballBio(summary)) {
      const betterTitle = await findBaseballWikipediaTitle(name);
      if (betterTitle) {
        const betterSummary = await fetchWikipediaSummary(betterTitle);
        if (looksLikeBaseballBio(betterSummary)) summary = betterSummary;
      }
    }
    const url = (summary && ((summary.thumbnail && summary.thumbnail.source) || (summary.originalimage && summary.originalimage.source))) || null;
    photoCache[name] = url;
    persistPhotoCache();
    return url;
  } catch {
    photoCache[name] = null;
    persistPhotoCache();
    return null;
  }
}

const PHOTO_COLOR_CACHE_KEY = 'dinger_photo_color_cache_v1';
const PHOTO_COLOR_SATURATION_THRESHOLD = 14; // avg max-min RGB channel delta; grayscale/sepia scans land well under this

function loadPhotoColorCache() {
  try {
    const raw = localStorage.getItem(PHOTO_COLOR_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistPhotoColorCache() {
  try {
    localStorage.setItem(PHOTO_COLOR_CACHE_KEY, JSON.stringify(photoColorCache));
  } catch {
    // Storage full or unavailable — cache just stays in-memory for this session.
  }
}

const photoColorCache = loadPhotoColorCache();

function loadImageForColorCheck(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
}

// Downsamples the photo onto a tiny canvas and measures average color
// saturation (max channel - min channel per pixel). True black-and-white or
// sepia-toned scans land near zero; real color photos of skin/grass/jerseys
// land well above the threshold. If the canvas read fails (e.g. a photo host
// without permissive CORS headers), the check is inconclusive — we let the
// player through rather than silently starving Photo Blitz's pool.
async function isColorPhotoUrl(url) {
  if (Object.prototype.hasOwnProperty.call(photoColorCache, url)) return photoColorCache[url];
  let verdict = true;
  try {
    const img = await loadImageForColorCheck(url);
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    let totalDelta = 0;
    let pixelCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      totalDelta += Math.max(r, g, b) - Math.min(r, g, b);
      pixelCount += 1;
    }
    verdict = (totalDelta / pixelCount) > PHOTO_COLOR_SATURATION_THRESHOLD;
  } catch {
    verdict = true;
  }
  photoColorCache[url] = verdict;
  persistPhotoColorCache();
  return verdict;
}

function initialsOf(name) {
  return name
    .split(/\s+/)
    .filter(word => /^[A-Z]/.test(word))
    .map(word => word[0])
    .join('')
    .slice(0, 3);
}

async function loadPlayerPhoto(player, solved) {
  const wrap = dom['player-photo-wrap'];
  const img = dom['player-photo'];
  const placeholder = dom['player-photo-placeholder'];

  wrap.classList.toggle('photo-win', solved);
  wrap.classList.toggle('photo-loss', !solved);
  img.classList.remove('loaded');
  img.removeAttribute('src');
  placeholder.textContent = '⚾';
  placeholder.classList.remove('hidden', 'initials');

  const url = await fetchPlayerPhoto(player.name);
  if (!url) {
    placeholder.textContent = initialsOf(player.name);
    placeholder.classList.add('initials');
    return;
  }

  img.onload = () => {
    img.classList.add('loaded');
    placeholder.classList.add('hidden');
  };
  img.onerror = () => {
    placeholder.textContent = initialsOf(player.name);
    placeholder.classList.add('initials');
  };
  img.alt = player.name;
  img.src = url;
}

function maxCluesFor(player) {
  return Math.min(CONFIG.maxClues, getCluesForPlayer(player).length);
}

function renderPuzzleMeta() {
  dom['puzzle-number'].textContent = `Puzzle #${today.puzzleNumber}`;
}

function renderClueList() {
  const clues = getCluesForPlayer(today.player);
  dom['clue-list'].innerHTML = '';
  for (let i = 0; i < progress.clueIndex; i += 1) {
    const li = document.createElement('li');
    li.className = 'clue-item';
    if (i === progress.clueIndex - 1 && !progress.finished) li.classList.add('clue-new');
    li.innerHTML = `<span class="clue-num">${i + 1}</span><span class="clue-word">${clues[i]}</span>`;
    dom['clue-list'].appendChild(li);
  }
}

function updateScoreDisplay() {
  const score = progress.finished ? progress.score : computeScore(progress.clueIndex, progress.misses);
  const el = dom['score-value'];
  if (el.textContent !== String(score)) {
    el.textContent = score;
    el.classList.remove('pulse');
    // eslint-disable-next-line no-void
    void el.offsetWidth;
    el.classList.add('pulse');
  }
}

function updatePassButton() {
  const max = maxCluesFor(today.player);
  if (progress.clueIndex >= max || progress.finished) {
    dom['pass-btn'].disabled = true;
    dom['pass-btn'].textContent = progress.finished ? 'No more clues' : 'Last clue revealed';
  } else {
    dom['pass-btn'].disabled = false;
    dom['pass-btn'].textContent = `Reveal next clue (−10)`;
  }
}

function showFeedback(message, type) {
  dom.feedback.textContent = message;
  dom.feedback.className = type ? `feedback-${type}` : '';
  if (type === 'wrong') {
    dom['guess-input'].classList.remove('shake');
    // eslint-disable-next-line no-void
    void dom['guess-input'].offsetWidth; // restart animation
    dom['guess-input'].classList.add('shake');
  }
}

function setGameControlsEnabled(enabled) {
  dom['guess-input'].disabled = !enabled;
  dom['guess-form'].querySelector('button').disabled = !enabled;
  dom['giveup-btn'].disabled = !enabled;
}

function renderGameScreen() {
  dom['game-screen'].classList.remove('hidden');
  dom['result-screen'].classList.add('hidden');
  renderClueList();
  updateScoreDisplay();
  updatePassButton();
}

function survivalCurrentPlayer() {
  return PLAYERS.find(p => p.id === survivalProgress.currentPlayerId) || null;
}

function timedCurrentPlayer() {
  return PLAYERS.find(p => p.id === timedProgress.currentPlayerId) || null;
}

function loadNextSurvivalPlayer() {
  if (!survivalProgress.queue.length) {
    survivalProgress.queue = buildSurvivalQueue();
  }
  const [nextId, ...rest] = survivalProgress.queue;
  survivalProgress.queue = rest;
  survivalProgress.currentPlayerId = nextId;
  survivalProgress.clueIndex = 1;
}

function loadNextTimedPlayer() {
  if (!timedProgress.queue.length) {
    timedProgress.queue = buildSurvivalQueue();
  }
  const [nextId, ...rest] = timedProgress.queue;
  timedProgress.queue = rest;
  timedProgress.currentPlayerId = nextId;
  timedProgress.clueIndex = 1;
  timedProgress.timeLeft = CONFIG.timedStartTime;
}

function photoBlitzCurrentPlayer() {
  return photoBlitzProgress.currentEntry ? PLAYERS.find(p => p.id === photoBlitzProgress.currentEntry.id) || null : null;
}

// Tries a single candidate id: fetches its photo and verifies it's a color
// photo (unless the player is on the black-and-white exception list).
// Returns {id, url} on success or null if this candidate should be skipped.
async function tryPreparePhotoBlitzEntry(id) {
  const player = PLAYERS.find(p => p.id === id);
  if (!player) return null;
  const url = await fetchPlayerPhoto(player.name);
  if (!url) return null;
  if (CONFIG.photoBlitzBwAllowlist.includes(id)) return { id, url };
  const isColor = await isColorPhotoUrl(url);
  return isColor ? { id, url } : null;
}

// Pulls candidates from the shuffled queue (refilling from the full roster
// when it runs dry) until one qualifies. Disqualified candidates (no photo,
// or black-and-white and not on the exception list) are silently dropped —
// the player never sees them.
async function findNextPhotoBlitzEntry() {
  for (;;) {
    if (!photoBlitzProgress.queue.length) {
      photoBlitzProgress.queue = buildSurvivalQueue();
    }
    const id = photoBlitzProgress.queue.shift();
    if (!id) return null;
    const entry = await tryPreparePhotoBlitzEntry(id);
    if (entry) return entry;
  }
}

function stopSurvivalTimer() {
  if (survivalTimer) {
    clearInterval(survivalTimer);
    survivalTimer = null;
  }
}

function stopTimedTimer() {
  if (timedTimer) {
    clearInterval(timedTimer);
    timedTimer = null;
  }
}

function startSurvivalTimer() {
  stopSurvivalTimer();
  survivalTimer = setInterval(() => {
    survivalProgress.timeLeft = clampSurvivalTime(survivalProgress.timeLeft - 1);
    updateSurvivalTimeDisplay();
    if (survivalProgress.timeLeft <= 0) endSurvivalRun();
  }, 1000);
}

function startTimedTimer() {
  stopTimedTimer();
  timedTimer = setInterval(() => {
    timedProgress.timeLeft = clampSurvivalTime(timedProgress.timeLeft - 1);
    updateTimedTimeDisplay();
    if (timedProgress.timeLeft <= 0) endTimedRun();
  }, 1000);
}

function stopPhotoBlitzTimer() {
  if (photoBlitzTimer) {
    clearInterval(photoBlitzTimer);
    photoBlitzTimer = null;
  }
}

function startPhotoBlitzTimer() {
  stopPhotoBlitzTimer();
  photoBlitzTimer = setInterval(() => {
    photoBlitzProgress.timeLeft = clampSurvivalTime(photoBlitzProgress.timeLeft - 1);
    updatePhotoBlitzTimeDisplay();
    if (photoBlitzProgress.timeLeft <= 0) endPhotoBlitzRun();
  }, 1000);
}

function clearSurvivalReveal() {
  if (survivalRevealTimer) {
    clearTimeout(survivalRevealTimer);
    survivalRevealTimer = null;
  }
}

function hideSurvivalReveal() {
  dom['survival-reveal-overlay'].classList.add('hidden');
  dom['survival-reveal-overlay'].classList.remove('survival-reveal-skip');
  dom['survival-reveal-photo'].classList.remove('loaded');
  dom['survival-reveal-photo'].removeAttribute('src');
  dom['survival-reveal-placeholder'].textContent = '⚾';
  dom['survival-reveal-placeholder'].classList.remove('hidden', 'initials');
  dom['survival-reveal-name'].textContent = '';
  dom['survival-reveal-bonus'].textContent = '';
}

// Pops up the just-finished player's photo + name in an overlay above the
// game. Fetches asynchronously; if a later reveal has already replaced this
// one (name text moved on) by the time the fetch resolves, it's a no-op.
async function showSurvivalReveal(player, detailText, tone = 'correct') {
  dom['survival-reveal-overlay'].classList.remove('hidden');
  dom['survival-reveal-overlay'].classList.toggle('survival-reveal-skip', tone === 'skip');
  dom['survival-reveal-name'].textContent = player.name;
  dom['survival-reveal-bonus'].textContent = detailText;
  dom['survival-reveal-photo'].classList.remove('loaded');
  dom['survival-reveal-photo'].removeAttribute('src');
  dom['survival-reveal-placeholder'].textContent = '⚾';
  dom['survival-reveal-placeholder'].classList.remove('hidden', 'initials');

  const url = await fetchPlayerPhoto(player.name);
  if (dom['survival-reveal-name'].textContent !== player.name) return;

  const img = dom['survival-reveal-photo'];
  const placeholder = dom['survival-reveal-placeholder'];
  if (url) {
    img.onload = () => {
      img.classList.add('loaded');
      placeholder.classList.add('hidden');
    };
    img.onerror = () => {
      placeholder.textContent = initialsOf(player.name);
      placeholder.classList.add('initials');
    };
    img.alt = player.name;
    img.src = url;
  } else {
    placeholder.textContent = initialsOf(player.name);
    placeholder.classList.add('initials');
  }
}

function startSurvivalRun() {
  clearSurvivalReveal();
  hideSurvivalReveal();
  survivalProgress = defaultSurvivalProgress();
  survivalProgress.queue = buildSurvivalQueue();
  survivalProgress.running = true;
  loadNextSurvivalPlayer();
  showFeedback('', '');
  dom['guess-input'].value = '';
  renderSurvivalGameScreen();
  startSurvivalTimer();
  dom['guess-input'].focus();
}

function startTimedRun() {
  clearSurvivalReveal();
  hideSurvivalReveal();
  timedProgress = defaultTimedProgress();
  timedProgress.queue = buildSurvivalQueue();
  timedProgress.running = true;
  loadNextTimedPlayer();
  showFeedback('', '');
  dom['guess-input'].value = '';
  renderTimedGameScreen();
  startTimedTimer();
  dom['guess-input'].focus();
}

function endSurvivalRun(showFinalReveal = true) {
  clearSurvivalReveal();
  stopSurvivalTimer();
  const finalPlayer = survivalCurrentPlayer();
  survivalProgress.running = false;
  survivalProgress.finished = true;
  if (survivalProgress.solved > survivalBest) {
    survivalBest = survivalProgress.solved;
    saveSurvivalBest(survivalBest);
  }
  if (showFinalReveal && finalPlayer) {
    setGameControlsEnabled(false);
    dom['pass-btn'].disabled = true;
    dom['clue-list'].innerHTML = '';
    showSurvivalReveal(finalPlayer, "Time's up", 'skip');
    survivalRevealTimer = setTimeout(() => {
      survivalRevealTimer = null;
      hideSurvivalReveal();
      if (gameMode === 'survival') renderSurvivalResult();
    }, SURVIVAL_REVEAL_MS);
    return;
  }
  hideSurvivalReveal();
  renderSurvivalResult();
}

function endTimedRun(showFinalReveal = true, revealText = "Time's up") {
  clearSurvivalReveal();
  stopTimedTimer();
  const finalPlayer = timedCurrentPlayer();
  timedProgress.running = false;
  timedProgress.finished = true;
  if (timedProgress.solved > timedBest) {
    timedBest = timedProgress.solved;
    saveTimedBest(timedBest);
  }
  if (showFinalReveal && finalPlayer) {
    setGameControlsEnabled(false);
    dom['pass-btn'].disabled = true;
    dom['clue-list'].innerHTML = '';
    showSurvivalReveal(finalPlayer, revealText, 'skip');
    survivalRevealTimer = setTimeout(() => {
      survivalRevealTimer = null;
      hideSurvivalReveal();
      if (gameMode === 'timed') renderTimedResult();
    }, SURVIVAL_REVEAL_MS);
    return;
  }
  hideSurvivalReveal();
  renderTimedResult();
}

async function startPhotoBlitzRun() {
  clearSurvivalReveal();
  hideSurvivalReveal();
  photoBlitzProgress = defaultPhotoBlitzProgress();
  photoBlitzProgress.queue = buildSurvivalQueue();
  photoBlitzProgress.running = true;
  showFeedback('', '');
  dom['guess-input'].value = '';
  renderPhotoBlitzLoading();

  const first = await findNextPhotoBlitzEntry();
  if (gameMode !== 'photoblitz' || !photoBlitzProgress.running) return; // navigated away mid-load
  photoBlitzProgress.currentEntry = first;
  renderPhotoBlitzGameScreen();
  startPhotoBlitzTimer();
  dom['guess-input'].focus();
}

// Unlike Survival/Timed, the photo is already fully visible the whole time
// in this mode, so there's nothing left to "reveal" when the clock simply
// runs out — go straight to results.
function endPhotoBlitzRun() {
  clearSurvivalReveal();
  hideSurvivalReveal();
  stopPhotoBlitzTimer();
  photoBlitzProgress.running = false;
  photoBlitzProgress.finished = true;
  if (photoBlitzProgress.solved > photoBlitzBest) {
    photoBlitzBest = photoBlitzProgress.solved;
    savePhotoBlitzBest(photoBlitzBest);
  }
  renderPhotoBlitzResult();
}

function renderSurvivalLanding() {
  dom['game-screen'].classList.remove('hidden');
  dom['result-screen'].classList.add('hidden');
  dom['score-label'].textContent = 'Time';
  dom['score-value'].textContent = String(CONFIG.survivalStartTime);
  dom['puzzle-number'].textContent = `Survival Best: ${survivalBest} solved`;
  dom['clue-list'].innerHTML = '';
  dom['survival-start-btn'].classList.remove('hidden');
  dom['survival-start-btn'].textContent = 'Start Survival Run';
  dom['guess-form'].classList.add('hidden');
  dom['action-row'].classList.add('hidden');
  showFeedback('', '');
}

function renderTimedLanding() {
  dom['game-screen'].classList.remove('hidden');
  dom['result-screen'].classList.add('hidden');
  dom['score-label'].textContent = 'Time';
  dom['score-value'].textContent = String(CONFIG.timedStartTime);
  dom['puzzle-number'].textContent = `Timed Best: ${timedBest} correct`;
  dom['clue-list'].innerHTML = '';
  dom['survival-start-btn'].classList.remove('hidden');
  dom['survival-start-btn'].textContent = 'Start Timed Run';
  dom['guess-form'].classList.add('hidden');
  dom['action-row'].classList.add('hidden');
  showFeedback('', '');
}

function renderPhotoBlitzLanding() {
  dom['game-screen'].classList.remove('hidden');
  dom['result-screen'].classList.add('hidden');
  dom['mystery-player'].classList.add('hidden');
  dom['clue-list'].classList.add('hidden');
  dom['photo-blitz-photo-wrap'].classList.remove('hidden');
  resetPhotoBlitzPhotoDisplay();
  dom['score-label'].textContent = 'Time';
  dom['score-value'].textContent = String(CONFIG.photoBlitzStartTime);
  dom['puzzle-number'].textContent = `Photo Blitz Best: ${photoBlitzBest} named`;
  dom['survival-start-btn'].classList.remove('hidden');
  dom['survival-start-btn'].textContent = 'Start Photo Blitz';
  dom['guess-form'].classList.add('hidden');
  dom['action-row'].classList.add('hidden');
  showFeedback('', '');
}

function renderPhotoBlitzLoading() {
  dom['game-screen'].classList.remove('hidden');
  dom['result-screen'].classList.add('hidden');
  dom['mystery-player'].classList.add('hidden');
  dom['clue-list'].classList.add('hidden');
  dom['photo-blitz-photo-wrap'].classList.remove('hidden');
  resetPhotoBlitzPhotoDisplay();
  dom['survival-start-btn'].classList.add('hidden');
  dom['guess-form'].classList.add('hidden');
  dom['action-row'].classList.add('hidden');
  dom['score-label'].textContent = 'Time';
  dom['score-value'].textContent = String(CONFIG.photoBlitzStartTime);
  dom['puzzle-number'].textContent = 'Loading first photo…';
  showFeedback('', '');
}

function resetPhotoBlitzPhotoDisplay() {
  dom['photo-blitz-photo'].classList.remove('loaded');
  dom['photo-blitz-photo'].removeAttribute('src');
  dom['photo-blitz-placeholder'].textContent = '⚾';
  dom['photo-blitz-placeholder'].classList.remove('hidden', 'initials');
}

function renderPhotoBlitzPhoto() {
  resetPhotoBlitzPhotoDisplay();
  const player = photoBlitzCurrentPlayer();
  if (!player || !photoBlitzProgress.currentEntry) return;
  const img = dom['photo-blitz-photo'];
  const placeholder = dom['photo-blitz-placeholder'];
  img.onload = () => {
    img.classList.add('loaded');
    placeholder.classList.add('hidden');
  };
  img.onerror = () => {
    placeholder.textContent = initialsOf(player.name);
    placeholder.classList.add('initials');
  };
  // alt is deliberately left blank — naming the player in alt text would
  // hand screen-reader users the answer this mode asks them to guess.
  img.alt = '';
  img.src = photoBlitzProgress.currentEntry.url;
}

function renderPhotoBlitzGameScreen() {
  dom['game-screen'].classList.remove('hidden');
  dom['result-screen'].classList.add('hidden');
  dom['mystery-player'].classList.add('hidden');
  dom['clue-list'].classList.add('hidden');
  dom['photo-blitz-photo-wrap'].classList.remove('hidden');
  dom['survival-start-btn'].classList.add('hidden');
  dom['guess-form'].classList.remove('hidden');
  dom['action-row'].classList.remove('hidden');
  dom['pass-btn'].classList.add('hidden');
  dom['score-label'].textContent = 'Time';
  setGameControlsEnabled(true);
  dom['puzzle-number'].textContent = `Named ${photoBlitzProgress.solved} · Best ${photoBlitzBest}`;
  renderPhotoBlitzPhoto();
  updatePhotoBlitzTimeDisplay();
  dom['giveup-btn'].disabled = false;
  dom['giveup-btn'].textContent = 'Skip';
}

function renderSurvivalGameScreen() {
  dom['game-screen'].classList.remove('hidden');
  dom['result-screen'].classList.add('hidden');
  dom['survival-start-btn'].classList.add('hidden');
  dom['guess-form'].classList.remove('hidden');
  dom['action-row'].classList.remove('hidden');
  dom['score-label'].textContent = 'Time';
  setGameControlsEnabled(true);
  dom['puzzle-number'].textContent = `Solved ${survivalProgress.solved} · Best ${survivalBest}`;
  renderSurvivalClueList();
  updateSurvivalTimeDisplay();
  updateSurvivalPassButton();
  dom['giveup-btn'].disabled = false;
  dom['giveup-btn'].textContent = `Skip (−${CONFIG.survivalSkipPenalty}s)`;
}

function renderTimedGameScreen() {
  dom['game-screen'].classList.remove('hidden');
  dom['result-screen'].classList.add('hidden');
  dom['survival-start-btn'].classList.add('hidden');
  dom['guess-form'].classList.remove('hidden');
  dom['action-row'].classList.remove('hidden');
  dom['score-label'].textContent = 'Time';
  setGameControlsEnabled(true);
  dom['puzzle-number'].textContent = `Correct ${timedProgress.solved} · Best ${timedBest}`;
  renderTimedClueList();
  updateTimedTimeDisplay();
  updateTimedPassButton();
  dom['giveup-btn'].disabled = false;
  dom['giveup-btn'].textContent = 'End run';
}

function renderSurvivalClueList() {
  const player = survivalCurrentPlayer();
  if (!player) return;
  const clues = getSurvivalCluesForPlayer(player);
  dom['clue-list'].innerHTML = '';
  for (let i = 0; i < survivalProgress.clueIndex; i += 1) {
    const li = document.createElement('li');
    li.className = 'clue-item';
    if (i === survivalProgress.clueIndex - 1) li.classList.add('clue-new');
    li.innerHTML = `<span class="clue-num">${i + 1}</span><span class="clue-word">${clues[i]}</span>`;
    dom['clue-list'].appendChild(li);
  }
}

function renderTimedClueList() {
  const player = timedCurrentPlayer();
  if (!player) return;
  const clues = getTimedCluesForPlayer(player);
  dom['clue-list'].innerHTML = '';
  for (let i = 0; i < timedProgress.clueIndex; i += 1) {
    const li = document.createElement('li');
    li.className = 'clue-item';
    if (i === timedProgress.clueIndex - 1) li.classList.add('clue-new');
    li.innerHTML = `<span class="clue-num">${i + 1}</span><span class="clue-word">${clues[i]}</span>`;
    dom['clue-list'].appendChild(li);
  }
}

function updateSurvivalTimeDisplay() {
  const el = dom['score-value'];
  const val = String(survivalProgress.timeLeft);
  if (el.textContent !== val) {
    el.textContent = val;
    el.classList.remove('pulse');
    // eslint-disable-next-line no-void
    void el.offsetWidth;
    el.classList.add('pulse');
  }
}

function updateTimedTimeDisplay() {
  const el = dom['score-value'];
  const val = String(timedProgress.timeLeft);
  if (el.textContent !== val) {
    el.textContent = val;
    el.classList.remove('pulse');
    // eslint-disable-next-line no-void
    void el.offsetWidth;
    el.classList.add('pulse');
  }
}

function updatePhotoBlitzTimeDisplay() {
  const el = dom['score-value'];
  const val = String(photoBlitzProgress.timeLeft);
  if (el.textContent !== val) {
    el.textContent = val;
    el.classList.remove('pulse');
    // eslint-disable-next-line no-void
    void el.offsetWidth;
    el.classList.add('pulse');
  }
}

function updateSurvivalPassButton() {
  if (survivalProgress.clueIndex >= CONFIG.survivalMaxClues) {
    dom['pass-btn'].disabled = true;
    dom['pass-btn'].textContent = 'No more clues';
  } else {
    dom['pass-btn'].disabled = false;
    dom['pass-btn'].textContent = 'Reveal next clue';
  }
}

function updateTimedPassButton() {
  if (timedProgress.clueIndex >= CONFIG.timedMaxClues) {
    dom['pass-btn'].disabled = true;
    dom['pass-btn'].textContent = 'No more clues';
  } else {
    dom['pass-btn'].disabled = timedProgress.timeLeft <= CONFIG.timedCluePenalty;
    dom['pass-btn'].textContent = `Reveal next clue (−${CONFIG.timedCluePenalty}s)`;
  }
}

function handleSurvivalGuessSubmit() {
  if (!survivalProgress.running) return;
  const raw = dom['guess-input'].value;
  if (!raw.trim()) return;
  const player = survivalCurrentPlayer();
  if (!player) return;

  if (isCorrectGuess(raw, player, PLAYERS)) {
    const bonus = survivalBonusForClueCount(survivalProgress.clueIndex);
    survivalProgress.timeLeft = clampSurvivalTime(survivalProgress.timeLeft + bonus);
    survivalProgress.solved += 1;
    dom['guess-input'].value = '';
    showFeedback('', '');
    updateSurvivalTimeDisplay();
    dom['puzzle-number'].textContent = `Solved ${survivalProgress.solved} · Best ${survivalBest}`;

    // Pause the clock while the solved player's photo pops up — the reveal
    // itself should never eat into the run's time budget.
    stopSurvivalTimer();
    setGameControlsEnabled(false);
    dom['pass-btn'].disabled = true;
    dom['clue-list'].innerHTML = '';
    showSurvivalReveal(player, `Correct! +${bonus}s`);

    clearSurvivalReveal();
    survivalRevealTimer = setTimeout(() => {
      survivalRevealTimer = null;
      hideSurvivalReveal();
      loadNextSurvivalPlayer();
      if (gameMode === 'survival') {
        showFeedback('', '');
        renderSurvivalGameScreen();
        startSurvivalTimer();
        dom['guess-input'].focus();
      }
    }, SURVIVAL_REVEAL_MS);
    return;
  }

  showFeedback('Not quite — try again, reveal a clue, or skip.', 'wrong');
  dom['guess-input'].select();
}

function handleTimedGuessSubmit() {
  if (!timedProgress.running) return;
  const raw = dom['guess-input'].value;
  if (!raw.trim()) return;
  const player = timedCurrentPlayer();
  if (!player) return;

  if (isCorrectGuess(raw, player, PLAYERS)) {
    timedProgress.solved += 1;
    dom['guess-input'].value = '';
    showFeedback('', '');
    dom['puzzle-number'].textContent = `Correct ${timedProgress.solved} · Best ${timedBest}`;

    stopTimedTimer();
    setGameControlsEnabled(false);
    dom['pass-btn'].disabled = true;
    dom['clue-list'].innerHTML = '';
    showSurvivalReveal(player, `Correct! Next clock: ${CONFIG.timedStartTime}s`);

    clearSurvivalReveal();
    survivalRevealTimer = setTimeout(() => {
      survivalRevealTimer = null;
      hideSurvivalReveal();
      loadNextTimedPlayer();
      if (gameMode === 'timed') {
        showFeedback('', '');
        renderTimedGameScreen();
        startTimedTimer();
        dom['guess-input'].focus();
      }
    }, SURVIVAL_REVEAL_MS);
    return;
  }

  showFeedback('Not quite — try again or reveal another clue.', 'wrong');
  dom['guess-input'].select();
}

function handleSurvivalPass() {
  if (!survivalProgress.running) return;
  if (survivalProgress.clueIndex >= CONFIG.survivalMaxClues) return;
  survivalProgress.clueIndex += 1;
  showFeedback('', '');
  renderSurvivalClueList();
  updateSurvivalPassButton();
}

function handleTimedPass() {
  if (!timedProgress.running) return;
  if (timedProgress.clueIndex >= CONFIG.timedMaxClues) return;
  timedProgress.timeLeft = clampSurvivalTime(timedProgress.timeLeft - CONFIG.timedCluePenalty);
  updateTimedTimeDisplay();
  if (timedProgress.timeLeft <= 0) {
    endTimedRun();
    return;
  }
  timedProgress.clueIndex += 1;
  showFeedback(`−${CONFIG.timedCluePenalty}s`, 'wrong');
  renderTimedClueList();
  updateTimedPassButton();
}

function handleSurvivalSkip() {
  if (!survivalProgress.running) return;
  const skippedPlayer = survivalCurrentPlayer();
  if (!skippedPlayer) return;

  survivalProgress.timeLeft = clampSurvivalTime(survivalProgress.timeLeft - CONFIG.survivalSkipPenalty);
  updateSurvivalTimeDisplay();
  showFeedback(`Skipped −${CONFIG.survivalSkipPenalty}s`, 'wrong');

  // Pause the clock while the skipped player's answer is shown, mirroring
  // the correct-answer reveal so the answer flash does not cost run time.
  stopSurvivalTimer();
  setGameControlsEnabled(false);
  dom['pass-btn'].disabled = true;
  dom['clue-list'].innerHTML = '';
  showSurvivalReveal(skippedPlayer, `Skipped −${CONFIG.survivalSkipPenalty}s`, 'skip');

  clearSurvivalReveal();
  survivalRevealTimer = setTimeout(() => {
    survivalRevealTimer = null;
    hideSurvivalReveal();
    if (gameMode !== 'survival') return;
    if (survivalProgress.timeLeft <= 0) {
      endSurvivalRun(false);
      return;
    }
    loadNextSurvivalPlayer();
    showFeedback('', '');
    renderSurvivalGameScreen();
    startSurvivalTimer();
    dom['guess-input'].focus();
  }, SURVIVAL_REVEAL_MS);
}

function handleTimedEndRun() {
  if (!timedProgress.running) return;
  endTimedRun(true, 'Run ended');
}

// Shared by both a correct guess and a skip: pauses the clock, pops up the
// just-shown player's name for confirmation, and — critically — starts
// fetching/verifying the next photo in parallel with that popup instead of
// after it, so load time hides inside a pause that was happening anyway and
// never eats into the run's clock.
function advancePhotoBlitz(player, detailText, tone) {
  stopPhotoBlitzTimer();
  setGameControlsEnabled(false);
  photoBlitzProgress.currentEntry = null;
  showSurvivalReveal(player, detailText, tone);
  const nextEntryPromise = findNextPhotoBlitzEntry();

  clearSurvivalReveal();
  survivalRevealTimer = setTimeout(() => {
    survivalRevealTimer = null;
    nextEntryPromise.then((next) => {
      if (gameMode !== 'photoblitz' || !photoBlitzProgress.running) return;
      hideSurvivalReveal();
      if (!next) {
        endPhotoBlitzRun();
        return;
      }
      photoBlitzProgress.currentEntry = next;
      showFeedback('', '');
      renderPhotoBlitzGameScreen();
      startPhotoBlitzTimer();
      dom['guess-input'].focus();
    });
  }, SURVIVAL_REVEAL_MS);
}

function handlePhotoBlitzGuessSubmit() {
  if (!photoBlitzProgress.running || !photoBlitzProgress.currentEntry) return;
  const raw = dom['guess-input'].value;
  if (!raw.trim()) return;
  const player = photoBlitzCurrentPlayer();
  if (!player) return;

  if (isCorrectGuess(raw, player, PLAYERS)) {
    photoBlitzProgress.solved += 1;
    dom['guess-input'].value = '';
    showFeedback('', '');
    dom['puzzle-number'].textContent = `Named ${photoBlitzProgress.solved} · Best ${photoBlitzBest}`;
    advancePhotoBlitz(player, 'Correct!', 'correct');
    return;
  }

  showFeedback('Not quite — try again or skip.', 'wrong');
  dom['guess-input'].select();
}

function handlePhotoBlitzSkip() {
  if (!photoBlitzProgress.running || !photoBlitzProgress.currentEntry) return;
  const player = photoBlitzCurrentPlayer();
  if (!player) return;
  photoBlitzProgress.skipped.push({ id: player.id, name: player.name, url: photoBlitzProgress.currentEntry.url });
  advancePhotoBlitz(player, 'Skipped', 'skip');
}

function renderSurvivalResult() {
  dom['game-screen'].classList.add('hidden');
  dom['result-screen'].classList.remove('hidden');
  dom['puzzle-number'].textContent = `Survival Best: ${survivalBest} solved`;

  const isNewBest = survivalProgress.solved > 0 && survivalProgress.solved >= survivalBest;
  dom['result-title'].textContent = "Time's up!";
  dom['result-player'].textContent = `You solved ${survivalProgress.solved} player${survivalProgress.solved === 1 ? '' : 's'} in Survival mode.`;
  dom['result-score'].textContent = `${survivalProgress.solved} solved`;
  dom['result-grid'].textContent = survivalProgress.solved > 0 ? '⚾'.repeat(Math.min(10, survivalProgress.solved)) : '❌';
  dom['result-summary'].innerHTML = `
    <div class="recap-stat"><span>This run</span><strong>${survivalProgress.solved}</strong><em>Players solved</em></div>
    <div class="recap-stat"><span>Best run</span><strong>${survivalBest}</strong><em>${isNewBest ? 'New best!' : 'Personal best'}</em></div>
  `;
  dom['result-clues'].innerHTML = '';
  dom['player-photo-wrap'].classList.remove('photo-win', 'photo-loss');
  dom['player-photo'].classList.remove('loaded');
  dom['player-photo'].removeAttribute('src');
  dom['player-photo-placeholder'].textContent = '⚾';
  dom['player-photo-placeholder'].classList.remove('hidden', 'initials');
  dom['survival-again-btn'].textContent = 'Play Again';
  dom['survival-again-btn'].classList.remove('hidden');
  dom['result-skipped'].classList.add('hidden');
  dom['next-puzzle-timer'].textContent = 'Survival mode has no daily limit.';
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function renderTimedResult() {
  dom['game-screen'].classList.add('hidden');
  dom['result-screen'].classList.remove('hidden');
  dom['puzzle-number'].textContent = `Timed Best: ${timedBest} correct`;

  const isNewBest = timedProgress.solved > 0 && timedProgress.solved >= timedBest;
  dom['result-title'].textContent = "Time's up!";
  dom['result-player'].textContent = `You got ${timedProgress.solved} player${timedProgress.solved === 1 ? '' : 's'} correct in Timed mode.`;
  dom['result-score'].textContent = `${timedProgress.solved} correct`;
  dom['result-grid'].textContent = timedProgress.solved > 0 ? '⚾'.repeat(Math.min(10, timedProgress.solved)) : '❌';
  dom['result-summary'].innerHTML = `
    <div class="recap-stat"><span>This run</span><strong>${timedProgress.solved}</strong><em>Players correct</em></div>
    <div class="recap-stat"><span>Best run</span><strong>${timedBest}</strong><em>${isNewBest ? 'New best!' : 'Personal best'}</em></div>
    <div class="recap-clue"><span>Rules</span><strong>${CONFIG.timedStartTime} seconds per player</strong><em>Each extra clue costs ${CONFIG.timedCluePenalty} seconds</em></div>
  `;
  dom['result-clues'].innerHTML = '';
  dom['player-photo-wrap'].classList.remove('photo-win', 'photo-loss');
  dom['player-photo'].classList.remove('loaded');
  dom['player-photo'].removeAttribute('src');
  dom['player-photo-placeholder'].textContent = '⏲️';
  dom['player-photo-placeholder'].classList.remove('hidden', 'initials');
  dom['survival-again-btn'].textContent = 'Play Again';
  dom['survival-again-btn'].classList.remove('hidden');
  dom['result-skipped'].classList.add('hidden');
  dom['next-puzzle-timer'].textContent = 'Timed mode has no daily limit.';
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function renderPhotoBlitzResult() {
  dom['game-screen'].classList.add('hidden');
  dom['result-screen'].classList.remove('hidden');
  dom['puzzle-number'].textContent = `Photo Blitz Best: ${photoBlitzBest} named`;

  const isNewBest = photoBlitzProgress.solved > 0 && photoBlitzProgress.solved >= photoBlitzBest;
  dom['result-title'].textContent = "Time's up!";
  dom['result-player'].textContent = `You named ${photoBlitzProgress.solved} player${photoBlitzProgress.solved === 1 ? '' : 's'} in Photo Blitz.`;
  dom['result-score'].textContent = `${photoBlitzProgress.solved} named`;
  dom['result-grid'].textContent = photoBlitzProgress.solved > 0 ? '⚾'.repeat(Math.min(10, photoBlitzProgress.solved)) : '❌';
  dom['result-summary'].innerHTML = `
    <div class="recap-stat"><span>This run</span><strong>${photoBlitzProgress.solved}</strong><em>Players named</em></div>
    <div class="recap-stat"><span>Best run</span><strong>${photoBlitzBest}</strong><em>${isNewBest ? 'New best!' : 'Personal best'}</em></div>
  `;
  dom['result-clues'].innerHTML = '';
  dom['player-photo-wrap'].classList.remove('photo-win', 'photo-loss');
  dom['player-photo'].classList.remove('loaded');
  dom['player-photo'].removeAttribute('src');
  dom['player-photo-placeholder'].textContent = '📸';
  dom['player-photo-placeholder'].classList.remove('hidden', 'initials');

  if (photoBlitzProgress.skipped.length) {
    dom['result-skipped'].classList.remove('hidden');
    dom['result-skipped'].innerHTML = `
      <h3>Players You Skipped</h3>
      <ul class="skipped-list">${photoBlitzProgress.skipped.map(s => `
        <li>
          <img class="skipped-photo" src="${s.url}" alt="${s.name}">
          <span>${s.name}</span>
        </li>
      `).join('')}</ul>
    `;
  } else {
    dom['result-skipped'].classList.add('hidden');
    dom['result-skipped'].innerHTML = '';
  }

  dom['survival-again-btn'].textContent = 'Play Again';
  dom['survival-again-btn'].classList.remove('hidden');
  dom['next-puzzle-timer'].textContent = 'Photo Blitz has no daily limit.';
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function renderHome() {
  dom['home-screen'].classList.remove('hidden');
  dom['puzzle-number'].classList.add('hidden');
  dom['game-intro'].classList.add('hidden');
  dom['mode-menu-btn'].classList.add('hidden');
  dom['game-screen'].classList.add('hidden');
  dom['result-screen'].classList.add('hidden');
  dom['home-daily-meta'].textContent = `Puzzle #${today.puzzleNumber}${progress.finished ? ' · Completed' : ''}`;
  dom['home-survival-meta'].textContent = `Best: ${survivalBest} solved`;
  dom['home-timed-meta'].textContent = `Best: ${timedBest} correct`;
  dom['home-photoblitz-meta'].textContent = `Best: ${photoBlitzBest} named`;
}

function setMode(mode) {
  if (mode === gameMode) return;
  gameMode = mode;
  clearSurvivalReveal();
  hideSurvivalReveal(); // in case a reveal was mid-flight when the mode changed
  stopSurvivalTimer(); // always pause survival's clock when leaving its screen; restarted below if entering it running
  stopTimedTimer(); // same idea for timed mode
  stopPhotoBlitzTimer(); // same idea for photo blitz

  if (mode === 'home') {
    renderHome();
    return;
  }

  dom['home-screen'].classList.add('hidden');
  dom['puzzle-number'].classList.remove('hidden');
  dom['game-intro'].classList.remove('hidden');
  dom['mode-menu-btn'].classList.remove('hidden');
  // Photo Blitz hides these and shows its own photo instead; every other
  // mode needs the defaults visible again and the big photo hidden.
  dom['mystery-player'].classList.remove('hidden');
  dom['clue-list'].classList.remove('hidden');
  dom['pass-btn'].classList.remove('hidden');
  dom['photo-blitz-photo-wrap'].classList.add('hidden');

  if (mode === 'survival') {
    dom['intro-title'].textContent = 'Survive the mystery-player gauntlet.';
    dom['intro-copy'].textContent = 'Solve fast to add time — clue 1 is worth +5s, clue 2 is +3s, clue 3 is +1s. Skips cost 3s.';
    if (survivalProgress.running) {
      startSurvivalTimer();
      renderSurvivalGameScreen();
    } else if (survivalProgress.finished) {
      renderSurvivalResult();
    } else {
      renderSurvivalLanding();
    }
  } else if (mode === 'timed') {
    dom['intro-title'].textContent = `Beat the ${CONFIG.timedStartTime}-second clock.`;
    dom['intro-copy'].textContent = `Each player starts with ${CONFIG.timedStartTime} seconds and ${CONFIG.timedMaxClues} clues. Revealing a clue costs ${CONFIG.timedCluePenalty} seconds. Correct answers reset the clock.`;
    if (timedProgress.running) {
      startTimedTimer();
      renderTimedGameScreen();
    } else if (timedProgress.finished) {
      renderTimedResult();
    } else {
      renderTimedLanding();
    }
  } else if (mode === 'photoblitz') {
    dom['intro-title'].textContent = 'Name the player from their photo.';
    dom['intro-copy'].textContent = `You have ${CONFIG.photoBlitzStartTime} seconds and unlimited free skips. No clues — photo only.`;
    if (photoBlitzProgress.running) {
      startPhotoBlitzTimer();
      renderPhotoBlitzGameScreen();
    } else if (photoBlitzProgress.finished) {
      renderPhotoBlitzResult();
    } else {
      renderPhotoBlitzLanding();
    }
  } else {
    dom['intro-title'].textContent = "Guess today's mystery MLB player.";
    dom['intro-copy'].textContent = 'Use the clues to name the player. The opener is intentionally tough, so a 100-point solve should feel rare.';
    dom['score-label'].textContent = 'Score';
    dom['giveup-btn'].textContent = 'Give up';
    dom['survival-start-btn'].classList.add('hidden');
    dom['survival-start-btn'].textContent = 'Start Survival Run';
    dom['guess-form'].classList.remove('hidden');
    dom['action-row'].classList.remove('hidden');
    renderPuzzleMeta();
    if (progress.finished) {
      renderResultScreen();
    } else {
      renderGameScreen();
    }
  }
}

function buildShareText() {
  let squares = '';
  for (let i = 1; i < progress.clueIndex; i += 1) squares += '🟨';
  squares += progress.solved ? '✅' : '❌';
  const clueCount = maxCluesFor(today.player);
  const status = progress.solved ? `${progress.clueIndex}/${clueCount}` : `X/${clueCount}`;
  return `⚾ Dinger #${today.puzzleNumber} — ${squares} ${status} — ${progress.score} pts`;
}

function resetShareButtonSoon() {
  setTimeout(() => { dom['share-btn'].textContent = 'Share Result'; }, 2000);
}

function gameShareUrl() {
  return window.location.href.split('#')[0];
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCenteredText(ctx, text, x, y, maxWidth, fontSize, fontFamily, color) {
  ctx.fillStyle = color;
  ctx.font = `800 ${fontSize}px ${fontFamily}`;
  let size = fontSize;
  while (ctx.measureText(text).width > maxWidth && size > 22) {
    size -= 2;
    ctx.font = `800 ${size}px ${fontFamily}`;
  }
  ctx.fillText(text, x, y);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Unable to create share image'));
    }, 'image/png');
  });
}

async function buildShareImageFile() {
  const size = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const link = gameShareUrl();
  const clueCount = maxCluesFor(today.player);
  const status = progress.solved
    ? `Solved in ${progress.clueIndex}/${clueCount} clues`
    : `Missed after ${progress.clueIndex}/${clueCount} clues`;
  const stats = loadStats();
  const streakText = `Current streak: ${stats.currentStreak}  •  Best: ${stats.maxStreak}`;

  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#041226');
  bg.addColorStop(0.55, '#0b2447');
  bg.addColorStop(1, '#12386a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(191, 13, 62, 0.92)';
  ctx.beginPath();
  ctx.moveTo(0, 790);
  ctx.bezierCurveTo(190, 710, 350, 710, 540, 790);
  ctx.bezierCurveTo(730, 710, 890, 710, 1080, 790);
  ctx.lineTo(1080, 1080);
  ctx.lineTo(0, 1080);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(245, 248, 255, 0.72)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 825);
  ctx.bezierCurveTo(190, 745, 350, 745, 540, 825);
  ctx.bezierCurveTo(730, 745, 890, 745, 1080, 825);
  ctx.stroke();

  ctx.fillStyle = 'rgba(245, 248, 255, 0.08)';
  for (let i = 0; i < 12; i += 1) {
    ctx.fillRect(i * 110 - 40, 0, 4, 1080);
  }

  roundRect(ctx, 90, 110, 900, 760, 36);
  ctx.fillStyle = 'rgba(7, 27, 54, 0.92)';
  ctx.fill();
  ctx.strokeStyle = '#2a5f9e';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawCenteredText(ctx, 'DINGER', 540, 210, 760, 108, 'Arial, sans-serif', '#f5f8ff');
  ctx.fillStyle = '#bf0d3e';
  ctx.font = '800 30px Arial, sans-serif';
  ctx.fillText(`DAILY MLB PLAYER GAME  •  PUZZLE #${today.puzzleNumber}`, 540, 292);

  ctx.fillStyle = '#f5f8ff';
  ctx.font = '900 150px Arial, sans-serif';
  ctx.fillText(`${progress.score}`, 540, 430);
  ctx.fillStyle = '#a9bdd8';
  ctx.font = '800 34px Arial, sans-serif';
  ctx.fillText('POINTS', 540, 520);

  ctx.fillStyle = progress.solved ? '#f5f8ff' : '#e83a59';
  ctx.font = '800 42px Arial, sans-serif';
  ctx.fillText(status, 540, 600);

  ctx.fillStyle = '#a9bdd8';
  ctx.font = '700 28px Arial, sans-serif';
  ctx.fillText(streakText, 540, 638);

  const blockSize = 48;
  const gap = 14;
  const totalWidth = progress.clueIndex * blockSize + (progress.clueIndex - 1) * gap;
  let x = 540 - totalWidth / 2;
  for (let i = 1; i <= progress.clueIndex; i += 1) {
    roundRect(ctx, x, 685, blockSize, blockSize, 8);
    ctx.fillStyle = i === progress.clueIndex
      ? (progress.solved ? '#f5f8ff' : '#e83a59')
      : '#bf0d3e';
    ctx.fill();
    if (i === progress.clueIndex) {
      ctx.fillStyle = progress.solved ? '#041226' : '#f5f8ff';
      ctx.font = '900 28px Arial, sans-serif';
      ctx.fillText(progress.solved ? '✓' : '×', x + blockSize / 2, 710);
    }
    x += blockSize + gap;
  }

  ctx.fillStyle = '#d8e8ff';
  ctx.font = '700 30px Arial, sans-serif';
  ctx.fillText('Play at', 540, 790);
  drawCenteredText(ctx, link, 540, 835, 760, 34, 'Arial, sans-serif', '#f5f8ff');

  const blob = await canvasToBlob(canvas);
  return new File([blob], `dinger-${today.puzzleNumber}.png`, { type: 'image/png' });
}

async function buildSurvivalShareImageFile() {
  const size = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const link = gameShareUrl();
  const isNewBest = survivalProgress.solved > 0 && survivalProgress.solved >= survivalBest;
  const bestText = isNewBest ? 'New personal best!' : `Best run: ${survivalBest} solved`;

  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#041226');
  bg.addColorStop(0.55, '#0b2447');
  bg.addColorStop(1, '#12386a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(191, 13, 62, 0.92)';
  ctx.beginPath();
  ctx.moveTo(0, 790);
  ctx.bezierCurveTo(190, 710, 350, 710, 540, 790);
  ctx.bezierCurveTo(730, 710, 890, 710, 1080, 790);
  ctx.lineTo(1080, 1080);
  ctx.lineTo(0, 1080);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(245, 248, 255, 0.72)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 825);
  ctx.bezierCurveTo(190, 745, 350, 745, 540, 825);
  ctx.bezierCurveTo(730, 745, 890, 745, 1080, 825);
  ctx.stroke();

  ctx.fillStyle = 'rgba(245, 248, 255, 0.08)';
  for (let i = 0; i < 12; i += 1) {
    ctx.fillRect(i * 110 - 40, 0, 4, 1080);
  }

  roundRect(ctx, 90, 110, 900, 760, 36);
  ctx.fillStyle = 'rgba(7, 27, 54, 0.92)';
  ctx.fill();
  ctx.strokeStyle = '#2a5f9e';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawCenteredText(ctx, 'DINGER', 540, 210, 760, 108, 'Arial, sans-serif', '#f5f8ff');
  ctx.fillStyle = '#bf0d3e';
  ctx.font = '800 30px Arial, sans-serif';
  ctx.fillText('SURVIVAL MODE', 540, 292);

  ctx.fillStyle = '#f5f8ff';
  ctx.font = '900 150px Arial, sans-serif';
  ctx.fillText(`${survivalProgress.solved}`, 540, 460);
  ctx.fillStyle = '#a9bdd8';
  ctx.font = '800 34px Arial, sans-serif';
  ctx.fillText('PLAYERS SOLVED', 540, 550);

  ctx.fillStyle = isNewBest ? '#f5f8ff' : '#e83a59';
  ctx.font = '800 40px Arial, sans-serif';
  ctx.fillText(bestText, 540, 636);

  ctx.fillStyle = '#d8e8ff';
  ctx.font = '700 30px Arial, sans-serif';
  ctx.fillText('Play at', 540, 790);
  drawCenteredText(ctx, link, 540, 835, 760, 34, 'Arial, sans-serif', '#f5f8ff');

  const blob = await canvasToBlob(canvas);
  return new File([blob], `dinger-survival-${survivalProgress.solved}.png`, { type: 'image/png' });
}

async function buildTimedShareImageFile() {
  const size = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const link = gameShareUrl();
  const isNewBest = timedProgress.solved > 0 && timedProgress.solved >= timedBest;
  const bestText = isNewBest ? 'New personal best!' : `Best run: ${timedBest} correct`;

  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#041226');
  bg.addColorStop(0.55, '#0b2447');
  bg.addColorStop(1, '#12386a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(191, 13, 62, 0.92)';
  ctx.beginPath();
  ctx.moveTo(0, 790);
  ctx.bezierCurveTo(190, 710, 350, 710, 540, 790);
  ctx.bezierCurveTo(730, 710, 890, 710, 1080, 790);
  ctx.lineTo(1080, 1080);
  ctx.lineTo(0, 1080);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(245, 248, 255, 0.72)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 825);
  ctx.bezierCurveTo(190, 745, 350, 745, 540, 825);
  ctx.bezierCurveTo(730, 745, 890, 745, 1080, 825);
  ctx.stroke();

  ctx.fillStyle = 'rgba(245, 248, 255, 0.08)';
  for (let i = 0; i < 12; i += 1) {
    ctx.fillRect(i * 110 - 40, 0, 4, 1080);
  }

  roundRect(ctx, 90, 110, 900, 760, 36);
  ctx.fillStyle = 'rgba(7, 27, 54, 0.92)';
  ctx.fill();
  ctx.strokeStyle = '#2a5f9e';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawCenteredText(ctx, 'DINGER', 540, 210, 760, 108, 'Arial, sans-serif', '#f5f8ff');
  ctx.fillStyle = '#bf0d3e';
  ctx.font = '800 30px Arial, sans-serif';
  ctx.fillText('TIMED MODE', 540, 292);

  ctx.fillStyle = '#f5f8ff';
  ctx.font = '900 150px Arial, sans-serif';
  ctx.fillText(`${timedProgress.solved}`, 540, 460);
  ctx.fillStyle = '#a9bdd8';
  ctx.font = '800 34px Arial, sans-serif';
  ctx.fillText('PLAYERS CORRECT', 540, 550);

  ctx.fillStyle = isNewBest ? '#f5f8ff' : '#e83a59';
  ctx.font = '800 40px Arial, sans-serif';
  ctx.fillText(bestText, 540, 636);

  ctx.fillStyle = '#d8e8ff';
  ctx.font = '700 30px Arial, sans-serif';
  ctx.fillText('Play at', 540, 790);
  drawCenteredText(ctx, link, 540, 835, 760, 34, 'Arial, sans-serif', '#f5f8ff');

  const blob = await canvasToBlob(canvas);
  return new File([blob], `dinger-timed-${timedProgress.solved}.png`, { type: 'image/png' });
}

async function buildPhotoBlitzShareImageFile() {
  const size = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const link = gameShareUrl();
  const isNewBest = photoBlitzProgress.solved > 0 && photoBlitzProgress.solved >= photoBlitzBest;
  const bestText = isNewBest ? 'New personal best!' : `Best run: ${photoBlitzBest} named`;

  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#041226');
  bg.addColorStop(0.55, '#0b2447');
  bg.addColorStop(1, '#12386a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(191, 13, 62, 0.92)';
  ctx.beginPath();
  ctx.moveTo(0, 790);
  ctx.bezierCurveTo(190, 710, 350, 710, 540, 790);
  ctx.bezierCurveTo(730, 710, 890, 710, 1080, 790);
  ctx.lineTo(1080, 1080);
  ctx.lineTo(0, 1080);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(245, 248, 255, 0.72)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 825);
  ctx.bezierCurveTo(190, 745, 350, 745, 540, 825);
  ctx.bezierCurveTo(730, 745, 890, 745, 1080, 825);
  ctx.stroke();

  ctx.fillStyle = 'rgba(245, 248, 255, 0.08)';
  for (let i = 0; i < 12; i += 1) {
    ctx.fillRect(i * 110 - 40, 0, 4, 1080);
  }

  roundRect(ctx, 90, 110, 900, 760, 36);
  ctx.fillStyle = 'rgba(7, 27, 54, 0.92)';
  ctx.fill();
  ctx.strokeStyle = '#2a5f9e';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawCenteredText(ctx, 'DINGER', 540, 210, 760, 108, 'Arial, sans-serif', '#f5f8ff');
  ctx.fillStyle = '#bf0d3e';
  ctx.font = '800 30px Arial, sans-serif';
  ctx.fillText('PHOTO BLITZ', 540, 292);

  ctx.fillStyle = '#f5f8ff';
  ctx.font = '900 150px Arial, sans-serif';
  ctx.fillText(`${photoBlitzProgress.solved}`, 540, 460);
  ctx.fillStyle = '#a9bdd8';
  ctx.font = '800 34px Arial, sans-serif';
  ctx.fillText('PLAYERS NAMED', 540, 550);

  ctx.fillStyle = isNewBest ? '#f5f8ff' : '#e83a59';
  ctx.font = '800 40px Arial, sans-serif';
  ctx.fillText(bestText, 540, 636);

  ctx.fillStyle = '#d8e8ff';
  ctx.font = '700 30px Arial, sans-serif';
  ctx.fillText('Play at', 540, 790);
  drawCenteredText(ctx, link, 540, 835, 760, 34, 'Arial, sans-serif', '#f5f8ff');

  const blob = await canvasToBlob(canvas);
  return new File([blob], `dinger-photo-blitz-${photoBlitzProgress.solved}.png`, { type: 'image/png' });
}

function renderResultScreen() {
  dom['game-screen'].classList.add('hidden');
  dom['result-screen'].classList.remove('hidden');
  dom['survival-again-btn'].classList.add('hidden');
  dom['result-skipped'].classList.add('hidden');

  dom['result-title'].textContent = progress.solved ? 'Nice work! ⚾' : 'Out of clues';
  dom['result-player'].textContent = `The answer was ${today.player.name} (${today.player.era})`;
  dom['result-score'].textContent = `${progress.score} pts`;

  let squares = '';
  for (let i = 1; i < progress.clueIndex; i += 1) squares += '🟨';
  squares += progress.solved ? '✅' : '❌';
  dom['result-grid'].textContent = squares;
  const clueCount = maxCluesFor(today.player);
  const clues = getCluesForPlayer(today.player);
  const finalClue = clues[progress.clueIndex - 1];
  const firstClue = clues[0];
  const outcome = progress.solved
    ? `Solved in ${progress.clueIndex} of ${clueCount} clues`
    : `Revealed ${progress.clueIndex} of ${clueCount} clues`;
  dom['result-summary'].innerHTML = `
    <div class="recap-stat"><span>${outcome}</span><strong>${progress.misses}</strong><em>Wrong guesses</em></div>
    <div class="recap-stat"><span>Era</span><strong>${today.player.era}</strong><em>Career window</em></div>
    <div class="recap-clue"><span>Clue trail</span><strong>${firstClue}</strong><em>Final clue shown: ${finalClue}</em></div>
  `;

  dom['result-clues'].innerHTML = '';
  clues.slice(0, progress.clueIndex).forEach((word, i) => {
    const li = document.createElement('li');
    li.className = 'clue-item';
    li.innerHTML = `<span class="clue-num">${i + 1}</span><span class="clue-word">${word}</span>`;
    dom['result-clues'].appendChild(li);
  });

  loadPlayerPhoto(today.player, progress.solved);
  startCountdown();
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  const tick = () => {
    const ms = msUntilNextMidnight();
    dom['next-puzzle-timer'].textContent = `Next puzzle in ${formatCountdown(ms / 1000)}`;
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function finalize(solved) {
  progress.finished = true;
  progress.solved = solved;
  progress.score = solved ? computeScore(progress.clueIndex, progress.misses) : 0;
  saveProgress(currentDateStr, progress);
  recordResult(currentDateStr, solved, progress.score, progress.clueIndex, progress.misses);
  renderResultScreen();
}

function handleGuessSubmit(e) {
  e.preventDefault();
  if (gameMode === 'survival') {
    handleSurvivalGuessSubmit();
    return;
  }
  if (gameMode === 'timed') {
    handleTimedGuessSubmit();
    return;
  }
  if (gameMode === 'photoblitz') {
    handlePhotoBlitzGuessSubmit();
    return;
  }
  if (progress.finished) return;
  const raw = dom['guess-input'].value;
  if (!raw.trim()) return;

  if (isCorrectGuess(raw, today.player, PLAYERS)) {
    dom['guess-input'].value = '';
    finalize(true);
    return;
  }

  progress.misses += 1;
  saveProgress(currentDateStr, progress);
  updateScoreDisplay();
  showFeedback('Not quite — try again or reveal the next clue.', 'wrong');
  dom['guess-input'].select();
}

function handlePass() {
  if (gameMode === 'survival') {
    handleSurvivalPass();
    return;
  }
  if (gameMode === 'timed') {
    handleTimedPass();
    return;
  }
  if (gameMode === 'photoblitz') return; // no clues to reveal in this mode
  if (progress.finished) return;
  const max = maxCluesFor(today.player);
  if (progress.clueIndex >= max) return;
  progress.clueIndex += 1;
  saveProgress(currentDateStr, progress);
  showFeedback('', '');
  renderClueList();
  updateScoreDisplay();
  updatePassButton();
}

function handleGiveUp() {
  if (gameMode === 'survival') {
    handleSurvivalSkip();
    return;
  }
  if (gameMode === 'timed') {
    handleTimedEndRun();
    return;
  }
  if (gameMode === 'photoblitz') {
    handlePhotoBlitzSkip();
    return;
  }
  if (progress.finished) return;
  finalize(false);
}

function buildSurvivalShareText() {
  return `⚾ Dinger Survival — ${survivalProgress.solved} solved (best: ${survivalBest})`;
}

function buildTimedShareText() {
  return `⚾ Dinger Timed — ${timedProgress.solved} correct (best: ${timedBest})`;
}

function buildPhotoBlitzShareText() {
  return `⚾ Dinger Photo Blitz — ${photoBlitzProgress.solved} named (best: ${photoBlitzBest})`;
}

async function handleSurvivalShare() {
  const text = buildSurvivalShareText();
  const url = gameShareUrl();
  let imageFile = null;
  dom['share-btn'].disabled = true;
  dom['share-btn'].textContent = 'Preparing...';

  try {
    imageFile = await buildSurvivalShareImageFile();
  } catch {
    imageFile = null;
  }

  dom['share-btn'].disabled = false;

  const shareData = {
    title: 'Dinger Survival',
    text: `${text}\n${url}`,
    url,
  };
  const imageShareData = imageFile
    ? { title: shareData.title, text: shareData.text, files: [imageFile] }
    : null;

  if (imageShareData && navigator.share && (!navigator.canShare || navigator.canShare(imageShareData))) {
    try {
      await navigator.share(imageShareData);
      dom['share-btn'].textContent = 'Shared!';
      resetShareButtonSoon();
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        dom['share-btn'].textContent = 'Share failed';
        resetShareButtonSoon();
      } else {
        dom['share-btn'].textContent = 'Share Result';
      }
    }
    return;
  }

  if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
    try {
      await navigator.share(shareData);
      dom['share-btn'].textContent = 'Shared!';
      resetShareButtonSoon();
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        dom['share-btn'].textContent = 'Share failed';
        resetShareButtonSoon();
      } else {
        dom['share-btn'].textContent = 'Share Result';
      }
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    dom['share-btn'].textContent = imageFile ? 'Copied link!' : 'Copied result!';
  } catch {
    dom['share-btn'].textContent = `${text} ${url}`;
  }
  resetShareButtonSoon();
}

async function handleTimedShare() {
  const text = buildTimedShareText();
  const url = gameShareUrl();
  let imageFile = null;
  dom['share-btn'].disabled = true;
  dom['share-btn'].textContent = 'Preparing...';

  try {
    imageFile = await buildTimedShareImageFile();
  } catch {
    imageFile = null;
  }

  dom['share-btn'].disabled = false;

  const shareData = {
    title: 'Dinger Timed',
    text: `${text}\n${url}`,
    url,
  };
  const imageShareData = imageFile
    ? { title: shareData.title, text: shareData.text, files: [imageFile] }
    : null;

  if (imageShareData && navigator.share && (!navigator.canShare || navigator.canShare(imageShareData))) {
    try {
      await navigator.share(imageShareData);
      dom['share-btn'].textContent = 'Shared!';
      resetShareButtonSoon();
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        dom['share-btn'].textContent = 'Share failed';
        resetShareButtonSoon();
      } else {
        dom['share-btn'].textContent = 'Share Result';
      }
    }
    return;
  }

  if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
    try {
      await navigator.share(shareData);
      dom['share-btn'].textContent = 'Shared!';
      resetShareButtonSoon();
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        dom['share-btn'].textContent = 'Share failed';
        resetShareButtonSoon();
      } else {
        dom['share-btn'].textContent = 'Share Result';
      }
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    dom['share-btn'].textContent = imageFile ? 'Copied link!' : 'Copied result!';
  } catch {
    dom['share-btn'].textContent = `${text} ${url}`;
  }
  resetShareButtonSoon();
}

async function handlePhotoBlitzShare() {
  const text = buildPhotoBlitzShareText();
  const url = gameShareUrl();
  let imageFile = null;
  dom['share-btn'].disabled = true;
  dom['share-btn'].textContent = 'Preparing...';

  try {
    imageFile = await buildPhotoBlitzShareImageFile();
  } catch {
    imageFile = null;
  }

  dom['share-btn'].disabled = false;

  const shareData = {
    title: 'Dinger Photo Blitz',
    text: `${text}\n${url}`,
    url,
  };
  const imageShareData = imageFile
    ? { title: shareData.title, text: shareData.text, files: [imageFile] }
    : null;

  if (imageShareData && navigator.share && (!navigator.canShare || navigator.canShare(imageShareData))) {
    try {
      await navigator.share(imageShareData);
      dom['share-btn'].textContent = 'Shared!';
      resetShareButtonSoon();
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        dom['share-btn'].textContent = 'Share failed';
        resetShareButtonSoon();
      } else {
        dom['share-btn'].textContent = 'Share Result';
      }
    }
    return;
  }

  if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
    try {
      await navigator.share(shareData);
      dom['share-btn'].textContent = 'Shared!';
      resetShareButtonSoon();
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        dom['share-btn'].textContent = 'Share failed';
        resetShareButtonSoon();
      } else {
        dom['share-btn'].textContent = 'Share Result';
      }
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    dom['share-btn'].textContent = imageFile ? 'Copied link!' : 'Copied result!';
  } catch {
    dom['share-btn'].textContent = `${text} ${url}`;
  }
  resetShareButtonSoon();
}

async function handleShare() {
  if (gameMode === 'survival') {
    await handleSurvivalShare();
    return;
  }
  if (gameMode === 'timed') {
    await handleTimedShare();
    return;
  }
  if (gameMode === 'photoblitz') {
    await handlePhotoBlitzShare();
    return;
  }
  const text = buildShareText();
  const url = gameShareUrl();
  let imageFile = null;
  dom['share-btn'].disabled = true;
  dom['share-btn'].textContent = 'Preparing...';

  try {
    imageFile = await buildShareImageFile();
  } catch {
    imageFile = null;
  }

  dom['share-btn'].disabled = false;

  const shareData = {
    title: `Dinger #${today.puzzleNumber}`,
    text: `${text}\n${url}`,
    url,
  };
  const imageShareData = imageFile
    ? { title: shareData.title, text: shareData.text, files: [imageFile] }
    : null;

  if (imageShareData && navigator.share && (!navigator.canShare || navigator.canShare(imageShareData))) {
    try {
      await navigator.share(imageShareData);
      dom['share-btn'].textContent = 'Shared!';
      resetShareButtonSoon();
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        dom['share-btn'].textContent = 'Share failed';
        resetShareButtonSoon();
      } else {
        dom['share-btn'].textContent = 'Share Result';
      }
    }
    return;
  }

  if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
    try {
      await navigator.share(shareData);
      dom['share-btn'].textContent = 'Shared!';
      resetShareButtonSoon();
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        dom['share-btn'].textContent = 'Share failed';
        resetShareButtonSoon();
      } else {
        dom['share-btn'].textContent = 'Share Result';
      }
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    dom['share-btn'].textContent = imageFile ? 'Copied link!' : 'Copied result!';
  } catch {
    dom['share-btn'].textContent = `${text} ${url}`;
  }
  resetShareButtonSoon();
}

function renderStats() {
  const stats = loadStats();
  const winPct = stats.played ? Math.round((100 * stats.wins) / stats.played) : 0;
  const solvedEntries = Object.values(stats.history).filter(h => h.solved);
  const avgScore = solvedEntries.length
    ? Math.round(solvedEntries.reduce((sum, h) => sum + h.score, 0) / solvedEntries.length)
    : 0;
  const distribution = Array.from({ length: CONFIG.maxClues }, (_, i) => {
    const clueNumber = i + 1;
    return solvedEntries.filter(h => h.cluesUsed === clueNumber).length;
  });
  const maxBucket = Math.max(1, ...distribution);
  const recent = Object.entries(stats.history)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 8);
  const distributionHtml = distribution.map((count, i) => {
    const pct = Math.max(count ? 8 : 0, Math.round((count / maxBucket) * 100));
    return `
      <div class="guess-bar-row">
        <span>${i + 1}</span>
        <div class="guess-bar-track"><div class="guess-bar-fill" style="width: ${pct}%"></div></div>
        <strong>${count}</strong>
      </div>
    `;
  }).join('');
  const recentHtml = recent.length
    ? recent.map(([date, entry]) => `
      <div class="history-row">
        <span class="history-date">${date.slice(5).replace('-', '/')}</span>
        <span class="history-result ${entry.solved ? 'win' : 'loss'}">${entry.solved ? 'Win' : 'Loss'}</span>
        <span class="history-score">${entry.solved ? `${entry.score} pts` : '0 pts'}</span>
        <span class="history-clues">${entry.cluesUsed}/${CONFIG.maxClues}</span>
      </div>
    `).join('')
    : '<p class="empty-history">Finished games will show up here.</p>';

  dom['stats-grid'].innerHTML = `
    <div class="stat-row">
      <div class="stat"><span class="stat-value">${stats.played}</span><span class="stat-label">Played</span></div>
      <div class="stat"><span class="stat-value">${winPct}%</span><span class="stat-label">Win rate</span></div>
      <div class="stat"><span class="stat-value">${stats.currentStreak}</span><span class="stat-label">Current streak</span></div>
      <div class="stat"><span class="stat-value">${stats.maxStreak}</span><span class="stat-label">Max streak</span></div>
      <div class="stat stat-wide"><span class="stat-value">${avgScore}</span><span class="stat-label">Avg score solved</span></div>
    </div>
    <section class="stats-section">
      <h3>Guess Distribution</h3>
      <div class="guess-bars">${distributionHtml}</div>
    </section>
    <section class="stats-section">
      <h3>Recent Games</h3>
      <div class="history-list">${recentHtml}</div>
    </section>
  `;
}

let lastFocusedEl = null;

function getFocusableEls(container) {
  return Array.from(container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.disabled && el.offsetParent !== null);
}

function trapFocusKeydown(e, modal) {
  if (e.key !== 'Tab') return;
  const focusable = getFocusableEls(modal);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function toggleModal(modal, show, triggerEl) {
  const wasOpen = !modal.classList.contains('hidden');
  modal.classList.toggle('hidden', !show);

  if (show && !wasOpen) {
    lastFocusedEl = triggerEl || document.activeElement;
    const focusable = getFocusableEls(modal);
    if (focusable.length) focusable[0].focus();
    modal._trapHandler = (e) => trapFocusKeydown(e, modal);
    modal.addEventListener('keydown', modal._trapHandler);
  } else if (!show && wasOpen) {
    if (modal._trapHandler) {
      modal.removeEventListener('keydown', modal._trapHandler);
      modal._trapHandler = null;
    }
    if (lastFocusedEl) lastFocusedEl.focus();
  }
}

function showFirstRunHelp() {
  try {
    if (localStorage.getItem(HELP_SEEN_KEY)) return;
    localStorage.setItem(HELP_SEEN_KEY, 'true');
    toggleModal(dom['help-modal'], true);
  } catch {
    toggleModal(dom['help-modal'], true);
  }
}

function handleModeStart() {
  if (gameMode === 'timed') {
    startTimedRun();
  } else if (gameMode === 'photoblitz') {
    startPhotoBlitzRun();
  } else {
    startSurvivalRun();
  }
}

function attachEvents() {
  dom['guess-form'].addEventListener('submit', handleGuessSubmit);
  dom['pass-btn'].addEventListener('click', handlePass);
  dom['giveup-btn'].addEventListener('click', handleGiveUp);
  dom['share-btn'].addEventListener('click', handleShare);
  dom['survival-start-btn'].addEventListener('click', handleModeStart);
  dom['survival-again-btn'].addEventListener('click', handleModeStart);
  dom['home-btn'].addEventListener('click', () => setMode('home'));
  dom['home-daily-btn'].addEventListener('click', () => setMode('daily'));
  dom['home-survival-btn'].addEventListener('click', () => setMode('survival'));
  dom['home-timed-btn'].addEventListener('click', () => setMode('timed'));
  dom['home-photoblitz-btn'].addEventListener('click', () => setMode('photoblitz'));
  dom['mode-menu-btn'].addEventListener('click', () => setMode('home'));

  dom['stats-btn'].addEventListener('click', () => { renderStats(); toggleModal(dom['stats-modal'], true, dom['stats-btn']); });
  dom['close-stats'].addEventListener('click', () => toggleModal(dom['stats-modal'], false));
  dom['close-stats-2'].addEventListener('click', () => toggleModal(dom['stats-modal'], false));

  dom['help-btn'].addEventListener('click', () => toggleModal(dom['help-modal'], true, dom['help-btn']));
  dom['close-help'].addEventListener('click', () => toggleModal(dom['help-modal'], false));
  dom['close-help-2'].addEventListener('click', () => toggleModal(dom['help-modal'], false));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      toggleModal(dom['stats-modal'], false);
      toggleModal(dom['help-modal'], false);
    }
  });
}

function init() {
  cacheDom();
  currentDateStr = todayDateStr();
  today = getPuzzleForDate(currentDateStr);
  progress = loadProgress(currentDateStr) || defaultProgress();
  survivalBest = loadSurvivalBest();
  timedBest = loadTimedBest();
  photoBlitzBest = loadPhotoBlitzBest();

  attachEvents();
  setMode('home');
  showFirstRunHelp();
}

document.addEventListener('DOMContentLoaded', init);
