// Newly authored browser reliability regression suite for the recovered PR14
// changes. This is a replacement suite; original missing test bytes are not
// reconstructed or claimed to be identical.
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {fresh,freshCampaign,Machine,MAX_OFFLINE,MINING_OFFLINE,advance,rates,estimateRecoverySeconds} from "./model.mjs";

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
    const isolatedPractice=await page.locator("#tutorial-return").isVisible();
    await page.locator("#campaign-action").click();
    await runAutosaveTicks(page,48);
    if(isolatedPractice){
      assert.match(await page.locator("#campaign-action").textContent(),/EARNED MINE/,
        "practice restoration earns the starter kit in its isolated in-memory world");
    }else{
      assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem("relight.webplaytest.v1")))).campaign.phase,"mine-kit",
        "restoration earns and saves the starter kit");
    }
    await page.locator("#campaign-action").click();
    await runAutosaveTicks(page,600);
    await page.locator("#revive").waitFor({state:"visible"});
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
  await page.locator("#campaign-action").click();
  assert.match(await page.locator("#mission-title").textContent(),/reactor is strained/);
  await page.locator("#campaign-action").click();
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
    assert.equal(await page.locator("#tutorial-return").isVisible(),true,
      "replay after Escape is visibly marked as temporary practice");
    assert.match(await page.locator("#tutorial-mode-label").textContent(),/Temporary practice/);
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
    const future=freshCampaign();future.campaign.version=2;
    const original=JSON.stringify(future);
    return withPage({initial:{[saveKey]:original,[firstKey]:"yes"}},async page=>{
      assert.equal(await raw(page),original,"startup does not normalize an unknown future campaign");
      assert.match((await status(page)).text,/existing save can't be read/i);
      await page.locator("#how-to-play").click();await page.locator("#begin").click();
      await page.locator("#campaign-action").click();await runAutosaveTicks(page,48);await pagehide(page);
      assert.equal(await raw(page),original,"volatile play and lifecycle writes keep the unknown save unchanged");
    });
  });

  await check("first light is a staged, saved campaign with an earned MINE and contextual POWER unlock",()=>withPage({
    width:320,height:640,initial:{}
  },async page=>{
    assert.equal(await page.locator("#welcome").evaluate(el=>el.open),false,"fresh opening begins in play, not a lesson modal");
    assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("campaign-opening")),true);
    assert.match(await page.locator("#mission-title").textContent(),/greenhouse/i);
    assert.equal(await page.locator(".tile:visible").count(),3,"the first view contains only the reactor, broken link and greenhouse");
    assert.equal(await page.locator(".sidebar").isVisible(),false);
    assert.equal(await page.locator(".resource-grid").isVisible(),false);
    assert.equal(await page.locator(".tile:enabled").count(),1,"only the repair tile accepts input");
    let saved=JSON.parse(await raw(page));
    assert.equal(saved.campaign.phase,"repair");assert.equal(saved.scrap,10);
    await page.locator('[data-index="13"]').click();
    saved=JSON.parse(await raw(page));
    assert.equal(saved.campaign.phase,"restore");assert.equal(saved.cells[13],Machine.Relay);
    await page.reload({waitUntil:"networkidle"});
    assert.match(await page.locator("#mission-title").textContent(),/greenhouse is waking/i,
      "the repaired connection resumes from the saved campaign state");
    await runAutosaveTicks(page,48);
    saved=JSON.parse(await raw(page));
    assert.equal(saved.campaign.phase,"mine-kit","actual simulated restoration earns the one-time kit");
    assert.ok(saved.scrap<1,"the kit can be earned after the ordinary scrap reserve is exhausted");
    assert.equal(await page.locator(".tile:visible").count(),6,"the earned kit reveals the next small construction area");
    await page.reload({waitUntil:"networkidle"});
    assert.equal(JSON.parse(await raw(page)).campaign.mineKit,"earned","earned-kit milestone survives reload");
    assert.match(await page.locator("#campaign-action").textContent(),/EARNED MINE/);
    const scrapBeforeKit=JSON.parse(await raw(page)).scrap;
    await page.locator('[data-index="17"]').click();
    saved=JSON.parse(await raw(page));
    assert.equal(saved.cells[17],Machine.Extractor);
    assert.equal(saved.scrap,scrapBeforeKit,"redeeming the kit does not spend ordinary scrap");
    assert.equal(saved.campaign.phase,"first-region");
    assert.equal(await page.locator("#revive").isVisible(),false,"early region claim stays unavailable");
    await runAutosaveTicks(page,600);
    await page.locator("#revive").waitFor({state:"visible"});
    await page.locator("#revive").focus();await page.keyboard.press("Enter");
    saved=JSON.parse(await raw(page));
    assert.equal(saved.region,1);assert.equal(saved.campaign.phase,"expansion");
    assert.match(await page.locator("#progress-recap").innerText(),/Claimed \+50\.0 scrap/);
    assert.equal(await page.evaluate(()=>document.activeElement.id),"region-state","keyboard claim keeps focus on contextual status");
    await page.evaluate(()=>document.querySelector("#revive").dispatchEvent(new MouseEvent("click",{bubbles:true})));
    assert.equal(JSON.parse(await raw(page)).region,1,"a repeated claim cannot duplicate the reward");
    await page.reload({waitUntil:"networkidle"});
    assert.equal(JSON.parse(await raw(page)).campaign.phase,"expansion","the first claim and new site survive reload");
    assert.equal(await page.locator(".tile:visible").count(),9);
    await page.locator("#campaign-action").click();
    saved=JSON.parse(await raw(page));assert.equal(saved.campaign.phase,"power");
    assert.match(await page.locator("#mission-title").textContent(),/reactor is strained/i);
    await page.locator("#campaign-action").click();
    saved=JSON.parse(await raw(page));assert.equal(saved.campaign.phase,"open");
    assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("campaign-opening")),false);
    assert.equal(await page.locator(".tile:visible").count(),25,"the full sandbox appears after the actual POWER placement");
    assert.equal(await page.locator(".sidebar").isVisible(),true);
    await page.reload({waitUntil:"networkidle"});
    assert.equal(JSON.parse(await raw(page)).campaign.phase,"open","POWER unlock is persisted after reload");
    assert.equal(await page.locator(".sidebar").isVisible(),true);
  }));

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
    assert.equal(await page.locator("#tutorial-return").isVisible(),true);
    assert.match(await page.locator("#tutorial-mode-label").textContent(),/Temporary practice/);
    const savedBefore=await raw(page);
    assert.equal(savedBefore,originalSave,"opening practice leaves original SAVE bytes unchanged");
    await buildGuidedNetwork(page);
    assert.equal(await page.locator("#revive").isVisible(),true);
    await page.locator("#revive").click();
    await unlockCampaignPower(page);
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
    await page.locator("#campaign-action").click();
    await page.reload({waitUntil:"networkidle"});
    assert.equal(await page.locator("#tutorial-return").isVisible(),false,
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
      await page.locator("#tutorial-return").click();
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
      await page.locator("#campaign-action").click();
      await runAutosaveTicks(page,12);await hideAndNotify(page);await pagehide(page);
      assert.equal(await raw(page),corrupt,"practice lifecycle actions preserve unreadable SAVE bytes");
      await page.locator("#tutorial-return").click();
      assert.equal(await raw(page),corrupt,"return cannot overwrite a corrupt protected save");
      assert.match((await status(page)).text,/existing save can't be read/i);
    });

    const original=savedWorld({scrap:80,region:1});
    const external=savedWorld({scrap:123,region:4});
    await withPage({initial:{[saveKey]:original,[firstKey]:"yes"}},async page=>{
      await page.locator("#how-to-play").click();await page.locator("#begin").click();
      await page.evaluate(value=>window.__relightTest.setRaw("relight.webplaytest.v1",value),external);
      await page.locator("#campaign-action").click();
      await runAutosaveTicks(page,12);await hideAndNotify(page);await pagehide(page);
      assert.equal(await raw(page),external,"practice cannot overwrite an external save change");
      await page.locator("#tutorial-return").click();
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
