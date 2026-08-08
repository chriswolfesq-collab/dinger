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