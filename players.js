function makeCuratedExpansionPlayer(row) {
  const [, name, acceptText, era, clue1, clue2, clue3, clue4, clue5, finalClue, survival1, survival2, survival3] = row;
  return {
    id: dingerCuratedId(name),
    name,
    accept: acceptText.split(';'),
    era,
    clues: [
      dingerEraWindow(era),
      clue1,
      clue2,
      clue3,
      dingerCareerStart(era),
      clue4,
      clue5,
      survival1,
      dingerCareerEnd(era),
      finalClue,
    ],
    survivalClues: [survival1, survival2, survival3],
  };
}

PLAYERS.push(...CURATED_EXPANSION_ROWS.map(makeCuratedExpansionPlayer));

// Rotation order for the daily puzzle — deliberately shuffled, not alphabetical
// or grouped by era, so difficulty varies day to day.
const DAILY_ORDER = [
  'mantle', 'gehrig', 'bonds', 'ozzie', 'gwynn', 'thome', 'ryan', 'chipper',
  'ortiz', 'wagner', 'mays', 'betts', 'koufax', 'pedro', 'jeter', 'musial',
  'maddux', 'arod', 'williams', 'trout', 'griffey', 'bench', 'rose', 'fernando',
  'ichiro', 'schmidt', 'ruth', 'harper', 'johnson', 'pujols', 'ripken', 'eckersley',
  'jackson', 'degrom', 'rivera', 'clemens', 'robinson', 'yount', 'aaron', 'boggs',
  'young', 'kershaw', 'mathewson', 'judge', 'hornsby', 'manny', 'berra', 'freeman',
  'clemente', 'thomas', 'paige', 'puckett', 'joshgibson', 'ohtani', 'henderson', 'murray',
  'brett', 'guerrero', 'pudge', 'bobgibson', 'seaver', 'piazza', 'molitor', 'sosa',
  'mcgwire', 'verlander', 'scherzer', 'cabrera', 'posey', 'larkin', 'smoltz', 'glavine',
  'sandberg', 'acuna', 'walker', 'fingers', 'mauer', 'winfield', 'speaker', 'bagwell',
  'nomar', 'killebrew', 'soto', 'campanella', 'palmer', 'gossage', 'dawson', 'beltre',
  'snider', 'carlton', 'ford', 'hoffman', 'kaline', 'yaz', 'rice', 'mattingly',
  'mccovey', 'sutter', 'banks', 'biggio', 'feller', 'spahn', 'mussina', 'sabathia',
  'halladay', 'greinke', 'felix', 'sale', 'hamels', 'lincecum', 'price', 'gerritcole',
  'machado', 'arenado', 'altuve', 'correa', 'ymolina', 'votto', 'goldschmidt', 'stanton',
  'jramirez', 'lindor', 'seager', 'turner', 'yordan', 'bautista', 'tulowitzki', 'wright',
  'utley', 'rollins', 'howard', 'konerko', 'teixeira', 'canseco', 'baines', 'mccutchen',
  'willclark', 'olerud', 'delgado', 'andruw', 'sheffield', 'sexson', 'ventura', 'giambi',
];

function dingerOrderHash(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const curatedExpansionIds = PLAYERS
  .filter(player => !DAILY_ORDER.includes(player.id))
  .map(player => player.id)
  .sort((a, b) => dingerOrderHash(a) - dingerOrderHash(b));

DAILY_ORDER.push(...curatedExpansionIds);