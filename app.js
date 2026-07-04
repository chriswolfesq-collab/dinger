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

const dom = {};
let today = null;
let currentDateStr = null;
let progress = null;
let countdownTimer = null;

function cacheDom() {
  [
    'puzzle-number', 'score-value', 'clue-list', 'guess-form', 'guess-input',
    'feedback', 'pass-btn', 'giveup-btn', 'game-screen', 'result-screen',
    'result-title', 'result-player', 'result-score', 'result-grid', 'result-clues',
    'share-btn', 'next-puzzle-timer', 'stats-modal', 'stats-grid', 'help-modal',
    'stats-btn', 'help-btn', 'close-stats', 'close-stats-2', 'close-help', 'close-help-2',
    'player-photo-wrap', 'player-photo', 'player-photo-placeholder',
  ].forEach(id => { dom[id] = document.getElementById(id); });
}

const photoCache = {};

async function fetchPlayerPhoto(name) {
  if (Object.prototype.hasOwnProperty.call(photoCache, name)) return photoCache[name];
  const title = encodeURIComponent(name.replace(/\s+/g, '_'));
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`);
    if (!res.ok) throw new Error('not ok');
    const data = await res.json();
    const url = (data.thumbnail && data.thumbnail.source) || (data.originalimage && data.originalimage.source) || null;
    photoCache[name] = url;
    return url;
  } catch {
    photoCache[name] = null;
    return null;
  }
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
  return Math.min(CONFIG.maxClues, player.clues.length);
}

function renderPuzzleMeta() {
  dom['puzzle-number'].textContent = `Puzzle #${today.puzzleNumber}`;
}

function renderClueList() {
  dom['clue-list'].innerHTML = '';
  for (let i = 0; i < progress.clueIndex; i += 1) {
    const li = document.createElement('li');
    li.className = 'clue-item';
    if (i === progress.clueIndex - 1 && !progress.finished) li.classList.add('clue-new');
    li.innerHTML = `<span class="clue-num">${i + 1}</span><span class="clue-word">${today.player.clues[i]}</span>`;
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

function buildShareText() {
  let squares = '';
  for (let i = 1; i < progress.clueIndex; i += 1) squares += '🟨';
  squares += progress.solved ? '✅' : '❌';
  return `⚾ Dinger #${today.puzzleNumber} — ${squares} ${progress.score} pts`;
}

function renderResultScreen() {
  dom['game-screen'].classList.add('hidden');
  dom['result-screen'].classList.remove('hidden');

  dom['result-title'].textContent = progress.solved ? 'Nice work! ⚾' : 'Out of clues';
  dom['result-player'].textContent = `The answer was ${today.player.name} (${today.player.era})`;
  dom['result-score'].textContent = `${progress.score} pts`;

  let squares = '';
  for (let i = 1; i < progress.clueIndex; i += 1) squares += '🟨';
  squares += progress.solved ? '✅' : '❌';
  dom['result-grid'].textContent = squares;

  dom['result-clues'].innerHTML = '';
  today.player.clues.slice(0, progress.clueIndex).forEach((word, i) => {
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
  if (progress.finished) return;
  finalize(false);
}

async function handleShare() {
  const text = buildShareText();
  try {
    await navigator.clipboard.writeText(text);
    dom['share-btn'].textContent = '✓ Copied!';
  } catch {
    dom['share-btn'].textContent = text;
  }
  setTimeout(() => { dom['share-btn'].textContent = '📋 Copy Share Text'; }, 2000);
}

function renderStats() {
  const stats = loadStats();
  const winPct = stats.played ? Math.round((100 * stats.wins) / stats.played) : 0;
  const solvedEntries = Object.values(stats.history).filter(h => h.solved);
  const avgScore = solvedEntries.length
    ? Math.round(solvedEntries.reduce((sum, h) => sum + h.score, 0) / solvedEntries.length)
    : 0;

  dom['stats-grid'].innerHTML = `
    <div class="stat"><span class="stat-value">${stats.played}</span><span class="stat-label">Played</span></div>
    <div class="stat"><span class="stat-value">${winPct}%</span><span class="stat-label">Win rate</span></div>
    <div class="stat"><span class="stat-value">${stats.currentStreak}</span><span class="stat-label">Current streak</span></div>
    <div class="stat"><span class="stat-value">${stats.maxStreak}</span><span class="stat-label">Max streak</span></div>
    <div class="stat"><span class="stat-value">${avgScore}</span><span class="stat-label">Avg score (solved)</span></div>
  `;
}

function toggleModal(modal, show) {
  modal.classList.toggle('hidden', !show);
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

function attachEvents() {
  dom['guess-form'].addEventListener('submit', handleGuessSubmit);
  dom['pass-btn'].addEventListener('click', handlePass);
  dom['giveup-btn'].addEventListener('click', handleGiveUp);
  dom['share-btn'].addEventListener('click', handleShare);

  dom['stats-btn'].addEventListener('click', () => { renderStats(); toggleModal(dom['stats-modal'], true); });
  dom['close-stats'].addEventListener('click', () => toggleModal(dom['stats-modal'], false));
  dom['close-stats-2'].addEventListener('click', () => toggleModal(dom['stats-modal'], false));

  dom['help-btn'].addEventListener('click', () => toggleModal(dom['help-modal'], true));
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

  renderPuzzleMeta();
  attachEvents();

  if (progress.finished) {
    renderResultScreen();
  } else {
    renderGameScreen();
    showFirstRunHelp();
  }
}

document.addEventListener('DOMContentLoaded', init);
