'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./helpers/loadGame');

const ctx = loadGame();
const {
  CONFIG, daysBetween, getPuzzleForDate, parseEraRange, decadeLabel, eraWindowLabel,
  getCluesForPlayer, normalize, withoutSuffix, compact, lastNameOf, levenshtein,
  isUniqueLastName, isCorrectGuess, computeScore, formatCountdown, PLAYERS, DAILY_ORDER,
  getSurvivalCluesForPlayer, survivalBonusForClueCount, clampSurvivalTime, buildSurvivalQueue,
} = ctx;

describe('normalize / withoutSuffix / compact', () => {
  test('lowercases, strips accents and punctuation, collapses whitespace', () => {
    assert.equal(normalize('José  Altuve.'), 'jose altuve');
    assert.equal(normalize("O'Neill  Jr."), 'oneill jr');
  });

  test('withoutSuffix strips generational suffixes', () => {
    assert.equal(withoutSuffix('Ken Griffey Jr.'), 'ken griffey');
    assert.equal(withoutSuffix('Cal Ripken Jr'), 'cal ripken');
  });

  test('compact removes all whitespace', () => {
    assert.equal(compact('Babe Ruth'), 'baberuth');
  });
});

describe('lastNameOf', () => {
  test('drops suffixes before taking the last token', () => {
    assert.equal(lastNameOf('Ken Griffey Jr.'), 'griffey');
    assert.equal(lastNameOf('Cal Ripken Jr.'), 'ripken');
    assert.equal(lastNameOf('Barry Bonds'), 'bonds');
  });
});

describe('levenshtein', () => {
  test('classic distances', () => {
    assert.equal(levenshtein('kitten', 'sitting'), 3);
    assert.equal(levenshtein('same', 'same'), 0);
    assert.equal(levenshtein('', 'abc'), 3);
  });
});

describe('isUniqueLastName', () => {
  const alice = { name: 'Alice Smith' };
  const bob = { name: 'Bob Smith' };
  const carol = { name: 'Carol Jones' };

  test('false when two players share a last name', () => {
    assert.equal(isUniqueLastName(alice, [alice, bob, carol]), false);
    assert.equal(isUniqueLastName(bob, [alice, bob, carol]), false);
  });

  test('true when no other player shares the last name', () => {
    assert.equal(isUniqueLastName(carol, [alice, bob, carol]), true);
  });
});

describe('isCorrectGuess', () => {
  const smith = { name: 'Alice Smith', accept: ['alice smith', 'the ace'] };
  const jones = { name: 'Bob Jones', accept: ['bob jones'] };
  const rothSuffix = { name: 'Chris Roth Jr.', accept: ['chris roth jr', 'chris roth'] };
  const uniqueLastNamePool = [smith, jones];

  test('matches an accepted alias exactly', () => {
    assert.equal(isCorrectGuess('The Ace', smith, uniqueLastNamePool), true);
  });

  test('matches full name regardless of case/punctuation', () => {
    assert.equal(isCorrectGuess('  ALICE   smith.', smith, uniqueLastNamePool), true);
  });

  test('matches a unique last name alone', () => {
    assert.equal(isCorrectGuess('Smith', smith, uniqueLastNamePool), true);
  });

  test('rejects a shared last name when ambiguous', () => {
    const dup = { name: 'Zed Smith', accept: ['zed smith'] };
    const ambiguousPool = [smith, jones, dup];
    assert.equal(isCorrectGuess('Smith', smith, ambiguousPool), false);
    assert.equal(isCorrectGuess('Smith', dup, ambiguousPool), false);
  });

  test('ignores generational suffix differences', () => {
    assert.equal(isCorrectGuess('Chris Roth Jr', rothSuffix, [rothSuffix]), true);
    assert.equal(isCorrectGuess('Chris Roth', rothSuffix, [rothSuffix]), true);
  });

  test('tolerates a small typo within edit distance 2', () => {
    assert.equal(isCorrectGuess('Alise Smith', smith, uniqueLastNamePool), true);
  });

  test('rejects a guess that is too far off', () => {
    assert.equal(isCorrectGuess('Someone Else Entirely', smith, uniqueLastNamePool), false);
  });

  test('rejects an empty guess', () => {
    assert.equal(isCorrectGuess('   ', smith, uniqueLastNamePool), false);
  });
});

describe('computeScore', () => {
  test('full score on a first-clue solve with no misses', () => {
    assert.equal(computeScore(1, 0), 100);
  });

  test('deducts cluePenalty per extra clue and missPenalty per miss', () => {
    assert.equal(computeScore(3, 0), 80);
    assert.equal(computeScore(1, 2), 70);
    assert.equal(computeScore(3, 2), 50);
  });

  test('never goes below zero', () => {
    assert.equal(computeScore(10, 10), 0);
  });
});

describe('formatCountdown', () => {
  test('formats seconds as HH:MM:SS', () => {
    assert.equal(formatCountdown(0), '00:00:00');
    assert.equal(formatCountdown(3661), '01:01:01');
  });

  test('clamps negative input to zero', () => {
    assert.equal(formatCountdown(-5), '00:00:00');
  });
});

describe('daysBetween', () => {
  test('counts whole days between two date strings', () => {
    assert.equal(daysBetween('2024-01-01', '2024-01-02'), 1);
    assert.equal(daysBetween('2024-01-01', '2024-01-01'), 0);
    assert.equal(daysBetween('2024-01-02', '2024-01-01'), -1);
  });
});

