// No documented bridge to the user's existing Dots conversation is available.
(function () {
  "use strict";
  window.DashboardCompanion = {
    status: function () { return "ChatGPT conversation and unread messages are unavailable on this dashboard. Open ChatGPT to continue."; },
    open: function (url) { window.open(url, "_blank", "noopener,noreferrer"); }
  };
})();
