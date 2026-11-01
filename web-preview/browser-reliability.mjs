// Newly authored browser reliability regression suite for the recovered PR14
// changes. This is a replacement suite; original missing test bytes are not
// reconstructed or claimed to be identical.
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {fresh,freshCampaign,freshVersionTwoCampaign,Machine,MAX_OFFLINE,MINING_OFFLINE,advance,rates,claim,TARGET,estimateRecoverySeconds,valid,repairGreenhouse,place,isReady} from "./model.mjs";

const origin=process.env.RELIGHT_BROWSER_URL||"http://127.0.0.1:8765";
const saveKey="relight.webplaytest.v1";
const firstKey="relight.webplaytest.onboarded.v1";
const tutorialKey="relight.webplaytest.tutorial.v1";
const executablePath=process.env.RELIGHT_CHROMIUM_EXECUTABLE_PATH||undefined;
const browser=await chromium.launch({headless:true,args:["--no-sandbox"],executablePath});
let passed=0;

function savedWorld({scrap=50,cells,restoration=0,region=0,savedAt=Math.floor(Date.now()/1000)}={}){
  const state=fresh();
  if(cells)state.cells=cells.slice();
  state.scrap=scrap;state.restoration=restoration;state.region=region;
  state.savedAt=savedAt;state.totalPlayed=0;
  return JSON.stringify(state);
}

function readableEta(seconds){
  const total=Math.ceil(seconds);
  if(total<60)return total+"s";
  const minutes=Math.floor(total/60),remainingSeconds=total%60;
  if(minutes<60)return minutes+"m"+(remainingSeconds?" "+remainingSeconds+"s":"");
  const hours=Math.floor(minutes/60),remainingMinutes=minutes%60;
  return hours+"h"+(remainingMinutes?" "+remainingMinutes+"m":"");
}

async function withPage({width=390,height=844,initial,config={}},run){
  const initialValues=initial===undefined?{[saveKey]:savedWorld()}:initial;
  const context=await browser.newContext({
    viewport:{width,height},deviceScaleFactor:1,
    isMobile:width<=650,hasTouch:width<=650
  });
  const page=await context.newPage();
  const appOrigin=new URL(origin).origin;
  await context.route("**/*",route=>{
    if(new URL(route.request().url()).origin===appOrigin)return route.continue();
    return route.abort();
  });
  await page.addInitScript(({initial,config})=>{
    const persistedHarness=sessionStorage.getItem("relight-test-storage-values");
    const values=new Map(persistedHarness?JSON.parse(persistedHarness):Object.entries(initial));
    const saveHarness=()=>sessionStorage.setItem("relight-test-storage-values",JSON.stringify([...values.entries()]));
    const persistedSettings=sessionStorage.getItem("relight-test-storage-settings");
    const settings={
      accessorDenied:false,failSaveGetRemaining:0,failSaveGetAlways:false,failFirstGet:false,
      failFirstSet:false,failSaveWritesRemaining:0,failSaveWritesAlways:false,
      mismatchAfterWrite:false,throwPostWriteGetOnce:false,
      ...config,...(persistedSettings?JSON.parse(persistedSettings):{})
    };
    const saveSettings=()=>sessionStorage.setItem("relight-test-storage-settings",JSON.stringify(settings));
    if(!persistedSettings)saveSettings();
    const events=[];
    let saveGets=0,saveWrites=0,postWriteGetFailed=false;
    let queuedFrame=null,frameTime=0;
    window.requestAnimationFrame=callback=>{queuedFrame=callback;return 1;};
    const storage={
      getItem(key){
        events.push(["get",key]);
        if(key==="relight.webplaytest.v1"){
          saveGets++;
          if(settings.failSaveGetAlways)throw new Error("blocked save read");
          if(settings.failSaveGetRemaining>0){settings.failSaveGetRemaining--;saveSettings();throw new Error("blocked save read");}
          if(settings.throwPostWriteGetOnce&&saveWrites>0&&!postWriteGetFailed){
            postWriteGetFailed=true;throw new Error("post-write read denied");
          }
          if(settings.mismatchAfterWrite&&saveWrites>0)return "readback did not match";
        }
        if(key==="relight.webplaytest.onboarded.v1"&&settings.failFirstGet)
          throw new Error("tutorial preference read denied");
        return values.has(key)?values.get(key):null;
      },
      setItem(key,value){
        events.push(["set",key,String(value)]);
        if(key==="relight.webplaytest.v1"){
          if(settings.failSaveWritesAlways)throw new Error("quota exceeded");
          if(settings.failSaveWritesRemaining>0){settings.failSaveWritesRemaining--;saveSettings();throw new Error("quota exceeded");}
          saveWrites++;
        }
        if(key==="relight.webplaytest.onboarded.v1"&&settings.failFirstSet)
          throw new Error("tutorial preference write denied");
        values.set(key,String(value));saveHarness();
      },
      removeItem(key){events.push(["remove",key]);values.delete(key);saveHarness();},
      clear(){events.push(["clear"]);values.clear();saveHarness();},
      key(index){return [...values.keys()][index]??null;},
      get length(){return values.size;}
    };
    Object.defineProperty(window,"localStorage",{
      configurable:true,
      get(){
        if(settings.accessorDenied)throw new Error("storage accessor denied");
        return storage;
      }
    });
    window.__relightTest={
      values,settings,events,
      configure(patch){Object.assign(settings,patch);saveSettings();},
      raw(key){return values.has(key)?values.get(key):null;},
      setRaw(key,value){values.set(key,String(value));saveHarness();},
      saveWrites(){return saveWrites;},
      saveGets(){return saveGets;},
      writeEvents(){return events.filter(event=>event[0]==="set"&&event[1]==="relight.webplaytest.v1").length;},
      tickAutosave(){
        if(!queuedFrame)return false;
        const callback=queuedFrame;queuedFrame=null;frameTime+=1000;callback(frameTime);return true;
      }
    };
  },{initial:initialValues,config});
  try{
    await page.goto(origin,{waitUntil:"networkidle"});
    assert.equal(await page.locator(".tile").count(),25,"playable board renders");
    await run(page);
  }finally{
    await context.close();
  }
}

