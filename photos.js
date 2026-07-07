// Player photo lookup, caching, and Photo Blitz qualification.

const PHOTO_CACHE_KEY = 'dinger_photo_cache_v1';
const PHOTO_COLOR_CACHE_KEY = 'dinger_photo_color_cache_v1';
const PHOTO_COLOR_SATURATION_THRESHOLD = 14; // avg max-min RGB channel delta; grayscale/sepia scans land well under this

// Add stable URLs here when a player's Wikipedia summary is unreliable. The
// title override avoids broad search for common names with ambiguous pages.
const PHOTO_URL_OVERRIDES = {};
const PHOTO_TITLE_OVERRIDES = {
  'Frank Thomas': 'Frank Thomas (designated hitter)',
  'Billy Williams': 'Billy Williams (left fielder)',
  'Joe Morgan': 'Joe Morgan',
  'Will Smith': 'Will Smith (catcher)',
};

function loadObjectCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistObjectCache(key, cache) {
  try {
    localStorage.setItem(key, JSON.stringify(cache));
  } catch {
    // Storage full or unavailable: cache stays in memory for this session.
  }
}

const photoCache = loadObjectCache(PHOTO_CACHE_KEY);
const photoColorCache = loadObjectCache(PHOTO_COLOR_CACHE_KEY);

async function fetchWikipediaSummary(title) {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/g, '_'))}`);
  if (!res.ok) return null;
  return res.json();
}

function looksLikeBaseballBio(summary) {
  if (!summary || summary.type === 'disambiguation') return false;
  const text = `${summary.description || ''} ${summary.extract || ''}`.toLowerCase();
  return text.includes('baseball');
}

async function findBaseballWikipediaTitle(name) {
  const query = encodeURIComponent(`${name} baseball`);
  const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=${query}`);
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data && data.query && data.query.search && data.query.search[0];
  return hit ? hit.title : null;
}

function photoCacheKeys(playerOrName) {
  const name = typeof playerOrName === 'string' ? playerOrName : playerOrName.name;
  const id = typeof playerOrName === 'string' ? null : playerOrName.id;
  return { name, id };
}

function photoOverrideFor(playerOrName) {
  const { name, id } = photoCacheKeys(playerOrName);
  if (id && PHOTO_URL_OVERRIDES[id]) return PHOTO_URL_OVERRIDES[id];
  return PHOTO_URL_OVERRIDES[name] || null;
}

function photoTitleFor(playerOrName) {
  const { name, id } = photoCacheKeys(playerOrName);
  if (id && PHOTO_TITLE_OVERRIDES[id]) return PHOTO_TITLE_OVERRIDES[id];
  return PHOTO_TITLE_OVERRIDES[name] || name;
}

async function fetchPlayerPhoto(playerOrName) {
  const { name } = photoCacheKeys(playerOrName);
  const overrideUrl = photoOverrideFor(playerOrName);
  if (overrideUrl) return overrideUrl;
  if (Object.prototype.hasOwnProperty.call(photoCache, name)) return photoCache[name];
  try {
    let summary = await fetchWikipediaSummary(photoTitleFor(playerOrName));
    if (!looksLikeBaseballBio(summary)) {
      const betterTitle = await findBaseballWikipediaTitle(name);
      if (betterTitle) {
        const betterSummary = await fetchWikipediaSummary(betterTitle);
        if (looksLikeBaseballBio(betterSummary)) summary = betterSummary;
      }
    }
    const url = (summary && ((summary.thumbnail && summary.thumbnail.source) || (summary.originalimage && summary.originalimage.source))) || null;
    photoCache[name] = url;
    persistObjectCache(PHOTO_CACHE_KEY, photoCache);
    return url;
  } catch {
    photoCache[name] = null;
    persistObjectCache(PHOTO_CACHE_KEY, photoCache);
    return null;
  }
}

function loadImageForColorCheck(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
}

async function isColorPhotoUrl(url) {
  if (Object.prototype.hasOwnProperty.call(photoColorCache, url)) return photoColorCache[url];
  let verdict = true;
  try {
    const img = await loadImageForColorCheck(url);
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    let totalDelta = 0;
    let pixelCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      totalDelta += Math.max(r, g, b) - Math.min(r, g, b);
      pixelCount += 1;
    }
    verdict = (totalDelta / pixelCount) > PHOTO_COLOR_SATURATION_THRESHOLD;
  } catch {
    verdict = true;
  }
  photoColorCache[url] = verdict;
  persistObjectCache(PHOTO_COLOR_CACHE_KEY, photoColorCache);
  return verdict;
}

function initialsOf(name) {
  return name
    .split(/\s+/)
    .filter(word => /^[A-Z]/.test(word))
    .map(word => word[0])
    .join('')
    .slice(0, 3);
}

async function loadPlayerPhoto(player, solved) {
  const wrap = dom['player-photo-wrap'];
  const img = dom['player-photo'];
  const placeholder = dom['player-photo-placeholder'];

  wrap.classList.toggle('photo-win', solved);
  wrap.classList.toggle('photo-loss', !solved);
  img.classList.remove('loaded');
  img.removeAttribute('src');
  placeholder.textContent = '⚾';
  placeholder.classList.remove('hidden', 'initials');

  const url = await fetchPlayerPhoto(player);
  if (!url) {
    placeholder.textContent = initialsOf(player.name);
    placeholder.classList.add('initials');
    return;
  }

  img.onload = () => {
    img.classList.add('loaded');
    placeholder.classList.add('hidden');
  };
  img.onerror = () => {
    placeholder.textContent = initialsOf(player.name);
    placeholder.classList.add('initials');
  };
  img.alt = player.name;
  img.src = url;
}

async function tryPreparePhotoBlitzEntry(id) {
  const player = PLAYERS.find(p => p.id === id);
  if (!player) return null;
  const url = await fetchPlayerPhoto(player);
  if (!url) return null;
  if (CONFIG.photoBlitzBwAllowlist.includes(id)) return { id, url };
  const isColor = await isColorPhotoUrl(url);
  return isColor ? { id, url } : null;
}

async function findNextPhotoBlitzEntry() {
  for (;;) {
    if (!photoBlitzProgress.queue.length) {
      photoBlitzProgress.queue = buildSurvivalQueue();
    }
    const id = photoBlitzProgress.queue.shift();
    if (!id) return null;
    const entry = await tryPreparePhotoBlitzEntry(id);
    if (entry) return entry;
  }
}
