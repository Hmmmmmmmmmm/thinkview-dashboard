const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const P = require("../studio/package.js");
const expansion = require("../logic/panel-expansion.js");
const schema = require("../schemas/panel.schema.json");
const root = path.resolve(__dirname, "..");
function panel(id = "focus") {
  const dir = path.join(root, "panels", id),
    m = JSON.parse(fs.readFileSync(path.join(dir, "panel.json")));
  return new Map(
    ["panel.json", ...Object.values(m.entries), ...m.assets].map((name) => [
      name,
      new Uint8Array(fs.readFileSync(path.join(dir, name))),
    ]),
  );
}
function mutate(files, change) {
  const m = JSON.parse(P.text(files.get("panel.json")));
  change(m);
  files.set("panel.json", P.bytes(JSON.stringify(m)));
  return files;
}
test("Studio validates every current package against the current schema and expansion contract", () => {
  for (const id of require("../panels/catalog.json").panels)
    assert.deepEqual(P.validate(panel(id), schema, expansion).errors, [], id);
});
test("ZIP round trip preserves declared source and binary assets exactly", async () => {
  const files = mutate(panel(), (m) => m.assets.push("assets/icon.png"));
  files.set("assets/icon.png", Uint8Array.from([0, 255, 42, 0, 128]));
  const roundtrip = await P.unzip(await P.zip(files).arrayBuffer());
  assert.deepEqual(roundtrip, files);
  assert.equal(P.validate(roundtrip, schema, expansion).errors.length, 0);
  const m = JSON.parse(P.text(files.get("panel.json")));
  const entries = P.embedded(files, m, {
    html: '<img src="asset:assets/icon.png">',
    css: "",
    js: "",
  });
  assert.match(entries.html, /data:image\/png;base64,AP8qAIA=/);
});
test("reads the same deflated ZIP format as the Python package exporter", async () => {
  const input = execFileSync("python3", [
    "-c",
    'import io,zipfile,sys\nb=io.BytesIO()\nwith zipfile.ZipFile(b,"w",zipfile.ZIP_DEFLATED) as z: z.writestr("panel.json",b"{\\"schemaVersion\\":1}")\nsys.stdout.buffer.write(b.getvalue())',
  ]);
  const files = await P.unzip(input);
  assert.equal(P.text(files.get("panel.json")), '{"schemaVersion":1}');
});
test("rejects traversal, duplicate members, corrupt CRC, truncated ZIPs and expansion bombs", async () => {
  for (const name of [
    "../panel.json",
    "/panel.json",
    "assets/../x",
    "C:\\x",
    "a//b",
    "./x",
  ])
    assert.throws(() => P.path(name));
  const input = new Uint8Array(
    await P.zip(new Map([["a.txt", P.bytes("abc")]])).arrayBuffer(),
  );
  input[35] ^= 1;
  await assert.rejects(P.unzip(input), /integrity/);
  await assert.rejects(P.unzip(input.slice(0, -5)), /complete/);
  const duplicate = execFileSync("python3", [
    "-c",
    'import io,zipfile,sys,warnings\nwarnings.simplefilter("ignore")\nb=io.BytesIO()\nwith zipfile.ZipFile(b,"w") as z:\n z.writestr("a",b"x")\n z.writestr("a",b"y")\nsys.stdout.buffer.write(b.getvalue())',
  ]);
  await assert.rejects(P.unzip(duplicate), /Duplicate/);
  const bomb = new Uint8Array(
    await P.zip(new Map([["a", P.bytes("x")]])).arrayBuffer(),
  );
  const view = new DataView(bomb.buffer);
  view.setUint32(31 + 1 + 24, P.LIMIT + 1, true);
  await assert.rejects(P.unzip(bomb), /16 MiB/);
});
test("blocks schema drift, missing files, scripts in markup, unscoped CSS, invalid JS and undeclared assets", () => {
  for (const change of [
    (m) => m.capabilities.push("unknown"),
    (m) => (m.unknown = 1),
    (m) => m.capabilities.push("network"),
    (m) => (m.entries.html = "../escape"),
    (m) => (m.entries.html = "missing.html"),
    (m) => (m.expansion.events.timerRun.size = { columns: 1, rows: 2 }),
  ]) {
    assert.ok(
      P.validate(mutate(panel(), change), schema, expansion).errors.length,
    );
  }
  for (const [name, content] of [
    ["panel.html", '<button onclick="alert(1)">x</button>'],
    ["panel.css", "body {color:red}"],
    ["panel.js", "const ="],
    ["panel.html", '<img src="asset:missing.png">'],
  ]) {
    const files = panel();
    files.set(name, P.bytes(content));
    assert.ok(P.validate(files, schema, expansion).errors.length, name);
  }
  const files = panel();
  files.set("private.txt", P.bytes("not declared"));
  const result = P.validate(files, schema, expansion);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.equal(
    P.declaredFiles(files, result.manifest).has("private.txt"),
    false,
  );
});
test("discovers wrapped candidates and confines selected package", () => {
  const files = new Map([["wrapper/a/panel.json", P.bytes('{"id":"a","title":"A"}')], ["wrapper/a/x", Uint8Array.of(1)], ["wrapper/b/panel.json", P.bytes('{"id":"b"}')], ["__MACOSX/panel.json", P.bytes('{}')], ["wrapper/a/._x", Uint8Array.of(2)]]);
  assert.deepEqual(P.packageRoots(files).map(x => x.manifestPath), ["wrapper/a/panel.json", "wrapper/b/panel.json"]);
  assert.deepEqual([...P.packageAt(files, "wrapper/a/panel.json").keys()], ["panel.json", "x"]);
  files.set("__MACOSX/../bad", Uint8Array.of(0));
  assert.throws(() => P.packageRoots(files), /Unsafe/);
});
test("expands asset folders and preserves nested binary files", async () => {
  const files = mutate(panel(), m => { m.assets = ["assets/"]; });
  files.set("assets/nested/icon.png", Uint8Array.of(0, 255, 12));
  const m = JSON.parse(P.text(files.get("panel.json")));
  assert.deepEqual(P.assetFiles(files, m), ["assets/nested/icon.png"]);
  assert.deepEqual(P.validate(files, schema, expansion).errors, []);
  const round = await P.unzip(await P.zip(P.declaredFiles(files, m)).arrayBuffer());
  assert.deepEqual(round.get("assets/nested/icon.png"), Uint8Array.of(0, 255, 12));
  assert.match(P.embedded(round, m, {html:'asset:assets/nested/icon.png'}).html, /AP8M/);
  m.assets = ["absent/"];
  assert.throws(() => P.assetFiles(files, m), /Missing or empty/);
  m.assets = ["assets"];
  assert.deepEqual(P.assetFiles(files, m), ["assets/nested/icon.png"]);
  m.assets = ["panel.html"];
  assert.throws(() => P.assetFiles(files, m), /distinct/);
});
test("reads Python ZIP directory records and removes macOS metadata", async () => {
  const input = execFileSync("python3", ["-c", 'import io,zipfile,sys\nb=io.BytesIO()\nwith zipfile.ZipFile(b,"w") as z:\n z.writestr("wrap/",b"")\n z.writestr("wrap/panel.json",b"{}")\n z.writestr("wrap/.DS_Store",b"x")\n z.writestr("__MACOSX/._panel.json",b"x")\nsys.stdout.buffer.write(b.getvalue())']);
  const files = await P.unzip(input);
  assert.deepEqual([...files.keys()], ["wrap/panel.json"]);
  assert.equal(P.packageRoots(files)[0].manifestPath, "wrap/panel.json");
});