async function closeGuide(page){
  if(await page.locator("#welcome").evaluate(element=>element.open))
    await page.locator("#dismiss-help").click({timeout:5000});
}
async function clickSceneAction(page){await page.locator("#scene-action").click();}
async function claimSceneRegion(page){await page.locator("#scene-awaken").click();}
async function build(page,machine,index){
  await closeGuide(page);
  const quick=page.locator(`.quick-tool[data-machine="${machine}"]`);
  const tool=page.locator(`.tool[data-machine="${machine}"]`);
  if(await quick.isVisible())await quick.click();else await tool.click();
  await page.locator(`[data-index="${index}"]`).click();
}
async function remove(page,index){
  await closeGuide(page);
  const quick=page.locator('.quick-tool[data-machine="0"]');
  const tool=page.locator('.tool[data-machine="0"]');
  if(await quick.isVisible())await quick.click();else await tool.click();
  await page.locator(`[data-index="${index}"]`).click();
}
async function status(page){
  return page.locator("#save-status").evaluate(el=>({
    hidden:el.hidden,text:el.textContent,tone:el.dataset.tone,
    role:el.getAttribute("role"),live:el.getAttribute("aria-live"),
    box:(()=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})(),
    scrollHeight:el.scrollHeight,clientHeight:el.clientHeight
  }));
}
async function raw(page,key=saveKey){return page.evaluate(key=>window.__relightTest.raw(key),key);}
async function pagehide(page){await page.evaluate(()=>window.dispatchEvent(new Event("pagehide")));}
async function hideAndNotify(page){
  await page.evaluate(()=>{
    Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
async function runAutosaveTicks(page,count=40){
  const ran=await page.evaluate(count=>{
    let executed=0;
    for(let i=0;i<count;i++)if(window.__relightTest.tickAutosave())executed++;
    return executed;
  },count);
  assert.ok(ran>=count-1,`only ${ran}/${count} animation frames ran`);
}
async function buildGuidedNetwork(page){
  if(await page.locator("body").evaluate(el=>el.classList.contains("campaign-opening"))){
    const isolatedPractice=await page.locator("#scene-return").isVisible();
    await clickSceneAction(page);
    await runAutosaveTicks(page,48);
    assert.equal(await page.locator("#opening-world").getAttribute("data-phase"),"mine-kit",
      isolatedPractice?"practice restoration earns the kit in its isolated world":"restoration earns and saves the starter kit");
    await page.locator("#scene-socket-8").click();
    assert.equal(await page.locator("#opening-world").getAttribute("data-phase"),"ridge-link");
    await runAutosaveTicks(page,32);
    await page.locator("#scene-action").click();
    for(let elapsed=0;elapsed<800&&(await page.locator("#opening-world").getAttribute("data-phase"))!=="investment-choice";elapsed+=8)
      await runAutosaveTicks(page,8);
    assert.equal(await page.locator("#opening-world").getAttribute("data-phase"),"investment-choice","the first route is earned during first-region restoration");
    await page.locator("#scene-choice-mine").click();
    for(let elapsed=0;elapsed<1000&&(await page.locator("#opening-world").getAttribute("data-phase"))!=="field-link";elapsed+=8)
      await runAutosaveTicks(page,8);
    assert.equal(await page.locator("#opening-world").getAttribute("data-phase"),"field-link");
    await page.locator("#scene-action").click();
    await runAutosaveTicks(page,1200);
    await page.locator("#scene-awaken").waitFor({state:"visible"});
    return;
  }
  await build(page,Machine.Generator,19);
  await build(page,Machine.Extractor,7);
  await runAutosaveTicks(page,40);
  await build(page,Machine.Relay,8);
  await runAutosaveTicks(page,40);
  await build(page,Machine.Restorer,9);
  await runAutosaveTicks(page,280);
}
async function unlockCampaignPower(page){
  if(!await page.locator("body").evaluate(el=>el.classList.contains("campaign-opening")))return;
  const version=await page.evaluate(()=>JSON.parse(localStorage.getItem("relight.webplaytest.v1"))?.campaign?.version);
  const phase=await page.locator("#opening-world").getAttribute("data-phase");
  if(version===3||phase==="frontier-life"&&await page.locator("#scene-return").isVisible()){
    assert.equal(phase,"frontier-life","the first claim reveals one frontier build, not the whole grid");
    assert.equal(await page.locator(".tile:visible").count(),0);
    await page.locator("#scene-action").click();
    assert.equal(await page.locator("#opening-world").getAttribute("data-phase"),"open",
      "the persistent valley remains active after starting the frontier LIFE site");
    assert.equal(await page.locator("#opening-world").isVisible(),true);
    assert.equal(await page.locator(".tile:visible").count(),0,"the scene remains the default even after the frontier starts");
    assert.equal(await page.locator(".sidebar").isVisible(),false);
    return;
  }
  assert.equal(await page.locator("#scene-choice-mine").isVisible(),true);
  await page.locator("#scene-choice-mine").click();
  assert.match(await page.locator("#world-copy").textContent(),/25 points/);
  await runAutosaveTicks(page,240);
  await page.locator("#scene-action").waitFor({state:"visible"});
  await clickSceneAction(page);
  assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("campaign-opening")),false,
    "the full sandbox opens only after the actual POWER placement");
}
async function check(name,fn){
  await fn();passed++;console.log("PASS browser reliability:",name);
}

try{
  const recognizable=savedWorld({scrap:73});
  await check("storage accessor denial preserves original bytes through play and lifecycle",()=>withPage({
    initial:{[saveKey]:recognizable},config:{accessorDenied:true}
  },async page=>{
    const warning=await status(page);
    assert.equal(warning.hidden,false);assert.match(warning.text,/existing save can't be read/i);
    assert.equal(warning.role,"status");assert.equal(warning.live,"polite");
    assert.equal(await page.locator("#scrap").textContent(),"30","fresh volatile world remains playable");
    await build(page,Machine.Generator,19);
    await runAutosaveTicks(page);
    await hideAndNotify(page);
    await pagehide(page);
    assert.equal(await raw(page),recognizable);
    assert.equal(await page.evaluate(()=>window.__relightTest.writeEvents()),0);
    await page.reload({waitUntil:"networkidle"});
    assert.equal(await raw(page),recognizable);
    assert.equal(await status(page).then(value=>value.hidden),false);
    await runAutosaveTicks(page);
    await hideAndNotify(page);await pagehide(page);
    assert.equal(await raw(page),recognizable);
    assert.equal(await page.evaluate(()=>window.__relightTest.writeEvents()),0);
  }));

  await check("SAVE getItem denial never writes even when setItem would work",()=>withPage({
    initial:{[saveKey]:recognizable},config:{failSaveGetAlways:true}
  },async page=>{
    await build(page,Machine.Generator,19);await runAutosaveTicks(page);
    await hideAndNotify(page);await pagehide(page);
    assert.equal(await raw(page),recognizable);
    assert.equal(await page.evaluate(()=>window.__relightTest.writeEvents()),0);
    assert.match((await status(page)).text,/left untouched/i);
    await page.reload({waitUntil:"networkidle"});
    assert.equal(await raw(page),recognizable);
    await runAutosaveTicks(page);await hideAndNotify(page);await pagehide(page);
    assert.equal(await raw(page),recognizable);
    assert.equal(await page.evaluate(()=>window.__relightTest.writeEvents()),0);
  }));

  for(const [name,rawSave] of [["malformed JSON","{"],["schema-invalid JSON",JSON.stringify({cells:[1,2]})]]){
    await check(`${name} remains untouched while a fresh session runs`,()=>withPage({
      initial:{[saveKey]:rawSave,[firstKey]:"yes"}
    },async page=>{
      assert.equal(await page.locator("#scrap").textContent(),"30");
      assert.match((await status(page)).text,/existing save can't be read/i);
      await build(page,Machine.Generator,19);await runAutosaveTicks(page);
      await hideAndNotify(page);await pagehide(page);
      assert.equal(await raw(page),rawSave);
      assert.equal(await page.evaluate(()=>window.__relightTest.writeEvents()),0);
      await page.reload({waitUntil:"networkidle"});
      assert.equal(await raw(page),rawSave);
      assert.match((await status(page)).text,/existing save can't be read/i);
      await runAutosaveTicks(page);await hideAndNotify(page);await pagehide(page);
      assert.equal(await raw(page),rawSave);
      assert.equal(await page.evaluate(()=>window.__relightTest.writeEvents()),0);
    }));
  }

  await check("invalid v2 anchor and pre-choice records remain byte-protected through reload and lifecycle",async()=>{
    const brokenNetwork=freshVersionTwoCampaign();
    brokenNetwork.cells[13]=Machine.Relay;brokenNetwork.cells[14]=Machine.Relay;
    brokenNetwork.cells[17]=Machine.Extractor;brokenNetwork.cells[7]=Machine.Extractor;
    brokenNetwork.region=1;brokenNetwork.restoration=12;brokenNetwork.scrap=48;
    brokenNetwork.campaign={version:2,phase:"investment-growth",mineKit:"redeemed",firstInvestment:"mine"};
    brokenNetwork.savedAt=Math.floor(Date.now()/1000);
    const badPreChoice=freshVersionTwoCampaign();
    badPreChoice.cells[13]=Machine.Relay;badPreChoice.cells[17]=Machine.Extractor;
    badPreChoice.region=0;badPreChoice.restoration=40;badPreChoice.scrap=48;
    badPreChoice.campaign={version:2,phase:"first-region",mineKit:"redeemed",firstInvestment:"power"};
    badPreChoice.savedAt=Math.floor(Date.now()/1000);
    for(const [label,state] of [["missing LIFE anchor",brokenNetwork],["pre-choice investment marker",badPreChoice]]){
      const original=JSON.stringify(state);
      await withPage({initial:{[saveKey]:original,[firstKey]:"yes"}},async page=>{
        assert.match((await status(page)).text,/existing save can't be read/i,label+" shows the protected-save warning");
        const initialWrites=await page.evaluate(()=>window.__relightTest.writeEvents());
        await build(page,Machine.Generator,19);await runAutosaveTicks(page,12);
        await hideAndNotify(page);await pagehide(page);
        assert.equal(await raw(page),original,label+" bytes survive play and lifecycle events");
        assert.equal(await page.evaluate(()=>window.__relightTest.writeEvents()),initialWrites,label+" causes no SAVE overwrite");
        await page.reload({waitUntil:"networkidle"});
        assert.equal(await raw(page),original,label+" bytes survive reload");
        assert.match((await status(page)).text,/existing save can't be read/i,label+" remains protected after reload");
      });
    }
  });

  await check("a save read failure immediately before write protects the verified snapshot",()=>withPage({
    initial:{[saveKey]:recognizable,[firstKey]:"yes"}
  },async page=>{
    const verified=await raw(page);
    const writes=await page.evaluate(()=>window.__relightTest.writeEvents());
    await page.evaluate(()=>window.__relightTest.configure({failSaveGetAlways:true}));
    await build(page,Machine.Generator,19);await pagehide(page);
    assert.equal(await raw(page),verified);
    assert.equal(await page.evaluate(()=>window.__relightTest.writeEvents()),writes);
    assert.match((await status(page)).text,/left untouched/i);
    await runAutosaveTicks(page);await hideAndNotify(page);await pagehide(page);
    assert.equal(await raw(page),verified);
    assert.equal(await page.evaluate(()=>window.__relightTest.writeEvents()),writes);
    await page.reload({waitUntil:"networkidle"});
    assert.equal(await raw(page),verified);
    assert.match((await status(page)).text,/existing save can't be read/i);
    await runAutosaveTicks(page);await hideAndNotify(page);await pagehide(page);
    assert.equal(await raw(page),verified);
    assert.equal(await page.evaluate(()=>window.__relightTest.writeEvents()),0);
  }));

  await check("an external save change is preserved while actions still work",()=>withPage({
    initial:{[saveKey]:savedWorld({scrap:20}),[firstKey]:"yes"}
  },async page=>{
    const before=await page.evaluate(()=>window.__relightTest.writeEvents());
    const external="external-tab-save-bytes";
    await page.evaluate(value=>window.__relightTest.setRaw("relight.webplaytest.v1",value),external);
    await build(page,Machine.Generator,19);
    assert.match((await status(page)).text,/changed outside this session/i);
    assert.equal(await raw(page),external);
    assert.equal(await page.evaluate(()=>window.__relightTest.writeEvents()),before);
    assert.match(await page.locator("#mobile-feedback").textContent(),/Structure built/i);
    await runAutosaveTicks(page);await hideAndNotify(page);await pagehide(page);
    assert.equal(await raw(page),external);
    assert.equal(await page.evaluate(()=>window.__relightTest.writeEvents()),before);
  }));

  await check("quota failure recovers only after an exact readback, then can fail and recover again",()=>withPage({
    initial:{[saveKey]:savedWorld({scrap:60}),[firstKey]:"yes"}
  },async page=>{
    await page.evaluate(()=>window.__relightTest.configure({failSaveWritesRemaining:1}));
    const before=await raw(page);
    await build(page,Machine.Generator,19);
    assert.match((await status(page)).text,/can't be saved/i);
    assert.equal(await raw(page),before,"failed quota write leaves prior save bytes intact");
    await build(page,Machine.Extractor,7);
    const recovered=await status(page);
    assert.equal(recovered.tone,"success");assert.match(recovered.text,/verified copy/i);
    const verified=await raw(page);
    assert.ok(verified);assert.equal(JSON.parse(verified).cells[7],Machine.Extractor);
    await page.evaluate(()=>window.__relightTest.configure({failSaveWritesRemaining:1}));
    await build(page,Machine.Relay,0);
    assert.match((await status(page)).text,/can't be saved/i);
    assert.equal(await raw(page),verified);
    await remove(page,0);
    assert.equal((await status(page)).tone,"success");
    assert.match((await status(page)).text,/verified copy/i);
    assert.equal(JSON.parse(await raw(page)).cells[0],Machine.Empty);
  }));

  await check("readback mismatch warns and prevents subsequent writes without rollback",()=>withPage({
    config:{mismatchAfterWrite:true}
  },async page=>{
    const warning=await status(page);
    assert.equal(warning.hidden,false);assert.match(warning.text,/couldn't verify/i);
    const written=await raw(page);
    assert.ok(JSON.parse(written).cells.length===25,"successful write is retained without rollback");
    const writes=await page.evaluate(()=>window.__relightTest.writeEvents());
    await build(page,Machine.Generator,19);await pagehide(page);
    assert.equal(await page.evaluate(()=>window.__relightTest.writeEvents()),writes);
    assert.equal(await raw(page),written);
    assert.match((await status(page)).text,/couldn't verify/i);
  }));

  await check("post-write read denial warns as unverified, keeps the write, and blocks retries",()=>withPage({
    config:{throwPostWriteGetOnce:true}
  },async page=>{
    const warning=await status(page);
    assert.match(warning.text,/couldn't verify/i);assert.doesNotMatch(warning.text,/left untouched/i);
    const written=await raw(page);
    assert.ok(written,"successful write remains stored when readback is denied");
    const writes=await page.evaluate(()=>window.__relightTest.writeEvents());
    await build(page,Machine.Generator,19);await pagehide(page);
    assert.equal(await page.evaluate(()=>window.__relightTest.writeEvents()),writes);
    assert.equal(await raw(page),written);
  }));

  for(const [name,config,firstValue] of [
    ["FIRST getItem denied",{failFirstGet:true},"yes"],
    ["FIRST setItem denied",{failFirstSet:true},undefined]
  ]){
    await check(`${name} is isolated from healthy save persistence`,()=>withPage({
      initial:{[saveKey]:savedWorld({scrap:60}),...(firstValue===undefined?{}:{[firstKey]:firstValue})},config
    },async page=>{
      assert.equal(await page.locator("#welcome").evaluate(el=>el.open),true,"guide remains available");
      assert.equal((await status(page)).hidden,true,"tutorial-only storage trouble is not a save warning");
      await page.locator("#dismiss-help").click();
      await build(page,Machine.Generator,19);
      const persisted=JSON.parse(await raw(page));
      assert.equal(persisted.cells[19],Machine.Generator);
      await page.locator("#how-to-play").click();
      assert.equal(await page.locator("#welcome").evaluate(el=>el.open),true);
      await page.locator("#dismiss-help").click();
      await page.reload({waitUntil:"networkidle"});
      assert.equal(await page.locator("#welcome").evaluate(el=>el.open),true,
        "unavailable FIRST preference can cause the guide to repeat after reload");
      assert.equal(JSON.parse(await raw(page)).cells[19],Machine.Generator);
      assert.equal((await status(page)).hidden,true);
    }));
  }

  await check("walkthrough reacts to different moves, prerequisite removal, low funds, and a full grid",async()=>{
    const started={active:true,complete:false,mode:"live",initialRegion:0};
    await withPage({initial:{[saveKey]:savedWorld({scrap:60}),[firstKey]:"yes",[tutorialKey]:JSON.stringify(started)}},async page=>{
      assert.match(await page.locator("#mission-title").textContent(),/Connect POWER/);
      await build(page,Machine.Extractor,19);
      assert.equal(JSON.parse(await raw(page)).cells[19],Machine.Extractor,
        "an alternative build is preserved instead of being cleared");
      assert.match(await page.locator("#mission-title").textContent(),/Connect POWER/,
        "a different build does not pretend the powered-LIFE goal is complete");
      assert.ok(await page.locator(".tile.tutorial-highlight").count()>0,
        "legal target is recomputed after the suggested cell becomes occupied");
      await build(page,Machine.Generator,9);
      assert.match(await page.locator("#mission-title").textContent(),/Extend the relay path/,
        "an already completed second-mine condition is skipped from actual state");
      await remove(page,9);
      assert.match(await page.locator("#mission-title").textContent(),/Connect POWER/,
        "removing a required generator regresses guidance to the unmet model condition");
    });

    const noFunds=fresh();noFunds.scrap=0;noFunds.savedAt=Math.floor(Date.now()/1000);
    await withPage({initial:{[saveKey]:JSON.stringify(noFunds),[firstKey]:"yes",[tutorialKey]:JSON.stringify(started)}},async page=>{
      assert.match(await page.locator("#mission-description").textContent(),/Wait for connected MINE production/);
      assert.equal(await page.locator(".tile.tutorial-highlight").count(),0,
        "unaffordable placements are not presented as legal targets");
      assert.equal(await page.locator("#scrap").evaluate(el=>el.classList.contains("tutorial-highlight")),true);
    });

    const fullCells=Array(25).fill(Machine.Relay);fullCells[12]=Machine.Core;fullCells[14]=Machine.Restorer;
    await withPage({initial:{[saveKey]:savedWorld({cells:fullCells,scrap:60}),[firstKey]:"yes",[tutorialKey]:JSON.stringify(started)}},async page=>{
      assert.match(await page.locator("#mission-description").textContent(),/No connected empty tile is available/);
      assert.equal(await page.locator(".tile.tutorial-highlight").count(),0,
        "a full board receives no fabricated target");
      assert.equal(await page.locator("#tutorial-skip").isVisible(),true,
        "the player can skip rather than being forced to remove a structure");
    });
  });

  await check("tutorial metadata must be a complete valid live record",()=>withPage({
    initial:{
      [saveKey]:savedWorld({scrap:77,region:2}),
      [firstKey]:"yes",
      [tutorialKey]:JSON.stringify({active:true,complete:true,mode:"live",initialRegion:-1})
    }
  },async page=>{
    assert.equal(await page.locator("#tutorial-skip").isVisible(),false,
      "contradictory or negative tutorial metadata cannot activate a walkthrough");
    assert.equal(await page.locator("#tutorial-return").isVisible(),false);
    const saved=JSON.parse(await raw(page));
    assert.equal(saved.region,2);assert.ok(saved.scrap>=77&&saved.scrap<78,
      "the existing world remains loaded; only normal startup mining may add fractional scrap");
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("relight.webplaytest.tutorial.v1")).initialRegion),-1,
      "invalid tutorial metadata is ignored without rewriting the existing record");
  }));

  await check("unaffordable guidance detects missing or disconnected scrap production",()=>withPage({
    width:320,height:640,initial:{
      [firstKey]:"yes",
      [tutorialKey]:JSON.stringify({active:true,complete:false,mode:"live",initialRegion:0})
    }
  },async page=>{
    const empty=fresh();empty.cells[11]=Machine.Empty;empty.scrap=0;
    const disconnected=fresh();disconnected.cells[11]=Machine.Empty;disconnected.cells[0]=Machine.Extractor;disconnected.scrap=0;
    for(const world of [empty,disconnected]){
      await page.evaluate(value=>window.__relightTest.setRaw("relight.webplaytest.v1",value),JSON.stringify(world));
      await page.reload({waitUntil:"networkidle"});
      await page.locator("#tutorial-skip").waitFor({state:"visible"});
      assert.match(await page.locator("#mission-description").textContent(),/No connected MINE produces scrap/);
      assert.doesNotMatch(await page.locator("#mission-description").textContent(),/Wait for MINE production/);
      assert.match(await page.locator("#mobile-feedback").textContent(),/Reconnect one or replay in practice/);
      assert.equal(await page.locator("#welcome").evaluate(el=>el.open),false,
        "the blocked lesson offers a safe recovery path without resetting the world");
    }
    const ready=fresh();ready.cells[9]=Machine.Restorer;ready.scrap=0;ready.restoration=100;ready.savedAt=Math.floor(Date.now()/1000);
    await page.evaluate(value=>window.__relightTest.setRaw("relight.webplaytest.v1",value),JSON.stringify(ready));
    await page.reload({waitUntil:"networkidle"});
    await page.locator("#tutorial-skip").waitFor({state:"visible"});
    assert.ok((await page.locator("#power-note").textContent()).includes("All placed machines are connected."));
    assert.match(await page.locator("#mission-description").textContent(),/Wait for connected MINE production/,
      "a ready region does not imply LIFE is consuming fuel while it earns scrap");
    assert.doesNotMatch(await page.locator("#mission-description").textContent(),/Scrap cannot grow/,
      "ready-world mining is reported as positive income despite LIFE demand");
  }));

  await check("legacy walkthrough skip and reopening leave the world unchanged",()=>withPage({initial:{
    [saveKey]:savedWorld(),[tutorialKey]:JSON.stringify({active:true,complete:false,mode:"live",initialRegion:0})
  }},async page=>{
    await page.locator("#begin").click();
    const saved=await raw(page);
    const before=JSON.parse(saved);
    await page.locator("#tutorial-skip").click();
    assert.equal(await raw(page),saved,"skipping changes only tutorial preference, not world SAVE");
    await page.locator("#how-to-play").click();
    assert.match(await page.locator("#welcome-copy").textContent(),/temporary practice network/);
    await page.locator("#dismiss-help").click();
    const after=JSON.parse(await raw(page));
    assert.equal(after.scrap,before.scrap);assert.deepEqual(after.cells,before.cells);
  }));

  await check("Escape dismisses onboarding without changing progress and replay stays isolated",()=>withPage({},async page=>{
    const saved=await raw(page);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#welcome").evaluate(el=>el.open),false,
      "keyboard Escape dismisses the native welcome dialog");
    assert.equal(await raw(page),saved,"dismissing onboarding does not alter the world save");
    await page.locator("#how-to-play").click();
    await page.locator("#begin").click();
    assert.equal(await page.locator("#scene-return").isVisible(),true,
      "replay after Escape is visibly marked as temporary practice");
    assert.match(await page.locator("#scene-practice-label").textContent(),/Temporary practice/);
    assert.equal(await raw(page),saved,"starting replay after Escape preserves the saved world bytes");
  }));

  await check("an early normal claim cannot mark unfinished construction lessons complete",()=>{
    const early=fresh();early.scrap=30;early.restoration=100;early.savedAt=Math.floor(Date.now()/1000);
    return withPage({initial:{
      [saveKey]:JSON.stringify(early),[firstKey]:"yes",
      [tutorialKey]:JSON.stringify({active:true,complete:false,mode:"live",initialRegion:0})
    }},async page=>{
      assert.equal(await page.locator("#revive").isVisible(),true,"existing claim remains available when ready");
      await page.locator("#revive").click();
      assert.equal(JSON.parse(await raw(page)).region,1,"early claim still grants the normal region advance");
      assert.equal(await page.locator("#mission-title").textContent(),"Connect POWER beside LIFE",
        "region progress cannot skip unbuilt tutorial lessons");
      assert.equal(await page.locator("#tutorial-done").isVisible(),false,
        "the walkthrough is not reported complete before its build goals");
      await build(page,Machine.Generator,9);
      assert.equal(await page.locator("#mission-title").textContent(),"Grow the scrap supply",
        "the lesson sequence continues from actual machines after an early claim");
    });
  });

  await check("guided live regions stay quiet on stable ticks and announce one stage change",()=>withPage({
    width:390,height:844,initial:{[saveKey]:savedWorld(),[firstKey]:"yes",
      [tutorialKey]:JSON.stringify({active:true,complete:false,mode:"live",initialRegion:0})}
  },async page=>{
    await page.locator("#how-to-play").click();
    await page.locator("#begin").click();
    await page.evaluate(()=>{
      const title=document.querySelector("#mission-title");
      const feedback=document.querySelector("#mobile-feedback");
      window.__liveMutationCounts={title:0,feedback:0};
      window.__liveMutationObserver=new MutationObserver(records=>{
        for(const record of records){
          if(title.contains(record.target)||record.target===title)window.__liveMutationCounts.title++;
          if(feedback.contains(record.target)||record.target===feedback)window.__liveMutationCounts.feedback++;
        }
      });
      window.__liveMutationObserver.observe(title,{subtree:true,childList:true,characterData:true});
      window.__liveMutationObserver.observe(feedback,{subtree:true,childList:true,characterData:true});
    });
    await runAutosaveTicks(page,8);
    await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
    assert.deepEqual(await page.evaluate(()=>window.__liveMutationCounts),{title:0,feedback:0},
      "stable animation ticks produce no redundant mission or mobile live-region mutations");

    await build(page,Machine.Generator,19);
    await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
    assert.deepEqual(await page.evaluate(()=>window.__liveMutationCounts),{title:1,feedback:1},
      "one completed goal creates one meaningful title and instruction update");
    assert.equal(await page.locator("#mission-title").textContent(),"Grow the scrap supply");
    assert.match(await page.locator("#mobile-feedback").textContent(),/Walkthrough 2\/5/);
    await page.evaluate(()=>window.__liveMutationObserver.disconnect());
  }));

  await check("legacy region-zero saves remain fully open instead of entering the new campaign",()=>withPage({
    initial:{[saveKey]:savedWorld({scrap:73,region:0}),[firstKey]:"yes"}
  },async page=>{
    const saved=JSON.parse(await raw(page));
    assert.equal(saved.campaign,undefined,"legacy schema is not rewritten with campaign locks");
    assert.ok(saved.scrap>=73&&saved.scrap<74,"normal offline simulation may add fractional scrap during startup");
    assert.equal(saved.region,0);
    assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("campaign-opening")),false);
    assert.equal(await page.locator(".tile:visible").count(),25);
    assert.equal(await page.locator(".sidebar").isVisible(),true);
    assert.equal(await page.locator('.tool[data-machine="5"]').isVisible(),true);
  }));

  await check("unknown future campaign versions remain byte-protected",()=>{
    const future=freshCampaign();future.campaign.version=99;
    const original=JSON.stringify(future);
    return withPage({initial:{[saveKey]:original,[firstKey]:"yes"}},async page=>{
      assert.equal(await raw(page),original,"startup does not normalize an unknown future campaign");
      assert.match((await status(page)).text,/existing save can't be read/i);
      await page.locator("#how-to-play").click();await page.locator("#begin").click();
      await clickSceneAction(page);await runAutosaveTicks(page,48);await pagehide(page);
      assert.equal(await raw(page),original,"volatile play and lifecycle writes keep the unknown save unchanged");
    });
  });

  await check("v3 actual connection, early priority, field relay and first frontier stay in the valley",()=>withPage({
    width:320,height:640,initial:{}
  },async page=>{
    assert.equal(await page.locator("#welcome").evaluate(el=>el.open),false,"fresh play starts directly in the valley");
    assert.equal(await page.locator("#opening-world").isVisible(),true);
    assert.equal(await page.locator(".tile:visible").count(),0);
    assert.equal(await page.locator(".sidebar").isVisible(),false);
    assert.equal(await page.locator(".resource:visible").count(),1);
    for(const id of ["#scene-reactor","#scene-relay","#scene-greenhouse","#scene-action"]){
      const rect=await page.locator(id).boundingBox();assert.ok(rect&&rect.y>=0&&rect.y+rect.height<=640,`${id} is visible at320×640`);
    }
    let saved=JSON.parse(await raw(page));assert.equal(saved.campaign.phase,"repair");assert.equal(saved.scrap,10);assert.ok(valid(saved));
    await page.locator("#scene-action").click();saved=JSON.parse(await raw(page));
    assert.equal(saved.campaign.phase,"restore");assert.equal(saved.cells[13],Machine.Relay);assert.equal(saved.scrap,6);
    await page.reload({waitUntil:"networkidle"});
    assert.equal(await page.locator("#opening-world").getAttribute("data-powered"),"true","repair produces a live cable after reload");
    await runAutosaveTicks(page,48);saved=JSON.parse(await raw(page));
    assert.equal(saved.campaign.phase,"mine-kit");assert.equal(saved.campaign.mineKit,"earned");
    await page.locator("#scene-socket-10").click();saved=JSON.parse(await raw(page));
    assert.equal(saved.campaign.phase,"mine-disconnected");assert.equal(rates(saved).mined,0);
    assert.match(await page.locator("#mission-title").textContent(),/no power path/i);
    const scrapBeforeKit=Number(await page.locator("#scrap").textContent().then(text=>text.match(/[\d.]+/)?.[0]||0));
    await page.locator("#scene-socket-8").click();saved=JSON.parse(await raw(page));
    assert.equal(saved.campaign.phase,"ridge-link");assert.equal(saved.cells[8],Machine.Extractor);
    assert.equal(saved.scrap,scrapBeforeKit,"the earned kit never costs scrap, even after long idle depleted the reserve");
    assert.equal(await page.locator(".tile:visible").count(),0,"socket work remains in the scene");
    await runAutosaveTicks(page,80);assert.ok(JSON.parse(await raw(page)).scrap>=4,
      "twenty simulated gameplay seconds fund the ridge relay after an idle-exhausted reserve");
    await page.locator("#scene-action").click();saved=JSON.parse(await raw(page));
    assert.equal(saved.campaign.phase,"first-region");assert.equal(saved.cells[18],Machine.Relay);
    assert.match(await page.locator('.scene-network-wire[data-from="13"][data-to="18"]').getAttribute("class"),/wire-live/);
    assert.equal(await page.locator(".tile:visible").count(),0,"the grid remains sealed after the connection");
    for(let ticks=0;ticks<800&&(await page.locator("#opening-world").getAttribute("data-phase"))!=="investment-choice";ticks+=16)
      await runAutosaveTicks(page,16);
    assert.equal(await page.locator("#opening-world").getAttribute("data-phase"),"investment-choice",
      "the first route becomes actionable from actual restoration and scrap");
    await pagehide(page);
    saved=JSON.parse(await raw(page));assert.equal(saved.campaign.phase,"investment-choice",
      `pagehide persists the earned milestone: restore=${saved.restoration}, scrap=${saved.scrap}, mine=${rates(saved).mined}, used=${rates(saved).used}`);
    assert.ok(saved.restoration>=25&&saved.scrap>=15,"the priority decision arrives during first restoration");
    assert.match(await page.locator("#scene-choice-mine-detail").textContent(),/1\.67 gross\/s.*\+1\.20 net\/s.*0\.47\/s at 67% power/);
    assert.match(await page.locator("#scene-choice-power-detail").textContent(),/1\.25 gross\/s.*\+0\.55 net\/s.*0\.84\/s at 100% power/);
    const mineBox=await page.locator("#scene-choice-mine").boundingBox(),powerBox=await page.locator("#scene-choice-power").boundingBox();
    assert.ok(mineBox.height>=44&&powerBox.height>=44);
    assert.ok(mineBox.x+mineBox.width<=powerBox.x||powerBox.x+powerBox.width<=mineBox.x,"route targets do not overlap");
    await page.locator("#scene-choice-mine").click();saved=JSON.parse(await raw(page));
    assert.equal(saved.campaign.phase,"first-region");assert.equal(saved.campaign.firstInvestment,"mine");
    assert.equal(await page.locator(".sidebar").isVisible(),false,"the route does not expose the dashboard");
    for(let ticks=0;ticks<1200&&(await page.locator("#opening-world").getAttribute("data-phase"))!=="field-link";ticks+=16)
      await runAutosaveTicks(page,16);
    saved=JSON.parse(await raw(page));assert.equal(saved.campaign.phase,"field-link");assert.ok(saved.restoration>=50&&saved.scrap>=4);
    await page.locator("#scene-action").click();saved=JSON.parse(await raw(page));
    assert.equal(saved.campaign.phase,"first-region");assert.equal(saved.cells[19],Machine.Relay);
    assert.match(await page.locator('.scene-network-wire[data-from="14"][data-to="19"]').getAttribute("class"),/wire-live/);
    await runAutosaveTicks(page,480);
    assert.equal(await page.locator("#scene-awaken").isVisible(),true);
    const before=Number(await page.locator("#opening-world").getAttribute("data-growth"));assert.ok(before>=.99);
    const planetBeforeClaim=await page.locator("#planet").evaluate(el=>el.toDataURL());
    await page.locator("#scene-awaken").focus();await page.keyboard.press("Enter");saved=JSON.parse(await raw(page));
    assert.equal(saved.region,1);assert.equal(saved.campaign.phase,"frontier-life");
    assert.equal(await page.evaluate(()=>document.activeElement.id),"scene-action","keyboard claim focuses the newly actionable frontier");
    assert.equal(await page.locator(".tile:visible").count(),0,"the first claim does not open the full grid");
    const after=Number(await page.locator("#opening-world").getAttribute("data-growth"));assert.ok(after>=.99,"restoration remains visible after claim");
    assert.equal(await page.locator("#planet").evaluate(el=>el.toDataURL()),planetBeforeClaim,
      "the rendered restoration canvas remains pixel-identical across the first claim");
    await page.locator("#scene-awaken").evaluate(el=>el.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    assert.equal(JSON.parse(await raw(page)).region,1,"duplicate claim cannot duplicate reward");
    await page.reload({waitUntil:"networkidle"});
    assert.equal(JSON.parse(await raw(page)).campaign.phase,"frontier-life","frontier objective survives reload");
    assert.equal(await page.locator(".sidebar").isVisible(),false);
    await page.locator("#scene-action").click();saved=JSON.parse(await raw(page));
    assert.equal(saved.campaign.phase,"open");assert.equal(saved.cells[24],Machine.Restorer);assert.ok(valid(saved));
    assert.equal(await page.locator(".tile:visible").count(),0,"the scene remains the default construction surface after frontier LIFE");
    assert.equal(await page.locator(".sidebar").isVisible(),false);
    assert.equal(await page.locator("#scene-build-controls").isVisible(),true);
    assert.equal(await page.locator("#scene-network-wires").isVisible(),false,
      "the original opening wires are hidden on the direct transition into the open-valley overlay");
    for(const [from,to] of [[12,13],[13,14]]){
      const edge=page.locator(`#scene-network-wires-open .scene-network-wire[data-from="${from}"][data-to="${to}"]`);
      assert.equal(await edge.count(),1,`open-valley network renders edge ${from}→${to}`);
      const geometry=await page.evaluate(({from,to})=>{
        const svg=document.querySelector("#scene-network-overlay"),matrix=svg.getScreenCTM();
        const point=index=>{
          const r=document.querySelector(`#scene-sites [data-index="${index}"]`).getBoundingClientRect();
          return [r.left+r.width/2,r.top+r.height/2];
        };
        const d=document.querySelector(`#scene-network-wires-open .scene-network-wire[data-from="${from}"][data-to="${to}"]`).getAttribute("d");
        const values=d.match(/-?\d+(?:\.\d+)?/g).map(Number);
        const actual=[[values[0],values[1]],[values[4],values[5]]].map(([x,y])=>{
          const p=new DOMPoint(x,y).matrixTransform(matrix);return [p.x,p.y];
        });
        return {actual,expected:[point(from),point(to)]};
      },{from,to});
      for(let endpoint=0;endpoint<2;endpoint++)for(let axis=0;axis<2;axis++)
        assert.ok(Math.abs(geometry.actual[endpoint][axis]-geometry.expected[endpoint][axis])<1,
          `edge ${from}→${to} uses the same open-valley site geometry`);
    }
    await page.locator('.scene-build-tool[data-machine="3"]').click();
    const openSites=await page.locator("#scene-sites .scene-site:visible").evaluateAll(nodes=>nodes.map(node=>{
      const r=node.getBoundingClientRect();return {index:node.dataset.index,left:r.left,right:r.right,top:r.top,bottom:r.bottom};
    }));
    for(let i=0;i<openSites.length;i++)for(let j=i+1;j<openSites.length;j++)
      assert.ok(openSites[i].right<=openSites[j].left||openSites[j].right<=openSites[i].left||
        openSites[i].bottom<=openSites[j].top||openSites[j].bottom<=openSites[i].top,
        `open-valley touch targets ${openSites[i].index} and ${openSites[j].index} do not overlap`);
    const focusedSite=page.locator('#scene-sites [data-index="17"]');
    await focusedSite.focus();
    await runAutosaveTicks(page,8);
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.index),"17",
      "focused site identity survives repeated render ticks");
    await page.keyboard.press("Enter");
    saved=JSON.parse(await raw(page));assert.equal(saved.cells[17],Machine.Extractor,"the persistent scene places a real connected model MINE at the selected site");
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.index),"17",
      "keyboard activation keeps focus on the same scene site node");
    assert.equal(await page.locator('#scene-sites [data-index="17"]').getAttribute("data-machine"),String(Machine.Extractor));
    await page.locator('.scene-build-tool[data-machine="2"]').click();
    assert.equal(await page.locator('.scene-build-tool[data-machine="2"]').getAttribute("aria-pressed"),"true","RELAY is active before pointer placement");
    const heldSite=page.locator("#scene-sites .scene-site-empty:visible").first();
    const heldIndex=await heldSite.getAttribute("data-index"),heldBox=await heldSite.boundingBox();
    assert.ok(heldBox);
    await heldSite.evaluate(el=>{el.dataset.pointerRegression="held";});
    await page.evaluate(()=>{
      window.__scenePointerEvents=[];
      for(const type of ["pointerdown","pointerup","click"])document.addEventListener(type,event=>{
        const site=event.target.closest?.(".scene-site");
        if(site)window.__scenePointerEvents.push([type,site.dataset.index]);
      },true);
    });
    await page.mouse.move(heldBox.x+heldBox.width/2,heldBox.y+heldBox.height/2);
    await page.mouse.down();
    await runAutosaveTicks(page,2);
    assert.equal(await page.locator(`#scene-sites [data-index="${heldIndex}"]`).getAttribute("data-pointer-regression"),"held",
      "the original pointer target remains the same DOM node across ticks");
    await page.mouse.up();
    assert.deepEqual(await page.evaluate(()=>window.__scenePointerEvents),[
      ["pointerdown",heldIndex],["pointerup",heldIndex],["click",heldIndex]
    ],"pointer press, release and click remain on the original site after render ticks");
    saved=JSON.parse(await raw(page));assert.equal(saved.cells[Number(heldIndex)],Machine.Relay,
      "pointerup after an intervening render still performs the selected build");
    await page.locator('.scene-build-tool[data-machine="0"]').click();
    await page.locator('.scene-build-tool[data-machine="0"]').click();
    const beforeInspect=await raw(page);
    await page.locator('#scene-sites [data-index="17"]').click();
    assert.equal(await raw(page),beforeInspect,"REMOVe selected but toggled off makes built-site taps inspection-only");
    assert.match(await page.locator("#scene-site-readout").textContent(),/Site 18 · MINE/);
    await page.locator('.scene-build-tool[data-machine="2"]').click();
    await page.locator('.scene-build-tool[data-machine="0"]').click();
    await page.locator('.scene-build-tool[data-machine="0"]').click();
    assert.equal(await page.locator("#scene-sites .scene-site-empty:visible").count(),0,"closing build-site selection clears the placement overlay");
    await page.locator("#scene-advanced-toggle").click();
    assert.equal(await page.locator(".tile:visible").count(),25,"advanced network view remains explicitly available");
    assert.equal(await page.locator(".sidebar").isVisible(),true);
    await page.locator("#scene-advanced-toggle").click();
    assert.equal(await page.locator(".tile:visible").count(),0,"returning to the scene never changes the world");
    assert.equal(await page.locator(".sidebar").isVisible(),false);
    await page.reload({waitUntil:"networkidle"});assert.equal(JSON.parse(await raw(page)).campaign.phase,"open");
    assert.equal(JSON.parse(await raw(page)).cells[17],Machine.Extractor,"scene construction survives reload");
    assert.equal(await page.locator(".tile:visible").count(),0,"reload restores the scene as the default view");
    saved=JSON.parse(await raw(page));saved.restoration=TARGET(saved.region);
    await page.evaluate(({key,value})=>window.__relightTest.setRaw(key,JSON.stringify(value)),{key:saveKey,value:saved});
    await page.reload({waitUntil:"networkidle"});
    assert.equal(await page.locator("#scene-awaken").isVisible(),true,"the ongoing valley offers its next region claim in-scene");
    assert.equal(await page.locator("#revive").isVisible(),false,"advanced view does not duplicate the scene claim action");
    await page.locator("#scene-awaken").click();saved=JSON.parse(await raw(page));
    assert.equal(saved.region,2);assert.equal(saved.campaign.phase,"open");assert.equal(await page.locator("#opening-world").isVisible(),true);
    await page.locator("#scene-awaken").evaluate(el=>el.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    assert.equal(JSON.parse(await raw(page)).region,2,"repeated second-region claim cannot duplicate its reward");
    assert.equal(await page.locator(".tile:visible").count(),0,"the scene remains default after the second claim");
  }));

  await check("v3 connected kit moves to DARK atomically, reloads, undoes and returns LIVE",async()=>{
    const kit=freshCampaign();assert.equal(repairGreenhouse(kit).ok,true);advance(kit,8);assert.equal(kit.campaign.phase,"mine-kit");
    await withPage({width:390,height:844,initial:{[saveKey]:JSON.stringify(kit),[firstKey]:"yes"}},async page=>{
      await page.locator("#scene-socket-8").click();
      let saved=JSON.parse(await raw(page));assert.equal(saved.campaign.phase,"ridge-link");assert.equal(saved.campaign.starterMineSite,8);
      await page.locator("#scene-socket-10").click();saved=JSON.parse(await raw(page));
      assert.equal(saved.campaign.phase,"mine-disconnected");assert.equal(saved.campaign.mineKit,"earned");assert.equal(saved.campaign.starterMineSite,null);
      assert.equal(saved.cells[8],Machine.Empty);assert.equal(saved.cells[10],Machine.Extractor);assert.equal(valid(saved),true);
      await page.reload({waitUntil:"networkidle"});saved=JSON.parse(await raw(page));
      assert.equal(saved.campaign.phase,"mine-disconnected");assert.equal(await page.locator("#scene-socket-10").isVisible(),true,
        "the occupied DARK socket remains visible as the undo action after reload");
      assert.equal(await page.locator("#scene-socket-10").textContent(),"UNDO · DARK");
      assert.match(await page.locator("#scene-socket-10").getAttribute("aria-label"),/Undo the disconnected starter MINE/);
      await page.locator("#scene-socket-10").click();saved=JSON.parse(await raw(page));
      assert.equal(saved.campaign.phase,"mine-kit");assert.equal(saved.cells[10],Machine.Empty);assert.equal(saved.campaign.mineKit,"earned");
      await page.locator("#scene-socket-8").click();await page.locator("#scene-socket-10").click();
      saved=JSON.parse(await raw(page));assert.equal(saved.campaign.phase,"mine-disconnected");
      await page.locator("#scene-socket-8").click();saved=JSON.parse(await raw(page));
      assert.equal(saved.campaign.phase,"ridge-link");assert.equal(saved.campaign.mineKit,"redeemed");assert.equal(saved.campaign.starterMineSite,8);
      assert.equal(saved.cells[8],Machine.Extractor);assert.equal(saved.cells[10],Machine.Empty);assert.equal(valid(saved),true);
    });
  });

  await check("v3 rejects malformed relay and LIFE anchors while preserving original SAVE bytes",async()=>{
    const broken=freshCampaign();broken.cells[13]=Machine.Empty;broken.cells[0]=Machine.Relay;
    broken.cells[17]=Machine.Extractor;broken.campaign.phase="ridge-link";broken.campaign.mineKit="redeemed";broken.campaign.starterMineSite=17;
    assert.equal(valid(broken),false);
    const missingLife=freshCampaign();missingLife.cells[13]=Machine.Relay;missingLife.cells[17]=Machine.Extractor;missingLife.cells[18]=Machine.Relay;
    missingLife.region=0;missingLife.restoration=25;missingLife.scrap=15;
    missingLife.campaign={version:3,phase:"investment-choice",mineKit:"redeemed",firstInvestment:null,starterMineSite:17,ridgeRelay:true,fieldRelay:false};
    assert.equal(valid(missingLife),true,"control fixture has connected anchor before mutation");
    missingLife.cells[14]=Machine.Empty;missingLife.cells[0]=Machine.Restorer;
    assert.equal(valid(missingLife),false);
    for(const corrupt of [broken,missingLife]){
      const original=JSON.stringify(corrupt);
      await withPage({initial:{[saveKey]:original,[firstKey]:"yes"}},async page=>{
        assert.equal(await raw(page),original,"startup leaves malformed campaign bytes untouched");
        assert.match((await status(page)).text,/existing save can't be read/i);
        await build(page,Machine.Generator,19);await runAutosaveTicks(page,12);await pagehide(page);
        assert.equal(await raw(page),original,"build and lifecycle save paths preserve malformed original bytes");
      });
    }
  });

  await check("v3 locked frontier rejects a save with no connected starter MINE and protects its bytes",async()=>{
    const frontier=freshCampaign();repairGreenhouse(frontier);advance(frontier,8);place(frontier,8,Machine.Extractor);
    while(frontier.scrap<4)advance(frontier,1);
    assert.equal(place(frontier,18,Machine.Relay).ok,true);
    while(frontier.campaign.phase!=="investment-choice")advance(frontier,1);
    assert.equal(place(frontier,23,Machine.Extractor).ok,true);
    while(frontier.campaign.phase!=="field-link")advance(frontier,1);
    assert.equal(place(frontier,19,Machine.Relay).ok,true);
    frontier.restoration=TARGET(frontier.region);assert.equal(claim(frontier).ok,true);
    assert.equal(frontier.campaign.phase,"frontier-life");assert.equal(valid(frontier),true);
    frontier.cells=frontier.cells.map(type=>type===Machine.Extractor?Machine.Empty:type);
    frontier.cells[0]=Machine.Extractor;frontier.scrap=0;
    assert.equal(valid(frontier),false,"a disconnected MINE cannot validate an otherwise immovable, unaffordable frontier");
    const original=JSON.stringify(frontier);
    await withPage({initial:{[saveKey]:original,[firstKey]:"yes"}},async page=>{
      assert.equal(await raw(page),original,"invalid frontier save remains byte-for-byte untouched");
      assert.match((await status(page)).text,/existing save can't be read/i);
      await pagehide(page);await runAutosaveTicks(page,12);
      assert.equal(await raw(page),original,"lifecycle and autosave do not overwrite the rejected save");
      assert.equal(await page.evaluate(()=>window.__relightTest.writeEvents()),0);
    });
  });

  await check("POWER-first route recovers from zero scrap and opens MINE only at 25 actual points",()=>{
    const choice=freshVersionTwoCampaign();choice.cells[13]=Machine.Relay;choice.cells[17]=Machine.Extractor;
    choice.campaign={version:2,phase:"first-region",mineKit:"redeemed",firstInvestment:null};
    choice.region=0;choice.restoration=TARGET(0);choice.scrap=15;choice.savedAt=Math.floor(Date.now()/1000);
    assert.equal(claim(choice).ok,true);assert.equal(choice.scrap,65);
    return withPage({width:390,height:844,initial:{[saveKey]:JSON.stringify(choice),[firstKey]:"yes"}},async page=>{
      const before=JSON.parse(await raw(page));assert.equal(before.campaign.phase,"investment-choice");
      assert.match(await page.locator("#scene-choice-power-detail").textContent(),/1\.00 gross\/s.*\+0\.30 net\/s.*0\.84\/s/);
      await page.locator("#scene-choice-power").click();
      let saved=JSON.parse(await raw(page));assert.ok(Math.abs((before.scrap-saved.scrap)-15)<0.5,"POWER selection spends its exact cost, apart from less than half a second of idle income");assert.equal(saved.campaign.phase,"investment-growth");
      saved.scrap=0;await page.evaluate(({key,value})=>window.__relightTest.setRaw(key,JSON.stringify(value)),{key:saveKey,value:saved});
      await page.reload({waitUntil:"networkidle"});
      assert.equal(JSON.parse(await raw(page)).campaign.firstInvestment,"power","POWER choice persists across reload");
      await runAutosaveTicks(page,600);
      saved=JSON.parse(await raw(page));assert.equal(saved.campaign.phase,"investment-second");
      assert.ok(saved.restoration>=25);assert.ok(saved.scrap>0,"one connected MINE fuels the LIFE boost from zero saved scrap");
      assert.equal(await page.locator("#scene-action").isVisible(),true);
      await page.locator("#scene-action").click();
      saved=JSON.parse(await raw(page));assert.equal(saved.cells[7],Machine.Extractor);assert.equal(saved.campaign.phase,"open");
      assert.equal(rates(saved).fraction,1,"the second investment converges to a balanced network");
    });
  });

  await check("v1 campaign is not migrated and keeps its existing MINE-then-POWER scene route",()=>{
    const old={...freshCampaign(),region:1,scrap:50,savedAt:Math.floor(Date.now()/1000)};
    old.cells[13]=Machine.Relay;old.cells[17]=Machine.Extractor;
    old.campaign={version:1,phase:"expansion",mineKit:"redeemed"};
    const original=JSON.stringify(old),originalCampaign=structuredClone(old.campaign),originalCells=old.cells.slice();
    return withPage({initial:{[saveKey]:original,[firstKey]:"yes"}},async page=>{
      const loadedV1=JSON.parse(await raw(page));
      assert.deepEqual(loadedV1.campaign,originalCampaign,"v1 progression fields are not upgraded or normalized");
      assert.deepEqual(loadedV1.cells,originalCells,"loading a v1 save preserves the existing machine layout");
      assert.equal(Object.hasOwn(loadedV1.campaign,"firstInvestment"),false,"v1 never receives a v2 choice marker");
      assert.equal(await page.locator("#scene-choice").isVisible(),false);
      assert.equal(await page.locator("#scene-action").getAttribute("aria-label").then(s=>/second MINE/.test(s)),true);
      await clickSceneAction(page);
      let state=JSON.parse(await raw(page));assert.equal(state.campaign.version,1);assert.equal(state.campaign.phase,"power");
      assert.equal(Object.hasOwn(state.campaign,"firstInvestment"),false);
      await page.reload({waitUntil:"networkidle"});
      assert.equal(JSON.parse(await raw(page)).campaign.phase,"power");
      await clickSceneAction(page);state=JSON.parse(await raw(page));
      assert.equal(state.campaign.phase,"open");assert.equal(state.campaign.version,1);
    });
  });

  await check("authentic v1 and v2 saves retain their first claim and version-specific MINE site",async()=>{
    function readyLegacy(version){
      const saved=freshVersionTwoCampaign();saved.campaign=version===1?
        {version:1,phase:"first-region",mineKit:"redeemed"}:
        {version:2,phase:"first-region",mineKit:"redeemed",firstInvestment:null};
      saved.cells[13]=Machine.Relay;saved.cells[17]=Machine.Extractor;saved.scrap=100;
      saved.restoration=TARGET(0);saved.region=0;saved.savedAt=Math.floor(Date.now()/1000);
      assert.equal(valid(saved),true,"fixture reflects authentic version "+version+" fields");
      return saved;
    }
    const v1=readyLegacy(1);
    await withPage({width:390,height:844,initial:{[saveKey]:JSON.stringify(v1),[firstKey]:"yes"}},async page=>{
      assert.equal(await page.locator("#scene-awaken").isVisible(),true,"v1 first-region claim remains available");
      await page.locator("#scene-awaken").click();let saved=JSON.parse(await raw(page));
      assert.equal(saved.campaign.version,1);assert.equal(saved.campaign.phase,"expansion");
      await page.locator("#scene-action").click();saved=JSON.parse(await raw(page));
      assert.equal(saved.cells[7],Machine.Extractor);assert.equal(saved.campaign.phase,"power");
      await page.locator("#scene-action").click();saved=JSON.parse(await raw(page));
      assert.equal(saved.cells[9],Machine.Generator);assert.equal(saved.campaign.phase,"open");
      assert.equal(Object.hasOwn(saved.campaign,"ridgeRelay"),false);assert.equal(Object.hasOwn(saved.campaign,"fieldRelay"),false);
    });
    const v2=readyLegacy(2);
    await withPage({width:390,height:844,initial:{[saveKey]:JSON.stringify(v2),[firstKey]:"yes"}},async page=>{
      assert.equal(await page.locator("#scene-awaken").isVisible(),true,"v2 first-region claim remains available");
      await page.locator("#scene-awaken").click();let saved=JSON.parse(await raw(page));
      assert.equal(saved.campaign.phase,"investment-choice");assert.equal(saved.campaign.firstInvestment,null);
      assert.match(await page.locator("#scene-choice-mine-detail").textContent(),/gross\/s.*net\/s.*LIFE/);
      await page.locator("#scene-choice-mine").click();saved=JSON.parse(await raw(page));
      assert.equal(saved.cells[7],Machine.Extractor,"v2 MINE remains at its original model site");
      assert.equal(saved.cells[23],Machine.Empty,"the v3 ridge site is not used by v2");
      assert.equal(saved.campaign.phase,"investment-growth");assert.equal(valid(saved),true);
      await page.reload({waitUntil:"networkidle"});
      for(let ticks=0;ticks<900&&(await page.locator("#opening-world").getAttribute("data-phase"))!=="investment-second";ticks+=20)
        await runAutosaveTicks(page,20);
      assert.equal(await page.locator("#opening-world").getAttribute("data-phase"),"investment-second");
      await page.locator("#scene-action").click();saved=JSON.parse(await raw(page));
      assert.equal(saved.cells[9],Machine.Generator);assert.equal(saved.campaign.phase,"open");assert.equal(valid(saved),true);
    });
  });

  await check("practice replay isolates every world write and returns the real saved world",()=>withPage({
    width:390,height:844,initial:{
      [saveKey]:savedWorld({cells:Array.from({length:25},(_,i)=>i===12?Machine.Core:Machine.Empty),scrap:77,restoration:10,region:2}),
      [firstKey]:"yes"
    }
  },async page=>{
    const originalSave=await raw(page);
    await page.locator("#how-to-play").click();
    assert.match(await page.locator("#welcome-copy").textContent(),/temporary practice network/i);
    await page.locator("#begin").click();
    assert.equal(await page.locator("#scene-return").isVisible(),true);
    assert.match(await page.locator("#scene-practice-label").textContent(),/Temporary practice/);
    const savedBefore=await raw(page);
    assert.equal(savedBefore,originalSave,"opening practice leaves original SAVE bytes unchanged");
    await buildGuidedNetwork(page);
    assert.equal(await page.locator("#scene-awaken").isVisible(),true);
    await claimSceneRegion(page);
    await unlockCampaignPower(page);
    await page.locator("#scene-advanced-toggle").click();
    assert.equal(await page.locator(".sidebar").isVisible(),true,"advanced practice controls remain available on request");
    await page.locator("#upgrade-mining").click();
    await page.evaluate(()=>{window.confirm=()=>true;});
    await page.locator("#repair").click();
    await runAutosaveTicks(page,12);
    await page.locator("#dismiss-recap").click();
    await page.evaluate(()=>{
      window.__relightRealNow=Date.now.bind(Date);
      window.__relightClockOffset=10000;
      Date.now=()=>window.__relightRealNow()+window.__relightClockOffset;
    });
    await hideAndNotify(page);
    await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});document.dispatchEvent(new Event("visibilitychange"));});
    assert.equal(await page.locator("#progress-recap").isHidden(),true,
      "practice resume does not apply elapsed time already simulated in its temporary world");
    await page.evaluate(()=>{window.__relightClockOffset+=10000;});
    await hideAndNotify(page);
    await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});document.dispatchEvent(new Event("visibilitychange"));});
    assert.equal(await page.locator("#progress-recap").isHidden(),true,
      "repeated practice hide/resume cycles never manufacture offline catch-up");
    await page.evaluate(()=>{Date.now=window.__relightRealNow;});
    await pagehide(page);
    assert.equal(await raw(page),savedBefore,
      "practice build, claim, upgrade, reset, autosave, visibility and pagehide never write the real SAVE");
    await page.locator("#tutorial-return").focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(()=>document.activeElement.id),"how-to-play",
      "keyboard return restores focus outside the temporary practice world");
    assert.match(await page.locator("#world-title").textContent(),/another dawn/i,
      "returning to a legacy save restores its normal headline");
    assert.match(await page.locator("#world-copy").textContent(),/planet has gone quiet/i,
      "returning to a legacy save restores its normal description");
    const restored=JSON.parse(await raw(page));
    assert.equal(restored.region,2,"practice region claims never transfer");
    assert.equal(restored.scrap,77,"practice rewards and spending never transfer");
    assert.deepEqual(restored.cells,Array.from({length:25},(_,i)=>i===12?Machine.Core:Machine.Empty),
      "practice construction and reset never alter the real grid");

    await page.locator("#how-to-play").click();await page.locator("#begin").click();
    await clickSceneAction(page);
    await page.reload({waitUntil:"networkidle"});
    assert.equal(await page.locator("#scene-return").isVisible(),false,
      "reload exits temporary practice rather than restoring its separate state");
    const afterReload=JSON.parse(await raw(page));
    assert.equal(afterReload.region,2);assert.equal(afterReload.scrap,77);
    assert.deepEqual(afterReload.cells,Array.from({length:25},(_,i)=>i===12?Machine.Core:Machine.Empty));
  }));

  await check("practice return applies productive saved-world catch-up exactly once",()=>{
    const productive=fresh();productive.scrap=0;productive.savedAt=Math.floor(Date.now()/1000);
    return withPage({initial:{[saveKey]:JSON.stringify(productive),[firstKey]:"yes"}},async page=>{
      await page.evaluate(()=>{
        window.__practiceClockBase=Date.now();window.__practiceClockOffset=0;
        Date.now=()=>window.__practiceClockBase+window.__practiceClockOffset;
      });
      const before=JSON.parse(await raw(page));
      await page.locator("#how-to-play").click();await page.locator("#begin").click();
      await page.evaluate(()=>{window.__practiceClockOffset=10000;});
      await page.locator("#scene-return").click();
      const afterReturn=JSON.parse(await raw(page));
      assert.ok(Math.abs(afterReturn.scrap-(before.scrap+3))<.001,
        "10 seconds of one connected mine and one LIFE yield the model's +3 net scrap");
      assert.ok(Math.abs(afterReturn.restoration-(before.restoration+7))<.001,
        "the real saved world receives the model's +7 recovery once");
      assert.match(await page.locator("#recap-details").innerText(),/Recovery gained: \+7\.0 points/);
      assert.match(await page.locator("#recap-details").innerText(),/Scrap net: \+3\.0 scrap/);
      await page.evaluate(()=>document.dispatchEvent(new Event("visibilitychange")));
      const afterSecondResume=JSON.parse(await raw(page));
      assert.equal(afterSecondResume.scrap,afterReturn.scrap,
        "a second resume at the same savedAt does not apply scrap gains again");
      assert.equal(afterSecondResume.restoration,afterReturn.restoration,
        "a second resume at the same savedAt does not apply recovery again");
    });
  });

  await check("practice preserves corrupt saves and external save changes",async()=>{
    const corrupt="{not valid save bytes";
    await withPage({initial:{[saveKey]:corrupt,[firstKey]:"yes"}},async page=>{
      await page.locator("#how-to-play").click();await page.locator("#begin").click();
      await clickSceneAction(page);
      await runAutosaveTicks(page,12);await hideAndNotify(page);await pagehide(page);
      assert.equal(await raw(page),corrupt,"practice lifecycle actions preserve unreadable SAVE bytes");
      await page.locator("#scene-return").click();
      assert.equal(await raw(page),corrupt,"return cannot overwrite a corrupt protected save");
      assert.match((await status(page)).text,/existing save can't be read/i);
    });

    const original=savedWorld({scrap:80,region:1});
    const external=savedWorld({scrap:123,region:4});
    await withPage({initial:{[saveKey]:original,[firstKey]:"yes"}},async page=>{
      await page.locator("#how-to-play").click();await page.locator("#begin").click();
      await page.evaluate(value=>window.__relightTest.setRaw("relight.webplaytest.v1",value),external);
      await clickSceneAction(page);
      await runAutosaveTicks(page,12);await hideAndNotify(page);await pagehide(page);
      assert.equal(await raw(page),external,"practice cannot overwrite an external save change");
      await page.locator("#scene-return").click();
      assert.equal(await raw(page),external,"return detects and preserves the external save change");
      assert.match((await status(page)).text,/changed outside this session/i);
    });
  });

  await check("durable save warning remains independent from build, low-scrap and removal feedback",()=>withPage({
    initial:{[saveKey]:savedWorld({scrap:20}),[firstKey]:"yes"}
  },async page=>{
    const external="another-tab-save";
    await page.evaluate(value=>window.__relightTest.setRaw("relight.webplaytest.v1",value),external);
    await build(page,Machine.Generator,19);
    const durable=(await status(page)).text;
    assert.match(durable,/changed outside this session/i);
    assert.match(await page.locator("#mobile-feedback").textContent(),/Structure built/i);
    assert.equal((await status(page)).text,durable);
    await build(page,Machine.Extractor,7);
    assert.match(await page.locator("#mobile-feedback").textContent(),/Not enough scrap/i);
    assert.equal((await status(page)).text,durable);
    await remove(page,14);
    assert.match(await page.locator("#mobile-feedback").textContent(),/Structure removed/i);
    assert.equal((await status(page)).text,durable);
    await remove(page,12);
    assert.match(await page.locator("#mobile-feedback").textContent(),/core cannot be replaced/i);
    assert.equal((await status(page)).text,durable);
  }));

  await check("network count reports connected machines separately from simultaneous power shortage",()=>{
    const cells=Array(25).fill(Machine.Empty);
    cells[12]=Machine.Core;cells[11]=Machine.Extractor;cells[13]=Machine.Relay;
    cells[14]=Machine.Restorer;cells[7]=Machine.Extractor;cells[0]=Machine.Restorer;
    return withPage({initial:{[saveKey]:savedWorld({cells,scrap:0}),[firstKey]:"yes"}},async page=>{
      assert.equal((await page.locator("#power").textContent()).trim(),"4 / 5");
      const network=await page.locator("#power-note").textContent();
      assert.match(network,/1 machine is disconnected/i);
      assert.match(network,/Power shortage: 3 connected consumers for usable capacity 2; output 67%/i);
    });
  });

  await check("board-local recovery fits every layout and awaken claims once from the keyboard",async()=>{
    for(const [width,height] of [[320,640],[390,844],[1440,900]])
      await withPage({width,height,initial:{
        [saveKey]:savedWorld({restoration:50}),[firstKey]:"yes"
      }},async page=>{
        assert.equal(await page.locator(".network-card #recovery-progress").count(),1);
        assert.equal(await page.locator(".network-card #revive").count(),1);
        assert.equal(await page.locator("#revive").isVisible(),false,
          "AWAKEN is hidden until the region is ready");
        const recovery=await page.locator(".board-recovery").boundingBox();
        const board=await page.locator("#network-board").boundingBox();
        assert.ok(recovery&&board&&recovery.y+recovery.height<=board.y,
          `${width}px recovery panel overlaps its board`);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),
          `${width}px layout has horizontal overflow`);
      });

    for(const [width,height] of [[320,640],[390,844],[1440,900]])
      await withPage({width,height,initial:{
        [saveKey]:savedWorld({restoration:100}),[firstKey]:"yes"
      }},async page=>{
        assert.equal(await page.locator("#revive").isVisible(),true,
          `${width}px ready state exposes the contextual action`);
        const action=await page.locator("#revive").boundingBox();
        assert.ok(action&&action.height>=44,
          `${width}px AWAKEN target is at least 44px tall`);
        const recovery=await page.locator(".board-recovery").boundingBox();
        const board=await page.locator("#network-board").boundingBox();
        assert.ok(recovery&&board&&recovery.y+recovery.height<=board.y,
          `${width}px ready action overlaps its board`);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),
          `${width}px ready state has horizontal overflow`);
      });

    await withPage({width:390,height:844,initial:{
      [saveKey]:savedWorld({restoration:100}),[firstKey]:"yes"
    }},async page=>{
      const action=page.locator("#revive");
      assert.equal(await action.isVisible(),true);
      assert.equal(await action.isEnabled(),true);
      await page.locator(".quick-tool").last().focus();
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(()=>document.activeElement.id),"revive",
        "keyboard tab order reaches the board-local action after machine selection");
      assert.equal(await action.evaluate(el=>el.matches(":focus-visible")),true,
        "keyboard focus remains visibly outlined");
      await page.keyboard.press("Enter");
      const afterClaim=JSON.parse(await raw(page));
      assert.equal(afterClaim.region,1,"keyboard activation advances one region");
      assert.equal(afterClaim.restoration,0,"the next region begins at zero progress");
      assert.equal(await action.isVisible(),false,
        "the contextual button hides after its region is claimed");
      assert.equal(await page.evaluate(()=>document.activeElement.id),"region-state",
        "keyboard focus returns to the local progress status after claiming");
      assert.equal(await page.locator("#region-state").evaluate(el=>el.matches(":focus-visible")),true,
        "the returned keyboard focus is visibly outlined");
      const focusStyle=await page.locator("#region-state").evaluate(el=>getComputedStyle(el).outlineStyle);
      assert.equal(focusStyle,"solid","the theme-consistent focus outline is rendered");
      const recap=page.locator("#progress-recap");
      assert.equal(await recap.isVisible(),true,"claim opens an independent progress recap");
      const recapText=await recap.innerText();
      assert.match(recapText,/Claimed \+50\.0 scrap/);
      assert.match(recapText,/Next region recovery target: 150 points/);
      assert.match(recapText,/AURORA-9 milestone progress: 33% toward the next planet \(three regions\)/);

      const writes=await page.evaluate(()=>window.__relightTest.writeEvents());
      await page.evaluate(()=>{
        const button=document.querySelector("#revive");
        for(let i=0;i<2;i++)button.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}));
      });
      const afterRepeats=JSON.parse(await raw(page));
      assert.equal(afterRepeats.region,1,"rapid repeated clicks cannot claim a second region");
      assert.equal(afterRepeats.restoration,0,"repeated clicks do not reset the new region");
      assert.equal(await page.evaluate(()=>window.__relightTest.writeEvents()),writes,
        "rejected repeat clicks do not write another claim");
      await page.locator("#dismiss-recap").focus();
      await page.keyboard.press("Enter");
      assert.equal(await recap.isVisible(),false,"keyboard can dismiss the recap");
      await page.reload({waitUntil:"networkidle"});
      assert.match(await page.locator("#sector").textContent(),/SECTOR 02/);
      assert.equal(await page.locator("#revive").isVisible(),false,
        "reload preserves the single claim and hides the next action until ready");
      assert.equal(await recap.isVisible(),false,"a claimed recap does not repeat after reload");
    });
  });

  await check("zero mining distinguishes an exhausted fuel supply from enough stored scrap",async()=>{
    const cells=fresh().cells;cells[11]=Machine.Empty;
    for(const [scrap,expected] of [[0,/Connect a MINE to fuel recovery/],[99,/Connect a MINE to fuel recovery/],[100,/active to awaken/]])
      await withPage({initial:{[saveKey]:savedWorld({cells,scrap}),[firstKey]:"yes"}},async page=>{
        assert.match(await page.locator("#region-state").textContent(),expected);
      });
  });

  await check("power-throttled ETA matches the network's sustainable fuel bottleneck",()=>{
    const cells=fresh().cells;
    cells[7]=Machine.Restorer;cells[17]=Machine.Extractor;cells[8]=Machine.Restorer;
    const world=savedWorld({cells,scrap:0});
    return withPage({initial:{[saveKey]:world,[firstKey]:"yes"}},async page=>{
      const state=JSON.parse(await raw(page));
      const eta=estimateRecoverySeconds(state);
      assert.ok(Number.isFinite(eta));
      assert.match(await page.locator("#power-note").textContent(),/Power shortage:/);
      assert.equal(await page.locator("#region-state").textContent(),"~"+readableEta(eta)+" active to awaken");
    });
  });

  await check("unbounded region targets show an honest bounded or unavailable estimate",async()=>{
    const overflowingCells=fresh().cells;overflowingCells[7]=Machine.Restorer;
    for(const [region,cells,expected] of [
      [1e306,undefined,/>1y active to awaken/],
      [3e306,overflowingCells,/Active time estimate unavailable/],
      [Number.MAX_VALUE,undefined,/Active time estimate unavailable/]
    ])
      await withPage({width:320,initial:{[saveKey]:savedWorld({region,cells}),[firstKey]:"yes"}},async page=>{
        assert.match(await page.locator("#region-state").textContent(),expected);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),
          "extreme ETA copy stays within the narrow mobile viewport");
      });
  });

  await check("interrupted recovery resumes its ETA on a later region",()=>{
    const cells=fresh().cells;
    cells[9]=Machine.Generator;
    const interrupted=savedWorld({cells,scrap:25,restoration:100,region:2,
      savedAt:Math.floor(Date.now()/1000)-60});
    return withPage({initial:{[saveKey]:interrupted,[firstKey]:"yes"}},async page=>{
      assert.match(await page.locator("#sector").textContent(),/SECTOR 03/);
      assert.match(await page.locator("#region-state").textContent(),/to awaken/);
      const savedBefore=JSON.parse(await raw(page));
      assert.equal(savedBefore.region,2);
      assert.ok(savedBefore.restoration>100,
        "one minute of capped offline recovery advances the interrupted run before ETA display");
      await page.reload({waitUntil:"networkidle"});
      assert.match(await page.locator("#sector").textContent(),/SECTOR 03/);
      assert.match(await page.locator("#region-state").textContent(),/to awaken/,
        "the next-region estimate is available again after reloading");
      const savedAfter=JSON.parse(await raw(page));
      assert.equal(savedAfter.region,2,"reload does not repeat the completed region claim");
      assert.ok(savedAfter.restoration>=savedBefore.restoration,
        "offline progress resumes without losing the saved recovery meter");
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),
        "the ETA stays within the narrow mobile layout");
    });
  });

  await check("offline return beyond the mining cap displays ETA from the resumed saved state",()=>{
    const cells=fresh().cells;
    cells[7]=Machine.Restorer;cells[17]=Machine.Extractor;cells[8]=Machine.Restorer;
    const initial=savedWorld({cells,scrap:0,restoration:100,region:100,
      savedAt:Math.floor(Date.now()/1000)-(MINING_OFFLINE+60)});
    return withPage({initial:{[saveKey]:initial,[firstKey]:"yes"}},async page=>{
      await pagehide(page);
      const resumed=JSON.parse(await raw(page));
      assert.ok(resumed.totalPlayed>MINING_OFFLINE,"offline elapsed time exceeded the mining cap");
      assert.ok(resumed.scrap<1,"offline mining stopped at the 30-minute cap");

      const expected=JSON.parse(initial);
      advance(expected,resumed.totalPlayed,MINING_OFFLINE);
      assert.equal(resumed.scrap,expected.scrap,"the saved resource balance reflects capped mining");
      assert.equal(resumed.restoration,expected.restoration,"the saved progress reflects actual offline recovery");
      const eta=estimateRecoverySeconds(resumed);
      assert.equal(await page.locator("#region-state").textContent(),"~"+readableEta(eta)+" active to awaken",
        "the displayed estimate is recalculated from the resumed save, not pre-offline state");

      await page.reload({waitUntil:"networkidle"});
      await pagehide(page);
      const resumedAgain=JSON.parse(await raw(page));
      assert.equal(await page.locator("#region-state").textContent(),
        "~"+readableEta(estimateRecoverySeconds(resumedAgain))+" active to awaken",
        "a second reload recalculates from the latest persisted state");
    });
  });

  await check("machine badges and selected explanation follow active, disconnected, fuel, and power states",async()=>{
    const active=savedWorld({scrap:50});
    await withPage({initial:{[saveKey]:active,[firstKey]:"yes"}},async page=>{
      await page.locator('.quick-tool[data-machine="3"]').click();
      await page.waitForFunction(()=>document.querySelector("#machine-readout").textContent.includes("network mining"));
      assert.match(await page.locator('[data-index="11"]').getAttribute("class"),/state-active/);
      assert.equal(await page.locator('[data-index="11"] .tile-status').textContent(),"ACTIVE");
      assert.match(await page.locator('[data-index="11"]').getAttribute("aria-label"),/active and connected/);
      assert.match(await page.locator("#machine-readout").textContent(),/MINE · 1 active .*network mining \+\d+\.\d{2} scrap\/s/);
      await page.locator('.quick-tool[data-machine="2"]').click();
      assert.match(await page.locator("#machine-readout").textContent(),/RELAY · 1 active/);
      await page.locator('.quick-tool[data-machine="3"]').click();
      assert.equal(await page.locator('.quick-tool[data-machine="3"]').getAttribute("aria-pressed"),"true");
      assert.equal(JSON.parse(await raw(page)).cells[7],Machine.Empty,
        "repeated tool selection does not place or remove a structure");
      await page.locator('[data-index="7"]').click();
      assert.match(await page.locator('[data-index="7"]').getAttribute("class"),/extractor state-throttled/,
        "the tapped tile is built normally and immediately reflects the new power shortage");
      await page.reload({waitUntil:"networkidle"});
      assert.equal(await page.locator('[data-index="7"] .tile-name').textContent(),"MINE");
      assert.equal(await page.locator('[data-index="7"] .tile-status').textContent(),"LOW",
        "the placed machine's state is derived again after reload");
      await page.locator('.quick-tool[data-machine="0"]').click();
      assert.match(await page.locator("#machine-readout").textContent(),/tap a structure to clear it; choose a machine to inspect its status/);
      assert.equal(JSON.parse(await raw(page)).cells[7],Machine.Extractor,
        "selecting REMOVE is descriptive and does not hijack tile placement/removal");
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
    });

    const disconnectedCells=fresh().cells;disconnectedCells[0]=Machine.Generator;
    await withPage({width:320,initial:{
      [saveKey]:savedWorld({cells:disconnectedCells,scrap:50}),[firstKey]:"yes"
    }},async page=>{
      await page.locator('.quick-tool[data-machine="5"]').click();
      await page.waitForFunction(()=>document.querySelector("#machine-readout").textContent.includes("connect a RELAY path"));
      assert.match(await page.locator('[data-index="0"]').getAttribute("class"),/state-disconnected/);
      assert.equal(await page.locator('[data-index="0"] .tile-status').textContent(),"OFF");
      assert.match(await page.locator('[data-index="0"]').getAttribute("aria-label"),/disconnected from the reactor/);
      assert.match(await page.locator("#machine-readout").textContent(),/POWER · 1 disconnected · connect a RELAY path/);
      await page.locator('.quick-tool[data-machine="2"]').click();
      await page.locator('[data-index="10"]').click();
      await page.locator('[data-index="5"]').click();
      await page.waitForFunction(()=>document.querySelector('[data-index="0"]').classList.contains("state-active"));
      assert.equal(await page.locator('[data-index="0"] .tile-status').textContent(),"ACTIVE",
        "building a connected relay path updates machine state without changing placement interaction");
      await page.reload({waitUntil:"networkidle"});
      assert.equal(await page.locator('[data-index="0"] .tile-status').textContent(),"ACTIVE",
        "the connected status is reconstructed from the saved grid after reload");
      const saved=JSON.parse(await raw(page));
      assert.equal(saved.cells[10],Machine.Relay);assert.equal(saved.cells[5],Machine.Relay);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),
        "status badges and readout fit a 320px viewport");
    });

    const dryCells=fresh().cells;dryCells[11]=Machine.Empty;
    await withPage({width:390,initial:{
      [saveKey]:savedWorld({cells:dryCells,scrap:0}),[firstKey]:"yes"
    }},async page=>{
      await page.locator('.quick-tool[data-machine="4"]').click();
      await page.waitForFunction(()=>document.querySelector("#machine-readout").textContent.includes("no scrap or mining"));
      assert.match(await page.locator('[data-index="14"]').getAttribute("class"),/state-fuel/);
      assert.equal(await page.locator('[data-index="14"] .tile-status').textContent(),"FUEL");
      assert.match(await page.locator('[data-index="14"]').getAttribute("aria-label"),/fuel-starved/);
      assert.match(await page.locator("#machine-readout").textContent(),/LIFE · 1 fuel-starved · no scrap or mining/);
    });

    const partialFuelCells=fresh().cells;
    partialFuelCells[7]=Machine.Restorer;partialFuelCells[9]=Machine.Generator;
    await withPage({initial:{
      [saveKey]:savedWorld({cells:partialFuelCells,scrap:0}),[firstKey]:"yes"
    }},async page=>{
      await page.locator('.quick-tool[data-machine="4"]').click();
      const state=JSON.parse(await raw(page)),network=rates(state);
      const expected=network.restored*network.mined/network.used;
      assert.ok(network.mined>0&&network.mined<network.used,"fixture has partial mining but a larger LIFE fuel demand");
      const simulated={...state,cells:state.cells.slice()};advance(simulated,.016);
      assert.ok(Math.abs((simulated.restoration-state.restoration)/.016-expected)<.01,
        "displayed sustainable recovery matches an independent model advance");
      assert.match(await page.locator('[data-index="7"]').getAttribute("class"),/state-fuel-limited/);
      assert.equal(await page.locator('[data-index="7"] .tile-status').textContent(),"LIMIT");
      assert.match(await page.locator('[data-index="7"]').getAttribute("aria-label"),/fuel-limited; mining supplies 71 percent of LIFE demand/);
      assert.match(await page.locator("#machine-readout").textContent(),/fuel-limited · mining supplies 71% of LIFE fuel use/);
      assert.ok((await page.locator("#machine-readout").textContent()).includes("network recovery currently +"+expected.toFixed(2)+"/s"));
      assert.equal(await page.locator("#recovery-rate").textContent(),"Restore +"+expected.toFixed(2)+"/s",
        "the region meter uses the same current fuel-limited rate");
    });

    const throttledCells=fresh().cells;
    throttledCells[7]=Machine.Restorer;throttledCells[17]=Machine.Extractor;throttledCells[8]=Machine.Restorer;
    await withPage({initial:{
      [saveKey]:savedWorld({cells:throttledCells,scrap:50}),[firstKey]:"yes"
    }},async page=>{
      await page.locator('.quick-tool[data-machine="4"]').click();
      await page.waitForFunction(()=>document.querySelector("#machine-readout").textContent.includes("power capacity"));
      assert.match(await page.locator('[data-index="14"]').getAttribute("class"),/state-throttled/);
      assert.equal(await page.locator('[data-index="14"] .tile-status').textContent(),"LOW");
      assert.match(await page.locator('[data-index="14"]').getAttribute("aria-label"),/power-throttled to 40 percent/);
      assert.match(await page.locator("#machine-readout").textContent(),/LIFE · 3 power-throttled · connected output is limited to 40% by power capacity/);
    });

    const combinedCells=fresh().cells;
    combinedCells[7]=Machine.Restorer;combinedCells[8]=Machine.Restorer;
    combinedCells[9]=Machine.Generator;combinedCells[17]=Machine.Restorer;
    await withPage({initial:{
      [saveKey]:savedWorld({cells:combinedCells,scrap:0}),[firstKey]:"yes"
    }},async page=>{
      await page.locator('.quick-tool[data-machine="4"]').click();
      const state=JSON.parse(await raw(page)),network=rates(state);
      assert.ok(network.mined<network.used&&network.fraction<1,
        "fixture has both a fuel deficit and a connected power shortage");
      const expected=network.restored*network.mined/network.used;
      const simulated={...state,cells:state.cells.slice()};advance(simulated,.016);
      assert.ok(Math.abs((simulated.restoration-state.restoration)/.016-expected)<.01,
        "combined-bottleneck rate matches an independent model advance");
      const tile=page.locator('[data-index="7"]');
      assert.match(await tile.getAttribute("class"),/state-fuel-limited.*state-throttled/);
      assert.equal(await tile.locator(".tile-status").textContent(),"FUEL/LOW");
      assert.match(await tile.getAttribute("aria-label"),/fuel-limited; mining supplies .* percent of LIFE demand; power-throttled to .* percent output/);
      const explanation=await page.locator("#machine-readout").textContent();
      assert.match(explanation,/fuel-limited/);assert.match(explanation,/power-throttled/);
      assert.ok(explanation.includes("network recovery currently +"+expected.toFixed(2)+"/s"));
      assert.equal(await page.locator("#recovery-rate").textContent(),"Restore +"+expected.toFixed(2)+"/s",
        "the region meter includes both fuel and power limits through actual network rates");
    });
  });

  await check("machine state remains visible at phone and desktop sizes and flow is static for reduced motion",async()=>{
    for(const [width,height] of [[320,640],[390,844],[1440,900]])
      await withPage({width,height,initial:{[saveKey]:savedWorld(),[firstKey]:"yes"}},async page=>{
        assert.equal(await page.locator(".tile-status").count(),25);
        assert.equal(await page.locator('[data-index="11"] .tile-status').textContent(),"ACTIVE");
        assert.equal(await page.locator('[data-index="12"] .tile-status').textContent(),"ACTIVE");
        assert.match(await page.locator("#machine-readout").textContent(),/POWER · none built yet/);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),
          `${width}px network state has horizontal overflow`);
        if(width===320){
          const tile=await page.locator('[data-index="11"]').boundingBox();
          const badge=await page.locator('[data-index="11"] .tile-status').boundingBox();
          assert.ok(tile&&badge&&badge.width<tile.width&&badge.height<tile.height,
            "status badge stays inside its machine tile");
        }
        await page.emulateMedia({reducedMotion:"reduce"});
        const wire=page.locator(".wire-live").first();
        assert.ok(await wire.count()>0,String(width)+"px connected fixture should render an energy link");
        const motion=await wire.evaluate(el=>({name:getComputedStyle(el).animationName,dash:getComputedStyle(el).strokeDasharray}));
        assert.equal(motion.name,"none","reduced motion keeps energy links as a static line");
        assert.equal(motion.dash,"none","static flow has no moving dash pattern");
      });
  });

  await check("offline recap reports actual zero, positive, negative, and capped model changes",async()=>{
    const dryCells=fresh().cells;dryCells[11]=Machine.Empty;dryCells[14]=Machine.Empty;
    const noMine=fresh().cells;noMine[11]=Machine.Empty;
    const cases=[
      {name:"zero",width:320,seconds:60,scrap:0,cells:dryCells,delta:/Scrap net: 0\.0 scrap/,recovery:/Recovery gained: 0\.0 points/},
      {name:"positive",width:390,seconds:10,scrap:0,cells:fresh().cells,delta:/Scrap net: \+\d+\.\d scrap/,recovery:/Recovery gained: \+\d+\.\d points/},
      {name:"negative",width:1440,seconds:60,scrap:10,cells:noMine,delta:/Scrap net: −\d+\.\d scrap/,recovery:/Recovery gained: \+\d+\.\d points/},
      {name:"capped",width:390,seconds:MAX_OFFLINE+3600,scrap:0,cells:fresh().cells,delta:/Scrap net: [−+]?\d+\.\d scrap/,recovery:/Recovery gained: \+\d+\.\d points/}
    ];
    for(const fixture of cases){
      const originalScrap=fixture.scrap;
      const savedAt=Math.floor(Date.now()/1000)-fixture.seconds;
      await withPage({width:fixture.width,height:fixture.width===320?640:844,initial:{
        [saveKey]:savedWorld({scrap:fixture.scrap,cells:fixture.cells,savedAt}),[firstKey]:"yes"
      }},async page=>{
        const recap=page.locator("#progress-recap");
        assert.equal(await recap.isVisible(),true,fixture.name+" return displays recap");
        const details=await recap.innerText();
        assert.match(details,fixture.delta,fixture.name+" displays signed net scrap");
        assert.match(details,fixture.recovery,fixture.name+" displays actual recovery delta");
        assert.match(details,/Planet milestone: \d+% of its three-region cycle/);
        assert.match(details,/Offline progress is capped at 8 hours; scrap mining is capped at 30 minutes/);
        const resumed=JSON.parse(await raw(page));
        const applied=Math.min(Math.max(0,resumed.savedAt-savedAt),MAX_OFFLINE);
        assert.equal(resumed.totalPlayed,applied,fixture.name+" uses model-applied elapsed time");
        const displayDelta=(value,unit)=>{
          const amount=(Math.round(Math.abs(value)*10)/10).toFixed(1);
          return (value>0?"+":value<0?"−":"")+amount+" "+unit;
        };
        assert.ok(details.includes("Scrap net: "+displayDelta(resumed.scrap-originalScrap,"scrap")+"."),
          fixture.name+" recap matches the model's actual scrap delta");
        assert.ok(details.includes("Recovery gained: "+displayDelta(resumed.restoration,"points")+"."),
          fixture.name+" recap matches the model's actual recovery delta");
        if(fixture.name==="zero")assert.equal(resumed.scrap-originalScrap,0);
        if(fixture.name==="positive")assert.ok(resumed.scrap-originalScrap>0);
        if(fixture.name==="negative")assert.ok(resumed.scrap-originalScrap<0);
        if(fixture.name==="capped"){
          assert.equal(resumed.totalPlayed,MAX_OFFLINE,"progress stops at the 8h cap");
          assert.match(details,/Applied 8h offline progress of 9h away/);
        }
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),
          fixture.name+" recap does not introduce horizontal overflow");
        const dismiss=page.locator("#dismiss-recap"),box=await dismiss.boundingBox();
        assert.ok(box&&box.width>=44&&box.height>=44,"dismiss target remains touch sized");
        if(fixture.name==="positive"){
          await page.emulateMedia({reducedMotion:"reduce"});
          const duration=await dismiss.evaluate(el=>getComputedStyle(el).transitionDuration);
          assert.ok(duration.split(",").every(value=>parseFloat(value)<=0.001),
            "recap remains static under reduced motion");
          await dismiss.focus();
          assert.equal(await dismiss.evaluate(el=>el.matches(":focus-visible")),true,
            "recap dismiss is keyboard visible");
          await page.keyboard.press("Space");
          assert.equal(await recap.isVisible(),false,"keyboard dismisses offline recap");
          await page.reload({waitUntil:"networkidle"});
          assert.equal(await recap.isVisible(),false,"persisted return does not repeat after reload");
        }
      });
    }
  });

  const crowdedCells=Array(25).fill(Machine.Relay);crowdedCells[12]=Machine.Core;
  for(const [width,height] of [[320,640],[390,844],[1440,900]]){
    await check(`${width}px responsive layout wraps long save warnings and 24/24 status`,()=>withPage({
      width,height,initial:{[saveKey]:savedWorld({cells:crowdedCells,scrap:0}),[firstKey]:"yes"},
      config:{mismatchAfterWrite:true}
    },async page=>{
      assert.equal((await page.locator("#power").textContent()).trim(),"24 / 24");
      const warning=await status(page);
      assert.equal(warning.hidden,false);assert.ok(warning.box.width>0&&warning.box.height>0);
      assert.ok(warning.scrollHeight<=warning.clientHeight+1,"save warning text is not clipped");
      const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
      assert.ok(dimensions.scrollWidth<=dimensions.width+2,`horizontal overflow: ${JSON.stringify(dimensions)}`);
      if(width<=390){
        assert.equal(await page.locator(".quick-tool:visible").count(),5);
        for(const button of await page.locator(".quick-tool:visible").all()){
          const box=await button.boundingBox();assert.ok(box.width>=44&&box.height>=44);
        }
      }else assert.equal(await page.locator(".tool:visible").count(),5);
    }));
  }

  console.log(`PASS: ${passed} newly authored browser reliability scenarios`);
}finally{
  await browser.close();
}
