// Newly authored regression checks for recovered Relight changes.
// This file does not claim byte identity with the unavailable original test.
import assert from "node:assert/strict";
import test from "node:test";
import {Machine,PRICE,fresh,rates,place} from "./model.mjs";

test("disconnected LIFE remains unproductive until relays reconnect it",()=>{
  const s=fresh();
  s.cells[11]=Machine.Empty;
  const before=rates(s);
  const built=place(s,0,Machine.Restorer);
  assert.equal(built.ok,true);
  assert.match(built.message,/disconnected/i);
  assert.equal(rates(s).restored,before.restored);
  assert.equal(s.scrap,12);

  for(const i of [5,10,11]){
    const result=place(s,i,Machine.Relay);
    assert.equal(result.ok,true);
  }
  assert.equal(rates(s).connected[0],true);
  assert.equal(rates(s).restored,before.restored+0.7);
});

test("recovered disconnected feedback leaves ordinary build costs and rates intact",()=>{
  const s=fresh();
  assert.deepEqual(PRICE,{[Machine.Relay]:4,[Machine.Extractor]:12,[Machine.Restorer]:18,[Machine.Generator]:15});
  const before=rates(s);
  const built=place(s,10,Machine.Generator);
  assert.equal(built.ok,true);
  assert.match(built.message,/Structure built\. Watch the network respond\./);
  assert.equal(s.scrap,15);
  assert.deepEqual(rates(s),{
    mined:before.mined,
    used:before.used,
    restored:before.restored,
    consumers:before.consumers,
    capacity:before.capacity+2,
    fraction:1,
    connected:before.connected.map((value,index)=>index===10?true:value)
  });
});
