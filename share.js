// Share text, generated share-card images, and platform fallbacks.

function gameShareUrl() {
  return window.location.href.split('#')[0];
}

function resetShareButtonSoon() {
  setTimeout(() => { dom['share-btn'].textContent = 'Share Result'; }, 2000);
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCenteredText(ctx, text, x, y, maxWidth, fontSize, fontFamily, color) {
  ctx.fillStyle = color;
  ctx.font = `800 ${fontSize}px ${fontFamily}`;
  let size = fontSize;
  while (ctx.measureText(text).width > maxWidth && size > 22) {
    size -= 2;
    ctx.font = `800 ${size}px ${fontFamily}`;
  }
  ctx.fillText(text, x, y);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Unable to create share image'));
    }, 'image/png');
  });
}

function paintShareCard(ctx, card) {
  const size = 1080;
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#041226');
  bg.addColorStop(0.55, '#0b2447');
  bg.addColorStop(1, '#12386a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(191, 13, 62, 0.92)';
  ctx.beginPath();
  ctx.moveTo(0, 790);
  ctx.bezierCurveTo(190, 710, 350, 710, 540, 790);
  ctx.bezierCurveTo(730, 710, 890, 710, 1080, 790);
  ctx.lineTo(1080, 1080);
  ctx.lineTo(0, 1080);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(245, 248, 255, 0.72)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 825);
  ctx.bezierCurveTo(190, 745, 350, 745, 540, 825);
  ctx.bezierCurveTo(730, 745, 890, 745, 1080, 825);
  ctx.stroke();

  ctx.fillStyle = 'rgba(245, 248, 255, 0.08)';
  for (let i = 0; i < 12; i += 1) {
    ctx.fillRect(i * 110 - 40, 0, 4, 1080);
  }

  roundRect(ctx, 90, 110, 900, 760, 36);
  ctx.fillStyle = 'rgba(7, 27, 54, 0.92)';
  ctx.fill();
  ctx.strokeStyle = '#2a5f9e';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawCenteredText(ctx, 'DINGER', 540, 210, 760, 108, 'Arial, sans-serif', '#f5f8ff');
  ctx.fillStyle = '#bf0d3e';
  ctx.font = '800 30px Arial, sans-serif';
  ctx.fillText(card.kicker, 540, 292);

  ctx.fillStyle = '#f5f8ff';
  ctx.font = '900 150px Arial, sans-serif';
  ctx.fillText(String(card.value), 540, 460);
  ctx.fillStyle = '#a9bdd8';
  ctx.font = '800 34px Arial, sans-serif';
  ctx.fillText(card.label, 540, 550);

  ctx.fillStyle = card.highlight ? '#f5f8ff' : '#e83a59';
  ctx.font = '800 40px Arial, sans-serif';
  ctx.fillText(card.status, 540, 636);

  if (card.detail) {
    ctx.fillStyle = '#a9bdd8';
    ctx.font = '700 28px Arial, sans-serif';
    ctx.fillText(card.detail, 540, 682);
  }

  ctx.fillStyle = '#d8e8ff';
  ctx.font = '700 30px Arial, sans-serif';
  ctx.fillText('Play at', 540, 790);
  drawCenteredText(ctx, gameShareUrl(), 540, 835, 760, 34, 'Arial, sans-serif', '#f5f8ff');
}

async function buildShareImageFile(card, filename) {
  const size = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  paintShareCard(canvas.getContext('2d'), card);
  const blob = await canvasToBlob(canvas);
  return new File([blob], filename, { type: 'image/png' });
}

function dailyShareConfig() {
  let squares = '';
  for (let i = 1; i < progress.clueIndex; i += 1) squares += '🟨';
  squares += progress.solved ? '✅' : '❌';
  const clueCount = maxCluesFor(today.player);
  const status = progress.solved ? `${progress.clueIndex}/${clueCount}` : `X/${clueCount}`;
  const stats = loadStats();
  const solvedText = progress.solved
    ? `Solved in ${progress.clueIndex}/${clueCount} clues`
    : `Missed after ${progress.clueIndex}/${clueCount} clues`;
  return {
    title: `Dinger #${today.puzzleNumber}`,
    text: `⚾ Dinger #${today.puzzleNumber} — ${squares} ${status} — ${progress.score} pts`,
    filename: `dinger-${today.puzzleNumber}.png`,
    card: {
      kicker: `DAILY MLB PLAYER GAME  •  PUZZLE #${today.puzzleNumber}`,
      value: progress.score,
      label: 'POINTS',
      status: solvedText,
      detail: `Current streak: ${stats.currentStreak}  •  Best: ${stats.maxStreak}`,
      highlight: progress.solved,
    },
  };
}

