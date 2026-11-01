const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { TextDecoder } = require('node:util');

function createEnvironment(initial = {}) {
  const records = new Map(Object.entries(initial));
  const values = new Map([['thinkview.notes', '"original"'], ['other.key', '"untouched"']]);
  const storage = { get length() { return values.size; }, key(i) { return [...values.keys()][i]; }, getItem(k) { return values.has(k) ? values.get(k) : null; }, setItem(k,v) { values.set(k,String(v)); }, removeItem(k) { values.delete(k); } };
  const db = { transaction() { const tx = { objectStore() { return { get(k) { return { result: records.get(k) }; }, put(v,k) { records.set(k,v); } }; } }; setImmediate(() => tx.oncomplete && tx.oncomplete()); return tx; } };
  const indexedDB = { open() { const req = { result: db }; setImmediate(() => req.onsuccess()); return req; } };
  const frame = { hidden: true, srcdoc: '' }, notice = { hidden: false, textContent: '' }, callbacks = [];
  const window = {};
  const source = fs.readFileSync('logic/bootstrap.js','utf8').replace('/* BUILTIN_BASE64 */', Buffer.from(JSON.stringify({ config:{storagePrefix:'thinkview.'},avatar:'avatar',bundle:{version:'0.1.0',html:'builtin'} })).toString('base64'));
  const context = { window, document:{getElementById(id) { return id === 'dashboard' ? frame : notice; }}, indexedDB, localStorage:storage, TextDecoder, Uint8Array, atob: s => Buffer.from(s,'base64').toString('binary'), setTimeout:fn => (callbacks.push(fn), callbacks.length), clearTimeout() {} };
  vm.runInNewContext(source, context);
  return { host:window.DashboardBootstrap, frame, values, records, callbacks };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i=0;i<8;i++) await tick(); }

test('verified staged release is applied only after acknowledgement', async () => {
  const e=createEnvironment(); await settle(); assert.equal(e.frame.srcdoc,'builtin');
  await e.host.stage({version:'0.2.0',html:'next'}); await e.host.apply(); assert.equal(e.frame.srcdoc,'next');
  assert.equal(e.records.get('active'),undefined); e.host.ready('0.2.0'); await settle();
  assert.equal(e.records.get('active').version,'0.2.0'); assert.equal(e.records.get('pending'),null); assert.equal(e.records.get('staged'),null);
});
test('failed startup restores dashboard storage without touching unrelated keys', async () => {
  const e=createEnvironment(); await settle(); await e.host.stage({version:'0.2.0',html:'broken'}); await e.host.apply();
  e.values.set('thinkview.notes','"changed"'); e.values.set('thinkview.extra','1'); e.callbacks.at(-1)(); await settle();
  assert.equal(e.frame.srcdoc,'builtin'); assert.equal(e.values.get('thinkview.notes'),'"original"'); assert.equal(e.values.has('thinkview.extra'),false); assert.equal(e.values.get('other.key'),'"untouched"'); assert.equal(e.records.get('staged'),null);
});
test('offline startup uses builtin and active timers defer staged update', async () => {
  const e=createEnvironment({staged:{version:'0.2.0',html:'next'}}); e.values.set('thinkview.panel.focus.state',JSON.stringify({endAt:Date.now()+60000})); await settle();
  assert.equal(e.frame.srcdoc,'builtin'); assert.equal(e.records.get('staged').version,'0.2.0');
});

