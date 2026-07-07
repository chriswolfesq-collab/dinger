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

function parseEraRange(era) {
  const match = String(era).match(/^(\d{4})[–-](\d{4}|present)$/);
  if (!match) return null;
  return {
    start: Number(match[1]),
    end: match[2] === 'present' ? 'present' : Number(match[2]),
  };
}

function decadeLabel(year) {
  return `${Math.floor(year / 10) * 10}s`;
}

function eraWindowLabel(range) {
  const startDecade = decadeLabel(range.start);
  const endDecade = range.end === 'present' ? 'today' : decadeLabel(range.end);
  return startDecade === endDecade ? startDecade : `${startDecade} to ${endDecade}`;
}

// player.clues holds exactly 7 hand-ordered facts, vaguest to most
// identifying: [0-2] broad enough to fit many players, [3-5] moderate
// reveals (team/role/nickname), [6] the single most identifying fact. This
// interleaves them with 3 auto-generated era clues to build a 10-clue ladder
// that escalates in specificity from start to finish.
function getCluesForPlayer(player) {
  const eraRange = parseEraRange(player.era);
  if (!eraRange) return player.clues.slice(0, CONFIG.maxClues);

  const decadeClue = `Career window sits in the ${eraWindowLabel(eraRange)} range`;
  const startYearClue = `Career began in ${eraRange.start}`;
  const endYearClue = eraRange.end === 'present'
    ? 'Career is still marked active in this puzzle set'
    : `Career ended in ${eraRange.end}`;

  const [vague1, vague2, vague3, mid1, mid2, mid3, finalClue] = player.clues;

  return [
    decadeClue,
    vague1,
    vague2,
    vague3,
    startYearClue,
    mid1,
    mid2,
    mid3,
    endYearClue,
    finalClue,
  ].slice(0, CONFIG.maxClues);
}

function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function withoutSuffix(str) {
  return normalize(str)
    .replace(/\b(jr|jnr|junior|sr|senior|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(str) {
  return normalize(str).replace(/\s+/g, '');
}

function compactWithoutSuffix(str) {
  return withoutSuffix(str).replace(/\s+/g, '');
}

function lastNameOf(fullName) {
  const parts = withoutSuffix(fullName).split(/\s+/);
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

function namesMatch(guess, candidate) {
  if (guess.normal === candidate.normal) return true;
  if (guess.compact === candidate.compact) return true;
  if (guess.noSuffix && guess.noSuffix === candidate.noSuffix) return true;
  if (guess.compactNoSuffix && guess.compactNoSuffix === candidate.compactNoSuffix) return true;
  return false;
}

function guessShape(str) {
  return {
    normal: normalize(str),
    compact: compact(str),
    noSuffix: withoutSuffix(str),
    compactNoSuffix: compactWithoutSuffix(str),
  };
}

function isCorrectGuess(rawGuess, player, allPlayers) {
  const guess = guessShape(rawGuess);
  if (!guess.normal) return false;

  const acceptList = player.accept.map(guessShape);
  if (acceptList.some(candidate => namesMatch(guess, candidate))) return true;

  const lastName = normalize(lastNameOf(player.name));
  const uniqueLastName = isUniqueLastName(player, allPlayers);
  if (uniqueLastName && namesMatch(guess, guessShape(lastName))) return true;

  if (guess.normal.length >= 4) {
    const candidates = uniqueLastName ? [...acceptList, guessShape(lastName)] : acceptList;
    for (const candidate of candidates) {
      if (Math.abs(candidate.normal.length - guess.normal.length) <= 2 && levenshtein(guess.normal, candidate.normal) <= 2) {
        return true;
      }
      if (Math.abs(candidate.compact.length - guess.compact.length) <= 2 && levenshtein(guess.compact, candidate.compact) <= 2) {
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
