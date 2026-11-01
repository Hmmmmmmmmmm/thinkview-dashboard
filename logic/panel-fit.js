/* Shared non-scrolling panel pages and accessible out-of-panel editors. */
(function () {
  "use strict";
  function editor(root, content, title) {
    var marker = document.createComment("panel editor"), dialog = document.createElement("dialog");
    content.before(marker); content.hidden = true;
    dialog.className = "panel-editor";
    var heading = document.createElement("h2"), close = document.createElement("button");
    heading.textContent = title; close.type = "button"; close.textContent = "Done"; close.className = "panel-editor-close";
    dialog.append(heading, close); document.body.append(dialog);
    function hide() { dialog.close(); }
    close.onclick = hide;
    dialog.addEventListener("close", function () { content.hidden = true; marker.after(content); });
    return {
      open: function () { content.hidden = false; dialog.append(content); if (content.tagName === "DETAILS") content.open = true; dialog.showModal(); },
      destroy: function () { if (dialog.open) dialog.close(); marker.after(content); content.hidden = true; marker.remove(); dialog.remove(); }
    };
  }
  function pages(root, list, itemHeight) {
    var page = 0, count = 1, nav = document.createElement("div"), previous = document.createElement("button"), next = document.createElement("button"), label = document.createElement("span");
    nav.className = "panel-pages"; previous.type = next.type = "button"; previous.textContent = "‹"; next.textContent = "›";
    previous.setAttribute("aria-label", "Previous page"); next.setAttribute("aria-label", "Next page"); label.setAttribute("aria-live", "polite");
    nav.append(previous, label, next); root.append(nav);
    function render() {
      var items = Array.from(list.children), capacity = Math.max(1, Math.floor(list.clientHeight / itemHeight));
      count = Math.max(1, Math.ceil(items.length / capacity)); page = Math.min(page, count - 1);
      items.forEach(function (item, index) { item.hidden = index < page * capacity || index >= (page + 1) * capacity; });
      label.textContent = (page + 1) + " / " + count; previous.disabled = page === 0; next.disabled = page >= count - 1;
      // Reserve a constant footer so page capacity cannot oscillate at a breakpoint.
      nav.style.visibility = count > 1 ? "visible" : "hidden";
    }
    previous.onclick = function () { page = Math.max(0, page - 1); render(); };
    next.onclick = function () { page++; render(); };
    var resize = new ResizeObserver(render), mutation = new MutationObserver(function () { page = 0; render(); });
    resize.observe(list); mutation.observe(list, { childList: true }); render();
    return function () { resize.disconnect(); mutation.disconnect(); nav.remove(); };
  }
  window.DashboardPanelFit = { editor: editor, pages: pages };
})();
