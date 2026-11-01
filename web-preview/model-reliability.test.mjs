// Newly authored regression checks for recovered Relight changes.
// This file does not claim byte identity with the unavailable original test.
import assert from "node:assert/strict";
import test from "node:test";
import {Machine,PRICE,TARGET,fresh,valid,rates,place,advance,isReady,estimateRecoverySeconds} from "./model.mjs";

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

test("recovery estimate reflects stored scrap, sustainable mining and disconnected LIFE",()=>{
  const supplied=fresh();
  const before=JSON.stringify(supplied);
  assert.equal(estimateRecoverySeconds(supplied),TARGET(supplied.region)/rates(supplied).restored);
  assert.equal(JSON.stringify(supplied),before,"estimating never changes gameplay state");

  const shortage=fresh();
  shortage.cells[7]=Machine.Restorer;
  shortage.scrap=0;
  const shortageRates=rates(shortage);
  assert.ok(shortageRates.mined<shortageRates.used);
  assert.equal(estimateRecoverySeconds(shortage),TARGET(shortage.region)/shortageRates.mined,
    "when scrap is exhausted, progress matches sustainable mining");
  shortage.scrap=14;
  assert.ok(estimateRecoverySeconds(shortage)>TARGET(shortage.region)/shortageRates.restored,
    "saved scrap provides a full-rate window before progress slows");

  const stalled=fresh();
  stalled.cells[11]=Machine.Empty;
  stalled.scrap=0;
  assert.equal(estimateRecoverySeconds(stalled),Infinity,
    "a life engine with no fuel source cannot reach the next region");
  stalled.scrap=100;
  assert.ok(Number.isFinite(estimateRecoverySeconds(stalled)),
    "enough stored scrap can finish a region even without mining");

  const disconnected=fresh();
  disconnected.cells[14]=Machine.Empty;
  disconnected.cells[0]=Machine.Restorer;
  assert.equal(estimateRecoverySeconds(disconnected),null,
    "no connected LIFE engine has no recovery estimate");
  const ready=fresh();ready.restoration=TARGET(ready.region);
  assert.equal(estimateRecoverySeconds(ready),0);
});

test("recovery estimate accounts for power throttling across the whole network",()=>{
  const s=fresh();
  s.cells[7]=Machine.Restorer;
  s.cells[17]=Machine.Extractor;
  s.cells[8]=Machine.Restorer;
  s.scrap=0;
  const r=rates(s);
  assert.ok(r.fraction<1,"too many connected consumers throttle every machine");
  assert.ok(r.mined<r.used,"the throttled mines cannot fully fuel LIFE");
  assert.equal(estimateRecoverySeconds(s),TARGET(s.region)/r.mined,
    "the estimate uses the sustainable mining bottleneck after scrap is depleted");
});

test("finite recovery estimates match independent 60fps advance simulations",()=>{
  const scarce=fresh();scarce.cells[7]=Machine.Restorer;scarce.scrap=0;
  const reserve=fresh();reserve.cells[7]=Machine.Restorer;reserve.scrap=14;
  const sufficientWithoutMining=fresh();sufficientWithoutMining.cells[11]=Machine.Empty;sufficientWithoutMining.scrap=100;
  const generatorBoost=fresh();generatorBoost.cells[9]=Machine.Generator;

  for(const [name,state] of [
    ["scarce scrap",scarce],
    ["stored scrap runway",reserve],
    ["fuel reserve without mining",sufficientWithoutMining],
    ["generator boost",generatorBoost]
  ]){
    const estimate=estimateRecoverySeconds(state);
    assert.ok(Number.isFinite(estimate),name+" should have a finite estimate");
    const simulated=structuredClone(state),frame=0.016;
    let steps=0;
    while(!isReady(simulated)&&steps<Math.ceil(estimate/frame)+3){
      advance(simulated,frame);
      steps++;
    }
    assert.equal(isReady(simulated),true,name+" reaches the target in the simulation");
    assert.ok(Math.abs(steps*frame-estimate)<=frame+1e-8,
      name+" estimate differs from frame simulation by more than one 60fps frame");
  }
});

test("unbounded regions do not create a finite or misleading display ETA",()=>{
  const hugeButFinite=fresh();hugeButFinite.region=1e306;
  const overflow=fresh();overflow.cells[7]=Machine.Restorer;overflow.scrap=0;overflow.region=3e306;
  const unbounded=fresh();unbounded.region=Number.MAX_VALUE;
  assert.ok(Number.isFinite(estimateRecoverySeconds(hugeButFinite)));
  assert.ok(estimateRecoverySeconds(hugeButFinite)>365*24*60*60);
  assert.equal(valid(overflow),true,"the overflow case is accepted by existing save validation");
  assert.ok(Number.isFinite(TARGET(overflow.region)),"the region target itself remains finite");
  assert.ok(rates(overflow).mined>0,"a connected MINE is producing in the overflow case");
  assert.equal(estimateRecoverySeconds(overflow),Infinity,
    "division can overflow even while the target and connected production are finite");
  assert.equal(estimateRecoverySeconds(unbounded),Infinity);
});
