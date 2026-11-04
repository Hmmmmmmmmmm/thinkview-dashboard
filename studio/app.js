(function () {
  "use strict";
  const $ = (id) => document.getElementById(id),
    P = PanelPackage;
  const data = JSON.parse($("studio-data").textContent),
    draftKey = "thinkview.panel-studio.draft.v1";
  let files = new Map(),
    activeFile = "panel.json",
    dirty = false,
    previewDirty = false,
    token = "",
    running = false,
    runningId = null,
    manifest = null,
    selectedSize = { columns: 1, rows: 1 },
    saveTimer,
    validateTimer,
    importEpoch = 0,
    previewEpoch = 0;
  let designMetadata = {version: 1, workspaces: {}};
  let colorSettings = {seed: data.colorSeed, variant: "expressive"};
  let colorEngineReady = Promise.resolve(), colorEngine = null, colorEpoch = 0;
  function colorCss() {
    return Object.entries(data.themes).map(([mode, roles]) =>
      'html[data-theme="' + mode + '"]{' + Object.entries(roles).map(([key, value]) => colorVariable(key) + ':' + value + ';').join('') + '}').join('\n');
  }
  async function loadColorEngine() {
    const urls = new Map(), active = new Set();
    function moduleUrl(key) {
      if (urls.has(key)) return urls.get(key);
      if (active.has(key)) throw Error("Circular color module dependency.");
      const source = data.colorModules[key];
      if (typeof source !== "string") throw Error("Missing color module: " + key);
      active.add(key);
      const resolved = source.replace(/studio-module:([^'"\s]+)/g, (_, dependency) => moduleUrl(dependency));
      active.delete(key);
      const url = URL.createObjectURL(new Blob([resolved], {type:"text/javascript"}));
      urls.set(key, url); return url;
    }
    try { return await import(moduleUrl("studio/color-engine.mjs")); }
    finally { for (const url of urls.values()) URL.revokeObjectURL(url); }
  }
  async function setColorSettings(next, persist = true) {
    const epoch = ++colorEpoch;
    if (!/^#[0-9a-f]{6}$/i.test(next.seed) || !["expressive", "tonalSpot"].includes(next.variant)) throw Error("Invalid color settings.");
    if (!colorEngine) throw Error("Material color engine is unavailable.");
    const generated = colorEngine.generate(next.seed, next.variant);
    if (epoch !== colorEpoch) return;
    colorSettings = {seed:next.seed.toLowerCase(), variant:next.variant};
    for (const mode of ["bright", "dark", "minimal"]) data.themes[mode] = generated[mode];
    $("color-seed").value = colorSettings.seed;
    $("color-seed-hex").value = colorSettings.seed;
    $("color-variant").value = colorSettings.variant;
    $("color-engine-status").textContent = "Seed " + colorSettings.seed.toUpperCase() + " · " + (colorSettings.variant === "expressive" ? "Expressive" : "Tonal spot") + " · Minimal is custom";
    renderColors(); if (designWorkbench) designWorkbench.refresh();
    if (blueprintReady) blueprintRender();
    if (running) send("theme-colors", colorCss());
    if (persist) { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 700); }
    return {settings:{...colorSettings}, themes:structuredClone(data.themes)};
  }
  let designWorkbench, activeExpression = "Expressive";
  const expressionCss = `
html[data-preview-expression="Quiet"] .board>.panel { box-shadow: none !important; }
html[data-preview-expression="Standard"] .board>.panel { box-shadow: inset 0 0 0 1px var(--md-sys-color-outline-variant) !important; }
html[data-preview-expression="Expressive"] .board>.panel { box-shadow: inset 0 0 0 2px var(--md-sys-color-primary) !important; }
`;
  function showExpression(profile, span) {
    const selected = selectedSize.columns + "×" + selectedSize.rows;
    const matches = span === selected;
    activeExpression = matches ? profile : "Original";
    $("expression-preview-status").textContent = matches ? profile + " · " + span + " · preview only" : "Original · " + selected + " not declared";
    if (running) send("expression", activeExpression);
  }
  function syncExpressionSize() {
    const span = selectedSize.columns + "×" + selectedSize.rows;
    if (designWorkbench && !designWorkbench.setSpan(span)) showExpression("Original", "");
  }
  const logs = [],
    apiRequests = [],
    panelStorage = Object.create(null),
    presentation = {
      emergency: "alert",
      high: "toast",
      medium: "list",
      low: "list",
    };
  let selectedRequest = null;
  $("api-source").value = JSON.stringify(
    PanelDataAPI.preset("disabled"),
    null,
    2,
  );
  const frame = $("preview"),
    encode = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
  const colorVariable = (name) =>
    "--md-sys-color-" +
    name.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
  function renderColors() {
    const mode = $("theme").value,
      roles = data.themes[mode];
    $("color-theme").value = mode;
    const query = $("color-search").value.trim().toLowerCase();
    const matches = Object.entries(roles).filter(([name, value]) =>
      (name + " " + colorVariable(name) + " " + value)
        .toLowerCase()
        .includes(query),
    );
    $("color-count").textContent =
      matches.length + " / " + Object.keys(roles).length + " roles";
    $("color-swatches").replaceChildren();
    for (const [name, value] of matches) {
      const variable = colorVariable(name),
        button = document.createElement("button"),
        chip = document.createElement("span"),
        label = document.createElement("span"),
        title = document.createElement("strong"),
        code = document.createElement("code"),
        hex = document.createElement("small");
      button.className = "color-swatch";
      button.dataset.token = variable;
      button.dataset.value = value;
      button.setAttribute("aria-label", "Copy var(" + variable + "), " + value);
      chip.className = "color-swatch-chip";
      chip.style.backgroundColor = value;
      chip.setAttribute("aria-hidden", "true");
      label.className = "color-swatch-label";
      title.textContent = name;
      code.textContent = variable;
      hex.textContent = value;
      label.append(title, code, hex);
      button.append(chip, label);
      button.onclick = async () => {
        const text = "var(" + variable + ")";
        $("color-copy").value = text;
        try {
          await navigator.clipboard.writeText(text);
          $("color-status").textContent = "Copied " + variable;
        } catch (_) {
          $("color-copy").focus();
          $("color-copy").select();
          $("color-status").textContent =
            "Selected CSS variable. Copy with Ctrl / ⌘ + C.";
        }
      };
      $("color-swatches").append(button);
    }
    if (!matches.length)
      $("color-swatches").textContent = "No matching color roles.";
    $("color-role-tags").replaceChildren();
    const caption = document.createElement("span");
    caption.textContent = "colorRole tags:";
    $("color-role-tags").append(caption);
    for (const role of data.schema.properties.colorRole.enum) {
      const chip = document.createElement("code");
      chip.className = "color-role-tag";
      chip.textContent = role;
      const background =
        mode === "minimal"
          ? "surfaceContainerLow"
          : role === "surface"
            ? "surfaceContainerHigh"
            : role + "Container";
      const foreground =
        mode === "minimal" || role === "surface"
          ? "onSurface"
          : "on" + role[0].toUpperCase() + role.slice(1) + "Container";
      chip.style.backgroundColor = roles[background];
      chip.style.color = roles[foreground];
      chip.title =
        'colorRole: "' +
        role +
        '" · data-tone="' +
        role +
        '" · var(' +
        colorVariable(background) +
        ") / var(" +
        colorVariable(foreground) +
        ")";
      $("color-role-tags").append(chip);
    }
  }
  function status(message, error = false) {
    $("workspace-status").textContent = message;
    $("workspace-status").className = error ? "error" : "";
  }
  function log(level, message) {
    const row = {
      at: new Date().toISOString(),
      level,
      message: String(message),
    };
    logs.push(row);
    if (logs.length > 300) logs.shift();
    renderLogs();
  }
  function renderLogs() {
    $("log-count").textContent = logs.length;
    const output = $("console-output");
    output.replaceChildren();
    for (const entry of logs) {
      const row = document.createElement("div");
      row.className = "log-row";
      row.dataset.level = entry.level;
      row.textContent =
        entry.at.slice(11, 19) +
        "  " +
        entry.level.toUpperCase() +
        "  " +
        entry.message;
      output.append(row);
    }
    output.scrollTop = output.scrollHeight;
  }
  function send(type, value) {
    if (!running) {
      status("Run preview first.");
      return;
    }
    frame.contentWindow.postMessage({ studio: token, type, data: value }, "*");
  }
  function changed() {
    dirty = true;
    previewDirty = true;
    $("edit-status").textContent = running ? "Changed · rerun" : "Unsaved";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 700);
    clearTimeout(validateTimer);
    validateTimer = setTimeout(validate, 400);
    updateFileInfo();
  }
  function saveDraft() {
    clearTimeout(saveTimer);
    try {
      const saved = {
        files: Array.from(files, ([name, content]) => [
          name,
          P.base64(content),
        ]),
        activeFile,
        storage: panelStorage,
        fixtureText: $("api-source").value,
        designMetadata,
        colorSettings,
      };
      localStorage.setItem(draftKey, JSON.stringify(saved));
      dirty = false;
      $("draft-status").textContent =
        "Draft saved locally at " +
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
      $("edit-status").textContent = running
        ? previewDirty
          ? "Draft saved · rerun edits"
          : "Preview up to date"
        : "Draft saved";
      return true;
    } catch (e) {
      $("draft-status").textContent =
        "Draft not saved: " + e.message + ". Export ZIP to keep work.";
      status(
        "Browser storage unavailable or full. Export ZIP to keep work.",
        true,
      );
      return false;
    }
  }
  function updateFileInfo() {
    $("file-size").textContent =
      (files.get(activeFile)?.length || 0).toLocaleString() + " bytes";
    $("line-info").textContent =
      "Line " +
      $("source").value.slice(0, $("source").selectionStart).split("\n").length;
  }
  function renderFiles() {
    $("file-list").replaceChildren();
    for (const name of files.keys()) {
      const button = document.createElement("button"),
        kind = document.createElement("span"),
        title = document.createElement("span");
      button.className = "file-link";
      button.setAttribute("aria-current", String(name === activeFile));
      kind.className = "file-type";
      kind.textContent =
        name === "panel.json"
          ? "{ }"
          : name.endsWith(".html")
            ? "<>"
            : name.endsWith(".css")
              ? "#"
              : name.endsWith(".js")
                ? "JS"
                : "◇";
      title.textContent = name;
      button.append(kind, title);
      button.onclick = () => selectFile(name);
      $("file-list").append(button);
    }
  }
  function isText(name) {
    return /\.(json|html?|css|js|txt|md|svg|csv|xml)$/i.test(name);
  }
  function selectFile(name) {
    activeFile = name;
    $("file-name").textContent = name;
    const editable = isText(name);
    $("source").hidden = !editable;
    $("binary-view").hidden = editable;
    if (editable) {
      try {
        $("source").value = P.text(files.get(name));
      } catch (_) {
        $("source").hidden = true;
        $("binary-view").hidden = false;
        $("binary-view").textContent =
          "This file is not UTF-8 text. It is preserved byte-for-byte for export.";
      }
    } else {
      $("binary-view").textContent =
        name +
        " · " +
        P.mime(name) +
        " · " +
        files.get(name).length.toLocaleString() +
        " bytes. Binary asset preserved for preview and export.";
      if (P.mime(name).startsWith("image/")) {
        const img = document.createElement("img");
        img.src =
          "data:" + P.mime(name) + ";base64," + P.base64(files.get(name));
        img.alt = name;
        img.style.cssText =
          "display:block;max-width:100%;max-height:360px;margin-top:24px;object-fit:contain";
        $("binary-view").append(img);
      }
    }
    $("format-file").disabled = !name.endsWith(".json");
    $("remove-file").disabled = name === "panel.json";
    renderFiles();
    updateFileInfo();
  }
  function validate() {
    const result = P.validate(files, data.schema, DashboardExpansion);
    manifest = result.manifest;
    const output = $("validation-results");
    output.replaceChildren();
    for (const [kind, messages] of [
      ["error", result.errors],
      ["warning", result.warnings],
    ])
      for (const message of messages) {
        const p = document.createElement("p");
        p.className = kind;
        p.textContent = (kind === "error" ? "× " : "△ ") + message;
        output.append(p);
      }
    if (!result.errors.length) {
      const p = document.createElement("p");
      p.className = "valid";
      p.textContent = "✓ Package contract and JavaScript syntax pass";
      output.prepend(p);
    }
    $("validation-summary").textContent = result.errors.length
      ? result.errors.length + (result.errors.length === 1 ? " error" : " errors")
      : result.warnings.length ? result.warnings.length + (result.warnings.length === 1 ? " warning" : " warnings") : "Passed";
    $("validation-summary").className = result.errors.length ? "error" : result.warnings.length ? "warning" : "valid";
    $("package-title").textContent = manifest?.title || "Invalid manifest";
    $("package-meta").textContent = manifest?.id
      ? manifest.id + " · v" + (manifest.version || "?")
      : "Edit panel.json to continue";
    const layoutStates = $("layout-states");
    layoutStates.replaceChildren();
    const sizes = manifest?.expansion?.sizes;
    if (Array.isArray(sizes) && sizes.length) {
      for (const size of sizes) {
        if (!Number.isInteger(size?.columns) || !Number.isInteger(size?.rows)) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = size.columns + " × " + size.rows;
        button.onclick = () => {
          const previewButton = $("sizes").querySelector(
            `button[data-columns="${size.columns}"][data-rows="${size.rows}"]`,
          );
          if (previewButton) previewButton.click();
          else {
            selectedSize = { columns: size.columns, rows: size.rows };
            syncExpressionSize();
            $("sizes").querySelectorAll("button").forEach((el) => el.setAttribute("aria-pressed", "false"));
            resize(selectedSize);
            if (running) send("size", selectedSize);
          }
        };
        layoutStates.append(button);
      }
    }
    if (!layoutStates.children.length)
      layoutStates.textContent = "No layout states declared.";
    $("event-buttons").replaceChildren();
    for (const name of Object.keys(manifest?.expansion?.events || {})) {
      const button = document.createElement("button");
      button.textContent = name;
      button.onclick = () => send("emit", name);
      $("event-buttons").append(button);
    }
    if (!$("event-buttons").children.length)
      $("event-buttons").textContent = "No expansion events declared.";
    if (designWorkbench) designWorkbench.refresh();
    return result;
  }
  function stopPreview() {
    previewEpoch++;
    token = "";
    running = false;
    runningId = null;
    frame.srcdoc = "";
    $("mount").disabled = $("remount").disabled = true;
    $("dismiss-attention").hidden = $("dismiss-attention").disabled = true;
    $("runtime-status").textContent = "Ready to run";
    $("preview-placeholder").hidden = false;
    $("notification-count").textContent = "0";
    $("notification-list").replaceChildren();
    $("runtime-state").textContent = "Not mounted";
    $("stage-toast").hidden = true;
  }
  function loadFiles(next, label) {
    stopPreview();
    files = next;
    visualPath = null;
    visualHistory.length = 0;
    $("visual-undo").disabled = true;
    if (blueprintReady) blueprintRender();
    selectFile(
      files.has("panel.json") ? "panel.json" : files.keys().next().value,
    );
    validate();
    changed();
    status("Opened " + label + ". Review source, then run preview.");
    resize(selectedSize);
    $("examples").value = "";
  }
  function mayReplace() {
    return (
      !dirty ||
      confirm(
        "Replace the current unsaved workspace? Export ZIP or save a draft first if needed.",
      )
    );
  }
  function choosePackage(roots) {
    const dialog = $("package-dialog"), select = $("package-choice");
    if (dialog.open) dialog.close();
    select.replaceChildren();
    for (const root of roots) {
      const option = document.createElement("option");
      option.value = root.manifestPath;
      option.textContent = (root.title || root.id || "Untitled") + " — " + root.manifestPath;
      select.append(option);
    }
    select.selectedIndex = -1;
    return new Promise((resolve) => {
      dialog.addEventListener("close", () => resolve(dialog.returnValue === "choose" ? select.value : null), { once: true });
      dialog.returnValue = "";
      dialog.showModal();
      select.focus();
    });
  }
  async function openZip(file) {
    if (!file || !mayReplace()) return;
    const epoch = ++importEpoch;
    try {
      if (file.size > P.LIMIT) throw Error("ZIP exceeds 16 MiB limit");
      const next = await P.unzip(await file.arrayBuffer());
      if (epoch !== importEpoch) return;
      const roots = P.packageRoots(next);
      if (!roots.length)
        throw Error("No panel.json package found. Extract nested ZIP collections before opening a package.");
      const path = roots.length === 1 ? roots[0].manifestPath : await choosePackage(roots);
      if (epoch !== importEpoch || !path) return;
      loadFiles(P.packageAt(next, path), file.name + " (" + path + ")");
      log("info", "ZIP opened without executing package scripts: " + file.name);
    } catch (e) {
      status("Could not open ZIP: " + e.message, true);
      log("error", e.message);
    }
  }
  function starter(id, title) {
    const m = {
      schemaVersion: 1,
      id,
      title,
      version: "1.0.0",
      rootClass: id.slice(0, 34) + "-panel",
      colorRole: "primary",
      entries: { html: "panel.html", css: "panel.css", js: "panel.js" },
      capabilities: ["storage"],
      assets: [],
      defaultEnabled: true,
      type: "Custom",
      grid: { columns: 1, rows: 1 },
      expansion: {
        sizes: [
          { columns: 1, rows: 1 },
          { columns: 1, rows: 2 },
          { columns: 2, rows: 1 },
          { columns: 2, rows: 2 },
        ],
        pinch: true,
        events: {
          expand: { action: "expand", size: { columns: 2, rows: 2 } },
          restore: { action: "restore" },
        },
      },
    };
    const html =
      '<div class="' +
      id +
      '-content">\n  <h2 data-title></h2>\n  <p data-count></p>\n  <button type="button" data-notify>Send notification</button>\n</div>\n';
    const css =
      '[data-panel="' +
      id +
      '"] { container-type: size; }\n.' +
      id +
      "-content { display: flex; flex-direction: column; justify-content: center; gap: 12px; height: 100%; }\n." +
      id +
      "-content h2 { font-size: clamp(18px, 8cqw, 32px); margin: 0; }\n." +
      id +
      "-content p { font-size: 12px; margin: 0; }\n." +
      id +
      "-content button { align-self: flex-start; padding: 8px 12px; border: 1px solid currentColor; border-radius: 12px; background: transparent; color: inherit; }\n";
    const js =
      'const root = ctx.root;\nlet count = ctx.storage.get("count", 0);\nroot.querySelector("[data-title]").textContent = ctx.manifest.title;\nconst output = root.querySelector("[data-count]");\nconst button = root.querySelector("[data-notify]");\nfunction render() { output.textContent = count + " notifications sent"; }\nfunction notify() {\n  count++;\n  ctx.storage.set("count", count);\n  ctx.notifications.publish({ id: "hello", title: ctx.manifest.title, message: "Notification " + count, priority: "high" });\n  render();\n}\nbutton.addEventListener("click", notify);\nrender();\nreturn () => button.removeEventListener("click", notify);\n';
    return new Map(
      Object.entries({
        "panel.json": JSON.stringify(m, null, 2) + "\n",
        "panel.html": html,
        "panel.css": css,
        "panel.js": js,
      }).map(([name, value]) => [name, P.bytes(value)]),
    );
  }
  function resize(size) {
    const width = Math.max(
        190,
        Math.min(600, Number($("cell-width").value) || 260),
      ),
      height = Math.max(
        152,
        Math.min(600, Number($("cell-height").value) || 220),
      );
    const w = width * size.columns + (size.columns - 1) * 14,
      h = height * size.rows + (size.rows - 1) * 14;
    $("frame-wrap").style.width = w + "px";
    $("frame-wrap").style.height = h + "px";
    $("blueprint-wrap").style.width = w + "px";
    $("blueprint-wrap").style.height = h + "px";
    if (typeof blueprintReady !== "undefined" && blueprintReady) blueprintRender();
    $("dimensions").textContent =
      size.columns + " × " + size.rows + " · " + w + " × " + h + " px";
  }
  async function run() {
    await colorEngineReady;
    let fixture;
    try {
      fixture = readFixture();
    } catch (e) {
      status("Fix Data API JSON before running: " + e.message, true);
      debugTab("data");
      return false;
    }
    const result = validate();
    if (result.errors.length) {
      $("validation-panel").open = true;
      status("Fix validation errors before running.", true);
      return false;
    }
    // Let the current runtime flush cleanup-only state before replacing its frame.
    const epoch = ++previewEpoch;
    if (running) {
      $("runtime-status").textContent = "Stopping…";
      const previousToken = token;
      await new Promise((resolve) => {
        let timeout;
        const finish = () => {
          clearTimeout(timeout);
          window.removeEventListener("message", receive);
          resolve();
        };
        const receive = (event) => {
          if (
            event.source === frame.contentWindow &&
            event.data?.studio === previousToken &&
            event.data.type === "stopped"
          )
            finish();
        };
        window.addEventListener("message", receive);
        timeout = setTimeout(finish, 1000);
        send("shutdown");
      });
      if (epoch !== previewEpoch) return;
    }
    stopPreview();
    manifest = result.manifest;
    runningId = manifest.id;
    token = crypto.randomUUID();
    running = true;
    previewDirty = false;
    apiRequests.length = 0;
    selectedRequest = null;
    renderRequests();
    const entries = P.embedded(files, manifest, result.entries),
      origins = $("allow-network").checked ? manifest.networkOrigins || [] : [];
    const connectOrigins = $("allow-network").checked && manifest.id === "weather"
      ? [...origins, "http://127.0.0.1:8768"] : origins;
    const csp =
      "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob: " +
      origins.join(" ") +
      "; font-src data:; connect-src " +
      (connectOrigins.length ? connectOrigins.join(" ") : "'none'") +
      "; media-src data: blob:; form-action 'none'; base-uri 'none'";
    const config = {
      token,
      manifest,
      script: entries.js,
      storage: panelStorage[manifest.id] || {},
      size: selectedSize,
      pinned: $("pinned").checked,
      fixture,
      appData: manifest.id === "weather" ? { caiyun_weather_api: $("caiyun-weather-api").value } : {},
    };
    const overrides =
      "html,body{height:100%;width:100%;overflow:hidden}body{transition:none;background:transparent}.board{display:block!important;padding:0!important;margin:0!important;height:100%;width:100%;overflow:hidden!important}.board>.panel{position:relative!important;inset:auto!important;width:100%!important;height:100%!important;margin:0!important;border-radius:14px!important;transform:none!important;grid-area:auto!important;opacity:1!important}";
    const html =
      '<!doctype html><html lang="en" data-preview-expression="' + activeExpression + '" data-theme="' +
      $("theme").value +
      '"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' +
      csp.replace(/"/g, "&quot;") +
      '"><style>' +
      data.sharedCss +
      "\n" +
      entries.css +
      "\n" +
      overrides +
      '\n' + expressionCss +
      '</style><style id="studio-color-overrides">' + colorCss() + '</style></head><body><div class="board"><section class="panel ' +
      manifest.rootClass +
      '" data-panel="' +
      manifest.id +
      '" data-tone="' +
      manifest.colorRole +
      '" aria-label="Panel preview">' +
      entries.html +
      '</section></div><script id="frame-config" type="application/json">' +
      encode(config) +
      "</script><script>" +
      data.expansion +
      "\n" +
      data.attention +
      "\n" +
      data.fit +
      "\n" +
      data.panelState +
      "\n" +
      data.runtime +
      "\n" +
      data.dataAPI +
      "\n" +
      data.provider +
      "\n" +
      data.frame +
      "</script></body></html>";
    frame.srcdoc = html;
    $("preview-placeholder").hidden = true;
    $("runtime-status").textContent = "Mounting…";
    $("edit-status").textContent = "Preview up to date";
    $("mount").disabled = $("remount").disabled = false;
    resize(selectedSize);
    status(
      "Preview started · " +
        (fixture.enabled
          ? "fixture data · unmatched requests return 404"
          : origins.length
            ? "declared network allowed"
            : "network blocked"),
    );
    log("info", "Run " + manifest.id + " · sandboxed · " + $("theme").value);
    return true;
  }
  window.addEventListener("message", (event) => {
    if (
      event.source !== frame.contentWindow ||
      !event.data ||
      event.data.studio !== token ||
      !running
    )
      return;
    const { type, data: value } = event.data;
    if (type === "visual-select") {
      try { visualSelect(value.path, value.tag, value.identity); } catch (e) { $("visual-status").textContent = e.message; }
    }
    if (type === "log") log(value.level, value.message);
    if (type === "api-request") {
      apiRequests.push(value);
      if (apiRequests.length > 80) apiRequests.shift();
      if (
        selectedRequest === null ||
        !apiRequests.some((entry) => entry.id === selectedRequest)
      )
        selectedRequest = value.id;
      renderRequests();
    }
    if (type === "size") resize(value);
    if (type === "mounted") {
      $("mount").textContent = value.disabled
        ? "Enable panel"
        : "Disable panel";
      $("runtime-status").textContent = value.ok
        ? "Mounted"
        : value.disabled
          ? "Disabled"
          : "Mount failed · see console";
      if (value.ok && visualPick) send("visual-pick", true);
      if (value.ok)
        for (const [priority, behavior] of Object.entries(presentation))
          send("presentation", { priority, behavior });
    }
    if (type === "storage") {
      panelStorage[runningId] = value;
      $("storage-state").textContent = JSON.stringify(value, null, 2);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveDraft, 700);
    }
    if (type === "attention-state") {
      const active = value === true;
      $("dismiss-attention").hidden = !active;
      $("dismiss-attention").disabled = !active;
    }
    if (type === "state") {
      $("runtime-state").textContent = JSON.stringify(value, null, 2);
      $("storage-state").textContent = JSON.stringify(value.storage, null, 2);
    }
    if (type === "notifications") renderNotifications(value);
    if (type === "presentation") {
      $("stage-toast").textContent =
        (value.behavior === "alert" ? "ALERT · " : "") +
        value.title +
        (value.message ? ": " + value.message : "");
      $("stage-toast").hidden = false;
      if (value.behavior === "alert") debugTab("notifications");
    }
  });
  function renderNotifications(entries) {
    $("notification-count").textContent = entries.length;
    const list = $("notification-list");
    list.replaceChildren();
    const priorities = ["emergency", "high", "medium", "low"];
    for (const entry of entries.sort(
      (a, b) => priorities.indexOf(a.priority) - priorities.indexOf(b.priority),
    )) {
      const row = document.createElement("div"),
        content = document.createElement("div"),
        priority = document.createElement("div"),
        title = document.createElement("strong"),
        description = document.createElement("p"),
        dismiss = document.createElement("button");
      row.className = "notification";
      row.dataset.priority = entry.priority;
      priority.className = "priority";
      priority.textContent =
        entry.priority +
        (entry.active ? " · attention" : "") +
        " · " +
        entry.id;
      title.textContent = entry.title;
      description.textContent = entry.message;
      content.append(priority, title, description);
      row.append(content);
      if (entry.canActivate) {
        const activate = document.createElement("button");
        activate.textContent = "Activate";
        activate.onclick = () => send("activate", entry.id);
        row.append(activate);
      }
      dismiss.textContent = "Dismiss";
      dismiss.setAttribute("aria-label", "Dismiss " + entry.title);
      dismiss.onclick = () => send("dismiss", entry.id);
      row.append(dismiss);
      list.append(row);
    }
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No notifications in the queue.";
      list.append(empty);
      $("stage-toast").hidden = true;
    }
  }
  function editorTab(name) {
    for (const tab of ["visual", "source", "manifest", "guide"]) {
      $(tab + "-view").hidden = name !== tab;
      $(tab + "-tab").setAttribute("aria-selected", String(name === tab));
    }
    if (name === "visual") visualRefresh();
    if (name === "manifest") {
      try {
        const m = JSON.parse(P.text(files.get("panel.json")));
        const form = $("manifest-view");
        for (const field of [
          "id",
          "title",
          "version",
          "rootClass",
          "colorRole",
          "description",
        ])
          form.elements[field].value = m[field] || "";
        form.elements.defaultEnabled.checked = m.defaultEnabled;
        $("capabilities").textContent = JSON.stringify(
          {
            capabilities: m.capabilities,
            networkOrigins: m.networkOrigins || [],
            grid: m.grid || { columns: 1, rows: 1 },
            expansion: m.expansion || null,
          },
          null,
          2,
        );
        $("manifest-status").textContent = "";
      } catch (e) {
        $("manifest-status").textContent =
          "Fix panel.json syntax first: " + e.message;
      }
    }
  }
  function debugTab(name) {
    $("debug-panel").open = true;
    for (const tab of ["notifications", "console", "events", "data"]) {
      $(tab + "-view").hidden = name !== tab;
      $(tab + "-tab").setAttribute("aria-selected", String(name === tab));
    }
  }
  function readFixture() {
    try {
      const fixture = PanelDataAPI.validate(JSON.parse($("api-source").value));
      $("api-enabled").checked = fixture.enabled;
      $("api-preset").value = "";
      $("api-status").textContent = fixture.enabled
        ? "Fixture JSON valid. Apply & rerun to use these responses."
        : "Fixtures are off. Apply & rerun to change the running preview.";
      $("api-status").className = "";
      return fixture;
    } catch (e) {
      $("api-status").textContent = e.message;
      $("api-status").className = "error";
      throw e;
    }
  }
  function renderRequests() {
    $("api-count").textContent = apiRequests.length;
    $("api-requests").replaceChildren();
    for (const entry of apiRequests.slice().reverse()) {
      const button = document.createElement("button");
      button.className = "api-request";
      button.setAttribute("aria-pressed", String(entry.id === selectedRequest));
      button.textContent =
        entry.method +
        " " +
        entry.url +
        " · " +
        (entry.aborted ? "ABORTED" : entry.error ? "ERROR" : entry.status) +
        " · " +
        entry.elapsedMs +
        "ms";
      button.onclick = () => {
        selectedRequest = entry.id;
        renderRequests();
      };
      $("api-requests").append(button);
    }
    const selected = apiRequests.find((entry) => entry.id === selectedRequest);
    $("api-detail").textContent = selected
      ? JSON.stringify(selected, null, 2)
      : "No request selected.";
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    status("Exported " + name);
  }
  let visualPath = null, visualPick = false, blueprintReady = false, blueprintDrag = null;
  const visualHistory = [];
  const visualStyles = ["width", "height", "fontSize", "color", "backgroundColor", "padding", "borderRadius", "translate", "boxSizing"];
  function visualDocument() {
    const m = JSON.parse(P.text(files.get("panel.json")));
    const name = m.entries.html;
    if (!files.has(name)) throw Error("HTML entry is missing.");
    const template = document.createElement("template");
    template.innerHTML = P.text(files.get(name));
    return {template, name};
  }
  function visualNode(root, path) {
    if (!Array.isArray(path) || !path.length || path.some(n => !Number.isInteger(n) || n < 0)) throw Error("Invalid layer path.");
    let node = root;
    for (const index of path) { node = node.children[index]; if (!node) throw Error("Layer no longer exists. Refresh the layer list."); }
    return node;
  }
  function visualRefresh() {
    const tree = $("visual-tree"); tree.replaceChildren();
    try {
      const {template} = visualDocument();
      function visit(parent, path) {
        Array.from(parent.children).forEach((node, index) => {
          const next = path.concat(index), button = document.createElement("button");
          button.type = "button"; button.style.paddingLeft = (8 + path.length * 14) + "px";
          button.textContent = node.localName + (node.id ? " #" + node.id : "") + (node.classList.length ? " ." + Array.from(node.classList).join(".") : "");
          button.setAttribute("aria-current", String(JSON.stringify(next) === JSON.stringify(visualPath)));
          button.onclick = () => visualSelect(next); tree.append(button); visit(node, next);
        });
      }
      visit(template.content, []);
      if (!tree.children.length) tree.textContent = "No static HTML elements.";
    } catch (e) { tree.textContent = e.message; }
  }
  function visualElementName(node) {
    const directText = Array.from(node.childNodes).filter(child => child.nodeType === 3).map(child => child.textContent).join(" ").replace(/\s+/g, " ").trim();
    const label = node.getAttribute("aria-label") || node.getAttribute("title") || (directText.length <= 60 ? directText : directText.slice(0, 57) + "…");
    const identity = node.id ? "#" + node.id : node.classList.length ? "." + Array.from(node.classList).join(".") : "";
    return (label ? label + " · " : "") + node.localName + (identity ? " " + identity : "");
  }
  function visualSelect(path, expectedTag, identity) {
    const {template} = visualDocument(), node = visualNode(template.content, path);
    if (expectedTag && (node.localName !== expectedTag || (identity && (node.id !== identity.id || node.className !== identity.className)))) throw Error("This preview layer is generated or differs from the source. Select it from Layers instead.");
    visualPath = path.slice();
    const name = visualElementName(node);
    $("visual-selection").textContent = name;
    $("blueprint-label").textContent = name;
    $("blueprint-selection").title = name + " · drag to move";
    blueprintSelect();
    $("visual-status").textContent = "Changes apply to the static HTML; scripts may change the rendered result.";
    visualRefresh();
    return {path: visualPath, tag: node.localName, text: node.children.length ? null : node.textContent, styles: Object.fromEntries(visualStyles.map(key => [key, node.style[key]]))};
  }
  function visualApply(path, changes) {
    const {template, name} = visualDocument(), node = visualNode(template.content, path);
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw Error("Changes must be an object.");
    for (const key of Object.keys(changes)) if (key !== "text" && !visualStyles.includes(key)) throw Error("Unsupported property: " + key);
    if (Object.hasOwn(changes, "text")) {
      if (node.children.length) throw Error("Text can only be edited on leaf elements.");
      if (typeof changes.text !== "string") throw Error("Text must be a string.");
      node.textContent = changes.text;
    }
    for (const key of visualStyles) if (Object.hasOwn(changes, key)) {
      if (typeof changes[key] !== "string" || changes[key].length > 500) throw Error("Invalid " + key);
      node.style[key] = changes[key];
      if (changes[key] && !node.style[key]) throw Error("Invalid CSS value for " + key);
    }
    if (!node.getAttribute("style")) node.removeAttribute("style");
    visualHistory.push({name, content:files.get(name), path:path.slice()});
    if (visualHistory.length > 30) visualHistory.shift();
    $("visual-undo").disabled = false;
    files.set(name, P.bytes(template.innerHTML));
    if (activeFile === name) $("source").value = P.text(files.get(name));
    changed(); blueprintRender(); return visualSelect(path);
  }
  // The blueprint never executes panel code. Its same-origin document is sandboxed
  // without scripts or network access and is used only for source-layout geometry.
  function blueprintRender() {
    if (!blueprintReady) return;
    const overlay = $("blueprint-selection"); overlay.hidden = true;
    try {
      const result = P.validate(files, data.schema, DashboardExpansion);
      if (!result.manifest || !result.entries || typeof result.entries.html !== "string" || typeof result.entries.css !== "string") throw Error("Valid HTML and CSS entries are required for the blueprint.");
      const entries = P.embedded(files, result.manifest, result.entries), m = result.manifest;
      const css = (data.sharedCss + "\n" + colorCss() + "\n" + entries.css + "\n" +
        "html,body{height:100%;width:100%;overflow:hidden}body{transition:none;background:#103c76}.board{display:block!important;padding:0!important;margin:0!important;height:100%;width:100%;overflow:hidden!important}.board>.panel{position:relative!important;inset:auto!important;width:100%!important;height:100%!important;margin:0!important;border-radius:0!important;transform:none!important;grid-area:auto!important;opacity:1!important}.board>.panel,.board>.panel *{color:#e2f1ff!important;background-color:transparent!important;background-image:none!important;border-color:#83c4ff!important;box-shadow:none!important}.board>.panel *{outline:1px dashed #83c4ff99;outline-offset:-1px;animation:none!important;transition:none!important}").replace(/<\/style/gi, "\\3c /style");
      const src = '<!doctype html><html data-theme="' + $("theme").value + '"><head><meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; style-src &apos;unsafe-inline&apos;; img-src data: blob:; font-src data:; form-action &apos;none&apos;; base-uri &apos;none&apos;"><style>' + css + '</style></head><body><div class="board"><section class="panel ' + m.rootClass + '" data-panel="' + m.id + '" data-tone="' + m.colorRole + '">' + entries.html + '</section></div></body></html>';
      const frame = $("blueprint");
      frame.onload = () => {
        try {
          const doc = frame.contentDocument, panel = doc.querySelector(".board>.panel");
          if (!panel) throw Error("Blueprint panel is unavailable.");
          doc.addEventListener("click", event => {
            event.preventDefault(); event.stopPropagation();
            let node = event.target;
            while (node && node !== panel && !(node instanceof frame.contentWindow.HTMLElement)) node = node.parentElement;
            let path = [], current = node;
            while (current && current !== panel) { const parent = current.parentElement; if (!parent) return; path.unshift(Array.prototype.indexOf.call(parent.children, current)); current = parent; }
            if (current === panel && path.length) { try { visualSelect(path, node.localName, {id:node.id, className:node.className}); } catch (error) { $("blueprint-status").textContent = error.message; } }
          }, true);
          blueprintSelect();
        } catch (error) { $("blueprint-status").textContent = error.message; }
      };
      frame.srcdoc = src;
    } catch (error) { $("blueprint-status").textContent = error.message; }
  }
  function blueprintSelect() {
    const overlay = $("blueprint-selection"), frame = $("blueprint");
    overlay.hidden = true;
    if (!blueprintReady || !visualPath) return;
    try {
      const panel = frame.contentDocument.querySelector(".board>.panel"), node = visualNode(panel, visualPath), source = visualNode(visualDocument().template.content, visualPath);
      if (!(node instanceof frame.contentWindow.HTMLElement) || node.localName !== source.localName || node.id !== source.id || node.className !== source.className) throw Error("This layer cannot be mapped to the blueprint.");
      const rect = node.getBoundingClientRect(), frameRect = frame.getBoundingClientRect();
      if (!rect.width || !rect.height) throw Error("This layer is hidden at the current panel size.");
      const style = frame.contentWindow.getComputedStyle(node);
      for (let current = node; current && current !== panel.parentElement; current = current.parentElement) {
        const computed = frame.contentWindow.getComputedStyle(current);
        if (computed.transform !== "none" || computed.rotate !== "none" || computed.scale !== "none") throw Error("Transformed layers cannot be dragged accurately in the blueprint.");
      }
      const values = style.translate === "none" ? [0,0] : style.translate.split(/\s+/).map(value => /^-?(?:\d+\.?\d*|\.\d+)px$/.test(value) ? parseFloat(value) : NaN);
      if (!values.length || values.length > 2 || values.some(value => !Number.isFinite(value))) throw Error("This layer uses a translation that cannot be safely edited.");
      if (values.length === 1) values.push(0);
      const x = rect.left, y = rect.top;
      if (x < -0.5 || y < -0.5 || x + rect.width > frameRect.width + .5 || y + rect.height > frameRect.height + .5) throw Error("Layer extends outside the panel; adjust its layout before dragging.");
      Object.assign(overlay.style, {left:x + "px", top:y + "px", width:rect.width + "px", height:rect.height + "px"});
      overlay.hidden = false;
      overlay._blueprintGeometry = {path:visualPath.slice(), x,y,width:rect.width,height:rect.height,tx:values[0],ty:values[1], frameWidth:frameRect.width,frameHeight:frameRect.height, resizable:style.display !== "inline"};
      $("blueprint-status").textContent = "Drag the blue selection to move; drag its lower-right handle to resize. Layout and panel boundaries constrain the result.";
    } catch (error) { $("blueprint-status").textContent = error.message; }
  }
  $("blueprint-selection").addEventListener("pointerdown", event => {
    if (event.button !== 0 || !event.isPrimary) return;
    const overlay = event.currentTarget, geometry = overlay._blueprintGeometry;
    if (!geometry) return;
    event.preventDefault(); event.stopPropagation();
    const resize = event.target.id === "blueprint-resize";
    if (resize && !geometry.resizable) { $("blueprint-status").textContent = "Inline text cannot be resized directly. Select a container or adjust its CSS."; return; }
    blueprintDrag = {geometry, pointer:event.pointerId, startX:event.clientX, startY:event.clientY, resize, dx:0, dy:0};
    overlay.setPointerCapture(event.pointerId);
  });
  $("blueprint-selection").addEventListener("pointermove", event => {
    const drag = blueprintDrag; if (!drag || event.pointerId !== drag.pointer) return;
    const g = drag.geometry, rawX = event.clientX - drag.startX, rawY = event.clientY - drag.startY;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    if (drag.resize) {
      drag.dx = clamp(rawX, 8 - g.width, g.frameWidth - g.x - g.width);
      drag.dy = clamp(rawY, 8 - g.height, g.frameHeight - g.y - g.height);
      event.currentTarget.style.width = (g.width + drag.dx) + "px"; event.currentTarget.style.height = (g.height + drag.dy) + "px";
    } else {
      drag.dx = clamp(rawX, -g.x, g.frameWidth - g.x - g.width);
      drag.dy = clamp(rawY, -g.y, g.frameHeight - g.y - g.height);
      event.currentTarget.style.left = (g.x + drag.dx) + "px"; event.currentTarget.style.top = (g.y + drag.dy) + "px";
    }
  });
  $("blueprint-selection").addEventListener("pointercancel", () => { blueprintDrag = null; blueprintSelect(); });
  async function commitBlueprintDrag(drag) {
    if (Math.abs(drag.dx) < .5 && Math.abs(drag.dy) < .5) { blueprintSelect(); return; }
    const g = drag.geometry, px = value => Math.round(value * 100) / 100 + "px";
    const changes = drag.resize ? {width:px(g.width + drag.dx), height:px(g.height + drag.dy), boxSizing:"border-box"} : {translate:px(g.tx + drag.dx) + " " + px(g.ty + drag.dy)};
    try {
      visualApply(g.path, changes);
      if (running) await run();
    } catch (error) { $("blueprint-status").textContent = error.message; blueprintRender(); }
  }
  $("blueprint-selection").addEventListener("pointerup", event => {
    const drag = blueprintDrag; if (!drag || event.pointerId !== drag.pointer) return; blueprintDrag = null;
    commitBlueprintDrag(drag);
  });
  $("blueprint-selection").addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const g = event.currentTarget._blueprintGeometry; if (!g) return;
    event.preventDefault();
    if (event.altKey && !g.resizable) { $("blueprint-status").textContent = "Inline text cannot be resized directly. Select a container."; return; }
    const step = event.shiftKey ? 10 : 1;
    const x = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const y = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const dx = event.altKey ? clamp(x, 8 - g.width, g.frameWidth - g.x - g.width) : clamp(x, -g.x, g.frameWidth - g.x - g.width);
    const dy = event.altKey ? clamp(y, 8 - g.height, g.frameHeight - g.y - g.height) : clamp(y, -g.y, g.frameHeight - g.y - g.height);
    commitBlueprintDrag({geometry:g, resize:event.altKey, dx, dy}).then(() => {
      const overlay = $("blueprint-selection");
      if (!overlay.hidden) overlay.focus();
      else $("blueprint").addEventListener("load", () => { if (!overlay.hidden) overlay.focus(); }, {once:true});
    });
  });
  function visualMove(direction) {
    const {template, name} = visualDocument(), node = visualNode(template.content, visualPath);
    const sibling = direction < 0 ? node.previousElementSibling : node.nextElementSibling;
    if (!sibling) return;
    if (direction < 0) node.parentNode.insertBefore(node, sibling); else node.parentNode.insertBefore(sibling, node);
    visualHistory.push({name, content:files.get(name), path:visualPath.slice()});
    if (visualHistory.length > 30) visualHistory.shift(); $("visual-undo").disabled = false;
    files.set(name, P.bytes(template.innerHTML)); if (activeFile === name) $("source").value = P.text(files.get(name));
    visualPath[visualPath.length - 1] += direction; changed(); blueprintRender(); visualSelect(visualPath);
  }
  $("visual-undo").onclick = async () => {
    const previous = visualHistory.pop(); if (!previous) return;
    files.set(previous.name, previous.content); visualPath = previous.path;
    if (activeFile === previous.name) $("source").value = P.text(previous.content);
    $("visual-undo").disabled = !visualHistory.length; changed(); blueprintRender(); visualRefresh();
    if (running) await run();
  };
  for (const [id, direction] of [["visual-up", -1], ["visual-down", 1]]) $(id).onclick = () => { try { visualMove(direction); } catch (e) { $("visual-status").textContent = e.message; } };
  $("visual-pick").onclick = () => { visualPick = !visualPick; $("visual-pick").setAttribute("aria-pressed", String(visualPick)); $("visual-pick").textContent = "Select on preview: " + (visualPick ? "on" : "off"); if (running) send("visual-pick", visualPick); };
  window.StudioControl = Object.freeze({
    inspect() { const {template} = visualDocument(); const nodes = []; function visit(parent, path) { Array.from(parent.children).forEach((node, i) => { const p = path.concat(i); nodes.push({path:p, tag:node.localName, id:node.id, classes:Array.from(node.classList), text:node.children.length ? null : node.textContent}); visit(node,p); }); } visit(template.content, []); return {manifest: JSON.parse(P.text(files.get("panel.json"))), nodes, previewRunning:running, previewDirty}; },
    select: visualSelect, update: visualApply, run, save: saveDraft,
    async setColors(settings) { await colorEngineReady; return setColorSettings(settings); },
    colors() { return {settings:{...colorSettings}, themes:structuredClone(data.themes)}; },
    examples() { return data.examples.map(({id, title}) => ({id, title})); },
    loadExample(id, replace) {
      if (replace !== true) throw Error("Set replace to true to replace the current workspace.");
      const example = data.examples.find(item => item.id === id);
      if (!example) throw Error("Unknown example.");
      ++importEpoch;
      loadFiles(new Map([...Object.entries(example.files).map(([name, value]) => [name, P.bytes(value)]), ...Object.entries(example.assets || {}).map(([name, value]) => [name, P.from64(value)])]), example.title);
      visualRefresh(); return {id, title:example.title};
    },
    diagnostics() { return {validation: validate(), runtime: $("runtime-status").textContent, logs: logs.slice(-50)}; },
    setPreview(options) {
      if (!options || typeof options !== "object") throw Error("Preview options required.");
      if (options.theme !== undefined) {
        if (!Object.hasOwn(data.themes, options.theme)) throw Error("Unknown theme.");
        $("theme").value = options.theme; $("theme").dispatchEvent(new Event("change"));
      }
      if (options.size !== undefined) {
        const size = options.size;
        if (!size || !Number.isInteger(size.columns) || !Number.isInteger(size.rows) || size.columns < 1 || size.columns > 2 || size.rows < 1 || size.rows > 3) throw Error("Invalid preview size.");
        selectedSize = {columns:size.columns, rows:size.rows}; syncExpressionSize(); resize(selectedSize); if (running) send("size", selectedSize);
        $("sizes").querySelectorAll("button").forEach(el => el.setAttribute("aria-pressed", String(Number(el.dataset.columns) === size.columns && Number(el.dataset.rows) === size.rows)));
      }
      return {theme:$("theme").value, size:selectedSize};
    },
  });
  $("source").oninput = () => {
    files.set(activeFile, P.bytes($("source").value));
    visualHistory.length = 0; $("visual-undo").disabled = true;
    changed();
    blueprintRender();
  };
  $("source").onkeyup = $("source").onclick = updateFileInfo;
  $("source").onkeydown = (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const field = e.target,
        start = field.selectionStart,
        end = field.selectionEnd;
      field.setRangeText("  ", start, end, "end");
      field.dispatchEvent(new Event("input"));
    }
  };
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      run();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveDraft();
    }
  });
  $("run").onclick = run;
  $("validate").onclick = () => {
    validate();
    status("Validation complete.");
  };
  $("save-draft").onclick = saveDraft;
  $("open-package").onclick = () => $("zip-input").click();
  $("zip-input").onchange = (e) => {
    openZip(e.target.files[0]);
    e.target.value = "";
  };
  $("new-package").onclick = () => $("new-dialog").showModal();
  $("cancel-new").onclick = () => $("new-dialog").close();
  $("new-form").onsubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    if (!mayReplace()) return;
    ++importEpoch;
    loadFiles(
      starter(form.elements.id.value, form.elements.title.value.trim()),
      form.elements.title.value,
    );
    $("new-dialog").close();
  };
  $("format-file").onclick = () => {
    try {
      files.set(
        activeFile,
        P.bytes(JSON.stringify(JSON.parse($("source").value), null, 2) + "\n"),
      );
      selectFile(activeFile);
      changed();
    } catch (e) {
      status(e.message, true);
    }
  };
  $("remove-file").onclick = () => {
    if (
      activeFile !== "panel.json" &&
      confirm(
        "Remove " +
          activeFile +
          " from this workspace? Update its manifest declaration too.",
      )
    ) {
      files.delete(activeFile);
      selectFile("panel.json");
      changed();
    }
  };
  $("add-file").onclick = () => $("asset-input").click();
  $("asset-input").onchange = async (e) => {
    const uploads = Array.from(e.target.files);
    e.target.value = "";
    try {
      const additions = [];
      let total = Array.from(files.values()).reduce((n, v) => n + v.length, 0);
      for (const file of uploads) {
        const name = P.path("assets/" + file.name);
        total += file.size;
        if (total > P.LIMIT || files.size + additions.length >= 256)
          throw Error("Package limit: 16 MiB / 256 files");
        if (files.has(name)) throw Error("Asset already exists: " + name);
        additions.push([name, new Uint8Array(await file.arrayBuffer())]);
      }
      const m = JSON.parse(P.text(files.get("panel.json")));
      for (const [name, value] of additions) {
        files.set(name, value);
        if (!m.assets.includes(name)) m.assets.push(name);
      }
      files.set("panel.json", P.bytes(JSON.stringify(m, null, 2) + "\n"));
      selectFile("panel.json");
      changed();
      status(
        "Assets added and declared. Reference with asset:assets/filename.",
      );
    } catch (e) {
      status(e.message, true);
    }
  };
  for (const tab of ["visual", "source", "manifest", "guide"])
    $(tab + "-tab").onclick = () => editorTab(tab);
  for (const tab of ["notifications", "console", "events", "data"])
    $(tab + "-tab").onclick = () => debugTab(tab);
  $("api-preset").onchange = () => {
    if (!$("api-preset").value) return;
    $("api-source").value = JSON.stringify(
      PanelDataAPI.preset($("api-preset").value),
      null,
      2,
    );
    readFixture();
    changed();
  };
  $("api-enabled").onchange = () => {
    try {
      const fixture = JSON.parse($("api-source").value);
      fixture.enabled = $("api-enabled").checked;
      $("api-source").value = JSON.stringify(fixture, null, 2);
      readFixture();
      changed();
    } catch (e) {
      $("api-status").textContent =
        "Fix fixture JSON before toggling: " + e.message;
      $("api-status").className = "error";
    }
  };
  $("api-source").oninput = () => {
    changed();
    try {
      const value = JSON.parse($("api-source").value);
      $("api-enabled").checked = value.enabled === true;
    } catch (_) {}
    $("api-status").textContent =
      "Edited data has not been applied. Apply & rerun when ready.";
  };
  $("api-validate").onclick = () => {
    try {
      readFixture();
    } catch (_) {}
  };
  $("api-apply").onclick = run;
  $("api-clear").onclick = () => {
    apiRequests.length = 0;
    selectedRequest = null;
    renderRequests();
  };
  $("api-export").onclick = () => {
    try {
      const fixture = readFixture();
      download(
        new Blob([JSON.stringify(fixture, null, 2)], {
          type: "application/json",
        }),
        "panel-studio-data.json",
      );
    } catch (_) {}
  };
  $("api-import").onclick = () => $("api-file").click();
  $("api-file").onchange = async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 512 * 1024) throw Error("Fixture exceeds 512 KiB");
      const fixture = PanelDataAPI.validate(JSON.parse(await file.text()));
      $("api-source").value = JSON.stringify(fixture, null, 2);
      readFixture();
      changed();
    } catch (e) {
      $("api-status").textContent = "Import failed: " + e.message;
      $("api-status").className = "error";
    }
  };
  document.querySelectorAll('[role="tablist"]').forEach((list) => {
    list.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
      let next = tabs.indexOf(document.activeElement);
      if (next < 0) return;
      event.preventDefault();
      next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (next + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
              tabs.length;
      tabs[next].click();
      tabs[next].focus();
    });
  });
  $("manifest-view").onsubmit = (e) => {
    e.preventDefault();
    try {
      const m = JSON.parse(P.text(files.get("panel.json")));
      for (const field of [
        "id",
        "title",
        "version",
        "rootClass",
        "colorRole",
        "description",
      ])
        m[field] = e.target.elements[field].value;
      m.defaultEnabled = e.target.elements.defaultEnabled.checked;
      files.set("panel.json", P.bytes(JSON.stringify(m, null, 2) + "\n"));
      if (activeFile === "panel.json")
        $("source").value = P.text(files.get("panel.json"));
      changed();
      validate();
      $("manifest-status").textContent =
        "Fields applied. Validate before running.";
    } catch (e) {
      $("manifest-status").textContent = e.message;
    }
  };
  $("sizes").onclick = (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    selectedSize = {
      columns: Number(button.dataset.columns),
      rows: Number(button.dataset.rows),
    };
    syncExpressionSize();
    $("sizes")
      .querySelectorAll("button")
      .forEach((el) => el.setAttribute("aria-pressed", String(el === button)));
    resize(selectedSize);
    if (running) send("size", selectedSize);
  };
  for (const key of ["cell-width", "cell-height"])
    $(key).onchange = () => {
      resize(selectedSize);
      if (running) send("size", selectedSize);
    };
  const changeColor = () => {
    colorEngineReady.then(() => setColorSettings({seed:$("color-seed").value, variant:$("color-variant").value})).catch(error => { $("color-engine-status").textContent = "Color generation failed: " + error.message; });
  };
  $("color-seed").oninput = changeColor;
  $("color-seed-hex").onchange = () => {
    const seed = $("color-seed-hex").value.trim();
    if (!/^#[0-9a-f]{6}$/i.test(seed)) { $("color-engine-status").textContent = "Enter a color as #RRGGBB."; return; }
    $("color-seed").value = seed; changeColor();
  };
  $("color-variant").onchange = changeColor;
  $("export-colors").onclick = () => download(new Blob([JSON.stringify({source:colorSettings.seed, variant:colorSettings.variant, specVersion:"2021", minimal:"ThinkView custom monochrome", themes:data.themes}, null, 2)], {type:"application/json"}), "thinkview-studio-color-schemes.json");
  $("theme").onchange = () => {
    renderColors();
    if (designWorkbench) designWorkbench.refresh();
    blueprintRender();
    if (running) send("theme", $("theme").value);
  };
  $("color-theme").onchange = () => {
    $("theme").value = $("color-theme").value;
    $("theme").onchange();
  };
  $("color-search").oninput = renderColors;
  $("pinned").onchange = () => {
    if (running) send("pinned", $("pinned").checked);
  };
  $("allow-network").onchange = () =>
    status("Network setting applies on the next Run preview.");
  $("dismiss-attention").onclick = () => send("dismiss-attention");
  $("mount").onclick = () => send("toggle");
  $("remount").onclick = () => send("remount");
  $("restore-size").onclick = () => send("restore");
  $("clear-storage").onclick = () => {
    if (running) send("storage-reset");
    else if (manifest?.id) {
      delete panelStorage[manifest.id];
      saveDraft();
      status("Preview storage reset.");
    }
  };
  function syncPresentation() {
    const priority = $("notification-form").elements.priority.value;
    $("presentation").value = presentation[priority];
  }
  $("notification-form").elements.priority.onchange = syncPresentation;
  $("presentation").onchange = () => {
    const priority = $("notification-form").elements.priority.value;
    presentation[priority] = $("presentation").value;
    if (running)
      send("presentation", { priority, behavior: presentation[priority] });
  };
  $("notification-form").onsubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    send("publish", {
      id: form.elements.id.value,
      title: form.elements.title.value,
      message: form.elements.message.value,
      priority: form.elements.priority.value,
      bound: form.elements.bound.checked,
    });
  };
  $("priority-test").onclick = () => {
    for (const priority of ["medium", "high", "emergency", "low"])
      send("publish", {
        id: "sequence-" + priority,
        title: priority + " priority test",
        message:
          "Dismiss higher-priority items to inspect the next eligible item.",
        priority,
        bound: true,
      });
  };
  $("clear-notifications").onclick = () => send("clear");
  $("clear-console").onclick = () => {
    logs.length = 0;
    renderLogs();
  };
  $("download-log").onclick = () =>
    download(
      new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" }),
      "panel-studio-debug.json",
    );
  $("export-zip").onclick = () => {
    try {
      const result = validate();
      if (result.errors.length)
        throw Error("Fix validation errors before exporting");
      download(
        P.zip(P.declaredFiles(files, result.manifest)),
        result.manifest.id + "-" + result.manifest.version + ".zip",
      );
    } catch (e) {
      status(e.message, true);
    }
  };
  $("export-json").onclick = () => {
    try {
      const result = validate();
      if (result.errors.length)
        throw Error("Fix validation errors before exporting");
      const pkg = P.toRuntimePackage(files, result.manifest, result.entries);
      const output = new Blob([JSON.stringify(pkg, null, 2)], {
        type: "application/json",
      });
      if (output.size > 2 * 1024 * 1024)
        throw Error(
          "Dashboard JSON exceeds its 2 MiB import limit. Reduce assets or use ZIP for source distribution.",
        );
      download(
        output,
        result.manifest.id + "-" + result.manifest.version + ".json",
      );
    } catch (e) {
      status(e.message, true);
    }
  };
  for (const example of data.examples) {
    const option = document.createElement("option");
    option.value = example.id;
    option.textContent = example.title;
    $("examples").append(option);
  }
  $("examples").onchange = () => {
    const example = data.examples.find((p) => p.id === $("examples").value);
    if (!example) return;
    if (mayReplace()) {
      ++importEpoch;
      loadFiles(
        new Map(
          [
            ...Object.entries(example.files).map(([name, value]) => [name, P.bytes(value)]),
            ...Object.entries(example.assets || {}).map(([name, value]) => [name, P.from64(value)]),
          ],
        ),
        example.title,
      );
    } else $("examples").value = "";
  };
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      dragDepth++;
      document.body.classList.add("dragging");
    }
  });
  window.addEventListener("dragover", (e) => {
    if (e.dataTransfer.types.includes("Files")) e.preventDefault();
  });
  window.addEventListener("dragleave", () => {
    if (--dragDepth <= 0) {
      dragDepth = 0;
      document.body.classList.remove("dragging");
    }
  });
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove("dragging");
    const file = e.dataTransfer.files[0];
    if (file) openZip(file);
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      saveDraft();
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
  });
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey) || "null");
    if (saved?.files) {
      const next = new Map(
        saved.files.map(([name, value]) => [P.path(name), P.from64(value)]),
      );
      if (
        !next.has("panel.json") ||
        next.size > 256 ||
        Array.from(next.values()).reduce((n, v) => n + v.length, 0) > P.LIMIT
      )
        throw Error("Invalid stored draft");
      files = next;
      if (saved.colorSettings && /^#[0-9a-f]{6}$/i.test(saved.colorSettings.seed) && ["expressive", "tonalSpot"].includes(saved.colorSettings.variant)) colorSettings = {seed:saved.colorSettings.seed.toLowerCase(), variant:saved.colorSettings.variant};
      if (saved.designMetadata && saved.designMetadata.version === 1 &&
          saved.designMetadata.workspaces && typeof saved.designMetadata.workspaces === "object" &&
          !Array.isArray(saved.designMetadata.workspaces)) designMetadata = saved.designMetadata;
      Object.assign(panelStorage, saved.storage || {});
      if (
        typeof saved.fixtureText === "string" &&
        saved.fixtureText.length <= 512 * 1024
      )
        $("api-source").value = saved.fixtureText;
      selectFile(files.has(saved.activeFile) ? saved.activeFile : "panel.json");
      validate();
      status("Restored local draft. Review source, then run preview.");
    } else {
      files = starter("my-panel", "My panel");
      selectFile("panel.js");
      validate();
    }
  } catch (e) {
    files = starter("my-panel", "My panel");
    selectFile("panel.js");
    validate();
    status("Could not restore draft: " + e.message, true);
  }
  designWorkbench = StudioM3Workbench.mount({
    root: $("m3-design"), themes: data.themes,
    getManifest: () => manifest, getTheme: () => $("theme").value,
    getMetadata: () => designMetadata,
    onProfile: showExpression,
    onSpanChange: span => {
      const [columns, rows] = span.split("×").map(Number);
      selectedSize = {columns, rows};
      syncExpressionSize();
      $("sizes").querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.columns) === columns && Number(button.dataset.rows) === rows)));
      resize(selectedSize); if (running) send("size", selectedSize);
    },
    changed: () => { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 700); }
  });
  syncExpressionSize();
  resize(selectedSize);
  renderColors();
  try {
    readFixture();
  } catch (_) {}
  syncPresentation();
  blueprintReady = true;
  $("color-seed").value = colorSettings.seed;
  $("color-seed-hex").value = colorSettings.seed;
  $("color-variant").value = colorSettings.variant;
  colorEngineReady = loadColorEngine().then(engine => { colorEngine = engine; return setColorSettings(colorSettings, false); }).catch(error => {
    $("color-engine-status").textContent = "Material color generation unavailable: " + error.message + ". Showing built-in colors.";
    $("color-seed").disabled = $("color-seed-hex").disabled = $("color-variant").disabled = $("export-colors").disabled = true;
    log("error", "Material color engine: " + error.message);
  });
  blueprintRender();
  visualRefresh();
  editorTab("visual");
})();
