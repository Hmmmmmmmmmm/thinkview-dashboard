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
    $("settings").appendChild($("notification-list"));
    $("settings").hidden = false;
    syncPanels();
    $("settings-close").focus();
  }
  function closeSettings() {
    $("settings").hidden = true;
    $("display").appendChild($("notification-list"));
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
      copyDraft();
    }
  });
  async function copyDraft() {
    var value = $("message-input").value.trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      $("composer-status").textContent =
        "Draft copied. Open ChatGPT to paste and send it.";
    } catch (e) {
      $("message-input").select();
      $("composer-status").textContent =
        "Select and copy the draft, then open ChatGPT to send it.";
    }
  }
  $("composer").onsubmit = function (e) {
    e.preventDefault();
    copyDraft();
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
      $("message-input").dispatchEvent(new Event("input", { bubbles: true }));
      $("composer-status").textContent =
        "Review your draft before copying it to ChatGPT.";
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
  // Runtime imports are trusted code. Persist the single-file package, not a path to it.
  var importedPackages = read("imported-panels") || [];
  if (!Array.isArray(importedPackages)) importedPackages = [];
  function validImported(pkg) {
    var m = pkg && pkg.manifest,
      e = pkg && pkg.entries;
    var idPattern = /^[a-z][a-z0-9-]{0,39}$/;
    var capabilities = [
      "local-time",
      "storage",
      "network",
      "location",
      "microphone",
      "external-navigation",
      "device-service",
    ];
    var required = [
      "schemaVersion",
      "id",
      "title",
      "version",
      "rootClass",
      "colorRole",
      "entries",
      "capabilities",
      "assets",
      "defaultEnabled",
    ];
    var optional = [
      "networkOrigins",
      "description",
      "type",
      "grid",
      "expansion",
    ];
    function object(value) {
      return value && typeof value === "object" && !Array.isArray(value);
    }
    function uniqueStrings(value) {
      return (
        Array.isArray(value) &&
        value.every(function (v) {
          return typeof v === "string";
        }) &&
        new Set(value).size === value.length
      );
    }
    function relativePath(value) {
      return (
        typeof value === "string" &&
        value.length > 0 &&
        !value.startsWith("/") &&
        !value.includes("\\") &&
        value.split("/").every(function (part) {
          return part && part !== "." && part !== "..";
        })
      );
    }
    if (
      !object(pkg) ||
      pkg.format !== "thinkview-panel-1" ||
      !object(m) ||
      !object(e)
    )
      return false;
    if (
      Object.keys(pkg).some(function (key) {
        return !["format", "manifest", "entries"].includes(key);
      }) ||
      Object.keys(m).some(function (key) {
        return !required.includes(key) && !optional.includes(key);
      }) ||
      required.some(function (key) {
        return !Object.prototype.hasOwnProperty.call(m, key);
      })
    )
      return false;
    if (
      m.schemaVersion !== 1 ||
      typeof m.id !== "string" ||
      !idPattern.test(m.id) ||
      typeof m.rootClass !== "string" ||
      !idPattern.test(m.rootClass) ||
      typeof m.title !== "string" ||
      !m.title.trim() ||
      typeof m.version !== "string" ||
      !/^\d+\.\d+\.\d+$/.test(m.version) ||
      !["primary", "secondary", "tertiary", "surface"].includes(m.colorRole) ||
      typeof m.defaultEnabled !== "boolean"
    )
      return false;
    if (
      ("type" in m && (typeof m.type !== "string" || !m.type.trim())) ||
      ("description" in m && typeof m.description !== "string")
    )
      return false;
    if (
      "grid" in m &&
      (!object(m.grid) ||
        Object.keys(m.grid).length !== 2 ||
        !Number.isInteger(m.grid.columns) ||
        m.grid.columns < 1 ||
        m.grid.columns > 2 ||
        !Number.isInteger(m.grid.rows) ||
        m.grid.rows < 1 ||
        m.grid.rows > 3)
    )
      return false;
    if (!DashboardExpansion.valid(m)) return false;
    if (
      !uniqueStrings(m.capabilities) ||
      m.capabilities.some(function (capability) {
        return !capabilities.includes(capability);
      }) ||
      !uniqueStrings(m.assets) ||
      !m.assets.every(relativePath)
    )
      return false;
    if (
      "networkOrigins" in m &&
      (!uniqueStrings(m.networkOrigins) ||
        !m.networkOrigins.every(function (origin) {
          return /^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(origin);
        }))
    )
      return false;
    if (
      m.capabilities.includes("network") &&
      (!Array.isArray(m.networkOrigins) || !m.networkOrigins.length)
    )
      return false;
    if (
      !object(m.entries) ||
      Object.keys(m.entries).length !== 3 ||
      !["html", "css", "js"].every(function (key) {
        return relativePath(m.entries[key]);
      })
    )
      return false;
    if (
      Object.keys(e).length !== 3 ||
      !["html", "css", "js"].every(function (key) {
        return typeof e[key] === "string";
      })
    )
      return false;
    return (
      !/<\s*script\b|\son[a-z]+\s*=/i.test(e.html) &&
      !/@import|<\/style/i.test(e.css) &&
      !/<\/script/i.test(e.js)
    );
  }
  var loadedPackageIds = new Set();
  importedPackages.forEach(function (pkg) {
    if (
      !validImported(pkg) ||
      panelCatalog.panels.some(function (m) {
        return m.id === pkg.manifest.id;
      })
    )
      return;
    var m = pkg.manifest,
      section = document.createElement("section"),
      tools = document.createElement("div"),
      move = document.createElement("button"),
      pin = document.createElement("button"),
      style = document.createElement("style");
    section.className = "panel " + m.rootClass;
    section.dataset.panel = m.id;
    section.dataset.tone = m.colorRole;
    section.setAttribute("aria-label", m.title);
    tools.className = "panel-tools";
    move.type = pin.type = "button";
    move.className = "panel-handle";
    pin.className = "panel-pin";
    move.dataset.move = pin.dataset.pin = m.id;
    move.setAttribute("aria-label", "Move " + m.title + " panel");
    pin.setAttribute("aria-label", "Pin " + m.title + " panel");
    move.textContent = "Move";
    pin.textContent = "Pin";
    tools.append(move, pin);
    section.innerHTML = pkg.entries.html;
    section.prepend(tools);
    board.appendChild(section);
    style.textContent = pkg.entries.css;
    document.head.appendChild(style);
    try {
      DisplayPanels.register(m, new Function("ctx", pkg.entries.js));
      panelCatalog.panels.push(m);
      panelNames[m.id] = m.title;
      loadedPackageIds.add(m.id);
    } catch (e) {
      section.remove();
      style.remove();
      console.error("Imported panel registration failed", m.id);
    }
  });
  $("panel-import").onchange = async function () {
    var file = this.files[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw Error("Package exceeds 2 MB.");
      var pkg = JSON.parse(await file.text());
      if (!validImported(pkg)) throw Error("Invalid package format.");
      if (
        panelCatalog.panels.some(function (m) {
          return m.id === pkg.manifest.id;
        }) ||
        importedPackages.some(function (p) {
          return p && p.manifest && p.manifest.id === pkg.manifest.id;
        })
      )
        throw Error(
          "A panel with this ID is already stored. Remove it before importing again.",
        );
      // Compile before persistence; this is trusted code and executes only when mounted.
      new Function("ctx", pkg.entries.js);
      var fragment = document.createElement("template"),
        seen = new Set();
      fragment.innerHTML = pkg.entries.html;
      fragment.content.querySelectorAll("[id]").forEach(function (el) {
        if (seen.has(el.id) || document.getElementById(el.id))
          throw Error("Duplicate HTML ID: " + el.id);
        seen.add(el.id);
      });
      var disclosure =
        "Install trusted code: " +
        pkg.manifest.title +
        "?\nCapabilities: " +
        (pkg.manifest.capabilities.join(", ") || "none declared") +
        "\nOrigins: " +
        ((pkg.manifest.networkOrigins || []).join(", ") || "none declared") +
        "\nThis code has full access to the dashboard and is not isolated.";
      if (!window.confirm(disclosure)) return;
      importedPackages.push(pkg);
      if (!preferences.set("imported-panels", importedPackages))
        throw Error("Browser storage is unavailable or full.");
      window.location.reload();
    } catch (e) {
      $("panel-import-status").textContent =
        "Could not load panel: " + e.message;
    } finally {
      this.value = "";
    }
  };
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
  var attentionEntry = null;
  var expansion = DashboardExpansion.create(
    panelCatalog.panels,
    function (id) {
      return panelLayout.sizes[id];
    },
    function (id) {
      return panelEnabled(id) && panelLayout.pinned.indexOf(id) < 0;
    },
    function () {
      updatePanelGrid();
    },
  );
  function expansionNotice(id, result) {
    if (panelLayout.pinned.indexOf(id) >= 0)
      showToast("Unpin " + panelNames[id] + " before expanding it.");
    else if (!result)
      showToast("No further declared size for " + panelNames[id] + ".");
    else
      showToast(
        panelNames[id] +
          " size changed for this session. Saved layout is unchanged.",
      );
  }
  function panelEnabled(id) {
    if (typeof panelLayout.enabled[id] === "boolean")
      return panelLayout.enabled[id];
    var definition = panelCatalog.panels.find(function (panel) {
      return panel.id === id;
    });
    return !!definition && definition.defaultEnabled !== false;
  }
  function updateCanvasNavigation() {
    var overflow = board.scrollHeight > board.clientHeight + 2;
    ["canvas-previous", "canvas-next"].forEach(function (id) { $(id).hidden = !overflow; });
    $("canvas-previous").disabled = board.scrollTop < 2;
    $("canvas-next").disabled = board.scrollTop + board.clientHeight >= board.scrollHeight - 2;
  }
  function canvasPage(direction) {
    board.scrollTop += direction * (board.clientHeight + (parseFloat(getComputedStyle(board).rowGap) || 0));
    updateCanvasNavigation();
  }
  $("canvas-previous").onclick = function () { canvasPage(-1); };
  $("canvas-next").onclick = function () { canvasPage(1); };
  $("panel-canvas-previous").onclick = function () { closePanelMenu(); canvasPage(-1); };
  $("panel-canvas-next").onclick = function () { closePanelMenu(); canvasPage(1); };
  board.addEventListener("scroll", updateCanvasNavigation, { passive: true });
  function updatePanelGrid() {
    var style = window.getComputedStyle(board),
      number = function (value) { return parseFloat(value) || 0; },
      width = board.clientWidth - number(style.paddingLeft) - number(style.paddingRight),
      height = board.clientHeight - number(style.paddingTop) - number(style.paddingBottom),
      visible = panelLayout.order.filter(panelEnabled),
      plan = DashboardLayout.grid(
        visible,
        Object.fromEntries(
          visible.map(function (id) {
            return [
              id,
              DashboardAttention.size(
                expansion.effective(id),
                attentionEntry && attentionEntry.panelId === id,
              ),
            ];
          }),
        ),
        window.innerWidth > window.innerHeight,

        width,
        height,
        number(style.columnGap),
        Object.fromEntries(panelCatalog.panels.map(function (p) { return [p.id, p.grid || { columns: 1, rows: 1 }]; })),
        number(style.rowGap),

      );
    // Hidden or not-yet-laid-out boards retain their last valid tracks.
    if (!plan) return;
    board.setAttribute("data-resized", String(plan.resized));
    board.style.gridTemplateColumns =
      "repeat(" + plan.columns + "," + plan.columnWidth + "px)";
    board.style.gridTemplateRows =
      "repeat(" + plan.rows + "," + plan.rowHeight + "px)";
    board.style.gridAutoRows = plan.rowHeight + "px";
    requestAnimationFrame(updateCanvasNavigation);
    visible.forEach(function (id) {
      panelElement(id).setAttribute(
        "data-expanded",
        String(
          expansion.active(id) ||
            !!(attentionEntry && attentionEntry.panelId === id),
        ),
      );
      panelElement(id).setAttribute(
        "data-temporarily-expanded",
        String(!!(attentionEntry && attentionEntry.panelId === id)),
      );
      panelElement(id).style.gridColumn = "span " + plan.spans[id].columns;
      panelElement(id).style.gridRow = "span " + plan.spans[id].rows;
    });
  }
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(function () { requestAnimationFrame(updatePanelGrid); }).observe(board);
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
      if (panel.hidden) expansion.restore(id);
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
    if (notificationHost) renderAttention(notificationHost.list());
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
  var pinch = DashboardExpansion.gesture();
  function cancelPinch() {
    pinch.cancel();
  }
  board.addEventListener(
    "pointerdown",
    function (e) {
      if (e.pointerType !== "touch") return;
      var panel = e.target.closest("[data-panel]");
      if (
        !panel ||
        panel.parentElement !== board ||
        e.target.closest("button,a,input,textarea,select,summary,.panel-tools")
      ) {
        cancelPinch();
        return;
      }
      var id = panel.getAttribute("data-panel"),
        declaration = panelCatalog.panels.find(function (m) {
          return m.id === id;
        }).expansion;
      if (!declaration || !declaration.pinch) return;
      if (pinch.down(id, e.pointerId, e.clientX, e.clientY)) {
        finishPanelDrag(true);
        closePanelMenu();
        e.preventDefault();
        e.stopPropagation();
      }
    },
    { capture: true, passive: false },
  );
  document.addEventListener(
    "pointermove",
    function (e) {
      pinch.move(e.pointerId, e.clientX, e.clientY);
      if (pinch.active) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    { capture: true, passive: false },
  );
  document.addEventListener(
    "pointerup",
    function (e) {
      var wasActive = pinch.active,
        result = pinch.up(e.pointerId);
      if (!wasActive) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      suppressClickUntil = Date.now() + 750;
      if (result && result.direction)
        expansionNotice(result.id, expansion.step(result.id, result.direction));
      activity();
    },
    { capture: true, passive: false },
  );
  document.addEventListener(
    "pointercancel",
    function () {
      cancelPinch();
      finishPanelDrag(true);
    },
    true,
  );
  window.addEventListener("blur", cancelPinch);
  window.addEventListener("resize", cancelPinch);
  window.addEventListener("pagehide", cancelPinch);
  board.querySelectorAll("[data-panel]").forEach(function (panel) {
    panel.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || panelDrag) return;
      // Native editable controls own their gestures; ordinary buttons may start
      // a scroll but never a long-press drag. Blank card areas keep drag behavior.
      if (e.target.closest("input,textarea,select")) return;
      var control = e.target.closest("button,a,summary"),
        scrollTarget = e.target;
      while (scrollTarget && scrollTarget !== panel) {
        var overflow = getComputedStyle(scrollTarget).overflowY;
        if (
          (overflow === "auto" || overflow === "scroll") &&
          scrollTarget.scrollHeight > scrollTarget.clientHeight
        )
          break;
        scrollTarget = scrollTarget.parentElement;
      }
      cancelCandidate();
      panelCandidate = {
        panel: panel,
        scrollTarget: scrollTarget || panel,
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
      };
      if (!control || control.hasAttribute("data-move"))
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
          target: panelCandidate.scrollTarget,
          innerStart: panelCandidate.scrollTarget.scrollTop,
          innerMax: Math.max(
            0,
            panelCandidate.scrollTarget.scrollHeight -
              panelCandidate.scrollTarget.clientHeight,
          ),
          scrollTop: board.scrollTop,
        };
        cancelCandidate();
      }
      if (panelScroll && e.pointerId === panelScroll.pointerId) {
        e.preventDefault();
        var scroll = DashboardExpansion.scrollPlan(
          panelScroll.y - e.clientY,
          panelScroll.innerStart,
          panelScroll.innerMax,
          panelScroll.scrollTop,
        );
        panelScroll.target.scrollTop = scroll.inner;
        board.scrollTop = scroll.outer;
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
    expansion.clear();
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
    var size = panelLayout.sizes[id]
      ? panelLayout.sizes[id].columns === 2
        ? "big"
        : "medium"
      : "auto";
    ["big", "medium", "auto"].forEach(function (key) {
      $("panel-size-" + key).setAttribute("aria-pressed", String(size === key));
    });
    var declaration = panelCatalog.panels.find(function (m) {
      return m.id === id;
    }).expansion;
    $("panel-expansion-controls").hidden = !declaration;
    $("panel-expansion-restore").disabled = !expansion.active(id);
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
    expansion.restore(editingPanel);
    if (size === "auto") delete panelLayout.sizes[editingPanel];
    else
      panelLayout.sizes[editingPanel] = {
        columns: size === "big" ? 2 : 1,
        rows: 1,
      };
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
  ["expand", "reduce"].forEach(function (action) {
    $("panel-expansion-" + action).onclick = function () {
      if (!editingPanel) return;
      var id = editingPanel;
      expansionNotice(id, expansion.step(id, action === "expand" ? 1 : -1));
      openPanelMenu(id);
    };
  });
  $("panel-expansion-restore").onclick = function () {
    if (!editingPanel) return;
    var id = editingPanel;
    expansion.restore(id);
    openPanelMenu(id);
    showToast("Saved panel size restored.");
  };
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

  var notificationPreferences = read("notification-behavior") || {};
  var notifications = new Map(),
    notificationListeners = new Set(),
    notificationCounter = 0;
  var priorities = ["emergency", "high", "medium", "low"];
  var notificationHost = {
    publish: function (item) {
      if (!item || typeof item.title !== "string")
        throw Error("A notification title is required");
      var id = String(item.id || "notification-" + ++notificationCounter);
      var priority = priorities.includes(item.priority)
        ? item.priority
        : "medium";
      var entry = {
        id: id,
        title: item.title,
        message: String(item.message || ""),
        priority: priority,
        source: String(item.source || "panel"),
        onActivate: item.onActivate,
        panelId: panelDefault.includes(item.panelId) ? item.panelId : null,
        content:
          item.content && typeof item.content === "object"
            ? item.content
            : null,
      };
      notifications.set(id, entry);
      notifyChanged();
      var behavior =
        notificationPreferences[priority] ||
        (priority === "emergency"
          ? "alert"
          : priority === "high"
            ? "toast"
            : "list");
      if (behavior === "alert") {
        wake();
        $("notification-list").hidden = false;
        $("notifications-open").setAttribute("aria-expanded", "true");
      }
      if (behavior === "toast")
        showToast(entry.title + (entry.message ? ": " + entry.message : ""));
      return id;
    },
    dismiss: function (id) {
      notifications.delete(String(id));
      notifyChanged();
    },
    list: function () {
      return Array.from(notifications.values());
    },
    subscribe: function (callback) {
      notificationListeners.add(callback);
      callback(notificationHost.list());
      return function () {
        notificationListeners.delete(callback);
      };
    },
  };
  function renderAttention(entries) {
    var next = DashboardAttention.select(entries, function (id) {
      return panelEnabled(id) && panelLayout.pinned.indexOf(id) < 0;
    });
    if (next === attentionEntry) return;
    attentionEntry = next;
    board.querySelectorAll(".attention-card").forEach(function (el) {
      el.remove();
    });
    board.querySelectorAll(".panel").forEach(function (el) {
      el.classList.remove("has-attention");
    });
    if (next) {
      var panel = panelElement(next.panelId),
        content = next.content || {};
      var card = document.createElement("div");
      card.className = "attention-card";
      card.dataset.kind = content.kind || "message";
      function text(tag, cls, value) {
        var el = document.createElement(tag);
        el.className = cls;
        el.textContent = String(value || "");
        card.appendChild(el);
        return el;
      }
      text(
        "div",
        "attention-eyebrow",
        (content.demo ? "DEMO · " : "") + next.priority + " attention",
      );
      text("h2", "attention-title", next.title);
      if (content.hero) text("div", "attention-hero", content.hero);
      text("p", "attention-message", next.message);
      if (Array.isArray(content.facts)) {
        var facts = text("dl", "attention-facts", "");
        content.facts.slice(0, 6).forEach(function (fact) {
          var row = document.createElement("div"),
            label = document.createElement("dt"),
            value = document.createElement("dd");
          label.textContent = String(fact.label || "");
          value.textContent = String(fact.value || "");
          row.append(label, value);
          facts.appendChild(row);
        });
      }
      var actions = text("div", "attention-actions", "");
      (Array.isArray(content.actions)
        ? content.actions.slice(0, 3)
        : []
      ).forEach(function (action) {
        var button = document.createElement("button");
        button.textContent = String(action.label || "Open");
        button.onclick = function () {
          if (typeof action.run === "function") action.run();
        };
        actions.appendChild(button);
      });
      var dismiss = document.createElement("button");
      dismiss.className = "attention-dismiss";
      dismiss.textContent = "Dismiss";
      dismiss.onclick = function () {
        notificationHost.dismiss(next.id);
      };
      actions.appendChild(dismiss);
      if (content.demo)
        text(
          "p",
          "attention-footnote",
          "Illustrative data · real inputs not connected. No native scheduling or device action.",
        );
      panel.classList.add("has-attention");
      panel.appendChild(card);
    }
    updatePanelGrid();
  }
  function notifyChanged() {
    var entries = notificationHost.list();
    renderAttention(entries);
    $("notification-count").textContent = String(entries.length);
    var list = $("notification-list");
    list.textContent = "";
    if (!entries.length) list.textContent = "No notifications.";
    entries
      .sort(function (a, b) {
        return priorities.indexOf(a.priority) - priorities.indexOf(b.priority);
      })
      .forEach(function (entry) {
        var row = document.createElement("div"),
          content = document.createElement("div"),
          title = document.createElement("strong"),
          detail = document.createElement("div"),
          dismiss = document.createElement("button");
        row.className = "notification-item";
        title.textContent = entry.title + " · " + entry.priority;
        detail.textContent = entry.message;
        content.append(title, detail);
        row.appendChild(content);
        if (typeof entry.onActivate === "function") {
          var open = document.createElement("button");
          open.textContent = "Open";
          open.onclick = entry.onActivate;
          row.appendChild(open);
        }
        dismiss.textContent = "Dismiss";
        dismiss.setAttribute("aria-label", "Dismiss " + entry.title);
        dismiss.onclick = function () {
          notificationHost.dismiss(entry.id);
        };
        row.appendChild(dismiss);
        list.appendChild(row);
      });
    notificationListeners.forEach(function (listener) {
      listener(entries.slice());
    });
  }
  $("notifications-open").onclick = function () {
    var list = $("notification-list");
    list.hidden = !list.hidden;
    this.setAttribute("aria-expanded", String(!list.hidden));
  };
  priorities.forEach(function (priority) {
    var row = document.createElement("label"),
      select = document.createElement("select");
    row.className = "notification-setting";
    row.appendChild(document.createTextNode(priority));
    select.setAttribute("aria-label", priority + " notification behavior");
    [
      ["list", "Notification list"],
      ["toast", "Toast and list"],
      ["alert", "Open list and wake display"],
    ].forEach(function (option) {
      var el = document.createElement("option");
      el.value = option[0];
      el.textContent = option[1];
      select.appendChild(el);
    });
    select.value =
      notificationPreferences[priority] ||
      (priority === "emergency"
        ? "alert"
        : priority === "high"
          ? "toast"
          : "list");
    select.onchange = function () {
      notificationPreferences[priority] = select.value;
      write("notification-behavior", notificationPreferences);
    };
    row.appendChild(select);
    $("notification-settings").appendChild(row);
  });
  notifyChanged();
  function renderPanelLibrary() {
    var library = $("panel-library"),
      query = $("panel-search").value.trim().toLowerCase(),
      groups = {};
    library.textContent = "";
    panelCatalog.panels.forEach(function (manifest) {
      var type = manifest.type || "Other";
      if (
        !(manifest.title + " " + type + " " + (manifest.description || ""))
          .toLowerCase()
          .includes(query)
      )
        return;
      if (!groups[type]) {
        var group = document.createElement("div"),
          heading = document.createElement("h3");
        group.className = "panel-group";
        heading.textContent = type;
        group.appendChild(heading);
        library.appendChild(group);
        groups[type] = group;
      }
      var label = document.createElement("label"),
        toggle = document.createElement("input");
      label.className = "panel-library-item";
      toggle.type = "checkbox";
      toggle.checked = panelEnabled(manifest.id);
      toggle.setAttribute("aria-label", "Show " + manifest.title + " panel");
      toggle.onchange = function () {
        if (!toggle.checked && panelDefault.filter(panelEnabled).length === 1) {
          toggle.checked = true;
          showToast("Keep at least one panel visible.");
          return;
        }
        panelLayout.enabled[manifest.id] = toggle.checked;
        saveLayout();
      };
      label.appendChild(toggle);
      label.appendChild(document.createTextNode(manifest.title));
      groups[type].appendChild(label);
      if (loadedPackageIds.has(manifest.id)) {
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "text-button";
        remove.textContent = "Remove " + manifest.title;
        remove.onclick = function () {
          if (
            !window.confirm(
              "Remove " +
                manifest.title +
                "? Its saved panel data remains in this browser.",
            )
          )
            return;
          importedPackages = importedPackages.filter(function (p) {
            return !p || !p.manifest || p.manifest.id !== manifest.id;
          });
          if (preferences.set("imported-panels", importedPackages))
            window.location.reload();
          else $("panel-import-status").textContent = "Could not save removal.";
        };
        groups[type].appendChild(remove);
      }
    });
    importedPackages.forEach(function (pkg, index) {
      var id = pkg && pkg.manifest && pkg.manifest.id;
      if (validImported(pkg) && loadedPackageIds.has(id)) return;
      var label =
        typeof id === "string" ? id : "invalid package " + (index + 1);
      if (query && !label.toLowerCase().includes(query)) return;
      var row = document.createElement("div"),
        remove = document.createElement("button");
      row.className = "panel-group";
      row.appendChild(
        document.createTextNode("Unavailable stored panel: " + label + " "),
      );
      remove.type = "button";
      remove.className = "text-button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", "Remove " + label);
      remove.onclick = function () {
        var next = importedPackages.filter(function (_, i) {
          return i !== index;
        });
        if (preferences.set("imported-panels", next)) window.location.reload();
        else $("panel-import-status").textContent = "Could not save removal.";
      };
      row.appendChild(remove);
      library.appendChild(row);
    });
    if (!library.children.length) library.textContent = "No matching panels.";
  }
  $("panel-search").addEventListener("input", renderPanelLibrary);
  renderPanelLibrary();
  $("refresh-all").onclick = function () {
    DisplayPanels.refresh();
    DashboardCalendar.refresh();
    showToast("Panels refreshed.");
  };
  applyLayout();

  setTheme(activeMode);
  $("location-name").textContent = location.name;
  viewport();
  activity();
  DisplayPanels.start({
    layout: {
      bind: function (id) {
        var bound = expansion.bind(id);
        return {
          emit: function (name) {
            var ok = bound.emit(name);
            if (!ok && panelLayout.pinned.indexOf(id) >= 0)
              showToast(
                "Unpin " +
                  panelNames[id] +
                  " to allow its automatic expansion.",
              );
            return ok;
          },
          dispose: bound.dispose,
        };
      },
    },
    notifications: notificationHost,
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
  // Explicit opt-in visual fixture, using the same renderer notification entry point.
  var demoSearch = window.location.search;
  // Built-in launcher uses a same-origin srcdoc frame. External embeddings may
  // be cross-origin; they must not prevent ordinary dashboard startup.
  if (!demoSearch && window.parent !== window) {
    try {
      demoSearch = window.parent.location.search;
    } catch (_) {
      /* no opt-in */
    }
  }
  if (new URLSearchParams(demoSearch).get("demo") === "attention") {
    var demoBar = document.createElement("aside");
    demoBar.className = "attention-demo";
    var demoLabel = document.createElement("strong");
    demoLabel.textContent =
      "DEMO — illustrative notifications; real inputs disconnected";
    demoBar.appendChild(demoLabel);
    var examples = {
      weather: {
        panelId: "weather",
        priority: "medium",
        title: "Rain approaching",
        message:
          "Bring an umbrella before heading out. Showers are expected nearby in about an hour.",
        content: {
          kind: "weather",
          hero: "80% chance of rain",
          facts: [
            { label: "Expected onset", value: "In 1 hour · 17:30" },
            { label: "Likely duration", value: "About 45 minutes" },
            { label: "Area", value: "Nearby · example location" },
          ],
        },
      },
      dot: {
        panelId: "dot",
        priority: "medium",
        title: "2 unread messages",
        message: "Your afternoon summary is ready to review.",
        content: {
          kind: "dot",
          hero: "Hello again",
          facts: [
            {
              label: "Dot · 2 min ago",
              value: "I grouped your open items for the afternoon.",
            },
            {
              label: "Dot · just now",
              value: "Would you like to review the next step?",
            },
          ],
        },
      },
      calendar: {
        panelId: "calendar-next",
        priority: "medium",
        title: "Design review starts soon",
        message:
          "Review the dashboard layouts and agree on the next iteration.",
        content: {
          kind: "calendar",
          hero: "In 10 min",
          facts: [
            { label: "Time", value: "17:00–17:30" },
            { label: "Location", value: "Studio · example meeting" },
            {
              label: "Preparation",
              value: "Bring the latest panel comparisons",
            },
          ],
        },
      },
      reminder: {
        panelId: "notes",
        priority: "medium",
        title: "Remember your umbrella",
        message: "A small thing to take care of before you leave.",
        content: {
          kind: "reminder",
          hero: "Before leaving",
          facts: [
            { label: "Reminder", value: "Pack umbrella and water bottle" },
            { label: "Due", value: "Today · 17:00" },
          ],
        },
      },
      alarm: {
        panelId: "clock",
        priority: "high",
        title: "Time to take a break",
        message: "Step away for a moment and stretch.",
        content: {
          kind: "alarm",
          hero: "17:00",
          facts: [{ label: "Alarm", value: "Afternoon break · demo only" }],
        },
      },
    };
    function demoPublish(name, priority) {
      var example = examples[name];
      if (!example) return false;
      var item = {
        ...example,
        id: "demo-" + name,
        priority: priority || example.priority,
        content: { ...example.content, demo: true },
      };
      var label =
        name === "alarm"
          ? "Snooze 5 min (demo)"
          : name === "reminder"
            ? "Mark done (demo)"
            : name === "dot"
              ? "Mark read (demo)"
              : "Acknowledge";
      item.content.actions = [
        {
          label: label,
          run: function () {
            notificationHost.dismiss(item.id);
            showToast(
              name === "alarm"
                ? "Demo snoozed. No alarm was scheduled."
                : "Demo acknowledged. No real data changed.",
            );
          },
        },
      ];
      return notificationHost.publish(item);
    }
    Object.keys(examples).forEach(function (name) {
      var b = document.createElement("button");
      b.textContent = name;
      b.dataset.demo = name;
      b.onclick = function () {
        demoPublish(name);
      };
      demoBar.appendChild(b);
    });
    var clear = document.createElement("button");
    clear.textContent = "Clear demos";
    clear.onclick = function () {
      notificationHost
        .list()
        .filter(function (e) {
          return e.id.indexOf("demo-") === 0;
        })
        .forEach(function (e) {
          notificationHost.dismiss(e.id);
        });
    };
    demoBar.appendChild(clear);
    $("settings").appendChild(demoBar);
    window.DashboardAttentionDemo = {
      publish: demoPublish,
      dismiss: notificationHost.dismiss,
      list: notificationHost.list,
      active: function () {
        return attentionEntry && attentionEntry.id;
      },
    };
  }
})();
