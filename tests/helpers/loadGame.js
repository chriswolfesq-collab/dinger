'use strict';
// Loads players.js + game.js the same way the browser does — as plain
// scripts sharing one global scope — so the test suite exercises the exact
// same code the page ships, with no test-only exports in production files.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Top-level `const`/`function` declarations across scripts run in the same vm
// context share one lexical scope (matching how classic <script> tags behave
// in a browser), but they never become *properties* of the context object —
// so we pull out what the tests need with one final in-context expression.
const EXPORTS = [
  'CONFIG', 'daysBetween', 'getPuzzleForDate', 'parseEraRange', 'decadeLabel',
  'eraWindowLabel', 'getCluesForPlayer', 'normalize', 'withoutSuffix', 'compact',
  'lastNameOf', 'levenshtein', 'isUniqueLastName', 'isCorrectGuess', 'computeScore',
  'formatCountdown', 'PLAYERS', 'DAILY_ORDER',
];

function loadGame() {
  const context = {};
  vm.createContext(context);
  const root = path.join(__dirname, '..', '..');
  const playersSrc = fs.readFileSync(path.join(root, 'players.js'), 'utf8');
  const gameSrc = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
  vm.runInContext(playersSrc, context, { filename: 'players.js' });
  vm.runInContext(gameSrc, context, { filename: 'game.js' });
  return vm.runInContext(`({ ${EXPORTS.join(', ')} })`, context, { filename: 'exports.js' });
}

module.exports = { loadGame };
