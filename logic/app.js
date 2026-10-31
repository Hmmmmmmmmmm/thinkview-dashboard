(function () {
  "use strict";
  var $ = function (id) {
    return document.getElementById(id);
  };
  var root = document.documentElement,
    IDLE_MS = DashboardConfig.display.idleTimeoutMs,
    WEATHER_MS = DashboardConfig.display.weatherRefreshMs,
    STALE_MS = 30 * 60 * 1000;
  var DOT_URL = $("real-chat").href,
    storageAvailable = true;
  var preferences = DashboardStorage.local(DashboardConfig.storagePrefix);
  function read(key) {
    var value = preferences.get(key, null);
    storageAvailable = preferences.available;
    return value;
  }
  function write(key, value) {
    if (!preferences.set(key, value)) {
      storageAvailable = false;
      $("storage-note").textContent =
        "Browser storage is unavailable. Choices last until this page closes.";
    }
  }
  var savedMode = read("theme"),
    activeMode = savedMode === "dark" ? "dark" : "bright",
    idle = false,
    lastActivity = Date.now(),
    idleTimer,
    toastTimer,
    weatherGeneration = 0,
    weatherController = null,
    weatherBusy = false,
    weatherFailed = false,
    weatherCache = null;
  var location = read("location");
  function validLocation(p) {
    return (
      p &&
      typeof p.name === "string" &&
      typeof p.lat === "number" &&
      isFinite(p.lat) &&
      p.lat >= -90 &&
      p.lat <= 90 &&
      typeof p.lon === "number" &&
      isFinite(p.lon) &&
      p.lon >= -180 &&
      p.lon <= 180
    );
  }
  if (!validLocation(location))
    location = {
      name: DashboardConfig.weather.name,
      lat: DashboardConfig.weather.latitude,
      lon: DashboardConfig.weather.longitude,
      preview: DashboardConfig.weather.isPreview,
    };
  function locationKey(p) {
    return p.lat.toFixed(2) + "," + p.lon.toFixed(2);
  }
  function icon(name) {
    $("weather-icon").setAttribute("href", "#" + name);
  }
  function setTheme(theme) {
    root.setAttribute("data-theme", theme);
    document.querySelector('meta[name="theme-color"]').content =
      getComputedStyle(root)
        .getPropertyValue("--md-sys-color-surface")
        .trim() || "#070707";
    document.querySelectorAll("[data-mode]").forEach(function (b) {
      b.setAttribute(
        "aria-pressed",
        String(b.getAttribute("data-mode") === theme),
      );
    });
  }
  function showToast(message) {
    $("toast").textContent = message;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      $("toast").hidden = true;
    }, 4500);
  }
  function setIdle() {
    if (listening || panelDrag || panelCandidate) return;
    closePanelMenu();
    idle = true;
    root.setAttribute("data-idle", "true");
    setTheme("minimal");
    document.querySelector(".shell").inert = true;
    $("chat").inert = true;
    $("settings").inert = true;
  }
  function wake() {
    if (!idle) return;
    idle = false;
    root.setAttribute("data-idle", "false");
    setTheme(activeMode);
    syncPanels();
  }
  function syncPanels() {
    document.querySelector(".shell").inert =
      !$("chat").hidden || !$("settings").hidden;
    $("chat").inert = $("chat").hidden || !$("settings").hidden;
    $("settings").inert = $("settings").hidden;
  }
  function activity() {
    wake();
    lastActivity = Date.now();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(setIdle, IDLE_MS);
  }
  ["pointerdown", "keydown", "wheel", "input", "scroll"].forEach(
    function (name) {
      document.addEventListener(name, activity, {
        capture: true,
        passive: true,
      });
    },
  );
  var lastPointerActivity = 0;
  document.addEventListener(
    "pointermove",
    function () {
      if (Date.now() - lastPointerActivity > 1000) {
        lastPointerActivity = Date.now();
        if (idle) suppressClickUntil = Date.now() + 750;
        activity();
      }
    },
    { passive: true },
  );
  // A resting display consumes the first tap/key, so waking never sends a draft or opens a call.
  var suppressClickUntil = 0;
  ["click", "keydown", "pointerdown"].forEach(function (name) {
    window.addEventListener(
      name,
      function (e) {
        if (name === "click" && Date.now() < suppressClickUntil) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (idle) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (name !== "click") suppressClickUntil = Date.now() + 750;
          activity();
        }
      },
      true,
    );
  });
  document.querySelectorAll("[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      var mode = b.getAttribute("data-mode");
      if (mode === "minimal") {
        setIdle();
      } else {
        activeMode = mode;
        write("theme", activeMode);
        wake();
        setTheme(activeMode);
      }
    });
  });
  $("preview-rest").onclick = setIdle;
  function clock() {
    var now = new Date(),
      pad = function (n) {
        return String(n).padStart(2, "0");
      };
    $("hours").textContent = pad(now.getHours());
    $("minutes").textContent = pad(now.getMinutes());
    $("accessible-time").textContent =
      pad(now.getHours()) + ":" + pad(now.getMinutes());
    $("accessible-time").dateTime = now.toISOString();
    $("date").textContent = now.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "long",
    });
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
    $("timezone").textContent = tz.replace(/_/g, " ") + " · 24H";
    if (weatherCache) freshness();
  }
  function freshLabel() {
    var age = Date.now() - weatherCache.fetchedAt,
      stamp = new Date(weatherCache.fetchedAt).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      prefix = location.preview ? "Preview city · " : "";
    var dataAge =
      Date.now() -
      (Date.parse(weatherCache.data.current.time + "Z") -
        (weatherCache.data.utc_offset_seconds || 0) * 1000);
    if (weatherFailed || age > STALE_MS || dataAge > 2 * 60 * 60 * 1000)
      return (
        "Cached · " +
        stamp +
        " · refresh needed" +
        (location.preview ? " · Preview city" : "")
      );
    return prefix + "Updated " + stamp;
  }
  function freshness() {
    if (weatherCache) $("weather-freshness").textContent = freshLabel();
  }
  function condition(code, day) {
    if (code === 0)
      return [day ? "Clear skies" : "Clear night", day ? "sun" : "moon"];
    if (code === 1) return ["Mostly clear", day ? "sun" : "moon"];
    if (code === 2) return ["Partly cloudy", "cloud"];
    if (code === 3) return ["Overcast", "cloud"];
    if (code === 45 || code === 48) return ["Foggy", "cloud"];
    if (code >= 51 && code <= 57) return ["Light drizzle", "rain"];
    if (code >= 61 && code <= 67) return ["Rain", "rain"];
    if (code >= 71 && code <= 77) return ["Snow", "snow"];
    if (code >= 80 && code <= 82) return ["Rain showers", "rain"];
    if (code === 85 || code === 86) return ["Snow showers", "snow"];
    if (code >= 95) return ["Thunderstorms", "rain"];
    return ["Conditions unavailable", "cloud"];
  }
  function renderWeather(data) {
    var current = data.current,
      c = condition(current.weather_code, current.is_day);
    $("temperature").textContent = Math.round(current.temperature_2m);
    $("weather-description").textContent = c[0];
    icon(c[1]);
    $("weather-freshness").title =
      "Model time: " + current.time + " " + (data.timezone || "");
    $("humidity").textContent =
      "Humidity " + Math.round(current.relative_humidity_2m) + "%";
    $("high-low").textContent =
      data.daily &&
      data.daily.temperature_2m_max &&
      data.daily.temperature_2m_min
        ? "H " +
          Math.round(data.daily.temperature_2m_max[0]) +
          "°   L " +
          Math.round(data.daily.temperature_2m_min[0]) +
          "°"
        : "H —°   L —°";
    freshness();
  }
  function cacheValid(cache) {
    return (
      cache &&
      cache.key === locationKey(location) &&
      typeof cache.fetchedAt === "number" &&
      cache.fetchedAt <= Date.now() + 60000 &&
      cache.data &&
      cache.data.current &&
      typeof cache.data.current.temperature_2m === "number" &&
      typeof cache.data.current.relative_humidity_2m === "number" &&
      typeof cache.data.current.weather_code === "number"
    );
  }
  function loadCache() {
    weatherCache = null;
    weatherFailed = false;
    var cache = read("weather");
    if (cacheValid(cache)) {
      weatherCache = cache;
      renderWeather(cache.data);
    } else {
      $("temperature").textContent = "--";
      $("weather-description").textContent = "Getting weather…";
      $("humidity").textContent = "Humidity —%";
      $("high-low").textContent = "H —°   L —°";
      $("weather-freshness").textContent = "Fetching latest";
      icon("cloud");
    }
  }
  async function jsonFetch(url, signal) {
    var response = await fetch(url, {
      signal: signal,
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) throw Error("HTTP " + response.status);
    return response.json();
  }
  async function refreshWeather() {
    var generation = ++weatherGeneration;
    if (weatherController) weatherController.abort();
    var controller = new AbortController();
    weatherController = controller;
    weatherBusy = true;
    $("refresh-weather").disabled = true;
    var timer = setTimeout(function () {
      controller.abort();
    }, 14000);
    var key = locationKey(location);
    try {
      var url =
        "https://api.open-meteo.com/v1/forecast?latitude=" +
        location.lat.toFixed(2) +
        "&longitude=" +
        location.lon.toFixed(2) +
        "&current=temperature_2m,relative_humidity_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2";
      var data = await jsonFetch(url, controller.signal);
      if (generation !== weatherGeneration || key !== locationKey(location))
        return;
      if (!cacheValid({ key: key, fetchedAt: Date.now(), data: data }))
        throw Error("Invalid weather response");
      weatherFailed = false;
      weatherCache = { key: key, fetchedAt: Date.now(), data: data };
      write("weather", weatherCache);
      renderWeather(data);
    } catch (e) {
      if (generation !== weatherGeneration) return;
      weatherFailed = true;
      if (weatherCache) freshness();
      else {
        $("weather-description").textContent = "Weather unavailable";
        $("weather-freshness").textContent = "Check connection · tap refresh";
      }
    } finally {
      clearTimeout(timer);
      if (generation === weatherGeneration) {
        weatherBusy = false;
        $("refresh-weather").disabled = false;
      }
    }
  }
  function chooseLocation(next) {
    searchGeneration++;
    location = next;
    write("location", location);
    $("location-name").textContent = location.name;
    loadCache();
    refreshWeather();
    $("settings-status").textContent = "Weather set to " + location.name + ".";
  }
  $("refresh-weather").onclick = refreshWeather;
  var panelReturn = null;
  function openSettings() {
    closePanelMenu();
    panelReturn = document.activeElement;
    $("settings").hidden = false;
    syncPanels();
    $("settings-close").focus();
  }
  function closeSettings() {
    $("settings").hidden = true;
    syncPanels();
    if (panelReturn) panelReturn.focus();
  }
  $("settings-open").onclick = openSettings;
  $("location-open").onclick = openSettings;
  $("settings-close").onclick = closeSettings;
  function openChat() {
    closePanelMenu();
    $("chat").hidden = false;
    syncPanels();
    $("close-chat").focus();
  }
  $("open-chat").onclick = openChat;
  $("close-chat").onclick = function () {
    stopDictation();
    $("chat").hidden = true;
    syncPanels();
    $("open-chat").focus();
  };
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (!$("settings").hidden) closeSettings();
      else if (!$("chat").hidden) $("close-chat").click();
    }
    if (e.key === "Tab") {
      var panel = !$("settings").hidden
        ? $("settings")
        : !$("chat").hidden
          ? $("chat")
          : null;
      if (!panel) return;
      var focusable = Array.from(
        panel.querySelectorAll(
          "button:not(:disabled),a[href],input,textarea,summary",
        ),
      ).filter(function (el) {
        return el.getClientRects().length;
      });
      var first = focusable[0],
        last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  var searchGeneration = 0;
  $("city-form").onsubmit = async function (e) {
    e.preventDefault();
    var query = $("city-search").value.trim();
    if (query.length < 2) return;
    var generation = ++searchGeneration;
    $("settings-status").textContent = "Finding places…";
    $("search-results").textContent = "";
    var controller = new AbortController(),
      timer = setTimeout(function () {
        controller.abort();
      }, 14000);
    try {
      var result = await jsonFetch(
        "https://geocoding-api.open-meteo.com/v1/search?name=" +
          encodeURIComponent(query) +
          "&count=5&language=en&format=json",
        controller.signal,
      );
      if (generation !== searchGeneration) return;
      if (!result.results || !result.results.length) {
        $("settings-status").textContent =
          "No city found. Try a nearby city or coordinates.";
        return;
      }
      $("settings-status").textContent = "Choose your location:";
      result.results.forEach(function (place) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "text-button";
        var label = [place.name, place.admin1, place.country]
          .filter(Boolean)
          .filter(function (v, i, a) {
            return a.indexOf(v) === i;
          })
          .join(", ");
        button.textContent = label;
        button.onclick = function () {
          searchGeneration++;
          chooseLocation({
            name: place.name,
            lat: Number(place.latitude),
            lon: Number(place.longitude),
            preview: false,
          });
          $("search-results").textContent = "";
        };
        $("search-results").appendChild(button);
      });
    } catch (e) {
      if (generation === searchGeneration)
        $("settings-status").textContent =
          "City search unavailable. Try coordinates or check your connection.";
    } finally {
      clearTimeout(timer);
    }
  };
  $("coordinates-form").onsubmit = function (e) {
    e.preventDefault();
    var lat = Number($("latitude").value),
      lon = Number($("longitude").value),
      next = {
        name: lat.toFixed(2) + "°, " + lon.toFixed(2) + "°",
        lat: lat,
        lon: lon,
        preview: false,
      };
    if (validLocation(next)) chooseLocation(next);
  };
  var locating = false;
  $("use-location").onclick = function () {
    if (!navigator.geolocation) {
      $("settings-status").textContent =
        "Location is unavailable. Search a city instead.";
      return;
    }
    if (locating) return;
    locating = true;
    var generation = ++searchGeneration;
    $("use-location").disabled = true;
    $("settings-status").textContent = "Waiting for this device’s location…";
    navigator.geolocation.getCurrentPosition(
      function (position) {
        locating = false;
        $("use-location").disabled = false;
        if (generation !== searchGeneration) return;
        chooseLocation({
          name: "Current location",
          lat: Number(position.coords.latitude.toFixed(2)),
          lon: Number(position.coords.longitude.toFixed(2)),
          preview: false,
        });
      },
      function () {
        locating = false;
        $("use-location").disabled = false;
        if (generation === searchGeneration)
          $("settings-status").textContent =
            "Location unavailable or denied. Search your city or enter coordinates.";
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    );
  };
  function inputChanged() {
    $("send-message").disabled = !$("message-input").value.trim();
    $("message-input").style.height = "44px";
    $("message-input").style.height =
      Math.min($("message-input").scrollHeight, 115) + "px";
  }
  $("message-input").addEventListener("input", inputChanged);
  $("message-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      addPreview();
    }
  });
  function addPreview() {
    var value = $("message-input").value.trim();
    if (!value) return;
    stopDictation();
    var message = document.createElement("div");
    message.className = "message user";
    var author = document.createElement("span");
    author.className = "message-author";
    author.textContent = "You · local preview";
    message.appendChild(author);
    message.appendChild(document.createTextNode(value));
    $("chat-history").appendChild(message);
    $("message-input").value = "";
    inputChanged();
    $("composer-status").textContent =
      "Preview only. Open ChatGPT to send this to your companion.";
    $("chat-history").scrollTop = $("chat-history").scrollHeight;
  }
  $("composer").onsubmit = function (e) {
    e.preventDefault();
    addPreview();
  };
  function callDot() {
    stopDictation();
    window.open(DOT_URL, "_blank", "noopener,noreferrer");
    $("composer-status").textContent =
      "ChatGPT opened. Use its phone button to start your real call.";
    showToast(
      "Open your companion’s phone button in ChatGPT to start the call.",
    );
  }
  $("call").onclick = callDot;
  $("quick-call").onclick = callDot;
  var recognition = null,
    listening = false;
  function stopDictation() {
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) {}
    }
    listening = false;
    $("dictate").setAttribute("aria-pressed", "false");
  }
  $("dictate").onclick = function () {
    if (listening) {
      stopDictation();
      return;
    }
    var SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      $("composer-status").textContent =
        "Dictation unavailable here. Use your keyboard’s microphone or Open ChatGPT.";
      return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = function () {
      listening = true;
      $("dictate").setAttribute("aria-pressed", "true");
      $("composer-status").textContent =
        "Listening… Tap the microphone to stop.";
    };
    recognition.onresult = function (e) {
      var text = e.results[0][0].transcript;
      $("message-input").value += ($("message-input").value ? " " : "") + text;
      inputChanged();
      $("composer-status").textContent =
        "Review your words before adding them to the preview.";
    };
    recognition.onerror = function () {
      $("composer-status").textContent =
        "Dictation unavailable or permission denied. You can still type.";
    };
    recognition.onend = function () {
      listening = false;
      $("dictate").setAttribute("aria-pressed", "false");
      activity();
    };
    try {
      recognition.start();
    } catch (e) {
      $("composer-status").textContent =
        "Dictation could not start. Try your keyboard’s microphone.";
    }
  };
  $("quick-dictate").onclick = function () {
    openChat();
    $("dictate").click();
  };
  var wakeLock = null,
    wakeWanted = false;
  async function keepAwake() {
    wakeWanted = true;
    if (!navigator.wakeLock) {
      showToast(
        "This browser cannot keep the screen awake. Use the device display setting.",
      );
      return;
    }
    try {
      if (!wakeLock || wakeLock.released) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", function () {});
      }
    } catch (e) {
      showToast(
        "Screen wake lock unavailable. Check this device’s display setting.",
      );
    }
  }
  $("keep-awake").onclick = keepAwake;
  $("fullscreen").onclick = async function () {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else showToast("Full screen is unavailable in this browser.");
    } catch (e) {
      showToast("Full screen could not open here.");
    }
    keepAwake();
  };
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stopDictation();
    } else {
      clock();
      if (wakeWanted) keepAwake();
      if (
        panelEnabled("weather") &&
        (!weatherCache || Date.now() - weatherCache.fetchedAt > WEATHER_MS)
      )
        refreshWeather();
      if (Date.now() - lastActivity >= IDLE_MS) setIdle();
    }
  });
  window.addEventListener("online", function () {
    if (panelEnabled("weather")) refreshWeather();
  });
  function viewport(useVisual) {
    var height =
      useVisual === true && window.visualViewport
        ? window.visualViewport.height
        : window.innerHeight;
    document.documentElement.style.setProperty(
      "--viewport-height",
      height + "px",
    );
  }
  if (window.visualViewport)
    window.visualViewport.addEventListener("resize", function () {
      viewport(true);
      requestAnimationFrame(updatePanelGrid);
    });
  window.addEventListener("resize", function () {
    viewport(false);
    requestAnimationFrame(updatePanelGrid);
  });
  setInterval(function () {
    var n = Math.floor(Date.now() / 60000) % 4;
    root.style.setProperty(
      "--shift-x",
      (n === 1 ? 1 : n === 3 ? -1 : 0) + "px",
    );
    root.style.setProperty(
      "--shift-y",
      (n === 2 ? 1 : n === 0 ? -1 : 0) + "px",
    );
  }, 60000);

  // Keep pinned slots fixed while reordering the remaining panels.
  var board = document.querySelector(".board"),
    panelCatalog = JSON.parse($("panel-manifest").textContent),
    panelNames = Object.fromEntries(
      panelCatalog.panels.map(function (panel) {
        return [panel.id, panel.title];
      }),
    );
  var panelDefault = panelCatalog.panels.map(function (panel) {
      return panel.id;
    }),
    panelLayout = read("layout"),
    panelCandidate = null,
    panelDrag = null,
    holdTimer = null,
    editingPanel = null,
    panelScroll = null;
  panelLayout = DashboardLayout.migrate(panelLayout, panelDefault);
  function panelEnabled(id) {
    if (typeof panelLayout.enabled[id] === "boolean")
      return panelLayout.enabled[id];
    var definition = panelCatalog.panels.find(function (panel) {
      return panel.id === id;
    });
    return !!definition && definition.defaultEnabled !== false;
  }
  function updatePanelGrid() {
    var visible = panelLayout.order.filter(panelEnabled),
      styles = getComputedStyle(board),
      available =
        board.clientHeight -
        parseFloat(styles.paddingTop) -
        parseFloat(styles.paddingBottom),
      plan = DashboardLayout.grid(
        visible,
        panelLayout.sizes,
        matchMedia("(min-aspect-ratio:11/10)").matches,
        available,
        parseFloat(styles.rowGap) || 0,
      );
    board.setAttribute("data-resized", String(plan.resized));
    board.style.gridTemplateColumns =
      "repeat(" + plan.columns + ",minmax(0,1fr))";
    board.style.gridTemplateRows =
      "repeat(" + plan.rows + "," + plan.rowHeight + "px)";
    board.style.gridAutoRows = plan.rowHeight + "px";
    visible.forEach(function (id) {
      panelElement(id).style.gridColumn = "span " + plan.spans[id];
      panelElement(id).style.gridRow = "auto";
    });
  }
  function panelElement(id) {
    return board.querySelector('[data-panel="' + id + '"]');
  }
  function applyLayout() {
    board.setAttribute(
      "data-resized",
      String(
        panelDefault.some(function (id) {
          return ["big", "medium"].indexOf(panelLayout.sizes[id]) >= 0;
        }),
      ),
    );
    var focused = document.activeElement;
    panelLayout.order.forEach(function (id, index) {
      var panel = panelElement(id),
        pinned = panelLayout.pinned.indexOf(id) >= 0,
        button = panel.querySelector("[data-pin]"),
        handle = panel.querySelector("[data-move]");
      panel.style.order = index;
      panel.setAttribute(
        "data-size",
        ["big", "medium"].indexOf(panelLayout.sizes[id]) >= 0
          ? panelLayout.sizes[id]
          : "auto",
      );
      panel.tabIndex = 0;
      panel.hidden = !panelEnabled(id);
      panel.setAttribute("data-pinned", String(pinned));
      button.setAttribute("aria-pressed", String(pinned));
      button.setAttribute(
        "aria-label",
        (pinned ? "Unpin " : "Pin ") + panelNames[id] + " panel",
      );
      button.title = pinned
        ? "Unpin to move this panel"
        : "Pin panel in this position";
      handle.setAttribute("aria-disabled", String(pinned));
      board.appendChild(panel);
    });
    if (focused && focused.isConnected && focused !== document.body)
      focused.focus({ preventScroll: true });
    updatePanelGrid();
    requestAnimationFrame(updatePanelGrid);
    if (window.DisplayPanels) DisplayPanels.sync();
  }
  function saveLayout() {
    write("layout", panelLayout);
    applyLayout();
  }
  function movePanel(id, target) {
    var order = DashboardLayout.move(
      panelLayout.order,
      panelLayout.pinned,
      id,
      target,
    );
    if (
      order.every(function (key, i) {
        return key === panelLayout.order[i];
      })
    )
      return false;
    panelLayout.order = order;
    saveLayout();
    return true;
  }
  board.querySelectorAll("[data-pin]").forEach(function (button) {
    button.onclick = function () {
      var id = button.getAttribute("data-pin"),
        index = panelLayout.pinned.indexOf(id);
      if (index >= 0) panelLayout.pinned.splice(index, 1);
      else panelLayout.pinned.push(id);
      saveLayout();
      showToast(
        panelNames[id] +
          " panel " +
          (index >= 0 ? "unpinned." : "pinned in place."),
      );
    };
  });
  function cancelCandidate() {
    clearTimeout(holdTimer);
    holdTimer = null;
    panelCandidate = null;
  }
  function startPanelDrag() {
    if (!panelCandidate) return;
    var candidate = panelCandidate,
      id = candidate.panel.getAttribute("data-panel");
    openPanelMenu(id);
    if (panelLayout.pinned.indexOf(id) >= 0) {
      cancelCandidate();
      suppressClickUntil = Date.now() + 750;
      return;
    }
    var rect = candidate.panel.getBoundingClientRect(),
      ghost = candidate.panel.cloneNode(true);
    ghost.removeAttribute("aria-label");
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    ghost.querySelectorAll("[id]").forEach(function (el) {
      el.removeAttribute("id");
    });
    ghost.classList.add("drag-ghost");
    ghost.style.width = rect.width + "px";
    ghost.style.height = rect.height + "px";
    ghost.style.left = rect.left + "px";
    ghost.style.top = rect.top + "px";
    document.body.appendChild(ghost);
    ghost.style.visibility = "hidden";
    panelDrag = {
      moved: false,
      id: id,
      panel: candidate.panel,
      ghost: ghost,
      pointerId: candidate.pointerId,
      startX: candidate.x,
      startY: candidate.y,
      target: null,
    };
    try {
      candidate.panel.setPointerCapture(candidate.pointerId);
    } catch (e) {}
    cancelCandidate();
  }
  board.querySelectorAll("[data-panel]").forEach(function (panel) {
    panel.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || panelDrag) return;
      var control = e.target.closest("button,a,input,textarea,summary");
      if (
        control &&
        !control.hasAttribute("data-move") &&
        !control.classList.contains("dot-entry")
      )
        return;
      cancelCandidate();
      panelCandidate = {
        panel: panel,
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
      };
      holdTimer = setTimeout(startPanelDrag, 450);
    });
    panel.addEventListener("contextmenu", function (e) {
      if (
        panelCandidate ||
        panelDrag ||
        editingPanel === panel.getAttribute("data-panel") ||
        e.target.closest("[data-move]")
      )
        e.preventDefault();
    });
  });
  document.addEventListener(
    "pointermove",
    function (e) {
      if (
        panelCandidate &&
        e.pointerId === panelCandidate.pointerId &&
        Math.hypot(e.clientX - panelCandidate.x, e.clientY - panelCandidate.y) >
          10
      ) {
        // Desktop-site browsers may report a touchscreen swipe as mouse input.
        // Moving before the hold scrolls for every pointer; holding still edits.
        panelScroll = {
          pointerId: e.pointerId,
          y: panelCandidate.y,
          scrollTop: board.scrollTop,
        };
        cancelCandidate();
      }
      if (panelScroll && e.pointerId === panelScroll.pointerId) {
        e.preventDefault();
        board.scrollTop = panelScroll.scrollTop + panelScroll.y - e.clientY;
        suppressClickUntil = Date.now() + 150;
        return;
      }
      if (!panelDrag || e.pointerId !== panelDrag.pointerId) return;
      e.preventDefault();
      if (
        Math.hypot(e.clientX - panelDrag.startX, e.clientY - panelDrag.startY) >
        8
      ) {
        panelDrag.moved = true;
        panelDrag.ghost.style.visibility = "visible";
        panelDrag.panel.classList.add("is-dragging");
        $("panel-menu").hidden = true;
      }
      panelDrag.ghost.style.transform =
        "translate(" +
        (e.clientX - panelDrag.startX) +
        "px," +
        (e.clientY - panelDrag.startY) +
        "px) rotate(1deg)";
      board.querySelectorAll(".drop-target").forEach(function (el) {
        el.classList.remove("drop-target");
      });
      var under = document.elementFromPoint(e.clientX, e.clientY),
        target = under && under.closest("[data-panel]");
      panelDrag.target =
        target &&
        target.parentElement === board &&
        panelLayout.pinned.indexOf(target.getAttribute("data-panel")) < 0
          ? target.getAttribute("data-panel")
          : null;
      if (panelDrag.target && panelDrag.target !== panelDrag.id)
        target.classList.add("drop-target");
    },
    { passive: false },
  );
  function finishPanelDrag(cancel) {
    if (panelScroll) {
      panelScroll = null;
      suppressClickUntil = Date.now() + 150;
    }
    cancelCandidate();
    if (!panelDrag) return;
    var drag = panelDrag;
    panelDrag = null;
    drag.ghost.remove();
    drag.panel.classList.remove("is-dragging");
    board.querySelectorAll(".drop-target").forEach(function (el) {
      el.classList.remove("drop-target");
    });
    try {
      drag.panel.releasePointerCapture(drag.pointerId);
    } catch (e) {}
    if (drag.moved && !cancel && drag.target && movePanel(drag.id, drag.target))
      showToast("Panel arrangement saved.");
    if (cancel) closePanelMenu();
    else openPanelMenu(drag.id);
    suppressClickUntil = Date.now() + 750;
    activity();
  }
  document.addEventListener("pointerup", function () {
    finishPanelDrag(false);
  });
  document.addEventListener("pointercancel", function () {
    finishPanelDrag(true);
  });
  board.querySelectorAll("[data-move]").forEach(function (handle) {
    handle.onclick = function () {
      showToast("Long-press and drag this grip, or use arrow keys.");
    };
    handle.addEventListener("keydown", function (e) {
      var id = handle.getAttribute("data-move");
      if (e.key === "Escape") {
        finishPanelDrag(true);
        return;
      }
      var direction =
        ["ArrowLeft", "ArrowUp"].indexOf(e.key) >= 0
          ? -1
          : ["ArrowRight", "ArrowDown"].indexOf(e.key) >= 0
            ? 1
            : 0;
      if (!direction) return;
      e.preventDefault();
      if (panelLayout.pinned.indexOf(id) >= 0) {
        showToast("Unpin this panel before moving it.");
        return;
      }
      var free = panelLayout.order.filter(function (key) {
          return panelLayout.pinned.indexOf(key) < 0;
        }),
        target = free[free.indexOf(id) + direction];
      if (target && movePanel(id, target))
        showToast("Panel arrangement saved.");
    });
  });
  $("reset-panels").onclick = function () {
    finishPanelDrag(true);
    panelLayout = {
      order: panelDefault.slice(),
      pinned: [],
      sizes: {},
      enabled: panelLayout.enabled,
    };
    saveLayout();
    showToast("Default panel arrangement restored.");
  };
  window.addEventListener("resize", function () {
    finishPanelDrag(true);
    closePanelMenu();
    updatePanelGrid();
  });
  window.addEventListener("blur", function () {
    finishPanelDrag(true);
  });

  function closePanelMenu() {
    if (!board) return;
    board.querySelectorAll("[data-editing]").forEach(function (panel) {
      panel.removeAttribute("data-editing");
    });
    $("panel-menu").hidden = true;
    editingPanel = null;
  }
  function openPanelMenu(id) {
    closePanelMenu();
    editingPanel = id;
    var panel = panelElement(id);
    panel.setAttribute("data-editing", "true");
    $("panel-menu-heading").textContent = panelNames[id] + " panel";
    var size = panelLayout.sizes[id] || "auto";
    ["big", "medium", "auto"].forEach(function (key) {
      $("panel-size-" + key).setAttribute("aria-pressed", String(size === key));
    });
    $("panel-menu-pin").textContent =
      panelLayout.pinned.indexOf(id) >= 0 ? "Unpin panel" : "Pin panel";
    $("panel-exit-fullscreen").hidden = !document.fullscreenElement;
    $("panel-menu").hidden = false;
    var r = panel.getBoundingClientRect(),
      menu = $("panel-menu"),
      menuHeight = menu.getBoundingClientRect().height;
    menu.style.left =
      Math.max(12, Math.min(innerWidth - 212, r.right - 212)) + "px";
    menu.style.top =
      Math.max(12, Math.min(innerHeight - menuHeight - 12, r.top + 46)) + "px";
  }
  function sizePanel(size) {
    if (!editingPanel) return;
    if (panelLayout.pinned.indexOf(editingPanel) >= 0) {
      showToast("Unpin this panel before resizing it.");
      return;
    }
    panelLayout.sizes[editingPanel] = size;
    saveLayout();
    openPanelMenu(editingPanel);
    showToast(
      size === "auto"
        ? "Auto fit restored."
        : (size === "big" ? "Big" : "Medium") + " panel size saved.",
    );
  }
  ["big", "medium", "auto"].forEach(function (size) {
    $("panel-size-" + size).onclick = function () {
      sizePanel(size);
    };
  });
  $("panel-menu-done").onclick = closePanelMenu;
  $("panel-menu-pin").onclick = function () {
    if (!editingPanel) return;
    var id = editingPanel;
    panelElement(id).querySelector("[data-pin]").click();
    openPanelMenu(id);
  };
  $("panel-exit-fullscreen").onclick = function () {
    if (document.fullscreenElement) document.exitFullscreen();
    closePanelMenu();
  };
  board.querySelectorAll("[data-panel]").forEach(function (panel) {
    panel.addEventListener("keydown", function (e) {
      if (e.target === panel && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openPanelMenu(panel.getAttribute("data-panel"));
        $("panel-size-big").focus();
      }
    });
  });
  document.addEventListener(
    "pointerdown",
    function (e) {
      if (
        editingPanel &&
        !e.target.closest("#panel-menu") &&
        !e.target.closest(".panel-tools")
      )
        closePanelMenu();
    },
    true,
  );
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && editingPanel) {
      finishPanelDrag(true);
      closePanelMenu();
    }
  });
  document.addEventListener("fullscreenchange", function () {
    root.setAttribute("data-fullscreen", String(!!document.fullscreenElement));
    closePanelMenu();
    viewport();
    requestAnimationFrame(updatePanelGrid);
  });

  panelCatalog.panels.forEach(function (manifest) {
    var label = document.createElement("label"),
      toggle = document.createElement("input");
    label.className = "panel-library-item";
    toggle.type = "checkbox";
    toggle.checked = panelEnabled(manifest.id);
    toggle.setAttribute("aria-label", "Show " + manifest.title + " panel");
    toggle.onchange = function () {
      if (!toggle.checked && panelDefault.filter(panelEnabled).length === 1) {
        toggle.checked = true;
        return;
      }
      panelLayout.enabled[manifest.id] = toggle.checked;
      saveLayout();
    };
    label.appendChild(toggle);
    label.appendChild(document.createTextNode(manifest.title));
    $("panel-library").appendChild(label);
  });
  applyLayout();

  setTheme(activeMode);
  $("location-name").textContent = location.name;
  viewport();
  activity();
  DisplayPanels.start({
    core: {
      clock: function () {
        clock();
        var ticker = setInterval(clock, 1000);
        return function () {
          clearInterval(ticker);
        };
      },
      weather: function () {
        loadCache();
        refreshWeather();
        var ticker = setInterval(function () {
          if (!weatherBusy) refreshWeather();
        }, WEATHER_MS);
        return function () {
          clearInterval(ticker);
          if (weatherController) weatherController.abort();
        };
      },
      dot: function () {
        return function () {
          stopDictation();
        };
      },
    },
  });

  if (!storageAvailable)
    $("storage-note").textContent =
      "Browser storage is unavailable. Choices last until this page closes.";
})();
