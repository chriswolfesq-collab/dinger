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
    'result-summary', 'share-btn', 'next-puzzle-timer', 'stats-modal', 'stats-grid', 'help-modal',
    'stats-btn', 'help-btn', 'close-stats', 'close-stats-2', 'close-help', 'close-help-2',
    'player-photo-wrap', 'player-photo', 'player-photo-placeholder',
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

function attachEvents() {
  dom['guess-form'].addEventListener('submit', handleGuessSubmit);
  dom['pass-btn'].addEventListener('click', handlePass);
  dom['giveup-btn'].addEventListener('click', handleGiveUp);
  dom['share-btn'].addEventListener('click', handleShare);

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
