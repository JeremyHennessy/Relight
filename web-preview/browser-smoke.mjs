// Chromium smoke for the staged valley-first campaign. Screenshots are local
// review artifacts; automated playback does not establish that the game is fun.
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {Machine,valid,rates} from "./model.mjs";

const origin=process.env.RELIGHT_BROWSER_URL||"http://127.0.0.1:8765";
const executablePath=process.env.RELIGHT_CHROMIUM_EXECUTABLE_PATH||undefined;
const browser=await chromium.launch({headless:true,args:["--no-sandbox"],executablePath});
const errors=[];
async function noOverflow(page,width){
  const extra=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(extra<=2,`${width}px viewport has ${extra}px horizontal overflow`);
}
async function noSiteOverlap(page,width){
  const boxes=await page.locator("#scene-sites .scene-site:visible").evaluateAll(nodes=>nodes.map(node=>{
    const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,index:node.dataset.index};
  }));
  for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++)
    assert.ok(boxes[a].right<=boxes[b].x||boxes[b].right<=boxes[a].x||
      boxes[a].bottom<=boxes[b].y||boxes[b].bottom<=boxes[a].y,
      `${width}px valley sites ${boxes[a].index} and ${boxes[b].index} overlap`);
}
async function context(width,height,reducedMotion){
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,
    isMobile:width<=650,hasTouch:width<=650,reducedMotion});
  const page=await ctx.newPage();
  await page.addInitScript(()=>{
    const pending=[];let clock=0;
    window.requestAnimationFrame=callback=>{pending.push(callback);return pending.length;};
    window.__relightAdvanceGameSeconds=seconds=>{
      const frames=Math.ceil(seconds*4);
      for(let i=0;i<frames;i++){
        const callback=pending.shift();if(!callback)throw new Error("game frame queue is empty");
        clock+=250;callback(clock);
      }
    };
  });
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//,route=>
    route.fulfill({status:200,contentType:"text/plain",body:""}));
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.goto(origin,{waitUntil:"networkidle"});
  return {ctx,page};
}
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem("relight.webplaytest.v1")));
async function stepGame(page,seconds){
  await page.evaluate(seconds=>window.__relightAdvanceGameSeconds(seconds),seconds);
}
async function tickUntil(page,phase,maxSeconds){
  for(let second=0;second<maxSeconds;second+=2){
    if((await saved(page)).campaign.phase===phase)return;
    await stepGame(page,2);
  }
  assert.equal((await saved(page)).campaign.phase,phase,`campaign reaches ${phase} within ${maxSeconds} active seconds`);
}
async function initialViewport(width,height){
  const {ctx,page}=await context(width,height);
  assert.equal(await page.locator("#welcome").evaluate(el=>el.open),false);
  const openingSave=await saved(page);
  await page.locator("#how-to-play").click();
  assert.match(await page.locator("#welcome-copy").textContent(),/25 restored with 15 scrap.*ridge salvage or faster greenhouse LIFE.*east field/i,
    "the v3 help copy describes the live early-choice route");
  await page.locator("#dismiss-help").click();
  assert.deepEqual(await saved(page),openingSave,"opening help does not alter or unlock the campaign");
  assert.equal(await page.locator("#welcome").evaluate(el=>el.open),false);
  assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("campaign-opening")),true);
  assert.equal(await page.locator("#opening-world").isVisible(),true);
  assert.equal(await page.locator(".tile:visible").count(),0,"the new campaign begins without a generic board");
  assert.equal(await page.locator(".sidebar").isVisible(),false,"future tools are earned later");
  assert.equal(await page.locator(".resource:visible").count(),1,"only salvage appears in the opening HUD");
  for(const selector of ["#scene-action","#scene-reactor","#scene-relay","#scene-greenhouse"]){
    const box=await page.locator(selector).boundingBox();
    assert.ok(box&&box.y>=0&&box.y+box.height<=height,`${width}×${height} keeps ${selector} visible in the first viewport`);
  }
  assert.ok((await page.locator("#scene-action").boundingBox()).height>=44,"repair target remains touch sized");
  const state=await saved(page);assert.equal(state.campaign.phase,"repair");assert.ok(valid(state));
  await noOverflow(page,width);
  await page.screenshot({path:`relight-firstlight-${width}-v3-opening-viewport.png`,fullPage:false,animations:"disabled"});
  await page.screenshot({path:`relight-firstlight-${width}-v3-opening-full.png`,fullPage:true,animations:"disabled"});
  await ctx.close();
}
async function checkTargets(page,selectors){
  const boxes=[];
  for(const selector of selectors){
    const box=await page.locator(selector).boundingBox();
    assert.ok(box&&box.width>=44&&box.height>=44,`${selector} has a touch target of at least44px`);
    const scene=await page.locator("#opening-world").boundingBox();
    assert.ok(box.x>=scene.x&&box.y>=scene.y&&box.x+box.width<=scene.x+scene.width&&box.y+box.height<=scene.y+scene.height,
      `${selector} stays inside the valley scene`);
    boxes.push({selector,...box});
  }
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j];
    assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,
      `${a.selector} and ${b.selector} do not overlap`);
  }
}
async function playRoute(page,route,shots=false){
  const routeView=route==="mine"?"390":"desktop";
  assert.equal(await page.locator("#scene-action").isVisible(),true);
  await page.locator("#scene-action").click();
  let state=await saved(page);assert.equal(state.campaign.phase,"restore");assert.equal(state.scrap,6);
  await page.reload({waitUntil:"networkidle"});
  await stepGame(page,12);
  state=await saved(page);assert.equal(state.campaign.phase,"mine-kit");
  assert.equal(await page.locator(".tile:visible").count(),0);assert.equal(await page.locator(".sidebar").isVisible(),false);
  assert.equal(await page.locator(".scene-socket:visible").count(),3);
  await page.locator("#scene-socket-10").click();
  state=await saved(page);assert.equal(state.campaign.phase,"mine-disconnected");assert.equal(rates(state).mined,0);
  assert.match(await page.locator("#mission-title").textContent(),/no power path/i);
  await page.locator("#scene-socket-8").click();
  state=await saved(page);assert.equal(state.campaign.phase,"ridge-link");assert.equal(state.campaign.starterMineSite,8);
  for(let elapsed=0;elapsed<40&&(await saved(page)).scrap<4;elapsed+=2)await stepGame(page,2);
  assert.ok((await saved(page)).scrap>=4,`connected MINE production funds the ridge relay without extra clicking (${(await saved(page)).scrap.toFixed(2)} scrap after up to 40 active seconds)`);
  assert.equal(await page.locator("#scene-action").isVisible(),true);
  await checkTargets(page,["#scene-action"]);
  await page.locator("#scene-action").click();
  state=await saved(page);assert.equal(state.campaign.phase,"first-region");assert.equal(state.cells[18],Machine.Relay);
  const ridgeWire=page.locator('.scene-network-wire[data-from="13"][data-to="18"]');
  assert.equal(await ridgeWire.count(),1,"the scene renders the built network edge");
  assert.match(await ridgeWire.getAttribute("class"),/wire-live/);
  assert.equal(await page.locator(".tile:visible").count(),0,"the connection task still uses the valley scene");
  await tickUntil(page,"investment-choice",180);
  state=await saved(page);assert.ok(state.restoration>=25&&state.scrap>=15);assert.ok(valid(state));
  const choiceUi=await page.evaluate(()=>({phase:document.querySelector("#opening-world").dataset.phase,
    hidden:document.querySelector("#scene-choice").hidden,opening:document.body.classList.contains("campaign-opening")}));
  assert.equal(await page.locator("#scene-choice").evaluate(el=>!el.hidden),true,
    `choice saves and renders together: ${JSON.stringify({saved:state.campaign.phase,...choiceUi})}`);
  assert.equal(await page.locator("#scene-choice-mine").isVisible(),true);
  assert.equal(await page.locator("#scene-choice-power").isVisible(),true);
  const mineDetail=await page.locator("#scene-choice-mine-detail").textContent();
  const powerDetail=await page.locator("#scene-choice-power-detail").textContent();
  assert.match(mineDetail,/1\.67 gross\/s.*\+1\.20 net\/s.*0\.47\/s at 67% power/i);
  assert.match(powerDetail,/1\.25 gross\/s.*\+0\.55 net\/s.*0\.84\/s at 100% power/i);
  await checkTargets(page,["#scene-choice-mine","#scene-choice-power"]);
  if(shots)await page.screenshot({path:`relight-firstlight-${routeView}-v3-investment-choice.png`,fullPage:false,animations:"disabled"});
  const chosen=route==="mine"?"#scene-choice-mine":"#scene-choice-power";
  await page.locator(chosen).click();
  state=await saved(page);assert.equal(state.campaign.phase,"first-region");assert.equal(state.campaign.firstInvestment,route);
  assert.equal(await page.locator(".tile:visible").count(),0,"first choice does not unlock the generic grid");
  assert.equal(await page.locator(".sidebar").isVisible(),false,"first choice does not unlock all tools");
  const routeRate=route==="mine"?.4666666666666666:.84;
  assert.ok(Math.abs(rates(state).restored-routeRate)<1e-9,"the selected route changes actual LIFE rate");
  if(shots)await page.screenshot({path:`relight-firstlight-${routeView}-v3-priority-installed.png`,fullPage:false,animations:"disabled"});
  await tickUntil(page,"field-link",260);
  state=await saved(page);assert.ok(state.restoration>=50&&state.scrap>=4);assert.ok(valid(state));
  await page.locator("#scene-action").waitFor({state:"visible"});
  await checkTargets(page,["#scene-action"]);
  if(shots)await page.screenshot({path:`relight-firstlight-${routeView}-v3-field-link.png`,fullPage:false,animations:"disabled"});
  await page.locator("#scene-action").click();
  state=await saved(page);assert.equal(state.campaign.phase,"first-region");assert.equal(state.cells[19],Machine.Relay);
  const fieldWire=page.locator('.scene-network-wire[data-from="14"][data-to="19"]');
  assert.equal(await fieldWire.count(),1);assert.match(await fieldWire.getAttribute("class"),/wire-live/);
  const growthBefore=Number(await page.locator("#opening-world").getAttribute("data-growth"));
  for(let second=0;second<260&&await page.locator("#scene-awaken").isHidden();second+=2)await stepGame(page,2);
  assert.equal(await page.locator("#scene-awaken").isVisible(),true,"the first region becomes claimable after its actual recovery target");
  assert.equal(await page.locator(".tile:visible").count(),0);
  if(shots)await page.screenshot({path:route==="mine"?"relight-firstlight-390-v3-ready-mine.png":"relight-firstlight-desktop-v3-ready-power.png",fullPage:false,animations:"disabled"});
  const growthReady=Number(await page.locator("#opening-world").getAttribute("data-growth"));
  assert.ok(growthReady>=growthBefore&&growthReady>=.99,"scene restoration remains visible through the ready state");
  const planetBeforeClaim=await page.locator("#planet").evaluate(el=>el.toDataURL());
  await page.locator("#scene-awaken").click();
  state=await saved(page);assert.equal(state.region,1);assert.equal(state.campaign.phase,"frontier-life");
  assert.equal(await page.locator("#opening-world").isVisible(),true);
  assert.equal(await page.locator(".tile:visible").count(),0,"the first claim reveals one scene action, not all construction tools");
  const afterClaimGrowth=Number(await page.locator("#opening-world").getAttribute("data-growth"));
  assert.ok(afterClaimGrowth>=.99,"the claim preserves the restored landscape instead of visually resetting it");
  assert.equal(await page.locator("#planet").evaluate(el=>el.toDataURL()),planetBeforeClaim,
    "the original restoration canvas pixels remain identical across the first claim");
  await page.locator("#scene-awaken").evaluate(el=>el.dispatchEvent(new MouseEvent("click",{bubbles:true})));
  assert.equal((await saved(page)).region,1,"duplicate claim events do not duplicate the reward");
  assert.equal(await page.locator("#scene-action").isVisible(),true);
  await page.locator("#scene-action").click();
  state=await saved(page);assert.equal(state.campaign.phase,"open");assert.equal(state.cells[24],Machine.Restorer);assert.ok(valid(state));
  assert.equal(await page.locator("#opening-world").isVisible(),true,"landscape remains the default after broader play unlocks");
  assert.equal(await page.locator(".tile:visible").count(),0,"frontier LIFE keeps the scene as the default construction surface");
  assert.equal(await page.locator(".sidebar").isVisible(),false);
  assert.equal(await page.locator("#scene-build-controls").isVisible(),true);
  await page.locator('.scene-build-tool[data-machine="3"]').click();
  await noSiteOverlap(page,await page.evaluate(()=>innerWidth));
  assert.ok(await page.locator('#scene-sites .scene-site-empty:visible').count()<=8,"the scene starts with a small nearby set of connected sites");
  if(await page.locator("#scene-more-sites").isVisible()){
    await page.locator("#scene-more-sites").click();
    assert.ok(await page.locator('#scene-sites .scene-site-empty:visible').count()>8,"additional connected sites are opt-in");
    await noSiteOverlap(page,await page.evaluate(()=>innerWidth));
    await page.locator("#scene-more-sites").click();
  }
  assert.equal(await page.locator('#scene-sites [data-index="0"]').isVisible(),false,"scene offers only sites connected to the existing network");
  assert.equal(await page.locator('#scene-sites [data-index="17"]').isVisible(),true,"the connected MINE site is directly actionable");
  await page.locator('#scene-sites [data-index="17"]').click();
  state=await saved(page);assert.equal(state.cells[17],Machine.Extractor,"scene placement performs a real connected model action");
  await page.locator('.scene-build-tool[data-machine="3"]').click();
  assert.equal(await page.locator('#scene-sites .scene-site-empty:visible').count(),0,"closing site choice returns to the unobscured landscape");
  await page.locator("#scene-advanced-toggle").click();
  assert.equal(await page.locator(".tile:visible").count(),25,"advanced network view remains available by explicit choice");
  assert.equal(await page.locator(".sidebar").isVisible(),true);
  await page.locator("#scene-advanced-toggle").click();
  assert.equal(await page.locator(".tile:visible").count(),0,"returning to the landscape preserves the same world");
  await noOverflow(page,await page.evaluate(()=>innerWidth));
}