function arcadeShareConfig(mode) {
  const configs = {
    survival: {
      title: 'Dinger Survival',
      label: 'PLAYERS SOLVED',
      kicker: 'SURVIVAL MODE',
      value: survivalProgress.solved,
      best: survivalBest,
      bestLabel: 'solved',
      filename: `dinger-survival-${survivalProgress.solved}.png`,
      text: `⚾ Dinger Survival — ${survivalProgress.solved} solved (best: ${survivalBest})`,
    },
    timed: {
      title: 'Dinger Timed',
      label: 'PLAYERS CORRECT',
      kicker: 'TIMED MODE',
      value: timedProgress.solved,
      best: timedBest,
      bestLabel: 'correct',
      filename: `dinger-timed-${timedProgress.solved}.png`,
      text: `⚾ Dinger Timed — ${timedProgress.solved} correct (best: ${timedBest})`,
    },
    photoblitz: {
      title: 'Dinger Photo Blitz',
      label: 'PLAYERS NAMED',
      kicker: 'PHOTO BLITZ',
      value: photoBlitzProgress.solved,
      best: photoBlitzBest,
      bestLabel: 'named',
      filename: `dinger-photo-blitz-${photoBlitzProgress.solved}.png`,
      text: `⚾ Dinger Photo Blitz — ${photoBlitzProgress.solved} named (best: ${photoBlitzBest})`,
    },
  };
  const config = configs[mode];
  const isNewBest = config.value > 0 && config.value >= config.best;
  return {
    title: config.title,
    text: config.text,
    filename: config.filename,
    card: {
      kicker: config.kicker,
      value: config.value,
      label: config.label,
      status: isNewBest ? 'New personal best!' : `Best run: ${config.best} ${config.bestLabel}`,
      highlight: isNewBest,
    },
  };
}

function activeShareConfig() {
  if (gameMode === 'survival') return arcadeShareConfig('survival');
  if (gameMode === 'timed') return arcadeShareConfig('timed');
  if (gameMode === 'photoblitz') return arcadeShareConfig('photoblitz');
  return dailyShareConfig();
}

async function shareWithFallback(config, imageFile) {
  const url = gameShareUrl();
  const shareData = {
    title: config.title,
    text: `${config.text}\n${url}`,
    url,
  };
  const imageShareData = imageFile
    ? { title: shareData.title, text: shareData.text, files: [imageFile] }
    : null;

  if (imageShareData && navigator.share && (!navigator.canShare || navigator.canShare(imageShareData))) {
    try {
      await navigator.share(imageShareData);
      dom['share-btn'].textContent = 'Shared!';
      resetShareButtonSoon();
    } catch (err) {
      dom['share-btn'].textContent = err && err.name !== 'AbortError' ? 'Share failed' : 'Share Result';
      if (err && err.name !== 'AbortError') resetShareButtonSoon();
    }
    return;
  }

  if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
    try {
      await navigator.share(shareData);
      dom['share-btn'].textContent = 'Shared!';
      resetShareButtonSoon();
    } catch (err) {
      dom['share-btn'].textContent = err && err.name !== 'AbortError' ? 'Share failed' : 'Share Result';
      if (err && err.name !== 'AbortError') resetShareButtonSoon();
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(`${config.text}\n${url}`);
    dom['share-btn'].textContent = imageFile ? 'Copied link!' : 'Copied result!';
  } catch {
    dom['share-btn'].textContent = `${config.text} ${url}`;
  }
  resetShareButtonSoon();
}

async function handleShare() {
  const config = activeShareConfig();
  let imageFile = null;
  dom['share-btn'].disabled = true;
  dom['share-btn'].textContent = 'Preparing...';

  try {
    imageFile = await buildShareImageFile(config.card, config.filename);
  } catch {
    imageFile = null;
  }

  dom['share-btn'].disabled = false;
  await shareWithFallback(config, imageFile);
}
