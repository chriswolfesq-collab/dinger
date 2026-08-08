// Pure game logic — no DOM access here, so it's easy to reason about/test.

const CONFIG = {
  basePoints: 100,
  cluePenalty: 10,
  missPenalty: 15,
  maxClues: 10,
  startDate: '2024-01-01', // day 0 anchor for puzzle numbering + rotation
  survivalStartTime: 60,
  survivalMaxClues: 3,
  survivalSkipPenalty: 3,
  survivalClueBonus: [5, 3, 1], // bonus seconds indexed by (cluesRevealed - 1)
  timedStartTime: 45,
  timedMaxClues: 3,
  timedCluePenalty: 5,
  photoBlitzStartTime: 60,
  // Photo Blitz only shows color photos, with a short exception list for
  // legends whose only available Wikipedia photo is black-and-white.
  photoBlitzBwAllowlist: ['ruth', 'gehrig', 'wagner', 'young', 'mathewson', 'paige', 'joshgibson', 'speaker', 'hornsby', 'robinson'],
};
