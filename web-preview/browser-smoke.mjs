// Runs in GitHub Actions against a real headless Chromium browser.
// Screenshots are produced for actual layout review, not treated as user approval.
import assert from "node:assert/strict";
import {chromium} from "playwright";
const origin=process.env.RELIGHT_BROWSER_URL||"http://127.0.0.1:8765";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const errors=[];
try{
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const p=await mobile.newPage();
  p.on("pageerror",err=>errors.push(err.message));
  p.on("console",msg=>{if(msg.type()==="error")errors.push(msg.text());});
  await p.goto(origin,{waitUntil:"networkidle"});
  assert.equal(await p.locator(".tile").count(),25,"5x5 grid rendered");
  assert.equal(await p.locator("#welcome").evaluate(e=>e.open),true,"first-launch tutorial appears");
  await p.screenshot({path:"relight-mobile-onboarding.png",fullPage:true,animations:"disabled"});
  const geometry=await p.evaluate(()=>{
    const b=document.querySelector("#begin").getBoundingClientRect();
    const d=document.querySelector("#welcome").getBoundingClientRect();
    const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
    return {viewport:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],button:[b.left,b.top,b.width,b.height],dialog:[d.left,d.top,d.width,d.height],hit:hit?.id||hit?.tagName,dialogCSS:getComputedStyle(document.querySelector("#welcome")).position};
  });
  console.log("ONBOARDING GEOMETRY",JSON.stringify(geometry));
  await p.locator("#begin").click({timeout:4000});
  assert.equal(await p.locator("#welcome").evaluate(e=>e.open),false,"tutorial closes");
  // Wait for the smooth scroll to put a usable part of the board into
  // view, not merely its first pixel at the bottom of the phone viewport.
  await p.waitForFunction(()=>{
    const rect=document.querySelector("#network-board").getBoundingClientRect();
    return window.scrollY>200 && rect.top>=0 &&
      rect.top<Math.min(360,window.innerHeight*.5);
  },null,{timeout:7000});
  const boardTop=await p.locator("#network-board").evaluate(e=>e.getBoundingClientRect().top);
  console.log("GUIDED BOARD USABLY VISIBLE",Math.round(boardTop));
  assert.match(await p.locator("#mission-title").textContent(),/life engine/i);
  assert.equal(await p.locator(".quick-tool").count(),5,"compact mobile machine controls");
  assert.equal(await p.locator('.quick-tool[data-machine="5"]').getAttribute("aria-pressed"),"true");
  assert.equal(await p.locator(".quick-tool").first().isVisible(),true,
    "machine controls must appear beside mobile board");
  const quickTarget=await p.locator(".quick-tool").first().boundingBox();
  assert.ok(quickTarget.width>=44&&quickTarget.height>=44,
    "mobile machine selector must be easy to tap");
  await p.locator('.quick-tool[data-machine="2"]').click();
  assert.equal(await p.locator('.tool[data-machine="2"]').getAttribute("aria-pressed"),"true",
    "compact selector updates full construction palette");
  await p.locator('.quick-tool[data-machine="5"]').click();
  assert.equal(await p.locator('.tool[data-machine="5"]').getAttribute("aria-pressed"),"true");
  assert.match(await p.locator("#selected-tool-text").textContent(),/glowing NEXT tile/);
  assert.match(await p.locator('[data-index="19"]').getAttribute("class"),/suggested/);
  await p.locator('[data-index="19"]').click();
  await p.waitForFunction(()=>document.querySelector("#mission-title")?.textContent.includes("scrap miner"));
  assert.match(await p.locator("#mission-description").textContent(),/MINE is already selected for you/,
    "guided mission instructions reflect the actual automatically selected tool");
  const phoneToast=await p.locator("#toast").boundingBox();
  assert.ok(phoneToast && phoneToast.y>=0 && phoneToast.y+phoneToast.height<=95,
    "mobile feedback stays in top screen area instead of covering lower grid");
  assert.equal(await p.locator('.quick-tool[data-machine="3"]').getAttribute("aria-pressed"),"true",
    "next guided machine auto-selects on compact palette");
  assert.match(await p.locator('[data-index="7"]').getAttribute("class"),/suggested/);
  await p.locator('[data-index="7"]').click();
  await p.waitForFunction(()=>document.querySelector("#mission-title")?.textContent.includes("world wake up"));
  assert.doesNotMatch(await p.locator("#selected-tool-text").textContent(),/glowing NEXT tile/,
    "no nonexistent NEXT tile after the tutorial construction steps");
  const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem("relight.webplaytest.v1")));
  assert.equal(saved.cells[19],5);assert.equal(saved.cells[7],3);
  assert.ok(saved.scrap>=3&&saved.scrap<10,"two purchases persisted; live mining may earn fractional scrap");
  await p.locator("#how-to-play").click();assert.equal(await p.locator("#welcome").evaluate(e=>e.open),true);
  await p.locator("#dismiss-help").click();
  const overflow=await p.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=2,"mobile page has horizontal overflow: "+overflow);
  await p.screenshot({path:"relight-mobile-playtest.png",fullPage:true,animations:"disabled"});
  await p.reload({waitUntil:"networkidle"});
  assert.match(await p.locator("#mission-title").textContent(),/world wake up/i,"save survives reload");
  assert.equal(await p.locator("#welcome").evaluate(e=>e.open),false,"guide dismissed persists");
  assert.equal(await p.locator('[data-index="19"]').locator(".tile-name").textContent(),"POWER");

  // Confirm the UI actually renders an evolving planet and a claimable
  // milestone. Seed only the persisted restore meter to avoid a 2-minute
  // wall-clock test; run the final completion and revival through the UI.
  const planetBefore=await p.locator("#planet").evaluate(e=>e.toDataURL());
  // A normal reload fires the game's pagehide save handler, so writing to
  // localStorage *before* reloading is immediately overwritten. Inject once
  // at document startup, ahead of the app module, to simulate a legitimate
  // nearly-completed saved region without weakening real persistence.
  await p.addInitScript(()=>{
    const marker="relight.browser-test.seeded-once";
    if(sessionStorage.getItem(marker))return;
    const key="relight.webplaytest.v1";
    const snapshot=JSON.parse(localStorage.getItem(key)||"null");
    if(!snapshot || snapshot.cells?.[19]!==5 || snapshot.cells?.[7]!==3)return;
    snapshot.restoration=99.8;
    snapshot.savedAt=Math.floor(Date.now()/1000);
    localStorage.setItem(key,JSON.stringify(snapshot));
    sessionStorage.setItem(marker,"yes");
  });
  await p.reload({waitUntil:"networkidle"});
  await p.waitForFunction(()=>!document.querySelector("#revive").disabled,
    null,{timeout:10000});
  assert.match(await p.locator("#selected-tool-text").textContent(),/tap AWAKEN REGION/,
    "when region is ready the guide prioritizes the revival action");
  assert.equal(await p.locator("#restored-percent").textContent(),"100%");
  const planetAtReady=await p.locator("#planet").evaluate(e=>e.toDataURL());
  const planetNameAtReady=await p.locator("#planet-name").textContent();
  assert.notEqual(planetAtReady,planetBefore,
    "recovered planet texture should visibly differ from barren planet");
  await p.screenshot({path:"relight-mobile-awakening-ready.png",fullPage:true,animations:"disabled"});
  await p.locator("#revive").click();
  const awakened=await p.evaluate(()=>JSON.parse(localStorage.getItem("relight.webplaytest.v1")));
  assert.equal(awakened.region,1,"reviving a region advances exactly one milestone");
  assert.equal(awakened.restoration,0,"next region begins from zero restoration");
  assert.match(await p.locator("#sector").textContent(),/SECTOR 02/);
  assert.equal(await p.locator("#planet-name").textContent(),planetNameAtReady,
    "first region revival should preserve the current planet identity");
  assert.equal(await p.locator("#planet").evaluate(e=>e.toDataURL()),planetAtReady,
    "first revival should preserve accumulated planet restoration, not reset to barren");
  await p.screenshot({path:"relight-mobile-awakened.png",fullPage:true,animations:"disabled"});
  await p.reload({waitUntil:"networkidle"});
  assert.match(await p.locator("#sector").textContent(),/SECTOR 02/,
    "region advancement is preserved across reload");
  await mobile.close();

  // Smaller Android handsets must still expose five usable one-thumb build
  // controls and a clickable tutorial without horizontal overflow.
  const narrow=await browser.newContext({
    viewport:{width:320,height:640},deviceScaleFactor:1,isMobile:true,hasTouch:true
  });
  const small=await narrow.newPage();
  small.on("pageerror",err=>errors.push(err.message));
  small.on("console",msg=>{if(msg.type()==="error")errors.push(msg.text());});
  await small.goto(origin,{waitUntil:"networkidle"});
  assert.equal(await small.locator("#welcome").evaluate(e=>e.open),true);
  await small.locator("#begin").click({timeout:6000});
  const narrowTool=await small.locator('.quick-tool[data-machine="5"]').boundingBox();
  assert.ok(narrowTool.width>=44&&narrowTool.height>=44,
    "320px handset tool buttons must stay touch-friendly");
  assert.ok((await small.evaluate(()=>document.documentElement.scrollWidth))<=320,
    "320px handset has no horizontal overflow");
  await small.locator('.quick-tool[data-machine="5"]').click();
  await small.locator('[data-index="19"]').click();
  assert.match(await small.locator("#mission-title").textContent(),/scrap miner/i);
  assert.match(await small.locator("#mission-description").textContent(),/MINE is already selected for you/);
  // The toast auto-dismisses after 3.5 seconds. Earlier test read its
  // offscreen hidden position after it had expired, a test error rather
  // than a UI regression. Re-trigger feedback and measure while visible.
  await small.locator('.quick-tool[data-machine="3"]').click();
  await small.waitForFunction(()=>{
    const toast=document.querySelector("#toast");
    const rect=toast.getBoundingClientRect();
    return toast.classList.contains("visible") && rect.top>=0;
  },null,{timeout:2500});
  const narrowToast=await small.locator("#toast").boundingBox();
  const narrowBoard=await small.locator("#network-board").boundingBox();
  console.log("NARROW VISIBLE TOAST GEOMETRY",JSON.stringify({toast:narrowToast,board:narrowBoard,innerHeight:640}));
  assert.ok(narrowToast && narrowToast.y>=0 && narrowToast.y+narrowToast.height<=100,
    "visible 320px notification must stay in top screen area");
  assert.ok(narrowBoard && narrowToast.y+narrowToast.height<narrowBoard.y,
    "visible notification must not obscure the lower play grid");
  await small.screenshot({path:"relight-narrow-320-playtest.png",fullPage:true,animations:"disabled"});
  await narrow.close();

  const desktop=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const d=await desktop.newPage();
  d.on("pageerror",err=>errors.push(err.message));
  d.on("console",msg=>{if(msg.type()==="error")errors.push(msg.text());});
  await d.goto(origin,{waitUntil:"networkidle"});
  assert.equal(await d.locator(".quick-tool").first().isVisible(),false,
    "desktop layout continues using full detailed tool descriptions");
  await d.locator("#begin").click();
  const desktopOverflow=await d.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(desktopOverflow<=2,"desktop page has horizontal overflow: "+desktopOverflow);
  await d.screenshot({path:"relight-desktop-playtest.png",fullPage:true,animations:"disabled"});
  await desktop.close();
  assert.deepEqual(errors,[],"No browser page errors or console errors");
  console.log("PASS: Chrome mobile+desktop render, tutorial steps, build clicks, save reload, no overflow, screenshots");
}
finally{await browser.close();}
