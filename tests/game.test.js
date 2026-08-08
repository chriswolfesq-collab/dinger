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
