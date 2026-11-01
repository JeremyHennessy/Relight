import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {Machine,PRICE,TARGET,MAX_OFFLINE,fresh,freshCampaign,freshVersionTwoCampaign,isCampaign,repairGreenhouse,redeemMineKit,loaded,valid,connected,rates,place,upgrade,upgradeCost,isReady,claim,resetGrid,advance,offline,mission,suggested} from "./model.mjs";

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

function v3AtChoice(startMine=8){
 const s=freshCampaign();let elapsed=0;
 assert.equal(repairGreenhouse(s).ok,true);elapsed+=5/.7;
 advance(s,5/.7);assert.equal(s.campaign.phase,"mine-kit");
 assert.equal(place(s,startMine,Machine.Extractor).ok,true);assert.equal(s.campaign.phase,"ridge-link");
 while(s.scrap<PRICE[Machine.Relay]){advance(s,1);elapsed++;assert.equal(valid(s),true);assert.ok(elapsed<200,"ridge relay remains affordable through ordinary production");}
 assert.equal(place(s,18,Machine.Relay).ok,true);assert.equal(s.campaign.ridgeRelay,true);assert.equal(s.campaign.phase,"first-region");
 while(s.campaign.phase!=="investment-choice"){advance(s,1);elapsed++;assert.equal(valid(s),true);assert.ok(elapsed<200,"first route choice arrives during active restoration");}
 assert.ok(s.restoration>=25);assert.ok(s.scrap>=15);assert.ok(elapsed<100,"connection and route choice arrive well before first-region completion");
 return s;
}
function v3Continue(s,route){
 const mineForecast=structuredClone(s);mineForecast.cells[23]=Machine.Extractor;
 const powerForecast=structuredClone(s);powerForecast.cells[9]=Machine.Generator;
 const current=rates(s),mine=rates(mineForecast),power=rates(powerForecast);
 assert.equal(current.mined,1.25);assert.equal(current.restored,.7);
 assert.equal(mine.mined,1.6666666666666665);assert.equal(mine.restored,.4666666666666666);
 assert.equal(power.mined,1.25);assert.equal(power.restored,.84);
 const index=route==="mine"?23:9,machine=route==="mine"?Machine.Extractor:Machine.Generator;
 assert.equal(place(s,index,machine).ok,true);assert.equal(s.campaign.firstInvestment,route);
 assert.equal(s.campaign.phase,"first-region");assert.equal(valid(JSON.parse(JSON.stringify(s))),true,"investment stage round-trips before the next milestone");
 assert.equal(place(s,19,Machine.Relay).ok,false,"field relay stays locked until restoration reaches its threshold");
 while(s.campaign.phase!=="field-link"){advance(s,1);assert.equal(valid(s),true);}
 assert.ok(s.restoration>=50);assert.ok(s.scrap>=PRICE[Machine.Relay]);
 assert.equal(place(s,19,Machine.Relay).ok,true);assert.equal(s.campaign.fieldRelay,true);assert.equal(s.campaign.phase,"first-region");
 assert.equal(valid(JSON.parse(JSON.stringify(s))),true,"field connection survives reload");
 assert.equal(claim(s).ok,false,"the region cannot be claimed before the real restoration goal");
 while(!isReady(s)){advance(s,1);assert.equal(valid(s),true);}
 assert.equal(claim(s).ok,true);assert.equal(s.region,1);assert.equal(s.campaign.phase,"frontier-life");
 assert.equal(valid(JSON.parse(JSON.stringify(s))),true,"new frontier is saveable before its action");
 assert.equal(place(s,0,Machine.Relay).ok,false,"the new site does not unlock arbitrary construction");
 assert.equal(place(s,24,Machine.Restorer).ok,true);assert.equal(s.campaign.phase,"open");
 assert.equal(valid(JSON.parse(JSON.stringify(s))),true,"full network opens only after the frontier LIFE starts");
 assert.equal(upgrade(s,true).ok,true,"advanced construction is now available");
 s.restoration=TARGET(s.region);assert.equal(claim(s).ok,true);assert.equal(s.region,2);assert.equal(s.campaign.phase,"open");
 return s;
}

