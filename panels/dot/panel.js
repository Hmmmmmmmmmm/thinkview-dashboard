var cleanupCore = ctx.host.core.dot(), root = ctx.root, list = root.querySelector('.dot-notifications');
var unsubscribe = ctx.host.notifications.subscribe(function (entries) {
  list.textContent = '';
  entries.filter(function (entry) { return entry.source === 'dot'; }).forEach(function (entry) {
    var row = document.createElement('div'), content = document.createElement('span'), dismiss = document.createElement('button');
    row.className = 'dot-notification'; content.textContent = entry.title + (entry.message ? ': ' + entry.message : '');
    dismiss.type = 'button'; dismiss.textContent = 'Dismiss'; dismiss.setAttribute('aria-label', 'Dismiss ' + entry.title);
    dismiss.addEventListener('click', function () { ctx.host.notifications.dismiss(entry.id); });
    row.appendChild(content); row.appendChild(dismiss); list.appendChild(row);
  });
});
return function () { unsubscribe(); if (typeof cleanupCore === 'function') cleanupCore(); };
