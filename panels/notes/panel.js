var root = ctx.root, input = root.querySelector('.notes-input'), copy = root.querySelector('.notes-copy'), page = 0, chunks = [''];
input.value = ctx.storage.get('text', '');
var editor = DashboardPanelFit.editor(root, input, 'Notes');
function display() {
  page = Math.min(page, chunks.length - 1); copy.textContent = chunks[page];
  root.querySelector('[data-notes-page]').textContent = (page + 1) + ' / ' + chunks.length;
  root.querySelector('[data-notes-prev]').disabled = page === 0;
  root.querySelector('[data-notes-next]').disabled = page === chunks.length - 1;
  root.querySelector('.notes-pagination').style.visibility = chunks.length > 1 ? 'visible' : 'hidden';
}
function paginate() {
  if (!copy.clientHeight || !copy.clientWidth) return;
  var text = input.value, at = 0; chunks = [];
  while (at < text.length) {
    var low = 1, high = text.length - at, best = 1;
    while (low <= high) { var mid = Math.floor((low + high) / 2); copy.textContent = text.slice(at, at + mid); if (copy.scrollHeight <= copy.clientHeight + 1) { best = mid; low = mid + 1; } else high = mid - 1; }
    var segment = text.slice(at, at + best), boundary = segment.lastIndexOf(' ');
    if (at + best < text.length && boundary > best * .6) best = boundary + 1;
    chunks.push(text.slice(at, at + best)); at += best;
  }
  if (!chunks.length) chunks = ['']; display();
}
function save() { ctx.storage.set('text', input.value); paginate(); }
function edit() { editor.open(); input.focus(); }
function previous() { page = Math.max(0, page - 1); display(); }
function next() { page = Math.min(chunks.length - 1, page + 1); display(); }
input.addEventListener('input', save); root.querySelector('[data-notes-edit]').onclick = edit;
root.querySelector('[data-notes-prev]').onclick = previous; root.querySelector('[data-notes-next]').onclick = next;
var observer = new ResizeObserver(paginate); observer.observe(copy); paginate();
return function () { input.removeEventListener('input', save); observer.disconnect(); editor.destroy(); root.querySelector('[data-notes-edit]').onclick = null; root.querySelector('[data-notes-prev]').onclick = root.querySelector('[data-notes-next]').onclick = null; };
