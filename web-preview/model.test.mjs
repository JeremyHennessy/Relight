import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {Machine,PRICE,TARGET,fresh,loaded,valid,connected,rates,place,upgrade,upgradeCost,isReady,claim,resetGrid,advance,offline,mission,suggested} from "./model.mjs";

test("world shape, persistent save validation and invalid recovery",()=>{
  const s=fresh();assert.equal(s.cells.length,25);assert.equal(s.cells[12],1);
  assert.equal(s.scrap,30);assert.equal(valid(s),true);
  assert.deepEqual(loaded(JSON.parse(JSON.stringify(s))),s);
  assert.equal(valid({...s,cells:Array(24).fill(0)}),false);
  assert.equal(valid({...s,scrap:NaN}),false);
  assert.equal(valid({...s,savedAt:-1}),false);
  assert.equal(loaded({...s,cells:[]}).cells[12],1);
});
test("starter layout has powered mine and active restorer",()=>{
 const s=fresh(),c=connected(s),r=rates(s);
 assert.equal(c[11],true);assert.equal(c[14],true);assert.equal(r.mined,1);
 assert.equal(r.restored,.7);assert.equal(r.capacity,2);assert.equal(r.consumers,2);
 advance(s,10);assert.ok(s.restoration>0);assert.ok(s.scrap>30);
});
test("build restrictions, affordability and core preservation",()=>{
 const s=fresh();
 assert.equal(place(s,12,Machine.Extractor).ok,false);
 assert.equal(place(s,0,Machine.Core).ok,false);
 assert.equal(place(s,99,Machine.Relay).ok,false);
 assert.equal(place(s,0,999).ok,false);
 assert.equal(place(s,11,Machine.Generator).ok,false);
 assert.equal(place(s,0,Machine.Generator).ok,true);
 assert.equal(s.scrap,15);
 assert.equal(place(s,0,Machine.Empty).ok,true);
 assert.equal(place(s,0,Machine.Empty).ok,false);
 assert.equal(s.scrap,15);
});
test("adjacency, capacity and isolated consumers match Unity economy",()=>{
 const s=fresh(),before=rates(s).restored;
 assert.equal(place(s,19,Machine.Generator).ok,true);
 assert.ok(rates(s).restored>before);
 const generator=rates(s);assert.equal(generator.capacity,4);
 assert.equal(place(s,7,Machine.Extractor).ok,true);
 assert.equal(rates(s).consumers,3);
 const capped=fresh();assert.equal(place(capped,7,Machine.Extractor).ok,true);
 assert.equal(rates(capped).fraction,2/3);
 const isolated=fresh();isolated.cells[11]=0;isolated.cells[14]=0;isolated.cells[0]=3;
 assert.equal(rates(isolated).mined,0);
 advance(isolated,100);assert.equal(isolated.scrap,30);
 const relay=fresh(),baseline=rates(relay).mined;
 assert.equal(place(relay,10,Machine.Relay).ok,true);
 assert.ok(rates(relay).mined>baseline);
});
test("first-session guidance is actionable and enough starter scrap is granted",()=>{
 const s=fresh();
 assert.equal(mission(s),0);assert.equal(suggested(s),19);
 assert.ok(PRICE[Machine.Generator]+PRICE[Machine.Extractor]<=s.scrap);
 assert.equal(place(s,19,Machine.Generator).ok,true);
 assert.equal(mission(s),1);assert.equal(suggested(s),7);
 assert.equal(place(s,7,Machine.Extractor).ok,true);
 assert.equal(mission(s),2);assert.equal(s.scrap,3);
 advance(s,120);
 assert.equal(isReady(s),true);
 assert.equal(s.region,0);
 assert.equal(claim(s).ok,true);
 assert.equal(s.region,1);assert.equal(mission(s),3);
 assert.equal(claim(s).ok,false);
});
test("upgrade costs, production efficiency and grid repair",()=>{
 const s=fresh();
 assert.equal(upgradeCost(s,true),20);
 assert.equal(upgrade(s,true).ok,true);
 assert.equal(s.extractorLevel,1);
 assert.equal(upgradeCost(s,true),36);
 assert.equal(upgrade(s,false).ok,false);
 s.region=3;s.restoration=24;
 assert.equal(place(s,11,Machine.Empty).ok,true);
 resetGrid(s);
 assert.equal(s.cells[11],Machine.Extractor);
 assert.equal(s.region,3);assert.equal(s.restoration,24);
});
test("8-hour offline storage cap and one claimable region match Unity",()=>{
 const s=fresh();s.savedAt=100;
 assert.equal(offline(s,100+8*3600+1000),28800);
 assert.equal(s.region,0);assert.equal(isReady(s),true);
 assert.equal(s.restoration,TARGET(0));
 assert.equal(s.scrap,1730);
 assert.equal(s.totalPlayed,28800);
 assert.equal(offline(s,100+8*3600+1000),0);
 const originalScrap=s.scrap;
 advance(s,100);assert.ok(s.scrap>originalScrap);
 assert.equal(s.restoration,TARGET(0));
 assert.equal(claim(s).ok,true);
 assert.equal(claim(s).ok,false);
 const one=fresh();one.savedAt=100;offline(one,3700);assert.equal(one.scrap,1730);
 const active=fresh();advance(active,28800);assert.ok(active.scrap>one.scrap);
});
test("future/negative clocks never give unintended offline production",()=>{
 const s=fresh();s.savedAt=1000;const before=s.scrap;
 assert.equal(offline(s,800),0);assert.equal(s.scrap,before);
 const other=fresh();assert.equal(offline(other,2000),0);
});
test("1000 deterministic random operations never invalidate state",()=>{
 const s=fresh();let seed=2841;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
 for(let k=0;k<1000;k++){
   const i=Math.floor(rand()*25),op=Math.floor(rand()*6);
   if(op<4)place(s,i,op+2);else if(op===4)place(s,i,Machine.Empty);else upgrade(s,rand()<.5);
   advance(s,rand()*5);
   assert.equal(valid(s),true,"step "+k);
 }
});
test("all UI assets are self-contained and safe static deploy files",()=>{
 const html=fs.readFileSync(new URL("./index.html",import.meta.url),"utf8");
 const app=fs.readFileSync(new URL("./app.mjs",import.meta.url),"utf8");
 const css=fs.readFileSync(new URL("./styles.css",import.meta.url),"utf8");
 for(const id of ["network-board","tiles","planet","welcome","mission-title","revive","upgrade-mining","upgrade-power","restored-percent","scrap"])
   assert.ok(html.includes('id="'+id+'"'),"HTML missing "+id);
 for(const token of ["./model.mjs","requestAnimationFrame","visibilitychange","pagehide","openGuide","persist","drawPlanet"])
   assert.ok(app.includes(token),"runtime missing "+token);
 assert.ok(css.includes("@media(max-width:650px)"));
 assert.ok(!html.includes("http://"));
});