test("v3 teaches repair, a movable earned kit and a real ridge connection before route choice",()=>{
 const s=freshCampaign();
 assert.equal(valid(s),true);assert.equal(s.campaign.version,3);assert.equal(s.campaign.phase,"repair");
 assert.deepEqual(s.cells.map((v,i)=>v&&i!==12?i:null).filter(v=>v!==null),[14]);
 assert.equal(place(s,13,Machine.Relay).ok,false);assert.equal(place(s,17,Machine.Extractor).ok,false);
 assert.equal(place(s,9,Machine.Generator).ok,false);assert.equal(upgrade(s,true).ok,false);
 assert.equal(claim(s).ok,false);assert.equal(resetGrid(s).ok,false);
 assert.equal(repairGreenhouse(s).ok,true);assert.equal(s.scrap,6);assert.equal(s.campaign.phase,"restore");
 const rawZero=structuredClone(s);advance(rawZero,MAX_OFFLINE,0);
 assert.equal(rawZero.campaign.phase,"mine-kit");assert.equal(rawZero.campaign.mineKit,"earned");assert.equal(rawZero.scrap,0);
 assert.equal(place(rawZero,19,Machine.Extractor).ok,false);assert.equal(rawZero.campaign.mineKit,"earned");
 assert.equal(place(rawZero,10,Machine.Extractor).ok,true);assert.equal(rawZero.campaign.phase,"mine-disconnected");assert.equal(rates(rawZero).mined,0);
 assert.equal(place(rawZero,10,Machine.Empty).ok,true);assert.equal(rawZero.campaign.phase,"mine-kit");
 assert.equal(place(rawZero,8,Machine.Extractor).ok,true);assert.equal(rawZero.campaign.phase,"ridge-link");
 const before=rawZero.scrap;assert.equal(place(rawZero,17,Machine.Extractor).ok,true,"the connected kit can be safely moved before cabling the ridge");
 assert.equal(rawZero.cells[8],Machine.Empty);assert.equal(rawZero.cells[17],Machine.Extractor);assert.equal(rawZero.scrap,before);
 assert.equal(place(rawZero,8,Machine.Extractor).ok,true);assert.equal(rawZero.campaign.starterMineSite,8);assert.equal(valid(rawZero),true);
 assert.equal(place(rawZero,18,Machine.Relay).ok,false,"the relay cost is enforced before placement");
 while(rawZero.scrap<4)advance(rawZero,1);
 assert.equal(place(rawZero,18,Machine.Relay).ok,true);assert.equal(rawZero.campaign.phase,"first-region");
 assert.equal(rawZero.cells[18],Machine.Relay);assert.equal(connected(rawZero)[18],true);assert.equal(valid(JSON.parse(JSON.stringify(rawZero))),true);
 assert.equal(place(rawZero,23,Machine.Extractor).ok,false,"route investment is not available before the progress milestone");
 assert.equal(place(rawZero,19,Machine.Relay).ok,false);assert.equal(place(rawZero,24,Machine.Restorer).ok,false);
 assert.equal(claim(rawZero).ok,false);
 while(rawZero.campaign.phase!=="investment-choice")advance(rawZero,1);
 assert.ok(rawZero.restoration>=25);assert.ok(rawZero.scrap>=15);assert.equal(valid(rawZero),true);
 assert.equal(claim(rawZero).ok,false);assert.equal(valid(JSON.parse(JSON.stringify(rawZero))),true);
});

test("v3 starter kit moves atomically between live and dark sockets and remains reload-valid",()=>{
 const s=freshCampaign();repairGreenhouse(s);advance(s,8);assert.equal(s.campaign.phase,"mine-kit");
 assert.equal(place(s,8,Machine.Extractor).ok,true);assert.equal(s.campaign.phase,"ridge-link");
 assert.equal(place(s,10,Machine.Extractor).ok,true,"a live kit may be tried at a dark site before the ridge cable");
 assert.equal(s.cells[8],Machine.Empty);assert.equal(s.cells[10],Machine.Extractor);
 assert.equal(s.campaign.phase,"mine-disconnected");assert.equal(s.campaign.mineKit,"earned");assert.equal(s.campaign.starterMineSite,null);
 assert.equal(valid(s),true,"dark move persists as an earned, disconnected kit");
 assert.equal(valid(JSON.parse(JSON.stringify(s))),true,"dark move survives a save/reload round trip");
 assert.equal(place(s,10,Machine.Empty).ok,true,"undo makes the same kit available again");
 assert.equal(s.cells[10],Machine.Empty);assert.equal(s.campaign.phase,"mine-kit");assert.equal(valid(s),true);
 assert.equal(place(s,8,Machine.Extractor).ok,true);assert.equal(place(s,10,Machine.Extractor).ok,true);
 assert.equal(place(s,8,Machine.Extractor).ok,true,"the disconnected kit can return to a live site");
 assert.equal(s.cells[10],Machine.Empty);assert.equal(s.cells[8],Machine.Extractor);
 assert.equal(s.campaign.phase,"ridge-link");assert.equal(s.campaign.mineKit,"redeemed");assert.equal(s.campaign.starterMineSite,8);
 assert.equal(valid(JSON.parse(JSON.stringify(s))),true);
 assert.equal(place(s,10,Machine.Extractor).ok,true);assert.equal(s.campaign.phase,"mine-disconnected");
 assert.equal(valid(s),true,"repeated live-to-dark moves cannot strand invalid metadata");
});

