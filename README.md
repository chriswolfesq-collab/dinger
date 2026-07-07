# Dinger

Dinger is a browser-based daily MLB player guessing game with Daily, Survival, Timed, and Photo Blitz modes.

## Run Locally

Open `index.html` in a browser, or serve the folder with any static file server.

## Tests

```sh
npm test
```

The test script intentionally targets `tests/` only. The `Backups/` folder is an archival copy and should not be included in normal test discovery.

## Project Layout

- `players.js` contains the player roster, accepted names, daily clues, and arcade-mode clues.
- `game.js` contains pure game logic with no DOM access.
- `storage.js` handles local saved progress, stats, and best scores.
- `photos.js` handles player photo lookup, photo caching, and Photo Blitz photo qualification.
- `share.js` handles share text, share images, and platform/clipboard fallbacks.
- `modals.js` handles modal focus behavior.
- `app.js` wires state, rendering, game modes, and events together.

## Release Notes

When changing browser-loaded assets, bump the query-string version in `index.html` so users do not get stale cached scripts or styles.
