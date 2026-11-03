var root = ctx.root, provider = window.ThinkViewDevice, current = null, disposed = false;
var levelNode = root.querySelector('.music-level'), levelTrack = root.querySelector('.music-level-track'), levelStatus = root.querySelector('[data-music-level-status]'), levelConnect = root.querySelector('.music-level-connect'), levelRetry = root.querySelector('.music-level-retry'), levelDisable = root.querySelector('.music-level-disable');
var levelState = null, levelEnabled = false, levelTimer = null, levelController = null, levelGeneration = 0, expiryTimer = null, intersecting = true, levelPermanentFailure = false, retryAt = 0, retryDelay = 5000, disablePending = false, lastCapability = null;
function visible() { return !document.hidden && intersecting; }
function showLevel(level) {
  clearTimeout(expiryTimer); expiryTimer = null;
  var valid = level && level.available && level.state === 'active' && level.measuredAt <= Date.now() && Date.now() - level.measuredAt <= level.staleAfterMs;
  levelNode.hidden = !valid;
  if (valid) { expiryTimer = setTimeout(function () { showLevel({state:'stale'}); }, Math.max(1, level.staleAfterMs - (Date.now() - level.measuredAt) + 1)); var percent = Math.round(level.value * 100); levelTrack.querySelector('span').style.width = percent + '%'; levelTrack.setAttribute('aria-valuenow', String(percent)); }
  else { levelTrack.querySelector('span').style.width = '0%'; levelTrack.setAttribute('aria-valuenow', '0'); }
  var labels = { disabled:'Output intensity is off', permission_required:'Output intensity needs Android permission', permission_denied:'Output intensity permission denied', waiting:'Waiting for output intensity', stale:'Output intensity unavailable or stale', unsupported:'Output intensity unsupported', error:'Output intensity unavailable' };
  levelStatus.textContent = valid ? '' : (level ? labels[level.state] || 'Output intensity unavailable' : 'Output intensity unavailable');
}
function stopLevel() { levelGeneration++; clearTimeout(expiryTimer); expiryTimer = null; clearTimeout(levelTimer); levelTimer = null; if (levelController) levelController.abort(); levelController = null; showLevel(levelState && levelState.state === 'active' ? {state:'stale'} : levelState); }
function startLevel() {
  if (disposed || !levelEnabled || disablePending || !visible() || levelTimer || levelController || levelPermanentFailure) return;
  if (Date.now() < retryAt) { levelTimer = setTimeout(function () { levelTimer = null; startLevel(); }, retryAt - Date.now()); return; }
  var generation = levelGeneration; levelController = new AbortController();
  provider.musicLevel(levelController.signal).then(function (level) {
    if (disposed || generation !== levelGeneration) return;
    levelController = null; retryAt = 0; retryDelay = 5000; levelState = level; showLevel(level);
    if (['waiting','active','stale'].indexOf(level.state) < 0) { levelEnabled = false; levelConnect.hidden = false; return; }
    levelTimer = setTimeout(function () { levelTimer = null; startLevel(); }, 100);
  }).catch(function (error) {
    if (disposed || generation !== levelGeneration) return;
    levelController = null; showLevel({state:'error'});
    if (error && [404, 405, 501].indexOf(error.status) >= 0) { levelPermanentFailure = true; levelRetry.hidden = false; return; }
    retryAt = Date.now() + retryDelay; retryDelay = Math.min(60000, retryDelay * 2); startLevel();
  });
}
function visibilityChanged() { if (visible()) startLevel(); else stopLevel(); }
var observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function (entries) { intersecting = entries.some(function (entry) { return entry.isIntersecting; }); visibilityChanged(); }) : null;
if (observer) { intersecting = false; observer.observe(root); }
document.addEventListener('visibilitychange', visibilityChanged);
function retryLevel() { levelPermanentFailure = false; retryAt = 0; retryDelay = 5000; levelRetry.hidden = true; startLevel(); }
function toggleLevel(disable) {
  levelConnect.disabled = true; levelDisable.disabled = true;
  if (disable) { disablePending = true; levelEnabled = false; stopLevel(); levelStatus.textContent = 'Turning output intensity off…'; levelRetry.hidden = true; }
  else { levelPermanentFailure = false; retryAt = 0; retryDelay = 5000; }
  provider.command('music.levelAccess', !disable).catch(function () {
    if (disposed) return;
    disablePending = false; levelEnabled = disable; showLevel({state:'error'}); if (disable) startLevel();
  }).finally(function () { if (!disposed && !disablePending) { levelConnect.disabled = false; levelDisable.disabled = false; } });
}
function enableLevel() { toggleLevel(false); }
function disableLevel() { toggleLevel(true); }
levelConnect.addEventListener('click', enableLevel);
levelDisable.addEventListener('click', disableLevel);
levelRetry.addEventListener('click', retryLevel);
var title = root.querySelector('[data-music-title]'), artist = root.querySelector('[data-music-artist]'), album = root.querySelector('[data-music-album]'), state = root.querySelector('[data-music-state]'), image = root.querySelector('.music-art'), connect = root.querySelector('.music-connect'), timeline = root.querySelector('.music-timeline');
function time(ms) { var seconds = Math.max(0, Math.floor(ms / 1000)); return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); }
function tick() {
  if (!current || !current.durationMs || current.positionMs === null) { timeline.hidden = true; return; }
  timeline.hidden = false;
  var elapsed = current.state === 'playing' && current.observedAt ? Math.max(0, Date.now() - current.observedAt) : 0;
  var position = Math.min(current.durationMs, current.positionMs + elapsed), progress = timeline.querySelector('progress');
  progress.max = current.durationMs; progress.value = position;
  root.querySelector('[data-music-position]').textContent = time(position); root.querySelector('[data-music-duration]').textContent = time(current.durationMs);
}
function render(snapshot) {
  current = snapshot.available && snapshot.status && snapshot.status.music;
  if (snapshot.available) {
    var capability = snapshot.musicLevelVersion === 1 ? 1 : 0;
    if (lastCapability !== null && capability !== lastCapability) { levelPermanentFailure = false; retryAt = 0; retryDelay = 5000; }
    lastCapability = capability;
  }
  var supported = snapshot.musicLevelVersion === 1 && snapshot.commands.indexOf('music.levelAccess') >= 0 && provider && provider.musicLevel;
  var nextLevel = supported && current && current.audioLevel;
  var shouldPoll = !!nextLevel && nextLevel.enabled === true && ['waiting','active','stale'].indexOf(nextLevel.state) >= 0;
  if (disablePending && nextLevel && nextLevel.enabled === false) { disablePending = false; levelConnect.disabled = false; levelDisable.disabled = false; }
  levelConnect.hidden = !supported || !nextLevel || shouldPoll || disablePending;
  levelDisable.hidden = !supported || !nextLevel || (nextLevel.enabled !== true && !disablePending);
  if (disablePending) { levelStatus.textContent = 'Turning output intensity off…'; }
  else if (!shouldPoll) { levelEnabled = false; stopLevel(); levelState = nextLevel; levelRetry.hidden = true; showLevel(levelState); }
  else { levelEnabled = true; levelRetry.hidden = !levelPermanentFailure; if (!levelController && !levelTimer && !levelPermanentFailure) { levelState = nextLevel; showLevel(levelState); startLevel(); } }
  root.dataset.playing = String(!!current && current.state === 'playing');
  connect.hidden = !current || current.access || snapshot.commands.indexOf('music.access') < 0;
  image.hidden = !current || !current.artwork;
  if (!image.hidden && image.src !== current.artwork) image.src = current.artwork;
  if (image.hidden) image.removeAttribute('src');
  title.textContent = current ? current.title || (current.state === 'playing' ? 'Audio playing' : current.state === 'paused' ? 'Paused' : 'Nothing playing') : 'Music unavailable';
  artist.textContent = current ? current.artist || current.source : '';
  album.textContent = current ? current.album : '';
  state.textContent = current && current.state !== 'idle' ? ({playing:'Playing',paused:'Paused',buffering:'Loading'})[current.state] : '';
  title.title = title.textContent; artist.title = artist.textContent; album.title = album.textContent; tick();
}
function setup() { connect.disabled = true; provider.command('music.access', true).catch(function (error) { if (!disposed) { artist.textContent = error.message; } }).finally(function () { if (!disposed) connect.disabled = false; }); }
connect.addEventListener('click', setup);
var unsubscribe = provider && provider.subscribe ? provider.subscribe(render, { intervalMs:2500 }) : null;
if (!unsubscribe) render({available:false,commands:[]});
var timer = setInterval(tick,1000);
return function () { disposed = true; stopLevel(); if (observer) observer.disconnect(); document.removeEventListener('visibilitychange', visibilityChanged); levelConnect.removeEventListener('click', enableLevel); levelDisable.removeEventListener('click', disableLevel); levelRetry.removeEventListener('click', retryLevel); clearInterval(timer); if (unsubscribe) unsubscribe(); connect.removeEventListener('click',setup); image.removeAttribute('src'); };