test("v3 frontier LIFE phase rejects a dead zero-scrap network without a productive MINE",()=>{
 const s=v3AtChoice(8);assert.equal(place(s,23,Machine.Extractor).ok,true);
 while(s.campaign.phase!=="field-link")advance(s,1);
 assert.equal(place(s,19,Machine.Relay).ok,true);
 while(!isReady(s))advance(s,1);
 assert.equal(claim(s).ok,true);assert.equal(s.campaign.phase,"frontier-life");assert.equal(valid(s),true);
 const dead=structuredClone(s);dead.cells=dead.cells.map((type,index)=>type===Machine.Extractor?Machine.Empty:type);dead.scrap=0;
 assert.equal(valid(dead),false,"the required LIFE site cannot be the only remaining campaign action with no productive MINE");
 const disconnected=structuredClone(s);disconnected.cells=disconnected.cells.map(type=>type===Machine.Extractor?Machine.Empty:type);disconnected.cells[0]=Machine.Extractor;
 assert.equal(valid(disconnected),false,"a decorative disconnected MINE is not enough to validate the locked frontier");
});

test("v3 open valley protects the last connected MINE when scrap is empty",()=>{
 const s=v3Continue(v3AtChoice(8),"mine");
 const before=structuredClone(s);
 assert.equal(place(before,0,Machine.Extractor).ok,false,"the scene cannot silently create an unconnected structure");
 assert.equal(before.scrap,s.scrap,"failed contextual placement does not consume scrap");
 assert.equal(place(before,17,Machine.Extractor).ok,true,"an adjacent connected valley site remains playable");
 assert.equal(valid(before),true);
 const mineSites=s.cells.map((type,index)=>type===Machine.Extractor&&rates(s).connected[index]?index:-1).filter(index=>index>=0);
 assert.ok(mineSites.length>=1);s.scrap=0;
 for(const index of mineSites.slice(0,-1))assert.equal(place(s,index,Machine.Empty).ok,true);
 const last=s.cells.findIndex((type,index)=>type===Machine.Extractor&&rates(s).connected[index]);
 assert.ok(last>=0);assert.equal(place(s,last,Machine.Empty).ok,false);
 assert.equal(s.cells[last],Machine.Extractor);assert.equal(rates(s).mined>0,true);assert.equal(valid(s),true);
});

test("v3 route forecasts are numeric, consequential and both routes continue through new frontier",()=>{
 const mine=v3Continue(v3AtChoice(8),"mine");
 assert.ok(rates(mine).mined>0);assert.equal(mine.region,2);
 const power=v3Continue(v3AtChoice(17),"power");
 assert.ok(rates(power).restored>0);assert.equal(power.region,2);
});

