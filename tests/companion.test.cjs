const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function api(extra={}) {
 const scope={window:{},AbortController,Set,Promise,Object,JSON,Error,setTimeout,clearTimeout,...extra};
 vm.runInNewContext(fs.readFileSync('logic/companion-service.js','utf8'),scope);
 return scope.window.DashboardCompanion;
}
const caps=()=>({version:1,provider:'test',capabilities:{open:true,authStatus:false,read:false,send:false,call:false}});
const status=()=>({version:1,availability:'available',view:'open',auth:'unknown'});
test('open is explicit, capability gated, and does not claim authentication',async()=>{
 let commands=0; const service=api().create({capabilities:async()=>caps(),status:async()=>status(),open:async()=>{commands++;return {ok:true};}});
 await assert.rejects(service.open(),/unavailable/); await service.refresh(); assert.equal(commands,0); assert.equal(service.state().auth,'unknown');
 await service.open(); assert.equal(commands,1); service.dispose(); await assert.rejects(service.open(),/unavailable/);
});
test('invalid, absent, or unsupported backend cannot open',async()=>{
 for(const transport of [
  {capabilities:async()=>{throw Error('missing');}},
  {capabilities:async()=>({...caps(),capabilities:{open:true}})},
  {capabilities:async()=>({...caps(),capabilities:{...caps().capabilities,open:false}}),status:async()=>status()},
  {capabilities:async()=>caps(),status:async()=>({...status(),auth:'signed-in'})},
  {capabilities:async()=>caps(),status:async()=>({...status(),availability:'unavailable'})}
 ]) { let sent=0; transport.open=async()=>{sent++;return {ok:true};}; const service=api().create(transport); await service.refresh(); await assert.rejects(service.open(),/unavailable/); assert.equal(sent,0); service.dispose(); }
});
test('dispose aborts in-flight requests and blocks late state',async()=>{
 let resolveStatus, signal; const service=api().create({capabilities:async()=>caps(),status:s=>{signal=s;return new Promise(r=>{resolveStatus=r;});},open:async()=>({ok:true})});
 const task=service.refresh(); await new Promise(r=>setImmediate(r)); service.dispose(); assert.equal(signal.aborted,true); resolveStatus(status()); await task; assert.equal(service.state().open,false);
});
test('same-origin transport sends exact open command and keeps CSRF out of state',async()=>{
 const requests=[]; const responses=[{...caps(),csrfToken:'transport-secret'},status(),{ok:true}];
 const service=api({fetch:async(url,options)=>{requests.push({url,options});return {ok:true,text:async()=>JSON.stringify(responses.shift())};}}).create();
 await service.refresh(); assert.equal(JSON.stringify(service.state()).includes('secret'),false); await service.open();
 assert.equal(requests[2].url,'/api/companion/v1/commands'); assert.equal(requests[2].options.method,'POST'); assert.equal(requests[2].options.body,'{"command":"open"}'); assert.equal(requests[2].options.headers['X-ThinkView-Token'],'transport-secret'); service.dispose();
});

test('hung backend times out and aborts without enabling open',async()=>{
 let timeout, signal; const service=api({setTimeout:fn=>{timeout=fn;return 1;},clearTimeout:()=>{}}).create({capabilities:s=>{signal=s;return new Promise(()=>{});},dispose(){}});
 const request=service.refresh(); await new Promise(r=>setImmediate(r)); timeout(); await request; assert.equal(signal.aborted,true); assert.equal(service.state().open,false); service.dispose();
});
test('rejected open is not reported as accepted',async()=>{
 const service=api().create({capabilities:async()=>caps(),status:async()=>status(),open:async()=>({ok:false,error:'unavailable'})}); await service.refresh(); await assert.rejects(service.open(),/failed/); service.dispose();
});

test('back-forward restore creates a fresh transport and keeps exactly one listener pair',async()=>{
 const listeners=new Map(), tokens=['first-token','second-token'], sent=[], routes=[];
 const target={addEventListener(n,f){assert.equal(listeners.has(n),false);listeners.set(n,f);},removeEventListener(n,f){assert.equal(listeners.get(n),f);listeners.delete(n);}};
 let tokenIndex=0; const apiInstance=api({fetch:async(url,options)=>{routes.push(url);let body;if(url.endsWith('capabilities'))body={...caps(),csrfToken:tokens[tokenIndex++]};else if(url.endsWith('status'))body=status();else {sent.push(options.headers['X-ThinkView-Token']);body={ok:true};}return {ok:true,text:async()=>JSON.stringify(body)};}});
 const life=apiInstance.lifecycle(target); await new Promise(r=>setImmediate(r)); await life.current().open();
 const old=life.current(); listeners.get('pagehide')({persisted:true}); assert.equal(life.current(),null); await assert.rejects(old.open(),/unavailable/);
 listeners.get('pageshow')({persisted:true}); await new Promise(r=>setImmediate(r)); assert.notEqual(life.current(),old); await life.current().open();
 listeners.get('pageshow')({persisted:true}); assert.equal(tokenIndex,2); assert.deepEqual(sent,tokens); assert.equal(listeners.size,2);
 life.dispose(); assert.equal(listeners.size,0); assert.equal(life.current(),null);
});
