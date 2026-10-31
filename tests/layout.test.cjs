const test=require('node:test');
const assert=require('node:assert/strict');
const {migrate,move,grid}=require('../logic/layout.js');

test('layout migration keeps saved order and appends newly registered panels',()=>{
  const saved={order:['removed','weather','clock','clock'],pinned:['weather','removed'],sizes:{weather:'medium',removed:'big'},enabled:{clock:false}};
  assert.deepEqual(migrate(saved,['clock','weather','notes']),{order:['weather','clock','notes'],pinned:['weather'],sizes:{weather:'medium'},enabled:{clock:false}});
});
test('reordering keeps pinned positions and does not mutate input',()=>{
  const order=['clock','weather','dot','notes'];
  assert.deepEqual(move(order,['weather'],'clock','notes'),['dot','weather','notes','clock']);
  assert.deepEqual(order,['clock','weather','dot','notes']);
  assert.deepEqual(move(order,['weather'],'clock','weather'),order);
  assert.deepEqual(move(order,[],'clock','missing'),order);
});
test('auto fit uses portrait and landscape reading order',()=>{
  const ids=['clock','weather','dot','calendar','focus','notes'];
  assert.deepEqual([grid(ids,{},false,660,12).columns,grid(ids,{},false,660,12).rows],[2,3]);
  assert.deepEqual([grid(ids,{},true,660,12).columns,grid(ids,{},true,660,12).rows],[3,2]);
  assert.equal(grid(ids.slice(0,3),{},false,660,12).columns,1);
});
test('presets use full and half width with one-third row height',()=>{
  const plan=grid(['clock','weather'],{clock:'big',weather:'medium'},true,390,15);
  assert.equal(plan.columns,2);assert.equal(plan.rows,3);assert.equal(plan.rowHeight,120);
  assert.deepEqual(plan.spans,{clock:2,weather:1});
});
test('invalid measurements never produce NaN CSS dimensions',()=>{
  const plan=grid(['clock'],{clock:'big'},false,NaN,NaN);
  assert.equal(Number.isFinite(plan.rowHeight),true);assert.ok(plan.rowHeight>=1);
});