test("v3 investment choice opens at 25 actual restoration and survives offline threshold crossing",()=>{
 const s=freshCampaign();repairGreenhouse(s);advance(s,8);place(s,8,Machine.Extractor);
 while(s.scrap<PRICE[Machine.Relay])advance(s,1);
 assert.equal(place(s,18,Machine.Relay).ok,true);assert.equal(s.campaign.phase,"first-region");
 s.restoration=24.9;s.scrap=15;advance(s,.1);
 assert.equal(s.campaign.phase,"first-region","24.9 points do not unlock the investment choice");
 s.restoration=25;advance(s,.01);
 assert.equal(s.campaign.phase,"investment-choice","25 actual points unlock the choice");
 const waiting=structuredClone(s);waiting.campaign.phase="first-region";waiting.restoration=24.5;
 waiting.scrap=15;waiting.savedAt=1000;offline(waiting,1001);
 assert.ok(waiting.restoration>=25);assert.equal(waiting.campaign.phase,"investment-choice","offline restoration crosses the same persisted threshold");
 assert.equal(valid(JSON.parse(JSON.stringify(waiting))),true);
 const short=structuredClone(waiting);short.campaign.phase="first-region";short.restoration=25;short.scrap=14.99;
 advance(short,.01);assert.equal(short.campaign.phase,"first-region","both the restoration and affordability thresholds are required");
});

test("v3 malformed anchors and campaign shape are rejected without rewriting their save bytes",()=>{
 const beforeKit=freshCampaign();repairGreenhouse(beforeKit);advance(beforeKit,10);place(beforeKit,17,Machine.Extractor);
 assert.equal(beforeKit.campaign.phase,"ridge-link");assert.equal(valid(beforeKit),true);
 const brokenRelay=structuredClone(beforeKit);brokenRelay.cells[13]=Machine.Empty;brokenRelay.cells[0]=Machine.Relay;
 assert.equal(valid(brokenRelay),false,"moving RELAY13 to tile0 cannot preserve a dead campaign");
 const missingLife=structuredClone(beforeKit);missingLife.cells[14]=Machine.Empty;missingLife.cells[0]=Machine.Restorer;
 assert.equal(valid(missingLife),false,"the powered LIFE anchor cannot be relocated during a locked phase");
 const choice=v3AtChoice(8);
 for(const mutate of [s=>{s.cells[14]=Machine.Empty;s.cells[0]=Machine.Restorer;},s=>{s.cells[13]=Machine.Empty;s.cells[0]=Machine.Relay;}]){
  const bad=structuredClone(choice);mutate(bad);assert.equal(valid(bad),false,"investment choice requires the actual connected anchors");
 }
 const missingField=structuredClone(choice);delete missingField.campaign.ridgeRelay;assert.equal(valid(missingField),false);
 const wrongShape=structuredClone(choice);wrongShape.campaign.fieldRelay="no";assert.equal(valid(wrongShape),false);
 for(const malformed of [brokenRelay,missingLife,missingField,wrongShape]){
  const raw=JSON.stringify(malformed);assert.equal(valid(JSON.parse(raw)),false);assert.equal(JSON.stringify(JSON.parse(raw)),raw,"unreadable progression bytes remain byte-stable for startup protection");
 }
});

test("v2 campaigns reject missing network anchors and firstInvestment before the choice",()=>{
 const repair=freshVersionTwoCampaign();
 const restoring=structuredClone(repair);assert.equal(repairGreenhouse(restoring).ok,true);
 const kit=structuredClone(restoring);advance(kit,10);assert.equal(kit.campaign.phase,"mine-kit");
 const firstRegion=structuredClone(kit);assert.equal(redeemMineKit(firstRegion,17).ok,true);
 const preChoice=[repair,restoring,kit,firstRegion];
 for(const state of preChoice){
  assert.equal(valid(state),true,state.campaign.phase+" is a valid v2 pre-choice save");
  state.campaign.firstInvestment="mine";
  assert.equal(valid(state),false,state.campaign.phase+" cannot record an investment before the first region claim");
 }
 const ready=structuredClone(firstRegion);ready.campaign.firstInvestment=null;ready.restoration=TARGET(0);assert.equal(claim(ready).ok,true);
 assert.equal(ready.campaign.phase,"investment-choice");assert.equal(valid(ready),true);
 assert.equal(place(ready,7,Machine.Extractor).ok,true);
 assert.equal(ready.campaign.phase,"investment-growth");assert.equal(valid(ready),true);
 const missingLife=structuredClone(ready);missingLife.cells[14]=Machine.Relay;
 assert.equal(valid(missingLife),false,"growth cannot lose the connected LIFE while both expansion sites are gated");
 advance(ready,25/rates(ready).restored);assert.equal(ready.campaign.phase,"investment-second");
 const missingSecondLife=structuredClone(ready);missingSecondLife.cells[14]=Machine.Relay;
 assert.equal(valid(missingSecondLife),false,"second-site phase also requires its connected LIFE anchor");
 const missingRelay=structuredClone(ready);missingRelay.cells[13]=Machine.Empty;
 assert.equal(valid(missingRelay),false,"choice-network phases require the connected RELAY anchor");
 assert.equal(valid(ready),true,"the valid second-site state remains saveable");
});

