const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function panel() {
 const nodes=new Map(), handlers=new Map(), commands=[], root={dataset:{},querySelector:node};
 let receive,stopped=false,cleared=false;
 function node(key){if(!nodes.has(key))nodes.set(key,{hidden:false,textContent:'',src:'',style:{},setAttribute(name,value){this[name]=value;},addEventListener:(name,fn)=>handlers.set(key+name,fn),removeEventListener:(name)=>handlers.delete(key+name),removeAttribute(name){if(name==='src')this.src='';},querySelector:node});return nodes.get(key);}
 const provider={subscribe(fn){receive=fn;return()=>{stopped=true;};},command(name,value){commands.push([name,value]);return Promise.resolve();}};
 const cleanup=vm.runInNewContext('(function(ctx){'+fs.readFileSync('panels/music/panel.js','utf8')+'})(ctx)',{ctx:{root},window:{ThinkViewDevice:provider},document:{hidden:false,addEventListener(){},removeEventListener(){}},setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{cleared=true;},Date,Math,String});
 function update(music,available=true){receive({available,status:{music},commands:['music.access']});}
 return {root,node,commands,update,cleanup,handlers,state:()=>({stopped,cleared})};
}
function music(override={}) {return {supported:true,access:true,state:'playing',title:'QA song',artist:'QA artist',album:'QA album',artwork:null,positionMs:30000,durationMs:120000,observedAt:Date.now(),...override};}
test('real playback state controls animation state and bounded progress',()=>{const p=panel();p.update(music());assert.equal(p.root.dataset.playing,'true');assert.equal(p.node('[data-music-title]').textContent,'QA song');p.update(music({state:'paused',positionMs:180000}));assert.equal(p.root.dataset.playing,'false');assert.equal(p.node('progress').value,120000);assert.equal(p.node('[data-music-position]').textContent,'2:00');p.cleanup();});
test('music setup remains opt-in; missing access does not invent track information',async()=>{const p=panel();p.update(music({access:false,state:'idle',title:'',artist:'',album:''}));assert.equal(p.node('.music-connect').hidden,false);assert.equal(p.node('[data-music-title]').textContent,'Nothing playing');assert.deepEqual(p.commands,[]);await p.handlers.get('.music-connectclick')();assert.deepEqual(p.commands,[['music.access',true]]);p.cleanup();assert.deepEqual(p.state(),{stopped:true,cleared:true});});
test('unavailable sources remove artwork and do not expose a setup command',()=>{const p=panel();p.update(music({artwork:'data:image/jpeg;base64,AAAA'}));p.update(null,false);assert.equal(p.root.dataset.playing,'false');assert.equal(p.node('.music-art').src,'');assert.equal(p.node('.music-connect').hidden,true);assert.equal(p.node('.music-timeline').hidden,true);p.cleanup();});
test('device provider rejects remote artwork and invalid progress, and releases faster polling',async()=>{const timers=[],calls=[];const scope={window:{},Set,Map,Array,Number,Object,Promise,AbortController,console,clearTimeout:()=>{},setTimeout:(fn,ms)=>{timers.push(ms);return 1;},fetch:async url=>{calls.push(url);return {ok:true,json:async()=>url.endsWith('capabilities')?{version:1,token:'qa',commands:['music.access']}:{version:1,music:music({artwork:'https://example.test/private.jpg',positionMs:-1,title:'x'.repeat(500)})}};}};vm.runInNewContext(fs.readFileSync('logic/device-provider.js','utf8'),scope);let result;const unsubscribe=scope.window.ThinkViewDevice.subscribe(s=>{result=s;},{intervalMs:2500});await new Promise(resolve=>setImmediate(resolve));assert.equal(result.status.music.artwork,null);assert.equal(result.status.music.positionMs,null);assert.equal(result.status.music.title.length,240);assert.equal(timers[0],2500);unsubscribe();assert.equal(calls.length,2);});

