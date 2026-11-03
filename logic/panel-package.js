/* Browser-local package IO. No package code is executed by these helpers. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PanelPackage = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const encoder = new TextEncoder(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  const LIMIT = 16 * 1024 * 1024,
    MAX_FILES = 256;
  const text = (bytes) => decoder.decode(bytes);
  const bytes = (value) => encoder.encode(value);
  function path(name) {
    if (
      typeof name !== "string" ||
      !name ||
      name.length > 240 ||
      /[\\\x00-\x1f:]/.test(name) ||
      name.startsWith("/") ||
      name.split("/").some((p) => !p || p === "." || p === "..")
    )
      throw Error("Unsafe package path: " + name);
    return name;
  }
  function metadata(name) {
    return name.split("/").some((part) => part === "__MACOSX" || part === ".DS_Store" || part.startsWith("._"));
  }
  function packageRoots(files) {
    const roots = [];
    for (const [name, data] of files) {
      path(name);
      if (metadata(name) || !(name === "panel.json" || name.endsWith("/panel.json"))) continue;
      let m = {};
      try { m = JSON.parse(text(data)); } catch (_) {}
      const safe = (v) => typeof v === "string" ? v.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 120) : "";
      roots.push({ manifestPath: name, title: safe(m.title), id: safe(m.id) });
    }
    return roots;
  }
  function packageAt(files, manifestPath) {
    path(manifestPath);
    if (metadata(manifestPath) || !(manifestPath === "panel.json" || manifestPath.endsWith("/panel.json")) || !files.has(manifestPath)) throw Error("Missing package manifest: " + manifestPath);
    const prefix = manifestPath.slice(0, -"panel.json".length), result = new Map();
    for (const [name, data] of files) {
      path(name);
      if (name.startsWith(prefix) && !metadata(name)) result.set(name.slice(prefix.length), data);
    }
    return result;
  }
  function assetFiles(files, manifest) {
    for (const name of files.keys()) path(name);
    const reserved = new Set(["panel.json", ...Object.values(manifest.entries)].map(path));
    const found = new Set();
    for (const declaration of manifest.assets) {
      const directory = declaration.endsWith("/");
      const name = path(directory ? declaration.slice(0, -1) : declaration);
      let matches = !directory && files.has(name) ? [name] : [...files.keys()].filter((f) => f.startsWith(name + "/") && !metadata(f));
      if (!matches.length) throw Error("Missing or empty asset: " + declaration);
      for (const f of matches) {
        if (reserved.has(f) || found.has(f)) throw Error("Manifest, entries, and assets must use distinct paths: " + f);
        found.add(f);
      }
    }
    return [...found];
  }
  const table = Array.from({ length: 256 }, (_, n) => {
    for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc(data) {
    let n = 0xffffffff;
    for (const b of data) n = table[(n ^ b) & 255] ^ (n >>> 8);
    return (n ^ 0xffffffff) >>> 0;
  }
  async function unzip(input) {
    const data = new Uint8Array(input),
      view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (data.length > LIMIT) throw Error("ZIP exceeds 16 MiB limit");
    let end = -1;
    for (
      let at = data.length - 22;
      at >= Math.max(0, data.length - 65557);
      at--
    ) {
      if (
        view.getUint32(at, true) === 0x06054b50 &&
        at + 22 + view.getUint16(at + 20, true) === data.length
      ) {
        end = at;
        break;
      }
    }
    if (end < 0) throw Error("Not a complete ZIP archive");
    const count = view.getUint16(end + 10, true),
      start = view.getUint32(end + 16, true),
      size = view.getUint32(end + 12, true);
    if (
      view.getUint16(end + 4, true) ||
      view.getUint16(end + 6, true) ||
      count !== view.getUint16(end + 8, true) ||
      count > MAX_FILES ||
      start + size !== end
    )
      throw Error("Unsupported multi-disk, ZIP64, or oversized archive");
    const files = new Map(), seen = new Set();
    let at = start,
      total = 0;
    for (let i = 0; i < count; i++) {
      if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50)
        throw Error("Invalid ZIP directory");
      const flags = view.getUint16(at + 8, true),
        method = view.getUint16(at + 10, true),
        checksum = view.getUint32(at + 16, true),
        packed = view.getUint32(at + 20, true),
        length = view.getUint32(at + 24, true),
        n = view.getUint16(at + 28, true),
        extra = view.getUint16(at + 30, true),
        comment = view.getUint16(at + 32, true),
        offset = view.getUint32(at + 42, true);
      const name = text(data.subarray(at + 46, at + 46 + n));
      at += 46 + n + extra + comment;
      if (at > end || flags & 1 || ![0, 8].includes(method))
        throw Error("Encrypted or unsupported ZIP member: " + name);
      const directory = name.endsWith("/");
      path(directory ? name.slice(0, -1) : name);
      if (seen.has(name)) throw Error("Duplicate ZIP member: " + name);
      seen.add(name);
      if ((total += length) > LIMIT || length > LIMIT)
        throw Error("Expanded package exceeds 16 MiB limit");
      if (offset + 30 > start || view.getUint32(offset, true) !== 0x04034b50)
        throw Error("Invalid ZIP local header");
      const localN = view.getUint16(offset + 26, true),
        localExtra = view.getUint16(offset + 28, true),
        body = offset + 30 + localN + localExtra;
      if (
        body + packed > start ||
        text(data.subarray(offset + 30, offset + 30 + localN)) !== name ||
        view.getUint16(offset + 8, true) !== method
      )
        throw Error("ZIP header mismatch: " + name);
      let output = data.slice(body, body + packed);
      if (method === 8) {
        if (typeof DecompressionStream === "undefined")
          throw Error(
            "This browser cannot read compressed ZIPs. Use a current Chrome or Firefox.",
          );
        const reader = new Blob([output])
            .stream()
            .pipeThrough(new DecompressionStream("deflate-raw"))
            .getReader(),
          chunks = [];
        let expanded = 0;
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            expanded += chunk.value.length;
            if (expanded > length || expanded > LIMIT)
              throw Error("ZIP member expands beyond declared size");
            chunks.push(chunk.value);
          }
        } finally {
          await reader.cancel();
        }
        output = new Uint8Array(expanded);
        let cursor = 0;
        for (const chunk of chunks) {
          output.set(chunk, cursor);
          cursor += chunk.length;
        }
      }
      if (output.length !== length || crc(output) !== checksum)
        throw Error("ZIP integrity check failed: " + name);
      if (directory && output.length) throw Error("Nonempty ZIP directory: " + name);
      if (!directory && !metadata(name)) files.set(name, output);
    }
    if (at !== end) throw Error("Invalid ZIP directory size");
    return files;
  }
  function zip(files) {
    files = new Map([...files].filter(([name]) => { path(name); return !metadata(name); }));
    if (files.size > MAX_FILES) throw Error("Too many package files");
    const local = [],
      central = [];
    let offset = 0,
      total = 0;
    for (const [name, data] of files) {
      path(name);
      total += data.length;
      if (total > LIMIT) throw Error("Package exceeds 16 MiB limit");
      const nameBytes = bytes(name),
        checksum = crc(data),
        head = new Uint8Array(30 + nameBytes.length),
        h = new DataView(head.buffer);
      h.setUint32(0, 0x04034b50, true);
      h.setUint16(4, 20, true);
      h.setUint16(6, 0x800, true);
      h.setUint16(12, 33, true);
      h.setUint32(14, checksum, true);
      h.setUint32(18, data.length, true);
      h.setUint32(22, data.length, true);
      h.setUint16(26, nameBytes.length, true);
      head.set(nameBytes, 30);
      local.push(head, data);
      const dir = new Uint8Array(46 + nameBytes.length),
        d = new DataView(dir.buffer);
      d.setUint32(0, 0x02014b50, true);
      d.setUint16(4, 20, true);
      d.setUint16(6, 20, true);
      d.setUint16(8, 0x800, true);
      d.setUint16(14, 33, true);
      d.setUint32(16, checksum, true);
      d.setUint32(20, data.length, true);
      d.setUint32(24, data.length, true);
      d.setUint16(28, nameBytes.length, true);
      d.setUint32(42, offset, true);
      dir.set(nameBytes, 46);
      central.push(dir);
      offset += head.length + data.length;
    }
    const centralSize = central.reduce((sum, v) => sum + v.length, 0),
      end = new Uint8Array(22),
      e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.size, true);
    e.setUint16(10, files.size, true);
    e.setUint32(12, centralSize, true);
    e.setUint32(16, offset, true);
    return new Blob([...local, ...central, end], { type: "application/zip" });
  }
  function schemaErrors(value, schema, location = "manifest") {
    const errors = [],
      fail = (message) => errors.push(location + ": " + message);
    if (schema.const !== undefined && value !== schema.const)
      fail("must equal " + JSON.stringify(schema.const));
    if (schema.enum && !schema.enum.includes(value))
      fail("choose " + schema.enum.join(", "));
    const type = Array.isArray(value)
      ? "array"
      : value === null
        ? "null"
        : typeof value;
    if (
      schema.type &&
      (schema.type === "integer"
        ? !Number.isInteger(value)
        : type !== schema.type)
    ) {
      fail("must be " + schema.type);
      return errors;
    }
    if (type === "string") {
      if (schema.minLength && value.trim().length < schema.minLength)
        fail("cannot be empty");
      if (schema.pattern && !new RegExp(schema.pattern).test(value))
        fail("invalid format");
    }
    if (
      type === "number" &&
      (value < (schema.minimum ?? -Infinity) ||
        value > (schema.maximum ?? Infinity))
    )
      fail("out of bounds");
    if (type === "array") {
      if (
        value.length < (schema.minItems || 0) ||
        value.length > (schema.maxItems ?? Infinity)
      )
        fail("invalid item count");
      if (
        schema.uniqueItems &&
        new Set(value.map((v) => JSON.stringify(v))).size !== value.length
      )
        fail("duplicate items");
      if (schema.items)
        value.forEach((v, i) =>
          errors.push(
            ...schemaErrors(v, schema.items, location + "[" + i + "]"),
          ),
        );
      if (
        schema.contains &&
        !value.some((v) => !schemaErrors(v, schema.contains).length)
      )
        fail("required item missing");
    }
    if (type === "object") {
      for (const key of schema.required || [])
        if (!Object.hasOwn(value, key)) fail("missing " + key);
      for (const [key, v] of Object.entries(value)) {
        if (schema.propertyNames)
          errors.push(
            ...schemaErrors(key, schema.propertyNames, location + "." + key),
          );
        if (schema.properties && Object.hasOwn(schema.properties, key))
          errors.push(
            ...schemaErrors(v, schema.properties[key], location + "." + key),
          );
        else if (schema.additionalProperties === false)
          fail("unknown field " + key);
        else if (typeof schema.additionalProperties === "object")
          errors.push(
            ...schemaErrors(
              v,
              schema.additionalProperties,
              location + "." + key,
            ),
          );
      }
    }
    if (
      schema.oneOf &&
      schema.oneOf.filter((s) => !schemaErrors(value, s).length).length !== 1
    )
      fail("invalid event rule");
    for (const s of schema.allOf || [])
      errors.push(...schemaErrors(value, s, location));
    if (schema.if && !schemaErrors(value, schema.if).length && schema.then)
      errors.push(...schemaErrors(value, schema.then, location));
    return errors;
  }
  function validate(files, schema, expansion) {
    const errors = [],
      warnings = [];
    let manifest,
      entries = {};
    try {
      for (const name of files.keys()) path(name);
      if (!files.has("panel.json"))
        throw Error("ZIP root must contain panel.json");
      manifest = JSON.parse(text(files.get("panel.json")));
      errors.push(...schemaErrors(manifest, schema));
      if (errors.length) return { manifest, entries, errors, warnings };
      if (!expansion.valid(manifest))
        errors.push(
          "Expansion sizes must be unique and contain the default grid and every event size",
        );
      const declared = [
        "panel.json",
        ...Object.values(manifest.entries),
        ...assetFiles(files, manifest),
      ];
      if (new Set(declared).size !== declared.length)
        errors.push("Manifest, entries, and assets must use distinct paths");
      for (const name of declared) {
        path(name);
        if (!files.has(name)) errors.push("Missing declared file: " + name);
      }
      for (const name of files.keys())
        if (!declared.includes(name))
          warnings.push("Not exported: undeclared file " + name);
      for (const [kind, name] of Object.entries(manifest.entries))
        if (files.has(name)) entries[kind] = text(files.get(name));
      if (/<\s*script\b|\son[a-z]+\s*=/i.test(entries.html || ""))
        errors.push("HTML: place scripts and event listeners in the JS entry");
      if (
        /<\/script/i.test(entries.js || "") ||
        /<\/style|@import/i.test(entries.css || "")
      )
        errors.push("Closing wrapper tags and CSS @import are not allowed");
      const css = (entries.css || "").replace(/\/\*[\s\S]*?\*\//g, ""),
        escaped = manifest.id.replace(/-/g, "\\-");
      for (const match of css.matchAll(/([^{}]+)\{/g)) {
        const group = match[1].trim();
        if (group.startsWith("@") || /^(from|to|[0-9.]+%)$/.test(group))
          continue;
        for (const selector of group.split(","))
          if (
            !new RegExp(
              "\\." +
                escaped +
                "-[a-zA-Z0-9_-]+|\\[data-panel\\s*=\\s*[\"']?" +
                escaped +
                "[\"']?\\]",
            ).test(selector)
          )
            errors.push("Unscoped CSS: " + selector.trim());
      }
      const ids = new Set();
      for (const m of (entries.html || "").matchAll(
        /\bid\s*=\s*["']([^"']+)["']/gi,
      )) {
        if (ids.has(m[1])) errors.push("Duplicate HTML ID: " + m[1]);
        ids.add(m[1]);
      }
      for (const kind of ["html", "css"])
        for (const m of (entries[kind] || "").matchAll(
          /asset:([A-Za-z0-9_./-]+)/g,
        ))
          if (!declared.includes(m[1]) || !assetFiles(files, manifest).includes(m[1]))
            errors.push("Undeclared asset: " + m[1]);
      try {
        new Function("ctx", entries.js || "");
      } catch (e) {
        errors.push("JavaScript: " + e.message);
      }
    } catch (e) {
      errors.push(e.message);
    }
    return { manifest, entries, errors: [...new Set(errors)], warnings };
  }
  function declaredFiles(files, manifest) {
    return new Map(
      [
        "panel.json",
        ...Object.values(manifest.entries),
        ...assetFiles(files, manifest),
      ].map((name) => [path(name), files.get(name)]),
    );
  }
  function base64(data) {
    let s = "";
    for (let i = 0; i < data.length; i += 8192)
      s += String.fromCharCode(...data.subarray(i, i + 8192));
    return btoa(s);
  }
  function from64(s) {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  }
  function mime(name) {
    return (
      {
        svg: "image/svg+xml",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        woff2: "font/woff2",
        mp3: "audio/mpeg",
        json: "application/json",
      }[name.split(".").pop().toLowerCase()] || "application/octet-stream"
    );
  }
  function embedded(files, manifest, entries) {
    const allowed = new Set(assetFiles(files, manifest));
    return Object.fromEntries(
      Object.entries(entries).map(([kind, value]) => [
        kind,
        ["html", "css"].includes(kind)
          ? value.replace(
              /asset:([A-Za-z0-9_./-]+)/g,
              (_, name) => {
                if (!allowed.has(name)) throw Error("Undeclared asset: " + name);
                return "data:" + mime(name) + ";base64," + base64(files.get(name));
              },
            )
          : value,
      ]),
    );
  }
  function toRuntimePackage(files, manifest, entries) {
    return { format: "thinkview-panel-1", manifest, entries: embedded(files, manifest, entries), assetData: Object.fromEntries(assetFiles(files, manifest).map(name => [name, "data:" + mime(name) + ";base64," + base64(files.get(name))])) };
  }
  return {
    toRuntimePackage,
    text,
    bytes,
    path,
    crc,
    zip,
    unzip,
    validate,
    schemaErrors,
    declaredFiles,
    packageRoots,
    packageAt,
    assetFiles,
    base64,
    from64,
    embedded,
    mime,
    LIMIT,
  };
});
