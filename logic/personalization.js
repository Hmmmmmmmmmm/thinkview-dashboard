// Local bootstrap retains user configuration and avatar across generic release updates.
try {
  var localBootstrap = window.parent !== window && window.parent.DashboardBootstrap;
  if (localBootstrap) {
    DashboardConfig = localBootstrap.config;
    var localName = DashboardConfig.companion.name, walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), node;
    while ((node = walker.nextNode())) { if (!/^(SCRIPT|STYLE)$/.test(node.parentElement.tagName)) node.nodeValue = node.nodeValue.replace(/\bDot\b/g, localName); }
    document.querySelectorAll('[aria-label], [title], [placeholder], [alt]').forEach(function (el) { ['aria-label', 'title', 'placeholder', 'alt'].forEach(function (attr) { if (el.hasAttribute(attr)) el.setAttribute(attr, el.getAttribute(attr).replace(/\bDot\b/g, localName)); }); });
    document.querySelectorAll('img.case-avatar').forEach(function (el) { el.src = localBootstrap.avatar; });
    document.getElementById('real-chat').href = DashboardConfig.companion.chatUrl;
    var manifestElement = document.getElementById('panel-manifest'), localManifest = JSON.parse(manifestElement.textContent);
    localManifest.panels.forEach(function (panel) { if (panel.id === 'dot') panel.title = localName; });
    manifestElement.textContent = JSON.stringify(localManifest);
    document.title = 'At a glance · ' + localName;
  }
} catch (e) { console.error('Local configuration unavailable:', e); }