test('output level accepts only fresh bounded native measurements and old apps do not poll', async()=>{
 let payload, levelCalls=0; const now=Date.now();
 const scope={window:{},Set,Map,Array,Number,Object,Promise,AbortController,console,Date,clearTimeout:()=>{},setTimeout:()=>1,fetch:async url=>({ok:true,json:async()=>{
  if(url.endsWith('capabilities')) return {version:1,token:'qa',commands:['music.levelAccess'],musicLevelVersion:1};
  if(url.endsWith('/status')) return {version:1,music:music({audioLevel:payload})};
  levelCalls++; return payload;
 }})};
 vm.runInNewContext(fs.readFileSync('logic/device-provider.js','utf8'),scope);
 payload={available:true,state:'active',value:0.7,unit:'normalized_peak',source:'android_output_mix_visualizer',measuredAt:now,staleAfterMs:1000};
 let snapshot; const unsubscribe=scope.window.ThinkViewDevice.subscribe(s=>snapshot=s); await new Promise(r=>setImmediate(r));
 assert.equal(snapshot.musicLevelVersion,1); assert.equal(snapshot.status.music.audioLevel.value,0.7);
 assert.equal((await scope.window.ThinkViewDevice.musicLevel()).value,0.7);
 for(const bad of [{value:1.1},{value:-0.1},{unit:'volume'},{source:'microphone'},{measuredAt:now+10000},{measuredAt:now-2000},{available:false}]){
  const original=payload; payload={...payload,...bad}; const parsed=await scope.window.ThinkViewDevice.musicLevel(); assert.equal(parsed.available,false); assert.equal(parsed.value,null); payload=original;
 }
 unsubscribe(); assert.equal(levelCalls,8);
 const old={...scope,window:{},fetch:async url=>({ok:true,json:async()=>url.endsWith('capabilities')?{version:1,token:'qa',commands:[]}:{version:1,music:music()}})};
 vm.runInNewContext(fs.readFileSync('logic/device-provider.js','utf8'),old); const stop=old.window.ThinkViewDevice.subscribe(()=>{}); await new Promise(r=>setImmediate(r));
 await assert.rejects(old.window.ThinkViewDevice.musicLevel(),/unavailable/); stop();
});

test('level polling follows visibility, expires readings, and aborts on unmount', async()=>{
 const nodes=new Map(), listeners={}, scheduled=new Map(); let id=0, observer, receive, calls=0, lastSignal, hang=false;
 function node(key){if(!nodes.has(key))nodes.set(key,{hidden:false,textContent:'',style:{},addEventListener(){},removeEventListener(){},removeAttribute(){},setAttribute(n,v){this[n]=v;},querySelector:node});return nodes.get(key);}
 const root={dataset:{},querySelector:node}; const document={hidden:false,addEventListener(n,f){listeners[n]=f;},removeEventListener(n){delete listeners[n];}};
 const provider={subscribe(f){receive=f;return()=>{};},musicLevel(signal){calls++;lastSignal=signal;return hang ? new Promise(()=>{}) : Promise.resolve({available:true,state:'active',value:.4,measuredAt:Date.now(),staleAfterMs:1000});},command(){return Promise.resolve();}};
 const scope={ctx:{root},window:{ThinkViewDevice:provider},document,AbortController,Date,Math,String,setInterval:()=>1,clearInterval(){},setTimeout(fn,ms){let key=++id;scheduled.set(key,{fn,ms});return key;},clearTimeout(key){scheduled.delete(key);},IntersectionObserver:class {constructor(f){observer=f;} observe(){} disconnect(){}}};
 const cleanup=vm.runInNewContext('(function(ctx){'+fs.readFileSync('panels/music/panel.js','utf8')+'})(ctx)',scope);
 receive({available:true,status:{music:music({audioLevel:{state:'waiting',enabled:true,available:false}})},commands:['music.levelAccess'],musicLevelVersion:1});
 assert.equal(calls,0); observer([{isIntersecting:true}]); await new Promise(r=>setImmediate(r));
 assert.equal(calls,1); assert.equal(node('.music-level').hidden,false); assert.equal(node('span').style.width,'40%');
 const expiry=[...scheduled.values()].find(x=>x.ms>100); expiry.fn(); assert.equal(node('.music-level').hidden,true); assert.equal(node('span').style.width,'0%');
 document.hidden=true; listeners.visibilitychange(); assert.equal(scheduled.size,0);
 hang=true; document.hidden=false; listeners.visibilitychange(); await new Promise(r=>setImmediate(r)); assert.equal(calls,2);
 cleanup(); assert.equal(scheduled.size,0); assert.equal(listeners.visibilitychange,undefined); assert.equal(lastSignal.aborted,true);
});