const { webcrypto, createHash } = require('node:crypto');
function updaterEnvironment(digest, responseStatus, startupErrors = [], cleanup) {
  const nodes = new Map();
  function element(id) { if (!nodes.has(id)) nodes.set(id, { textContent:'', value:'', disabled:false, addEventListener(){}, dispatchEvent(){}, select(){} }); return nodes.get(id); }
  const bytes = Buffer.from('<!doctype html><title>release</title>');
  const expected = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  const staged = [], stored = new Map(), reloads = [], requests = [], acknowledgements = [];
  const storage = { get length(){return stored.size;}, key(i){return [...stored.keys()][i];}, getItem(k){return stored.has(k) ? stored.get(k) : null;}, setItem(k,v){stored.set(k,String(v));}, removeItem(k){stored.delete(k);} };
  const parent = { DashboardBootstrap:{ reload(){reloads.push(true);}, stage(bundle){staged.push(bundle);return Promise.resolve();}, staged(){return Promise.resolve(null);}, failure(){return Promise.resolve(null);}, ready(version){acknowledgements.push(version);} } };
  const window = { parent, crypto:webcrypto, confirm(){return true;} };
  const release = {tag_name:'v0.2',draft:false,prerelease:false,assets:[{name:'thinkview-dashboard-bundle.html',state:'uploaded',browser_download_url:'https://github.com/Hmmmmmmmmmm/thinkview-dashboard/releases/download/v0.2/thinkview-dashboard-bundle.html',digest:digest || expected,size:bytes.length}]};
  const context = { window, document:{getElementById:element}, DashboardVersion:'0.1.0', DisplayPanels:{startupErrors(){return startupErrors;},manifest(){return cleanup ? [{id:"notes"}] : [];},stop(){if(cleanup) cleanup(storage);},sync(){}}, DashboardConfig:{storagePrefix:'thinkview.'}, DashboardStorage:{local(){return {get(k,f){return f},set(){}}}}, localStorage:storage, crypto:webcrypto, navigator:{}, TextDecoder, Uint8Array, Array, Date, JSON, Error, Promise, Event:class{}, setTimeout(){}, setInterval(){}, atob:s=>Buffer.from(s,'base64').toString('binary'), fetch(url){requests.push(url); if (responseStatus) return Promise.resolve({ok:false,status:responseStatus,headers:{get(k){return k==='x-ratelimit-reset' ? String(Math.floor(Date.now()/1000)+3600) : null;}}}); return Promise.resolve(url.endsWith('/releases/latest') ? {ok:true,json:()=>Promise.resolve(release)} : {ok:true,json:()=>Promise.resolve({encoding:'base64',size:bytes.length,content:bytes.toString('base64')})});} };
  vm.runInNewContext(fs.readFileSync('logic/update-ui.js','utf8'),context);
  return {nodes,staged,element,stored,reloads,requests,acknowledgements};
}
test('latest stable release is selected and its matching digest is staged', async () => {
  const e=updaterEnvironment(); e.element('update-check').onclick(); for(let i=0;i<12;i++) await tick();
  assert.equal(e.staged.length,1); assert.equal(e.staged[0].version,'0.2.0'); assert.match(e.element('update-status').textContent,/ready/);
});
test('a mismatched release checksum is rejected without changing the running bundle', async () => {
  const e=updaterEnvironment('sha256:'+'0'.repeat(64)); e.element('update-check').onclick(); for(let i=0;i<12;i++) await tick();
  assert.equal(e.staged.length,0); assert.match(e.element('update-status').textContent,/checksum does not match/);
});

test('browser data transfer copies dashboard data without modifying source or unrelated target keys', async () => {
  const source=updaterEnvironment(), target=updaterEnvironment();
  source.stored.set('thinkview.panel.notes.text', JSON.stringify('personal note'));
  source.element('data-export').onclick();
  target.stored.set('other.key', 'keep'); target.stored.set('thinkview.old', 'true');
  target.element('data-transfer').value=source.element('data-transfer').value; target.element('data-import').onclick();
  assert.equal(source.stored.get('thinkview.panel.notes.text'), JSON.stringify('personal note'));
  assert.equal(target.stored.get('thinkview.panel.notes.text'), JSON.stringify('personal note'));
  assert.equal(target.stored.get('other.key'), 'keep'); assert.equal(target.stored.has('thinkview.old'), false); assert.equal(target.reloads.length,1);
});

test('rate-limited checks back off until reset and keep the current dashboard', async () => {
  const e=updaterEnvironment(null,403); e.element('update-check').onclick(); for(let i=0;i<4;i++) await tick();
  assert.equal(e.requests.length,1); assert.match(e.element('update-status').textContent,/retry after/);
  e.element('update-check').onclick(); assert.equal(e.requests.length,1); assert.match(e.element('update-status').textContent,/paused until/); assert.equal(e.staged.length,0);
});

test('failed visible panel startup is not acknowledged as a working update', () => {
  const e=updaterEnvironment(null,null,['clock']);
  assert.equal(e.acknowledgements.length,0); assert.match(e.element('update-status').textContent,/clock/);
});
test('panel runtime reports only visible initial mount failures', () => {
  const window = { addEventListener(){} }, roots = { clock: {hidden:false}, weather: {hidden:true} };
  const document = { querySelector(selector) { const match = /data-panel="([^"]+)"/.exec(selector); return roots[match[1]] || null; } };
  const context = { window, document, DashboardConfig:{storagePrefix:'thinkview.'}, DashboardStorage:{local(){return {}}}, console:{error(){}} };
  vm.runInNewContext(fs.readFileSync('logic/panel-runtime.js','utf8'),context);
  window.DisplayPanels.register({id:'clock'},()=>{throw Error('broken')});
  window.DisplayPanels.register({id:'weather'},()=>{throw Error('hidden')});
  window.DisplayPanels.start({});
  assert.deepEqual(Array.from(window.DisplayPanels.startupErrors()),['clock']);
});

test('panel cleanup runs before imported values replace old browser data', () => {
  const source=updaterEnvironment(), target=updaterEnvironment(null,null,[], storage => storage.setItem('thinkview.panel.notes.text', JSON.stringify('old mounted value')));
  source.stored.set('thinkview.panel.notes.text',JSON.stringify('imported value')); source.element('data-export').onclick();
  target.element('data-transfer').value=source.element('data-transfer').value; target.element('data-import').onclick();
  assert.equal(target.stored.get('thinkview.panel.notes.text'), JSON.stringify('imported value')); assert.equal(target.reloads.length,1);
});
