// State, storage, rendering, and event wiring for Dinger.

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

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function appendClueItem(list, number, clue, isNew = false) {
  const li = el('li', 'clue-item');
  if (isNew) li.classList.add('clue-new');
  li.append(el('span', 'clue-num', String(number)), el('span', 'clue-word', clue));
  list.appendChild(li);
}

function recapBlock(className, label, value, detail) {
  const block = el('div', className);
  block.append(el('span', '', label), el('strong', '', String(value)), el('em', '', detail));
  return block;
}

function renderResultSummary(blocks) {
  dom['result-summary'].replaceChildren(...blocks);
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
    appendClueItem(dom['clue-list'], i + 1, clues[i], i === progress.clueIndex - 1 && !progress.finished);
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
    appendClueItem(dom['clue-list'], i + 1, clues[i], i === survivalProgress.clueIndex - 1);
  }
}

function renderTimedClueList() {
  const player = timedCurrentPlayer();
  if (!player) return;
  const clues = getTimedCluesForPlayer(player);
  dom['clue-list'].innerHTML = '';
  for (let i = 0; i < timedProgress.clueIndex; i += 1) {
    appendClueItem(dom['clue-list'], i + 1, clues[i], i === timedProgress.clueIndex - 1);
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
  renderResultSummary([
    recapBlock('recap-stat', 'This run', survivalProgress.solved, 'Players solved'),
    recapBlock('recap-stat', 'Best run', survivalBest, isNewBest ? 'New best!' : 'Personal best'),
  ]);
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
  renderResultSummary([
    recapBlock('recap-stat', 'This run', timedProgress.solved, 'Players correct'),
    recapBlock('recap-stat', 'Best run', timedBest, isNewBest ? 'New best!' : 'Personal best'),
    recapBlock('recap-clue', 'Rules', `${CONFIG.timedStartTime} seconds per player`, `Each extra clue costs ${CONFIG.timedCluePenalty} seconds`),
  ]);
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
  renderResultSummary([
    recapBlock('recap-stat', 'This run', photoBlitzProgress.solved, 'Players named'),
    recapBlock('recap-stat', 'Best run', photoBlitzBest, isNewBest ? 'New best!' : 'Personal best'),
  ]);
  dom['result-clues'].innerHTML = '';
  dom['player-photo-wrap'].classList.remove('photo-win', 'photo-loss');
  dom['player-photo'].classList.remove('loaded');
  dom['player-photo'].removeAttribute('src');
  dom['player-photo-placeholder'].textContent = '📸';
  dom['player-photo-placeholder'].classList.remove('hidden', 'initials');

  if (photoBlitzProgress.skipped.length) {
    dom['result-skipped'].classList.remove('hidden');
    const title = el('h3', '', 'Players You Skipped');
    const list = el('ul', 'skipped-list');
    photoBlitzProgress.skipped.forEach((skipped) => {
      const item = el('li');
      const img = el('img', 'skipped-photo');
      img.src = skipped.url;
      img.alt = skipped.name;
      item.append(img, el('span', '', skipped.name));
      list.appendChild(item);
    });
    dom['result-skipped'].replaceChildren(title, list);
  } else {
    dom['result-skipped'].classList.add('hidden');
    dom['result-skipped'].replaceChildren();
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
  renderResultSummary([
    recapBlock('recap-stat', outcome, progress.misses, 'Wrong guesses'),
    recapBlock('recap-stat', 'Era', today.player.era, 'Career window'),
    recapBlock('recap-clue', 'Clue trail', firstClue, `Final clue shown: ${finalClue}`),
  ]);

  dom['result-clues'].innerHTML = '';
  clues.slice(0, progress.clueIndex).forEach((word, i) => {
    appendClueItem(dom['result-clues'], i + 1, word);
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
  if (gameMode === 'photoblitz') return;
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

  const statRow = el('div', 'stat-row');
  [
    [stats.played, 'Played', 'stat'],
    [`${winPct}%`, 'Win rate', 'stat'],
    [stats.currentStreak, 'Current streak', 'stat'],
    [stats.maxStreak, 'Max streak', 'stat'],
    [avgScore, 'Avg score solved', 'stat stat-wide'],
  ].forEach(([value, label, className]) => {
    const stat = el('div', className);
    stat.append(el('span', 'stat-value', String(value)), el('span', 'stat-label', label));
    statRow.appendChild(stat);
  });

  const distributionSection = el('section', 'stats-section');
  distributionSection.appendChild(el('h3', '', 'Guess Distribution'));
  const bars = el('div', 'guess-bars');
  distribution.forEach((count, i) => {
    const pct = Math.max(count ? 8 : 0, Math.round((count / maxBucket) * 100));
    const row = el('div', 'guess-bar-row');
    const track = el('div', 'guess-bar-track');
    const fill = el('div', 'guess-bar-fill');
    fill.style.width = `${pct}%`;
    track.appendChild(fill);
    row.append(el('span', '', String(i + 1)), track, el('strong', '', String(count)));
    bars.appendChild(row);
  });
  distributionSection.appendChild(bars);

  const recentSection = el('section', 'stats-section');
  recentSection.appendChild(el('h3', '', 'Recent Games'));
  const historyList = el('div', 'history-list');
  if (recent.length) {
    recent.forEach(([date, entry]) => {
      const row = el('div', 'history-row');
      row.append(
        el('span', 'history-date', date.slice(5).replace('-', '/')),
        el('span', `history-result ${entry.solved ? 'win' : 'loss'}`, entry.solved ? 'Win' : 'Loss'),
        el('span', 'history-score', entry.solved ? `${entry.score} pts` : '0 pts'),
        el('span', 'history-clues', `${entry.cluesUsed}/${CONFIG.maxClues}`),
      );
      historyList.appendChild(row);
    });
  } else {
    historyList.appendChild(el('p', 'empty-history', 'Finished games will show up here.'));
  }
  recentSection.appendChild(historyList);

  dom['stats-grid'].replaceChildren(statRow, distributionSection, recentSection);
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