test("fully opened v2 campaigns and legacy saves keep ordinary later-region claims",()=>{
 const s=freshVersionTwoCampaign();repairGreenhouse(s);advance(s,10);redeemMineKit(s,17);advance(s,200);
 assert.equal(claim(s).ok,true,"the first campaign claim opens the new frontier");
 assert.equal(place(s,7,Machine.Extractor).ok,true);
 assert.equal(s.campaign.phase,"investment-growth");advance(s,60);
 assert.equal(s.campaign.phase,"investment-second");
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

test("v2 unaffordable, occupied and full-site actions never consume unlocks",()=>{
 const s=freshVersionTwoCampaign();repairGreenhouse(s);advance(s,10);redeemMineKit(s,17);
 advance(s,160);assert.equal(claim(s).ok,true);
 const phase=s.campaign.phase,grid=s.cells.slice();s.scrap=0;
 assert.equal(place(s,7,Machine.Extractor).ok,false,"unaffordable choice is rejected");
 assert.equal(s.campaign.phase,phase);assert.deepEqual(s.cells,grid);
 s.scrap=50;s.cells[7]=Machine.Relay;
 assert.equal(place(s,7,Machine.Extractor).ok,false,"an occupied MINE site does not consume the choice");
 s.cells[7]=Machine.Empty;
 for(let i=0;i<25;i++)if(![7,9,12,17].includes(i)&&s.cells[i]===Machine.Empty)s.cells[i]=Machine.Relay;
 assert.equal(place(s,7,Machine.Extractor).ok,true,"the marked MINE site remains legal on a full surrounding board");
 assert.equal(s.campaign.phase,"investment-growth");
 s.scrap=50;
 assert.equal(place(s,9,Machine.Generator).ok,false,"the other site stays locked before 25 recovery");
 assert.equal(s.campaign.phase,"investment-growth");
});


test("new investment branches expose truthful rates, survive the 25-point gate, and converge",()=>{
 const readyCampaign=()=>{
  const s=freshVersionTwoCampaign();repairGreenhouse(s);advance(s,10);redeemMineKit(s,17);advance(s,200);
  assert.equal(isReady(s),true);assert.equal(claim(s).ok,true);assert.equal(s.campaign.phase,"investment-choice");return s;
 };
 const mineFirst=readyCampaign();
 advance(mineFirst,25/rates(mineFirst).restored);
 assert.ok(mineFirst.restoration>=25);assert.equal(mineFirst.campaign.phase,"investment-choice",
  "waiting before a first investment still exposes both first choices");
 const minePreview=structuredClone(mineFirst);minePreview.cells[7]=Machine.Extractor;
 const mineRates=rates(minePreview);
 assert.ok(Math.abs(mineRates.mined-4/3)<1e-9);
 assert.ok(Math.abs(mineRates.used-7/15)<1e-9);
 assert.ok(Math.abs(mineRates.restored-7/15)<1e-9);
 assert.ok(Math.abs((mineRates.mined-mineRates.used)-13/15)<1e-9);
 assert.equal(place(mineFirst,7,Machine.Extractor).ok,true);
 assert.equal(mineFirst.campaign.phase,"investment-second","ready-at-choice grants the second site immediately");
 assert.equal(valid(JSON.parse(JSON.stringify(mineFirst))),true,"the chosen investment reloads without migration");
 assert.equal(place(mineFirst,9,Machine.Generator).ok,true);
 assert.equal(mineFirst.campaign.phase,"open");
 const mineFinal=rates(mineFirst);
 assert.equal(mineFinal.fraction,1);assert.equal(mineFinal.mined,2);assert.equal(mineFinal.restored,.84);
 advance(mineFirst,1000);
 assert.equal(claim(mineFirst).ok,true,"both sites converge to normal region claiming");
 assert.equal(mineFirst.region,2);assert.equal(mineFirst.campaign.phase,"open");

 const powerFirst=readyCampaign();
 const powerPreview=structuredClone(powerFirst);powerPreview.cells[9]=Machine.Generator;
 const powerRates=rates(powerPreview);
 assert.equal(powerRates.fraction,1);assert.equal(powerRates.mined,1);
 assert.equal(powerRates.used,.7);assert.equal(powerRates.restored,.84);
 assert.ok(Math.abs(powerRates.mined-powerRates.used-.3)<1e-9);
 assert.equal(place(powerFirst,9,Machine.Generator).ok,true);
 assert.equal(powerFirst.campaign.firstInvestment,"power");
 assert.equal(powerFirst.campaign.phase,"investment-growth");
 powerFirst.scrap=0;
 advance(powerFirst,25/rates(powerFirst).restored);
 assert.ok(powerFirst.scrap>0,"POWER-first recovery remains fueled from zero saved scrap");
 assert.equal(powerFirst.campaign.phase,"investment-second","25 actual points open the other site");
 assert.equal(valid(JSON.parse(JSON.stringify(powerFirst))),true);
 advance(powerFirst,12);assert.ok(powerFirst.scrap>=12,"the open MINE investment becomes affordable through live production");
 assert.equal(place(powerFirst,7,Machine.Extractor).ok,true);
 const powerFinal=rates(powerFirst);
 assert.equal(powerFirst.campaign.phase,"open");assert.equal(powerFinal.fraction,1);
 assert.equal(powerFinal.mined,2);assert.equal(powerFinal.restored,.84);
 advance(powerFirst,1000);assert.equal(claim(powerFirst).ok,true);assert.equal(powerFirst.region,2);
});

test("25 recovery threshold is actual, persistable, offline-safe and cannot be crossed by a timer",()=>{
 const s=freshVersionTwoCampaign();repairGreenhouse(s);advance(s,10);redeemMineKit(s,17);advance(s,200);claim(s);
 assert.equal(place(s,7,Machine.Extractor).ok,true);
 assert.equal(s.campaign.phase,"investment-growth");
 const r=rates(s);advance(s,24.9/r.restored);
 assert.ok(s.restoration<25);assert.equal(s.campaign.phase,"investment-growth");
 const beforeReload=JSON.parse(JSON.stringify(s));assert.equal(valid(beforeReload),true);
 const resumed=JSON.parse(JSON.stringify(beforeReload));advance(resumed,(25-resumed.restoration)/rates(resumed).restored);
 assert.ok(resumed.restoration>=25);assert.equal(resumed.campaign.phase,"investment-second");
 const offlineState=JSON.parse(JSON.stringify(beforeReload));offlineState.savedAt=100;
 const applied=offline(offlineState,100+MAX_OFFLINE);assert.equal(applied,MAX_OFFLINE);
 assert.ok(offlineState.restoration>=25);assert.equal(offlineState.campaign.phase,"investment-second");
 const noEarlyClaim=JSON.parse(JSON.stringify(resumed));noEarlyClaim.restoration=TARGET(noEarlyClaim.region);
 assert.equal(valid(noEarlyClaim),true);
 assert.equal(claim(noEarlyClaim).ok,false,"a full meter cannot bypass the required second site");
 assert.equal(place(resumed,9,Machine.Generator).ok,true);assert.equal(resumed.campaign.phase,"open");
});

test("v1 campaign saves remain byte-stable on their existing forced route",()=>{
 const s=freshVersionTwoCampaign();s.campaign.version=1;delete s.campaign.firstInvestment;
 repairGreenhouse(s);advance(s,10);redeemMineKit(s,17);advance(s,200);
 assert.equal(claim(s).ok,true);assert.equal(s.campaign.phase,"expansion");assert.equal(valid(s),true);
 const bytes=JSON.stringify(s),loadedV1=JSON.parse(bytes);
 assert.equal(valid(loadedV1),true);assert.equal(JSON.stringify(loadedV1),bytes,"loading a v1 campaign adds no new field or migration");
 assert.equal(place(loadedV1,9,Machine.Generator).ok,false,"v1 does not gain the new POWER-first route");
 assert.equal(place(loadedV1,7,Machine.Extractor).ok,true);assert.equal(loadedV1.campaign.phase,"power");
 assert.equal(place(loadedV1,9,Machine.Generator).ok,true);assert.equal(loadedV1.campaign.phase,"open");
 assert.equal(Object.hasOwn(loadedV1.campaign,"firstInvestment"),false);
});
