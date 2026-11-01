// Hosted/local Chromium smoke for the staged First Light campaign.
// Screenshots are inspection artifacts; they do not stand in for player tests.
import assert from "node:assert/strict";
import {chromium} from "playwright";

const origin=process.env.RELIGHT_BROWSER_URL||"http://127.0.0.1:8765";
const executablePath=process.env.RELIGHT_CHROMIUM_EXECUTABLE_PATH||undefined;
const browser=await chromium.launch({headless:true,args:["--no-sandbox"],executablePath});
const errors=[];
async function isolateRemoteFonts(context){
  if(!["127.0.0.1","localhost"].includes(new URL(origin).hostname))return;
  await context.route("https://fonts.googleapis.com/**",route=>
    route.fulfill({status:200,contentType:"text/css",body:""}));
}
async function assertNoOverflow(page,width){
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=2,`${width}px page has horizontal overflow: ${overflow}px`);
}
async function freshContext(width,height){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,
    isMobile:width<=650,hasTouch:width<=650});
  await isolateRemoteFonts(context);
  const page=await context.newPage();
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
  await page.goto(origin,{waitUntil:"networkidle"});
  return {context,page};
}

try{
  const {context:mobile,page}=await freshContext(390,844);
  assert.equal(await page.locator("#welcome").evaluate(dialog=>dialog.open),false,
    "a new save starts in the playable opening, without a feature-list modal");
  assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("campaign-opening")),true);
  assert.equal(await page.locator(".tile:visible").count(),3,
    "the initial space shows only reactor, broken relay and greenhouse");
  assert.equal(await page.locator(".tile:enabled").count(),1,"only the broken relay site is actionable");
  assert.equal(await page.locator(".sidebar").isVisible(),false,"future machines and upgrades stay out of the opening");
  assert.equal(await page.locator(".resource-grid").isVisible(),false,"the opening has no resource dashboard");
  assert.match(await page.locator("#mission-title").textContent(),/greenhouse/i);
  assert.match(await page.locator("#campaign-action").textContent(),/REPAIR RELAY/);
  assert.match(await page.locator('[data-index="12"]').getAttribute("aria-label"),/CORE/i,
    "occupied reactor keeps its machine name in its accessible label");
  assert.match(await page.locator('[data-index="14"]').getAttribute("aria-label"),/LIFE/i,
    "occupied greenhouse keeps its machine name in its accessible label");
  assert.match(await page.locator('[data-index="13"]').evaluate(el=>getComputedStyle(el,"::after").content),/REPAIR/,
    "broken-link target badge names the repair action");
  for(const selector of ["#campaign-action","#region-state",'[data-index="12"]','[data-index="13"]','[data-index="14"]']){
    const box=await page.locator(selector).boundingBox();
    assert.ok(box&&box.y>=0&&box.y+box.height<=844,
      `390×844 opening keeps ${selector} visible without scrolling`);
  }
  assert.doesNotMatch(await page.locator("#selected-tool-text").textContent(),/POWER|NEXT/i,
    "repair stage does not inherit the sandbox POWER/NEXT hint");
  assert.equal(await page.locator(".board-foot").isVisible(),false,
    "campaign stages hide the irrelevant sandbox selection footer");
  await assertNoOverflow(page,390);
  await page.screenshot({path:"relight-firstlight-390-opening.png",fullPage:true,animations:"disabled"});
  await page.screenshot({path:"relight-firstlight-390-viewport.png",fullPage:false,animations:"disabled"});

  await page.locator('[data-index="13"]').click();
  assert.match(await page.locator("#mission-title").textContent(),/greenhouse is waking/i);
  assert.match(await page.locator("#world-copy").textContent(),/relay is repaired/i);
  assert.doesNotMatch(await page.locator("#world-copy").textContent(),/relay.*broken/i);
  assert.equal(await page.locator("[data-index='13'] .tile-name").textContent(),"RELAY");
  await page.waitForFunction(()=>document.querySelector("#campaign-action")?.textContent.includes("EARNED MINE"),null,{timeout:15000});
  assert.equal(await page.locator(".tile:visible").count(),6,"the earned-kit milestone reveals one small expansion");
  assert.match(await page.locator("#world-copy").textContent(),/greenhouse is recovering/i);
  assert.doesNotMatch(await page.locator("#world-copy").textContent(),/relay.*broken/i);
  assert.match(await page.locator('[data-index="17"]').evaluate(el=>getComputedStyle(el,"::after").content),/MINE/,
    "earned-kit target badge introduces the MINE action");
  await page.screenshot({path:"relight-firstlight-390-kit.png",fullPage:true,animations:"disabled"});
  await page.screenshot({path:"relight-firstlight-390-kit-viewport.png",fullPage:false,animations:"disabled"});
  await page.locator("#campaign-action").click();
  assert.equal(await page.locator("[data-index='17'] .tile-name").textContent(),"MINE");
  assert.equal(await page.locator("#revive").isVisible(),false,"first awakening waits for real region progress");

  // Seed a nearly complete, valid first-region state once to keep the smoke
  // bounded; the real actions (claim, expansion MINE, POWER) still use UI/model.
  await page.addInitScript(()=>{
    const marker="relight.smoke.seeded-first-region";
    if(sessionStorage.getItem(marker))return;
    const key="relight.webplaytest.v1",saved=JSON.parse(localStorage.getItem(key)||"null");
    if(saved?.campaign?.phase!=="first-region")return;
    saved.restoration=99.8;saved.savedAt=Math.floor(Date.now()/1000);
    localStorage.setItem(key,JSON.stringify(saved));sessionStorage.setItem(marker,"yes");
  });
  await page.reload({waitUntil:"networkidle"});
  assert.equal(await page.locator("#revive").isVisible(),true,"a region claim becomes available at its actual target");
  const recovery=await page.locator(".board-recovery").boundingBox();
  const board=await page.locator("#network-board").boundingBox();
  assert.ok(recovery&&board&&recovery.y+recovery.height<=board.y,"recovery status and claim do not overlap the board");
  await page.screenshot({path:"relight-firstlight-390-ready.png",fullPage:true,animations:"disabled"});
  await page.screenshot({path:"relight-firstlight-390-ready-viewport.png",fullPage:false,animations:"disabled"});
  const planetAtReady=await page.locator("#planet").evaluate(el=>el.toDataURL());
  const planetNameAtReady=await page.locator("#planet-name").textContent();
  await page.locator("#revive").click();
  let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("relight.webplaytest.v1")));
  assert.equal(saved.region,1);assert.equal(saved.campaign.phase,"expansion");
  assert.match(await page.locator("#world-copy").textContent(),/region is awake/i);
  assert.doesNotMatch(await page.locator("#world-copy").textContent(),/relay.*broken/i);
  assert.equal(await page.locator("#planet").evaluate(el=>el.toDataURL()),planetAtReady,
    "first awakening preserves the earned restoration pixels");
  assert.equal(await page.locator("#planet-name").textContent(),planetNameAtReady);
  assert.match(await page.locator('[data-index="7"]').evaluate(el=>getComputedStyle(el,"::after").content),/MINE/,
    "new-frontier target badge names the MINE action");
  await page.screenshot({path:"relight-firstlight-390-awakened.png",fullPage:true,animations:"disabled"});
  await page.locator("#campaign-action").click();
  saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("relight.webplaytest.v1")));
  assert.equal(saved.campaign.phase,"power");
  assert.match(await page.locator("#world-copy").textContent(),/strain the reactor/i);
  assert.doesNotMatch(await page.locator("#world-copy").textContent(),/relay.*broken/i);
  assert.match(await page.locator('[data-index="9"]').evaluate(el=>getComputedStyle(el,"::after").content),/POWER/,
    "overload target badge names the POWER action");
  assert.equal(await page.locator("#planet").evaluate(el=>el.toDataURL()),planetAtReady,
    "POWER installation keeps the first region's restoration pixels");
  assert.match(await page.locator("#mission-title").textContent(),/reactor is strained/i);
  await page.locator("#campaign-action").click();
  saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("relight.webplaytest.v1")));
  assert.equal(saved.campaign.phase,"open");
  assert.equal(await page.locator(".tile:visible").count(),25,"the full grid opens only after POWER placement");
  assert.match(await page.locator("#world-copy").textContent(),/planet has gone quiet/i,
    "the restored sandbox receives normal world copy after opening completion");
  assert.doesNotMatch(await page.locator("#world-copy").textContent(),/relay.*broken/i);
  await page.reload({waitUntil:"networkidle"});
  assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("campaign-opening")),false,
    "the first POWER unlock persists across reload");
  assert.equal(await page.locator("#planet").evaluate(el=>el.toDataURL()),planetAtReady,
    "reloaded open campaign keeps the earned restoration pixels");
  assert.match(await page.locator("#world-title").textContent(),/another dawn/i,
    "normal world headline remains after POWER and reload");
  assert.match(await page.locator("#world-copy").textContent(),/planet has gone quiet/i);
  await assertNoOverflow(page,390);
  await page.close();await mobile.close();

  const {context:narrow,page:small}=await freshContext(320,640);
  assert.equal(await small.locator(".tile:visible").count(),3);
  for(const selector of ["#campaign-action","#region-state",'[data-index="12"]','[data-index="13"]','[data-index="14"]']){
    const box=await small.locator(selector).boundingBox();
    assert.ok(box&&box.y>=0&&box.y+box.height<=640,
      `320×640 opening keeps ${selector} visible without scrolling`);
  }
  await small.screenshot({path:"relight-firstlight-320-viewport.png",fullPage:false,animations:"disabled"});
  await small.locator('[data-index="13"]').evaluate(el=>el.scrollIntoView({behavior:"instant",block:"center"}));
  const target=await small.locator('[data-index="13"]').boundingBox();
  assert.ok(target&&target.y>=0&&target.y+target.height<=640,
    "the highlighted repair target fits the real 320×640 viewport after focusing it");
  assert.ok(target.width>=44&&target.height>=44,"the relay target is touch sized");
  await assertNoOverflow(small,320);
  await small.screenshot({path:"relight-firstlight-320-opening.png",fullPage:true,animations:"disabled"});
  await narrow.close();

  const {context:desktop,page:d}=await freshContext(1440,900);
  assert.equal(await d.locator(".tile:visible").count(),3);
  assert.equal(await d.locator(".sidebar").isVisible(),false);
  await assertNoOverflow(d,1440);
  await d.screenshot({path:"relight-firstlight-desktop-opening.png",fullPage:true,animations:"disabled"});
  await d.screenshot({path:"relight-firstlight-desktop-viewport.png",fullPage:false,animations:"disabled"});
  await desktop.close();
  assert.deepEqual(errors,[],"Chromium reports no page or console errors");
  console.log("PASS: staged opening, earned kit, region claim, earned POWER, 320/390/1440 layouts and screenshots");
}finally{await browser.close();}
