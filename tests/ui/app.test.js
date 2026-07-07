'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

describe('browser app wiring', () => {
  test('loads classic scripts in dependency order', () => {
    const html = read('index.html');
    const scripts = Array.from(html.matchAll(/<script src="([^"]+)"/g)).map(match => match[1].split('?')[0]);
    assert.deepEqual(scripts, [
      'players.js',
      'game.js',
      'storage.js',
      'photos.js',
      'share.js',
      'modals.js',
      'app.js',
    ]);
  });

  test('main handlers route all playable modes', () => {
    const app = read('app.js');
    for (const mode of ['survival', 'timed', 'photoblitz']) {
      assert.match(app, new RegExp(`gameMode === '${mode}'`), `missing ${mode} mode routing`);
    }
    assert.match(app, /handleGuessSubmit/);
    assert.match(app, /handlePass/);
    assert.match(app, /handleGiveUp/);
  });

  test('data-driven panels avoid HTML string interpolation', () => {
    const app = read('app.js');
    const unsafeWrites = app
      .split('\n')
      .filter(line => line.includes('.innerHTML') && !line.includes("= ''"));
    assert.deepEqual(unsafeWrites, []);
  });
});
