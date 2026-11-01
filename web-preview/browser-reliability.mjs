// Newly authored browser reliability regression suite for the recovered PR14
// changes. This is a replacement suite; original missing test bytes are not
// reconstructed or claimed to be identical.
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {fresh,Machine,MINING_OFFLINE,advance,estimateRecoverySeconds} from "./model.mjs";

const origin=process.env.RELIGHT_BROWSER_URL||"http://127.0.0.1:8765";
const saveKey="relight.webplaytest.v1";
const firstKey="relight.webplaytest.onboarded.v1";
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

async function withPage({width=390,height=844,initial={},config={}},run){
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
  },{initial,config});
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
    await page.locator("#begin").click({timeout:5000});
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
      await page.locator("#begin").click();
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
