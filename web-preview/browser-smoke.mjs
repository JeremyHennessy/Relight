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
  // Scroll behavior may animate; inspect the final visible position, not
  // the first scroll frame. The board must enter the actual viewport.
  await p.waitForFunction(()=>{
    const rect=document.querySelector("#network-board").getBoundingClientRect();
    return window.scrollY>200 && rect.top>=0 && rect.top<window.innerHeight;
  },null,{timeout:6000});
  const boardTop=await p.locator("#network-board").evaluate(e=>e.getBoundingClientRect().top);
  console.log("GUIDED BOARD IN VIEW",Math.round(boardTop));
  assert.match(await p.locator("#mission-title").textContent(),/life engine/i);
  assert.match(await p.locator('[data-index="19"]').getAttribute("class"),/suggested/);
  await p.locator('[data-index="19"]').click();
  await p.waitForFunction(()=>document.querySelector("#mission-title")?.textContent.includes("scrap miner"));
  assert.match(await p.locator('[data-index="7"]').getAttribute("class"),/suggested/);
  await p.locator('[data-index="7"]').click();
  await p.waitForFunction(()=>document.querySelector("#mission-title")?.textContent.includes("world wake up"));
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
  await mobile.close();

  const desktop=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const d=await desktop.newPage();
  d.on("pageerror",err=>errors.push(err.message));
  d.on("console",msg=>{if(msg.type()==="error")errors.push(msg.text());});
  await d.goto(origin,{waitUntil:"networkidle"});
  await d.locator("#begin").click();
  const desktopOverflow=await d.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(desktopOverflow<=2,"desktop page has horizontal overflow: "+desktopOverflow);
  await d.screenshot({path:"relight-desktop-playtest.png",fullPage:true,animations:"disabled"});
  await desktop.close();
  assert.deepEqual(errors,[],"No browser page errors or console errors");
  console.log("PASS: Chrome mobile+desktop render, tutorial steps, build clicks, save reload, no overflow, screenshots");
}
finally{await browser.close();}
