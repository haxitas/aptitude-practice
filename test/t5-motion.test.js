import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairDotPositions, interpolateDotPositions, generateDotPositions, distanceSquared } from '../js/logic/t5.js';
import { DEFAULTS } from '../js/core/settings.js';
import { createRng } from '../js/core/rng.js';

test('点のスライドの既定値は400ms', () => assert.equal(DEFAULTS.t5.dotMoveMs, 400));

test('対応は近い未使用点を選ぶ1対1・同値は添字順・入力を変えない', () => {
  for (let seed=1; seed<=100; seed++) {
    const rng = createRng(seed);
    const old = generateDotPositions(rng, 13, DEFAULTS.t5).dots;
    const next = generateDotPositions(rng, 13, DEFAULTS.t5).dots;
    const copy = JSON.stringify([old,next]);
    const pairs = pairDotPositions(old, next);
    assert.equal(new Set(pairs.map(p=>p.fromIndex)).size,13);
    assert.equal(new Set(pairs.map(p=>p.toIndex)).size,13);
    const used = new Set();
    pairs.forEach((p,i) => {
      assert.equal(p.fromIndex,i);
      const available = next.map((point,index)=>({index,d:distanceSquared(old[i],point)})).filter(x=>!used.has(x.index)).sort((a,b)=>a.d-b.d||a.index-b.index);
      assert.equal(p.toIndex,available[0].index);
      used.add(p.toIndex);
      assert.deepEqual(p.from,old[i]);
      assert.deepEqual(p.to,next[p.toIndex]);
    });
    assert.deepEqual(pairDotPositions(old,next),pairs);
    assert.equal(JSON.stringify([old,next]),copy);
  }
  assert.equal(pairDotPositions([{x:0,y:0},{x:0,y:0}], [{x:-1,y:0},{x:1,y:0}])[0].toIndex,0);
  assert.throws(()=>pairDotPositions([], [{x:0,y:0}]));
});

test('途中は旧と新を結ぶ線上、0msは旧位置・400ms以降は新位置', () => {
  const old=[{x:-0.8,y:0.2},{x:0.5,y:-0.3}];
  const next=[{x:0.7,y:0.4},{x:-0.3,y:0.1}];
  const pairs=pairDotPositions(old,next);
  for(const ms of [0,100,200,399,400,1000]) {
    const k=Math.min(ms/400,1), points=interpolateDotPositions(pairs,ms,400);
    points.forEach((point,i)=> {
      const {from,to}=pairs[i];
      assert.ok(Math.abs(point.x-(from.x+(to.x-from.x)*k))<1e-12, `ms=${ms}`);
      assert.ok(Math.abs(point.y-(from.y+(to.y-from.y)*k))<1e-12, `ms=${ms}`);
      assert.ok(Math.hypot(point.x,point.y)<=1);
    });
    if(ms>=400) assert.deepEqual(points,pairs.map(p=>p.to));
  }
  assert.deepEqual(interpolateDotPositions(pairs,0,0),pairs.map(p=>p.to));
});
