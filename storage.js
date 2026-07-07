// Local persistence helpers for Dinger.

const PROGRESS_KEY_PREFIX = 'dinger_progress_v1_';
const STATS_KEY = 'dinger_stats_v1';
const HELP_SEEN_KEY = 'dinger_help_seen_v1';
const SURVIVAL_BEST_KEY = 'dinger_survival_best_v1';
const TIMED_BEST_KEY = 'dinger_timed_best_v1';
const PHOTO_BLITZ_BEST_KEY = 'dinger_photo_blitz_best_v1';

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadProgress(dateStr) {
  return loadJson(PROGRESS_KEY_PREFIX + dateStr, null);
}

function saveProgress(dateStr, state) {
  saveJson(PROGRESS_KEY_PREFIX + dateStr, state);
}

function defaultStats() {
  return { played: 0, wins: 0, currentStreak: 0, maxStreak: 0, history: {} };
}

function loadStats() {
  return loadJson(STATS_KEY, defaultStats());
}

function saveStats(stats) {
  saveJson(STATS_KEY, stats);
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
  if (stats.history[dateStr]) return stats;
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

function loadBestScore(key) {
  try {
    const val = Number(localStorage.getItem(key));
    return Number.isFinite(val) && val > 0 ? val : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(key, best) {
  try {
    localStorage.setItem(key, String(best));
  } catch {
    // Best score stays in memory only if storage is unavailable.
  }
}

function loadSurvivalBest() {
  return loadBestScore(SURVIVAL_BEST_KEY);
}

function saveSurvivalBest(best) {
  saveBestScore(SURVIVAL_BEST_KEY, best);
}

function loadTimedBest() {
  return loadBestScore(TIMED_BEST_KEY);
}

function saveTimedBest(best) {
  saveBestScore(TIMED_BEST_KEY, best);
}

function loadPhotoBlitzBest() {
  return loadBestScore(PHOTO_BLITZ_BEST_KEY);
}

function savePhotoBlitzBest(best) {
  saveBestScore(PHOTO_BLITZ_BEST_KEY, best);
}
