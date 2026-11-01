
const test = require('node:test');
const assert = require('node:assert/strict');
const {migrate, move, grid} = require('../logic/layout.js');

test('migration preserves valid state and converts legacy sizes', () => {
  const saved = {order:['removed','weather','clock','clock'], pinned:['weather','removed'], sizes:{weather:'medium',clock:'big',removed:'big'}, enabled:{clock:false}};
  assert.deepEqual(migrate(saved,['clock','weather','notes']), {
    order:['weather','clock','notes'], pinned:['weather'],
    sizes:{clock:{columns:2,rows:1},weather:{columns:1,rows:1}}, enabled:{clock:false}
  });
});
test('migration retains valid spans and rejects out-of-contract values', () => {
 assert.deepEqual(migrate({sizes:{clock:{columns:2,rows:3},weather:{columns:3,rows:4}}},['clock','weather']).sizes,{clock:{columns:2,rows:3}});
});
test('reordering keeps pinned positions and does not mutate input', () => {
  const order=['clock','weather','dot','notes'];
  assert.deepEqual(move(order,['weather'],'clock','notes'),['dot','weather','notes','clock']);
  assert.deepEqual(order,['clock','weather','dot','notes']);
  assert.deepEqual(move(order,['weather'],'clock','weather'),order);
  assert.deepEqual(move(order,[],'clock','missing'),order);
});
test('portrait and landscape tracks fill measured board content with actual gaps', () => {
  for (const [landscape,width,height,columns,rows] of [[false,501.5,800,2,3],[true,817,486,3,2]]) {
    const plan=grid(['clock','weather'],{clock:{columns:2,rows:1}},landscape,width,height,12,{},8);
    assert.equal(plan.columns,columns);
    assert.equal(plan.rows,rows);
    assert.ok(Math.abs(plan.columnWidth*columns + 12*(columns-1)-width)<1e-9);
    assert.ok(Math.abs(plan.rowHeight*rows + 8*(rows-1)-height)<1e-9);
    assert.deepEqual(plan.spans.clock,{columns:2,rows:1});
  }
});
test('resizing or changing chrome recomputes tracks without a fixed reserve', () => {
  const a=grid(['clock'],{},false,500,700,12);
  const b=grid(['clock'],{},false,440,640,12);
  assert.equal(a.columnWidth,244);
  assert.equal(b.columnWidth,214);
  assert.equal(a.columnWidth-b.columnWidth,30);
  assert.ok(b.rowHeight<a.rowHeight);
});
test('defaults, explicit spans and narrow widths remain valid', () => {
  const plan=grid(['clock','weather','notes'],{weather:{columns:1,rows:2}},true,180,100,12,{clock:{columns:2,rows:1}});
  assert.deepEqual(plan.spans,{clock:{columns:1,rows:1},weather:{columns:1,rows:2},notes:{columns:1,rows:1}});
  assert.equal(plan.columnWidth,180); assert.equal(plan.columns,1);
  assert.equal(plan.rowHeight,100); assert.equal(plan.rows,1);
});
test('hidden or invalid boards do not replace previous valid dimensions', () => {
  for (const [w,h] of [[0,500],[500,0],[NaN,500],[500,Infinity]])
    assert.equal(grid(['clock'],{},false,w,h,12),null);
});