test('404 does not retry on status refresh; disable cancels demand and ignores old responses', async()=>{
 const nodes=new Map(), handlers=new Map(), scheduled=new Map(); let id=0, observer, receive, calls=0, commands=[], resolveOld, mode='404';
 function node(key){if(!nodes.has(key))nodes.set(key,{hidden:false,disabled:false,textContent:'',style:{},addEventListener:(n,f)=>handlers.set(key+n,f),removeEventListener(){},removeAttribute(){},setAttribute(){},querySelector:node});return nodes.get(key);}
 const root={dataset:{},querySelector:node}, document={hidden:false,addEventListener(){},removeEventListener(){}};
 const provider={subscribe(f){receive=f;return()=>{};},musicLevel(){calls++; return mode==='404' ? Promise.reject(Object.assign(Error('missing'),{status:404})) : new Promise(r=>{resolveOld=r;});},command(n,v){commands.push([n,v]);return Promise.resolve();}};
 const scope={ctx:{root},window:{ThinkViewDevice:provider},document,AbortController,Date,Math,String,setInterval:()=>1,clearInterval(){},setTimeout(fn,ms){let key=++id;scheduled.set(key,{fn,ms});return key;},clearTimeout(key){scheduled.delete(key);},IntersectionObserver:class {constructor(f){observer=f;} observe(){} disconnect(){}}};
 const cleanup=vm.runInNewContext('(function(ctx){'+fs.readFileSync('panels/music/panel.js','utf8')+'})(ctx)',scope);
 const status=state=>({available:true,status:{music:music({audioLevel:{state,enabled:state!=='disabled',available:false}})},commands:['music.levelAccess'],musicLevelVersion:1});
 receive(status('waiting')); observer([{isIntersecting:true}]); await new Promise(r=>setImmediate(r)); assert.equal(calls,1);
 receive(status('waiting')); receive(status('waiting')); await new Promise(r=>setImmediate(r)); assert.equal(calls,1); assert.equal(node('.music-level-retry').hidden,false);
 mode='pending'; handlers.get('.music-level-retryclick')(); assert.equal(calls,2);
 handlers.get('.music-level-disableclick')(); assert.deepEqual(commands,[['music.levelAccess',false]]); receive(status('waiting'));
 resolveOld({available:true,state:'active',value:.8,measuredAt:Date.now(),staleAfterMs:1000}); await new Promise(r=>setImmediate(r));
 assert.equal(node('.music-level').hidden,true); assert.match(node('[data-music-level-status]').textContent,/Turning/); assert.equal(calls,2);
 receive(status('disabled')); receive(status('error')); assert.equal(node('.music-level-disable').hidden,false); receive(status('disabled')); assert.equal(node('.music-level-connect').disabled,false); assert.equal(node('.music-level-connect').hidden,false); assert.equal(node('.music-level-disable').hidden,true); cleanup();
});

test('transient level failures use bounded retry delay, unaffected by status refresh', async()=>{
 const nodes=new Map(), timers=new Map(); let id=0, observer, receive, calls=0;
 function node(key){if(!nodes.has(key))nodes.set(key,{hidden:false,textContent:'',style:{},addEventListener(){},removeEventListener(){},removeAttribute(){},setAttribute(){},querySelector:node});return nodes.get(key);}
 const provider={subscribe(f){receive=f;return()=>{};},musicLevel(){calls++;return Promise.reject(Error('temporary'));},command(){return Promise.resolve();}};
 const scope={ctx:{root:{dataset:{},querySelector:node}},window:{ThinkViewDevice:provider},document:{hidden:false,addEventListener(){},removeEventListener(){}},AbortController,Date,Math,String,setInterval:()=>1,clearInterval(){},setTimeout(fn,ms){let key=++id;timers.set(key,{fn,ms});return key;},clearTimeout(key){timers.delete(key);},IntersectionObserver:class {constructor(f){observer=f;} observe(){} disconnect(){}}};
 const cleanup=vm.runInNewContext('(function(ctx){'+fs.readFileSync('panels/music/panel.js','utf8')+'})(ctx)',scope);
 const status={available:true,status:{music:music({audioLevel:{state:'waiting',enabled:true,available:false}})},commands:['music.levelAccess'],musicLevelVersion:1};
 receive(status);observer([{isIntersecting:true}]);await new Promise(r=>setImmediate(r));receive(status);assert.equal(calls,1);assert.ok([...timers.values()].some(x=>x.ms>=4900 && x.ms<=5000));cleanup();
});