try{
  await initialViewport(320,640);
  await initialViewport(390,844);
  await initialViewport(1440,900);

  const {ctx:mineContext,page:minePage}=await context(390,844);
  await playRoute(minePage,"mine",true);
  await minePage.screenshot({path:"relight-firstlight-390-v3-open-valley.png",fullPage:false,animations:"disabled"});
  const openSave=await saved(minePage);
  const {ctx:smallValleyContext,page:smallValleyPage}=await context(320,640);
  await smallValleyPage.evaluate(value=>localStorage.setItem("relight.webplaytest.v1",JSON.stringify(value)),openSave);
  await smallValleyPage.reload({waitUntil:"networkidle"});
  assert.equal(await smallValleyPage.locator("#opening-world").isVisible(),true);
  assert.equal(await smallValleyPage.locator(".tile:visible").count(),0,"320px post-frontier play keeps the scene as default");
  assert.equal(await smallValleyPage.locator(".sidebar").isVisible(),false);
  await smallValleyPage.evaluate(()=>window.scrollTo(0,0));
  await smallValleyPage.screenshot({path:"relight-firstlight-320-v3-open-valley-default.png",fullPage:false,animations:"disabled"});
  await smallValleyPage.locator('.scene-build-tool[data-machine="2"]').click();
  await noSiteOverlap(smallValleyPage,320);
  await smallValleyPage.screenshot({path:"relight-firstlight-320-v3-open-valley.png",fullPage:false,animations:"disabled"});
  await smallValleyContext.close();
  await mineContext.close();

  const {ctx:powerContext,page:powerPage}=await context(1440,900);
  await playRoute(powerPage,"power",true);
  await powerPage.screenshot({path:"relight-firstlight-desktop-v3-power-priority.png",fullPage:false,animations:"disabled"});
  await powerContext.close();

  const {ctx:reduceContext,page:reduced}=await context(320,640,"reduce");
  await reduced.locator("#scene-action").focus();await reduced.keyboard.press("Enter");
  assert.equal((await saved(reduced)).campaign.phase,"restore");
  assert.equal(await reduced.evaluate(()=>document.activeElement.id),"mission-title");
  const flow=await reduced.locator(".scene-flow").evaluate(el=>({animation:getComputedStyle(el).animationDuration,opacity:getComputedStyle(el).opacity}));
  assert.equal(flow.animation,"0s");await noOverflow(reduced,320);await reduceContext.close();
  assert.deepEqual(errors,[],"Chromium smoke completes without console/page errors");
  console.log("PASS: valley repair, powered MINE, ridge/field connections, both early priority routes, first claim, frontier unlock and 320/390/desktop layouts");
}finally{await browser.close();}
