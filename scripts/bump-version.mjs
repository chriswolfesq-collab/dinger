#!/usr/bin/env node
// Rewrites every `?v=N` cache-busting param in index.html in one atomic
// write, so a deploy can never bump style.css/players.js/game.js/app.js's
// version and forget one of the others.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'index.html');
const html = readFileSync(indexPath, 'utf8');

const versions = [...html.matchAll(/\?v=(\d+)/g)].map(m => Number(m[1]));
if (versions.length === 0) {
  console.error('No ?v=N cache-busting params found in index.html');
  process.exit(1);
}

const current = Math.max(...versions);
const requested = process.argv[2];
const next = requested ? Number(requested) : current + 1;

if (!Number.isInteger(next) || next <= 0) {
  console.error(`Invalid version: "${requested}". Pass a positive integer, e.g. "npm run bump-version -- 14".`);
  process.exit(1);
}

writeFileSync(indexPath, html.replace(/\?v=\d+/g, `?v=${next}`));
console.log(`Bumped ${versions.length} cache-busting param(s) in index.html: v=${current} -> v=${next}`);
