const test=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../logic/storage.js');
function memory(){const values=new Map();return {values,getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,value)};}
test('panel namespaces cannot collide',()=>{
  const backend=memory(),notes=create(backend,'panel.notes.'),timer=create(backend,'panel.timer.');
  notes.set('state','note');timer.set('state',{remaining:10});
  assert.equal(notes.get('state',''),'note');assert.deepEqual(timer.get('state',null),{remaining:10});
});
test('missing and malformed data return a safe fallback',()=>{
  const backend=memory(),store=create(backend,'test.');
  assert.equal(store.get('missing','fallback'),'fallback');backend.values.set('test.bad','{');
  assert.deepEqual(store.get('bad',[]),[]);
});
test('blocked or full storage does not stop a panel mounting',()=>{
  const store=create({getItem(){throw Error('blocked');},setItem(){throw Error('full');}},'x.');
  assert.equal(store.get('x',null),null);assert.equal(store.set('x','value'),false);assert.equal(store.available,false);
  assert.equal(create(null,'x.').set('x','value'),false);
});
