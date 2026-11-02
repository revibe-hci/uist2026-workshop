import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gameTimeline} from '../src/remix/game-timeline.js';

test('a replay requested between RAF timestamps cannot select a negative region',()=>{
  const frame=gameTimeline(-.015,2);
  assert.equal(frame.index,0);assert.equal(frame.phase,0);assert.equal(frame.busy,true);
});
test('a single selected fragment gets time to collide and resolve before the final hold',()=>{
  assert.equal(gameTimeline(4.6,1).collision,true);
  assert.equal(gameTimeline(6.3,1).collision,false);
  assert.equal(gameTimeline(6.3,1).revealed[0],true);
  assert.equal(gameTimeline(8.6,1).done,true);
  assert.equal(gameTimeline(8.6,1).busy,false);
});
test('two fragments reveal separately and stay within their own region indices',()=>{
  const second=gameTimeline(3.7,2);
  assert.equal(second.index,1);assert.deepEqual(second.revealed,[true,false]);
  assert.deepEqual(gameTimeline(7.3,2).revealed,[true,true]);
  assert.equal(gameTimeline(200,2).index,1);assert.equal(gameTimeline(200,2).busy,false);
});
