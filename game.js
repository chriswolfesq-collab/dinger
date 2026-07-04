// Pure game logic — no DOM access here, so it's easy to reason about/test.

const CONFIG = {
  basePoints: 100,
  cluePenalty: 10,
  missPenalty: 15,
  maxClues: 10,
  startDate: '2024-01-01', // day 0 anchor for puzzle numbering + rotation
};

function todayDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(`${dateStrA}T00:00:00`);
  const b = new Date(`${dateStrB}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

function getPuzzleForDate(dateStr) {
  const dayNum = daysBetween(CONFIG.startDate, dateStr);
  const puzzleNumber = dayNum + 1;
  const idx = ((dayNum % DAILY_ORDER.length) + DAILY_ORDER.length) % DAILY_ORDER.length;
  const playerId = DAILY_ORDER[idx];
  const player = PLAYERS.find(p => p.id === playerId);
  return { puzzleNumber, dayNum, player };
}

function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lastNameOf(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

function isUniqueLastName(player, allPlayers) {
  const target = normalize(lastNameOf(player.name));
  const count = allPlayers.filter(p => normalize(lastNameOf(p.name)) === target).length;
  return count === 1;
}

function isCorrectGuess(rawGuess, player, allPlayers) {
  const guess = normalize(rawGuess);
  if (!guess) return false;

  const acceptList = player.accept.map(normalize);
  if (acceptList.includes(guess)) return true;

  const lastName = normalize(lastNameOf(player.name));
  if (guess === lastName && isUniqueLastName(player, allPlayers)) return true;

  if (guess.length >= 4) {
    const candidates = isUniqueLastName(player, allPlayers) ? [...acceptList, lastName] : acceptList;
    for (const candidate of candidates) {
      if (Math.abs(candidate.length - guess.length) <= 2 && levenshtein(guess, candidate) <= 2) {
        return true;
      }
    }
  }
  return false;
}

function computeScore(cluesRevealed, misses) {
  const raw = CONFIG.basePoints - (cluesRevealed - 1) * CONFIG.cluePenalty - misses * CONFIG.missPenalty;
  return Math.max(0, raw);
}

function msUntilNextMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return Math.max(1000, next.getTime() - now.getTime());
}

function formatCountdown(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