describe('era parsing', () => {
  test('parses a closed range', () => {
    const range = parseEraRange('1986–2007');
    assert.equal(range.start, 1986);
    assert.equal(range.end, 2007);
  });

  test('parses an open-ended "present" range', () => {
    const range = parseEraRange('2018–present');
    assert.equal(range.start, 2018);
    assert.equal(range.end, 'present');
  });

  test('returns null for an unparseable era', () => {
    assert.equal(parseEraRange('not a range'), null);
  });

  test('decadeLabel and eraWindowLabel', () => {
    assert.equal(decadeLabel(1986), '1980s');
    assert.equal(eraWindowLabel({ start: 1986, end: 2007 }), '1980s to 2000s');
    assert.equal(eraWindowLabel({ start: 1986, end: 'present' }), '1980s to today');
  });
});

describe('getPuzzleForDate', () => {
  test('day 0 is puzzle #1 at rotation index 0', () => {
    const { puzzleNumber, dayNum, player } = getPuzzleForDate(CONFIG.startDate);
    assert.equal(puzzleNumber, 1);
    assert.equal(dayNum, 0);
    assert.equal(player.id, DAILY_ORDER[0]);
  });

  test('rotation wraps around after DAILY_ORDER.length days', () => {
    const wrapDate = new Date(`${CONFIG.startDate}T00:00:00`);
    wrapDate.setDate(wrapDate.getDate() + DAILY_ORDER.length);
    const y = wrapDate.getFullYear();
    const m = String(wrapDate.getMonth() + 1).padStart(2, '0');
    const d = String(wrapDate.getDate()).padStart(2, '0');
    const { player } = getPuzzleForDate(`${y}-${m}-${d}`);
    assert.equal(player.id, DAILY_ORDER[0]);
  });

  test('every id in DAILY_ORDER resolves to a real player', () => {
    for (const id of DAILY_ORDER) {
      assert.ok(PLAYERS.some(p => p.id === id), `missing player for id "${id}"`);
    }
  });
});

describe('getCluesForPlayer', () => {
  test('every player has exactly CONFIG.maxClues hand-authored clues', () => {
    for (const player of PLAYERS) {
      assert.equal(player.clues.length, CONFIG.maxClues, `player "${player.id}" has ${player.clues.length} authored clues`);
    }
  });

  test('every player yields exactly CONFIG.maxClues non-empty clues', () => {
    for (const player of PLAYERS) {
      const clues = getCluesForPlayer(player);
      assert.equal(clues.length, CONFIG.maxClues, `player "${player.id}" has ${clues.length} clues`);
      clues.forEach((clue, i) => {
        assert.ok(typeof clue === 'string' && clue.length > 0, `player "${player.id}" clue #${i + 1} is empty/undefined`);
      });
    }
  });

  test('era clues (decade, start year, end year) land at positions 1, 5, and 9', () => {
    const player = PLAYERS.find(p => p.id === 'bonds');
    const clues = getCluesForPlayer(player);
    assert.match(clues[0], /^Career window sits in the/);
    assert.match(clues[4], /^Career began in/);
    assert.match(clues[8], /^Career ended in|still marked active/);
  });
});

describe('survival mode helpers', () => {
  test('getSurvivalCluesForPlayer returns the dedicated survivalClues set, not a slice of the daily ladder', () => {
    const player = PLAYERS.find(p => p.id === 'bonds');
    const survivalClues = getSurvivalCluesForPlayer(player);
    assert.equal(survivalClues.length, CONFIG.survivalMaxClues);
    assert.deepEqual(survivalClues, player.survivalClues);
  });

  test('every player has exactly 3 non-empty, standalone survivalClues', () => {
    for (const player of PLAYERS) {
      assert.equal(player.survivalClues.length, CONFIG.survivalMaxClues, `player "${player.id}" has ${player.survivalClues.length} survival clues`);
      player.survivalClues.forEach((clue, i) => {
        assert.ok(typeof clue === 'string' && clue.length > 0, `player "${player.id}" survival clue #${i + 1} is empty/undefined`);
      });
    }
  });

  // Regression guard for a real bug: survival clues used to be sliced from
  // the tail of the sequential daily ladder, so some read like "Played for
  // Boston too" — nonsensical without the earlier daily clue that named the
  // first team. Survival clues must never depend on words like this.
  test('no survivalClue leans on a dangling reference to an unstated earlier fact', () => {
    const danglingWords = /\b(too|also|another|the other|as well|likewise)\b/i;
    for (const player of PLAYERS) {
      player.survivalClues.forEach((clue, i) => {
        assert.doesNotMatch(clue, danglingWords, `player "${player.id}" survival clue #${i + 1} ("${clue}") may depend on unstated context`);
      });
    }
  });

  test('survivalBonusForClueCount matches the 5/3/1 tier', () => {
    assert.equal(survivalBonusForClueCount(1), 5);
    assert.equal(survivalBonusForClueCount(2), 3);
    assert.equal(survivalBonusForClueCount(3), 1);
  });

  test('survivalBonusForClueCount is 0 outside the defined tiers', () => {
    assert.equal(survivalBonusForClueCount(4), 0);
    assert.equal(survivalBonusForClueCount(0), 0);
  });

  test('clampSurvivalTime floors at zero but has no upper bound', () => {
    assert.equal(clampSurvivalTime(-10), 0);
    assert.equal(clampSurvivalTime(0), 0);
    assert.equal(clampSurvivalTime(500), 500);
  });

  test('buildSurvivalQueue is a full shuffled permutation of every player id', () => {
    const queue = buildSurvivalQueue(() => 0.42);
    assert.equal(queue.length, PLAYERS.length);
    assert.equal(new Set(queue).size, PLAYERS.length);
    PLAYERS.forEach(p => assert.ok(queue.includes(p.id)));
  });

  test('buildSurvivalQueue actually shuffles (order differs from insertion order)', () => {
    const inOrder = PLAYERS.map(p => p.id);
    const queue = buildSurvivalQueue(() => 0.9);
    assert.notDeepEqual(queue, inOrder);
  });
});
