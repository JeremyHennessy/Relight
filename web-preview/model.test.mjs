import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {Machine,PRICE,TARGET,MAX_OFFLINE,fresh,freshCampaign,isCampaign,repairGreenhouse,redeemMineKit,loaded,valid,connected,rates,place,upgrade,upgradeCost,isReady,claim,resetGrid,advance,offline,mission,suggested} from "./model.mjs";

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
 for(const id of ["network-board","tiles","planet","welcome","mission-title","campaign-action","campaign-wallet","revive","upgrade-mining","upgrade-power","restored-percent","scrap"])
   assert.ok(html.includes('id="'+id+'"'),"HTML missing "+id);
 for(const token of ["./model.mjs","freshCampaign","repairGreenhouse","redeemMineKit","campaign-opening","requestAnimationFrame","visibilitychange","pagehide","openGuide","persist","drawPlanet"])
   assert.ok(app.includes(token),"runtime missing "+token);
 assert.ok(css.includes("@media(max-width:650px)"));
 assert.ok(!html.includes("http://"));
});

test("new opening earns an idle-safe MINE kit and gates actions through the first POWER need",()=>{
 const s=freshCampaign();
 assert.equal(isCampaign(s),true);assert.equal(valid(s),true);
 assert.deepEqual(s.cells.filter((v,i)=>v!==0&&i!==12),[Machine.Restorer]);
 assert.equal(s.cells[13],Machine.Empty);assert.equal(s.scrap,10);
 assert.equal(place(s,13,Machine.Relay).ok,false,"the broken connection requires its dedicated repair action");
 assert.equal(place(s,17,Machine.Extractor).ok,false,"hidden MINE action cannot bypass the kit unlock");
 assert.equal(place(s,9,Machine.Generator).ok,false,"hidden POWER action cannot bypass progression");
 assert.equal(upgrade(s,true).ok,false);assert.equal(claim(s).ok,false);assert.equal(resetGrid(s).ok,false);
 assert.equal(repairGreenhouse(s).ok,true);assert.equal(s.scrap,6);assert.equal(s.campaign.phase,"restore");
 assert.equal(repairGreenhouse(s).ok,false);
 const longIdle=structuredClone(s);advance(longIdle,MAX_OFFLINE,0);
 assert.equal(longIdle.campaign.phase,"mine-kit");assert.equal(longIdle.campaign.mineKit,"earned");
 assert.ok(longIdle.restoration>=5);assert.equal(longIdle.scrap,0,"idle time can exhaust ordinary scrap without losing the kit");
 assert.equal(place(longIdle,17,Machine.Extractor).ok,false,"the earned kit is redeemed only through its one-time action");
 assert.equal(redeemMineKit(longIdle,12).ok,false,"wrong target does not consume the kit");
 longIdle.cells[17]=Machine.Relay;
 assert.equal(redeemMineKit(longIdle,17).ok,false,"occupied target does not consume the kit");
 longIdle.cells[17]=Machine.Empty;
 assert.equal(redeemMineKit(longIdle,17).ok,true);assert.equal(longIdle.campaign.mineKit,"redeemed");
 assert.equal(longIdle.cells[17],Machine.Extractor);assert.equal(longIdle.scrap,0,"kit placement does not spend scrap");
 assert.equal(redeemMineKit(longIdle,17).ok,false,"kit is single use");
 advance(longIdle,160);assert.equal(isReady(longIdle),true,"one mine can sustain the first region after idle depletion");
 assert.equal(claim(longIdle).ok,true);assert.equal(longIdle.region,1);assert.equal(longIdle.campaign.phase,"expansion");
 const reward=longIdle.scrap;assert.equal(claim(longIdle).ok,false);assert.equal(longIdle.scrap,reward,"claim cannot duplicate its reward");
 assert.equal(place(longIdle,8,Machine.Extractor).ok,false,"expansion unlock exposes one legal site only");
 assert.equal(place(longIdle,7,Machine.Extractor).ok,true);assert.equal(longIdle.campaign.phase,"power");
 assert.ok(rates(longIdle).fraction<1,"second MINE creates a real capacity shortage");
 assert.equal(upgrade(longIdle,false).ok,false,"upgrade remains locked until the earned POWER introduction");
 assert.equal(place(longIdle,9,Machine.Generator).ok,true);assert.equal(longIdle.campaign.phase,"open");
 assert.equal(rates(longIdle).fraction,1,"new POWER resolves the introduced shortage");
 longIdle.scrap=0;
 assert.equal(place(longIdle,17,Machine.Empty).ok,true,"one MINE can be removed while another remains connected");
 assert.equal(place(longIdle,7,Machine.Empty).ok,false,"the last connected MINE cannot be removed at zero scrap");
 assert.equal(longIdle.cells[7],Machine.Extractor,"the anti-deadlock guard preserves the productive machine");
 longIdle.scrap=40;
 assert.equal(place(longIdle,7,Machine.Empty).ok,false,"having enough cash alone does not permit removing the last campaign MINE");
 assert.equal(longIdle.cells[7],Machine.Extractor);
 assert.equal(place(longIdle,9,Machine.Empty).ok,true,"the completed sandbox can still edit its POWER layout");
 assert.equal(valid(longIdle),true,"an earned unlock remains valid after a player changes the board");
 assert.equal(resetGrid(longIdle).ok,true,"the completed sandbox can reset its board without relocking progression");
 assert.equal(valid(longIdle),true);
});

