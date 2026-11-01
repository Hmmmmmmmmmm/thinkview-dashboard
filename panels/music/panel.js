var root = ctx.root, provider = window.ThinkViewDevice, current = null, disposed = false;
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
return function () { disposed = true; clearInterval(timer); if (unsubscribe) unsubscribe(); connect.removeEventListener('click',setup); image.removeAttribute('src'); };
