// Hosted/local Chromium smoke for the staged First Light campaign.
// Screenshots are inspection artifacts; they do not stand in for player tests.
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {Machine,freshCampaign} from "./model.mjs";

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
async function freshContext(width,height,reducedMotion){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,
    isMobile:width<=650,hasTouch:width<=650,reducedMotion});
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
  assert.equal(await page.locator("#opening-world").isVisible(),true,
    "the opening uses one shared landscape");
  assert.equal(await page.locator(".tile:visible").count(),0,"the generic board is absent during First Light");
  assert.equal(await page.locator("#mission-banner").isVisible(),false,"there is no duplicate mission card");
  assert.equal(await page.locator("#scene-action").isVisible(),true,"the broken relay itself is actionable");
  assert.equal(await page.locator(".sidebar").isVisible(),false,"future machines and upgrades stay hidden");
  assert.equal(await page.locator(".resource:visible").count(),1,"the light HUD shows only scrap");
  assert.match(await page.locator("#world-title").textContent(),/First Light/);
  assert.match(await page.locator("#world-copy").textContent(),/broken link/);
  assert.match(await page.locator("#scene-action").getAttribute("aria-label"),/broken relay/i);
  for(const selector of ["#scene-action","#scene-reactor","#scene-relay","#scene-greenhouse"]){
    const box=await page.locator(selector).boundingBox();
    assert.ok(box&&box.y>=0&&box.y+box.height<=844,
      `390×844 opening keeps ${selector} visible without scrolling`);
  }
  const relayBox=await page.locator("#scene-relay").boundingBox();
  const repairBox=await page.locator("#scene-action").boundingBox();
  assert.ok(relayBox&&repairBox&&repairBox.x<relayBox.x+relayBox.width&&repairBox.x+repairBox.width>relayBox.x,
    "the repair target overlaps the broken relay in the shared landscape");
  assert.ok(repairBox.height>=44,"the scene repair target remains touch sized");
  await assertNoOverflow(page,390);
  await page.screenshot({path:"relight-firstlight-390-opening.png",fullPage:true,animations:"disabled"});
  await page.screenshot({path:"relight-firstlight-390-viewport.png",fullPage:false,animations:"disabled"});

  // A real touch followed by duplicate click delivery must repair only once.
  await page.locator("#scene-action").tap();
  await page.locator("#scene-action").evaluate(el=>{
    el.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,detail:1}));
    el.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,detail:1}));
  });
  let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("relight.webplaytest.v1")));
  assert.equal(saved.campaign.phase,"restore");assert.equal(saved.cells[13],2);assert.equal(saved.scrap,6);
  assert.equal(await page.locator("#opening-world").getAttribute("data-powered"),"true",
    "the repaired cable reads powered from the saved network");
  assert.equal(await page.locator("#scene-action").isVisible(),false);
  assert.equal(await page.locator("#opening-world").evaluate(el=>el.classList.contains("scene-pulse")),true,
    "repair gives a brief power-travel response");
  await page.reload({waitUntil:"networkidle"});
  assert.equal(await page.locator("#opening-world").getAttribute("data-phase"),"restore");
  assert.equal(await page.locator("#opening-world").getAttribute("data-powered"),"true",
    "reload immediately restores the authoritative powered state");
  assert.equal(await page.locator("#opening-world").evaluate(el=>el.classList.contains("scene-pulse")),false,
    "an interrupted pulse never becomes saved progress");
  await page.waitForFunction(()=>Number(document.querySelector("#opening-world")?.dataset.growth)>0,null,{timeout:5000});
  await page.waitForFunction(()=>document.querySelector("#scene-action")?.textContent.includes("INSTALL MINE"),null,{timeout:15000});
  assert.match(await page.locator("#world-title").textContent(),/Scrap becomes a tool/i);
  assert.ok(Number(await page.locator("#opening-world").getAttribute("data-growth"))>=.05,
    "living ground tracks actual restoration points");
  assert.ok(Number(await page.locator("#scene-sprouts").evaluate(el=>getComputedStyle(el).opacity))>0,
    "LIFE progress adds visible plants to the field");
  await page.screenshot({path:"relight-firstlight-390-kit.png",fullPage:true,animations:"disabled"});
  await page.screenshot({path:"relight-firstlight-390-kit-viewport.png",fullPage:false,animations:"disabled"});
  await page.locator("#scene-action").click();
  saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("relight.webplaytest.v1")));
  assert.equal(saved.cells[17],3,"the earned MINE is placed directly in its world site");
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector("#scene-mine-17")).opacity)>.9,null,{timeout:1000});
  assert.ok(Number(await page.locator("#scene-mine-17").evaluate(el=>getComputedStyle(el).opacity))>.9,
    "the machine becomes visible where the player installed it");
  assert.equal(await page.locator("#scene-awaken").isVisible(),false,"awakening still waits for real region recovery");

  // Seed one valid near-ready save to keep the smoke short; all interactions remain real.
  await page.addInitScript(()=>{
    const marker="relight.smoke.seeded-first-region";
    if(sessionStorage.getItem(marker))return;
    const key="relight.webplaytest.v1",saved=JSON.parse(localStorage.getItem(key)||"null");
    if(saved?.campaign?.phase!=="first-region")return;
    saved.restoration=99.8;saved.savedAt=Math.floor(Date.now()/1000);
    localStorage.setItem(key,JSON.stringify(saved));sessionStorage.setItem(marker,"yes");
  });
  await page.reload({waitUntil:"networkidle"});
  assert.equal(await page.locator("#scene-awaken").isVisible(),true,"the scene claim appears at the real target");
  await page.screenshot({path:"relight-firstlight-390-ready.png",fullPage:true,animations:"disabled"});
  await page.screenshot({path:"relight-firstlight-390-ready-viewport.png",fullPage:false,animations:"disabled"});
  const planetAtReady=await page.locator("#planet").evaluate(el=>el.toDataURL());
  const planetNameAtReady=await page.locator("#planet-name").textContent();
  await page.locator("#scene-awaken").click();
  saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("relight.webplaytest.v1")));
  assert.equal(saved.region,1);assert.equal(saved.campaign.phase,"investment-choice");
  assert.match(await page.locator("#world-copy").textContent(),/MINE means more scrap/i);
  assert.equal(await page.locator("#scene-choice-mine").isVisible(),true);
  assert.equal(await page.locator("#scene-choice-power").isVisible(),true);
  for(const id of ["#scene-choice-mine","#scene-choice-power"]){
    const rect=await page.locator(id).boundingBox();assert.ok(rect&&rect.y>=0&&rect.y+rect.height<=844,`${id} stays inside the scene`);
  }
  assert.match(await page.locator("#scene-choice-mine-detail").textContent(),/MINE 1\.33 gross\/s · scrap \+0\.87 net\/s · LIFE 0\.47\/s at 67% power/);
  assert.match(await page.locator("#scene-choice-power-detail").textContent(),/MINE 1\.00 gross\/s · scrap \+0\.30 net\/s · LIFE 0\.84\/s at 100% power/);
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector("#scene-frontier")).opacity)>.9,null,{timeout:1000});
  assert.ok(Number(await page.locator("#scene-frontier").evaluate(el=>getComputedStyle(el).opacity))>.9,
    "the first claim reveals a new physical site");
  assert.equal(await page.locator("#planet").evaluate(el=>el.toDataURL()),planetAtReady,
    "the first awakening preserves earned planet restoration pixels");
  assert.equal(await page.locator("#planet-name").textContent(),planetNameAtReady);
  await page.screenshot({path:"relight-firstlight-390-awakened.png",fullPage:true,animations:"disabled"});
  await page.screenshot({path:"relight-firstlight-390-investment-choice.png",fullPage:false,animations:"disabled"});
  await page.locator("#scene-choice-mine").tap();
  saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("relight.webplaytest.v1")));
  assert.equal(saved.campaign.phase,"investment-growth");assert.equal(saved.campaign.firstInvestment,"mine");
  assert.equal(saved.cells[7],Machine.Extractor,"the first investment appears at its distinct scene site");
  assert.equal(await page.locator("#scene-action").isVisible(),false,"the next site stays sealed during the recovery window");
  await page.screenshot({path:"relight-firstlight-390-investment-growth.png",fullPage:false,animations:"disabled"});
  saved.restoration=25;saved.campaign.phase="investment-second";
  await page.evaluate(value=>localStorage.setItem("relight.webplaytest.v1",JSON.stringify(value)),saved);
  await page.reload({waitUntil:"networkidle"});
  assert.equal(await page.locator("#scene-action").isVisible(),true,"the earned 25-point milestone reveals the next site after reload");
  await page.screenshot({path:"relight-firstlight-390-investment-unlocked.png",fullPage:false,animations:"disabled"});
  assert.equal(await page.locator("#opening-world").getAttribute("data-overloaded"),"true",
    "the visible reactor strain follows the real first-MINE investment");
  const planetAtInvestmentUnlock=await page.locator("#planet").evaluate(el=>el.toDataURL());
  const persistedMilestone=JSON.parse(await page.evaluate(()=>localStorage.getItem("relight.webplaytest.v1")));
  assert.ok((persistedMilestone.region+persistedMilestone.restoration/150)/3>1/3,
    "the 25-point recovery visibly advances planetary restoration");
  await page.locator("#scene-action").click();
  saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("relight.webplaytest.v1")));
  assert.equal(saved.campaign.phase,"open");assert.equal(saved.campaign.firstInvestment,"mine");
  assert.equal(await page.locator(".tile:visible").count(),25,"the full grid opens only after real POWER placement");
  assert.equal(await page.locator(".sidebar").isVisible(),true);
  assert.match(await page.locator("#world-copy").textContent(),/planet has gone quiet/i,
    "normal sandbox copy returns when the opening ends");
  await page.reload({waitUntil:"networkidle"});
  assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("campaign-opening")),false);
  assert.equal(await page.locator("#planet").evaluate(el=>el.toDataURL()),planetAtInvestmentUnlock,
    "the second build and reload preserve the exact earned restoration pixels");
  assert.match(await page.locator("#world-title").textContent(),/another dawn/i);
  await assertNoOverflow(page,390);
  await page.close();await mobile.close();

  const {context:narrow,page:small}=await freshContext(320,640);
  assert.equal(await small.locator("#opening-world").isVisible(),true);
  assert.equal(await small.locator(".tile:visible").count(),0);
  for(const selector of ["#scene-action","#scene-reactor","#scene-relay","#scene-greenhouse"]){
    const box=await small.locator(selector).boundingBox();
    assert.ok(box&&box.y>=0&&box.y+box.height<=640,
      `320×640 opening keeps ${selector} visible without scrolling`);
  }
  const narrowAction=await small.locator("#scene-action").boundingBox();
  assert.ok(narrowAction&&narrowAction.height>=44,"320px direct repair target stays touch sized");
  await small.screenshot({path:"relight-firstlight-320-viewport.png",fullPage:false,animations:"disabled"});
  await assertNoOverflow(small,320);
  await small.screenshot({path:"relight-firstlight-320-opening.png",fullPage:true,animations:"disabled"});
  await narrow.close();

  const {context:desktop,page:d}=await freshContext(1440,900);
  assert.equal(await d.locator("#opening-world").isVisible(),true);
  assert.equal(await d.locator(".tile:visible").count(),0);
  assert.equal(await d.locator(".sidebar").isVisible(),false);
  await assertNoOverflow(d,1440);
  await d.screenshot({path:"relight-firstlight-desktop-opening.png",fullPage:true,animations:"disabled"});
  await d.screenshot({path:"relight-firstlight-desktop-viewport.png",fullPage:false,animations:"disabled"});
  await desktop.close();

  const choiceWorld=freshCampaign();choiceWorld.cells[13]=Machine.Relay;choiceWorld.cells[17]=Machine.Extractor;
  choiceWorld.region=1;choiceWorld.scrap=65;choiceWorld.savedAt=Math.floor(Date.now()/1000);
  choiceWorld.campaign={version:2,phase:"investment-choice",mineKit:"redeemed",firstInvestment:null};
  const {context:wideChoice,page:choicePage}=await freshContext(1440,900);
  await choicePage.evaluate(value=>localStorage.setItem("relight.webplaytest.v1",JSON.stringify(value)),choiceWorld);
  await choicePage.reload({waitUntil:"networkidle"});
  assert.equal(await choicePage.locator("#scene-choice-mine").isVisible(),true);
  assert.equal(await choicePage.locator("#scene-choice-power").isVisible(),true);
  for(const selector of ["#scene-choice-mine","#scene-choice-power"]){
    const rect=await choicePage.locator(selector).boundingBox();
    assert.ok(rect&&rect.y>=0&&rect.y+rect.height<=900,`${selector} is visible in the desktop choice scene`);
  }
  await assertNoOverflow(choicePage,1440);
  await choicePage.screenshot({path:"relight-firstlight-desktop-investment-choice.png",fullPage:false,animations:"disabled"});
  await wideChoice.close();

  const {context:narrowChoice,page:choice320}=await freshContext(320,640);
  await choice320.evaluate(value=>localStorage.setItem("relight.webplaytest.v1",JSON.stringify(value)),choiceWorld);
  await choice320.reload({waitUntil:"networkidle"});
  for(const selector of ["#scene-choice-mine","#scene-choice-power"]){
    const rect=await choice320.locator(selector).boundingBox();
    assert.ok(rect&&rect.height>=44&&rect.y>=0&&rect.y+rect.height<=640,
      `320×640 keeps the ${selector} investment target visible and touch-sized`);
  }
  await assertNoOverflow(choice320,320);
  await choice320.screenshot({path:"relight-firstlight-320-investment-choice.png",fullPage:false,animations:"disabled"});
  await narrowChoice.close();

  const {context:motion,page:still}=await freshContext(390,844,"reduce");
  assert.equal(await still.evaluate(()=>matchMedia("(prefers-reduced-motion: reduce)").matches),true);
  await still.locator("#scene-action").focus();await still.keyboard.press("Enter");
  const repair=await still.evaluate(()=>JSON.parse(localStorage.getItem("relight.webplaytest.v1")));
  assert.equal(repair.campaign.phase,"restore","keyboard Enter performs the same single model repair");
  assert.equal(await still.evaluate(()=>document.activeElement.id),"world-title",
    "keyboard repair moves focus to a meaningful next-stage heading");
  assert.equal(await still.locator("#opening-world").getAttribute("data-powered"),"true");
  const flow=await still.locator(".scene-flow").evaluate(el=>({
    animation:getComputedStyle(el).animationDuration,opacity:getComputedStyle(el).opacity
  }));
  assert.equal(flow.animation,"0s","reduced motion disables the traveling animation");
  assert.ok(Number(flow.opacity)>0,"reduced-motion keeps a static powered-cable signal");
  await still.screenshot({path:"relight-firstlight-390-reduced-motion.png",fullPage:false,animations:"disabled"});
  await motion.close();
  assert.deepEqual(errors,[],"Chromium reports no page or console errors");
  console.log("PASS: interactive field scene, earned kit, region claim, POWER unlock and responsive layouts");
}finally{await browser.close();}