test("campaign saves validate each milestone while legacy and future data stay distinguishable",()=>{
 const opening=freshCampaign();
 assert.equal(valid(opening),true);
 const legacy=fresh();
 assert.equal(Object.hasOwn(legacy,"campaign"),false);
 assert.equal(valid(legacy),true,"valid pre-campaign saves remain fully unlocked legacy worlds");
 assert.equal(place(legacy,0,Machine.Generator).ok,true);
 const unknown=structuredClone(opening);unknown.campaign.version=99;
 assert.equal(valid(unknown),false,"unknown campaign save versions are rejected rather than normalized");
 const invalid=structuredClone(opening);invalid.campaign.phase="future-feature";
 assert.equal(valid(invalid),false);
 repairGreenhouse(opening);advance(opening,10);
 assert.equal(opening.campaign.phase,"mine-kit");assert.equal(valid(opening),true);
 const resumed=JSON.parse(JSON.stringify(opening));assert.equal(valid(resumed),true);
 redeemMineKit(resumed,17);assert.equal(valid(resumed),true);
});

test("fully opened campaigns and legacy saves keep ordinary later-region claims",()=>{
 const s=freshCampaign();repairGreenhouse(s);advance(s,10);redeemMineKit(s,17);advance(s,200);
 assert.equal(claim(s).ok,true,"the first campaign claim opens the new frontier");
 assert.equal(place(s,7,Machine.Extractor).ok,true);
 assert.equal(place(s,9,Machine.Generator).ok,true);
 assert.equal(s.campaign.phase,"open");
 s.restoration=TARGET(s.region);
 assert.equal(claim(s).ok,true,"the second region can be claimed after the opening unlock");
 assert.equal(s.region,2);assert.equal(s.campaign.phase,"open","later claims must not re-enter the opening expansion gate");
 assert.equal(claim(s).ok,false,"the second claim reward cannot be repeated after its meter resets");
 s.restoration=TARGET(s.region);
 assert.equal(claim(s).ok,true,"third-region claim remains on the ordinary sandbox path");
 assert.equal(s.region,3);assert.equal(s.campaign.phase,"open");assert.equal(valid(s),true);

 const legacy=fresh();legacy.region=1;legacy.restoration=TARGET(legacy.region);
 assert.equal(claim(legacy).ok,true,"legacy saves remain claimable without a campaign marker");
 assert.equal(legacy.region,2);assert.equal(Object.hasOwn(legacy,"campaign"),false);
 assert.equal(claim(legacy).ok,false,"legacy claims still reset the meter and cannot duplicate");
});

test("unaffordable, occupied and full-site campaign actions never consume unlocks",()=>{
 const s=freshCampaign();repairGreenhouse(s);advance(s,10);redeemMineKit(s,17);
 advance(s,160);assert.equal(claim(s).ok,true);
 const phase=s.campaign.phase,grid=s.cells.slice();s.scrap=0;
 assert.equal(place(s,7,Machine.Extractor).ok,false,"unaffordable expansion placement is rejected");
 assert.equal(s.campaign.phase,phase);assert.deepEqual(s.cells,grid);
 s.scrap=50;s.cells[7]=Machine.Relay;
 assert.equal(place(s,7,Machine.Extractor).ok,false,"an occupied expansion target remains occupied and locked");
 s.cells[7]=Machine.Empty;
 for(let i=0;i<25;i++)if(i!==7&&i!==12&&s.cells[i]===Machine.Empty)s.cells[i]=Machine.Relay;
 assert.equal(place(s,7,Machine.Extractor).ok,true,"the explicitly open target remains legal even on a full surrounding board");
 assert.equal(s.campaign.phase,"power");
 s.scrap=0;assert.equal(place(s,9,Machine.Generator).ok,false,"POWER cannot exceed the available claim reward");
 s.scrap=50;s.cells[9]=Machine.Relay;
 assert.equal(place(s,9,Machine.Generator).ok,false,"occupied POWER target does not advance the stage");
 assert.equal(s.campaign.phase,"power");
});
