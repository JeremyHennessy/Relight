import {Machine,PRICE,TARGET,fresh,loaded,valid,connected,rates,place,upgrade,upgradeCost,isReady,claim,resetGrid,advance,offline,mission,suggested} from "./model.mjs";

const SAVE="relight.webplaytest.v1";
const FIRST="relight.webplaytest.onboarded.v1";
const glyph={0:"+",1:"✦",2:"◇",3:"⬡",4:"✳",5:"ϟ"};
const words={0:"REMOVE",1:"CORE",2:"RELAY",3:"MINE",4:"LIFE",5:"POWER"};
const kinds={0:"empty",1:"core",2:"relay",3:"extractor",4:"restorer",5:"generator"};
const stepTitles=[
  "Give the life engine a boost.",
  "Build a second scrap miner.",
  "Watch the world wake up.",
  "Keep the light spreading."
];
const stepDescriptions=[
  "POWER is already selected. Tap the glowing square beside LIFE to boost the planet's recovery.",
  "Great! Choose MINE and tap the glowing square. More scrap keeps your restoration running.",
  "You've built a working network. Watch the recovery meter fill, then tap AWAKEN REGION.",
  "Your first region is alive. Add relays, improve efficiency and revive the next region."
];
const $=id=>document.getElementById(id);
const now=()=>Math.floor(Date.now()/1000);
let state=fresh(),selected=Machine.Generator,lastGoal=-1,lastPlanet=-1,lastCells="",lastNotice=0,saveClock=0,lastFrame=0,toastTimeout=null;
try{const data=JSON.parse(localStorage.getItem(SAVE)||"null");state=loaded(data);}catch(e){console.warn("Saved run unavailable; starting fresh.",e);}
const away=offline(state,now());
function persist(){
  state.savedAt=now();
  try{localStorage.setItem(SAVE,JSON.stringify(state));}
  catch(e){console.warn("Progress could not be saved in this browser",e);notice("Browser storage unavailable. This session won't persist.",true);}
}
const readable=n=>n>=1e6?(n/1e6).toFixed(1)+"M":n>=1e3?(n/1e3).toFixed(1)+"K":Number(n).toFixed(0);
function notice(message,warning=false){
  const el=$("toast");el.textContent=message;
  el.style.borderColor=warning?"#e09b88":"#599a8e";
  el.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout=setTimeout(()=>el.classList.remove("visible"),3500);
}
const tiles=[];
for(let i=0;i<25;i++){
  const btn=document.createElement("button");
  btn.type="button";btn.className="tile empty";btn.dataset.index=i;
  const symbol=document.createElement("span");symbol.className="tile-icon";
  const label=document.createElement("span");label.className="tile-name";
  btn.append(symbol,label);
  btn.addEventListener("click",()=>tap(i));
  $("tiles").append(btn);tiles.push({btn,symbol,label});
}
function choose(machine,manual=true){
  selected=machine;
  document.querySelectorAll(".tool").forEach(el=>{
    el.setAttribute("aria-pressed",String(Number(el.dataset.machine)===selected));
  });
  $("selected-tool-text").textContent=selected===Machine.Empty?"REMOVE selected · tap a structure":words[selected]+" selected · tap a square";
  if(manual)notice(selected===Machine.Empty?"Tap a structure to remove it.":words[selected]+" selected. Now tap an empty square.");
}
document.querySelectorAll(".tool").forEach(el=>el.addEventListener("click",()=>choose(Number(el.dataset.machine))));
function tap(index){
  const result=place(state,index,selected);
  notice(result.message,!result.ok);
  if(result.ok){persist();render(true);}
}
$("upgrade-mining").addEventListener("click",()=>{
  const r=upgrade(state,true);notice(r.message,!r.ok);if(r.ok){persist();render(true);}
});
$("upgrade-power").addEventListener("click",()=>{
  const r=upgrade(state,false);notice(r.message,!r.ok);if(r.ok){persist();render(true);}
});
$("revive").addEventListener("click",()=>{
  const r=claim(state);
  notice(r.message,!r.ok);if(r.ok){persist();render(true);}
});
$("repair").addEventListener("click",()=>{
  if(!window.confirm("Reset the network to its starting layout? Structures will not be refunded. Region and upgrades stay saved."))return;
  const r=resetGrid(state);notice(r.message);persist();render(true);
});
const welcome=$("welcome");
function openGuide(){
  if(typeof welcome.showModal==="function"&&!welcome.open)welcome.showModal();
  else welcome.setAttribute("open","");
}
function closeGuide(startPlaying=false){
  try{localStorage.setItem(FIRST,"yes");}catch(_){}
  if(typeof welcome.close==="function"&&welcome.open)welcome.close();
  else welcome.removeAttribute("open");
  // The visual planet intro is tall on a phone. After onboarding, put the
  // mission and its suggested build tile in view instead of hiding gameplay
  // below the fold. This affects navigation only, never the saved world.
  if(startPlaying){
    const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector(".mission-banner")?.scrollIntoView({
      behavior:reducedMotion?"instant":"smooth",block:"start"
    });
  }
}
$("how-to-play").addEventListener("click",openGuide);
$("begin").addEventListener("click",()=>closeGuide(true));
$("dismiss-help").addEventListener("click",()=>closeGuide(false));
welcome.addEventListener("cancel",()=>{try{localStorage.setItem(FIRST,"yes");}catch(_){}});
if(!localStorage.getItem(FIRST))openGuide();
if(away>2)notice("Welcome back! Your network worked for "+Math.floor(away/60)+" offline minutes.");
function render(force=false){
  if(!valid(state)){console.error("Invalid world, resetting safely");state=fresh();persist();}
  const r=rates(state),m=mission(state),ready=isReady(state),percentage=Math.min(100,100*state.restoration/TARGET(state.region));
  $("sector").textContent="SECTOR "+String(state.region+1).padStart(2,"0");
  $("scrap").textContent=readable(state.scrap);
  $("power").textContent=r.consumers+" / "+r.capacity;
  $("mining-rate").textContent="+"+r.mined.toFixed(1)+" scrap / second";
  $("power-note").textContent=r.fraction>=1?"All machines powered":Math.round(r.fraction*100)+"% power distribution";
  $("restored-percent").textContent=Math.floor(percentage)+"%";
  $("recovery-fill").style.width=percentage+"%";
  $("recovery-progress").setAttribute("aria-valuenow",String(Math.floor(percentage)));
  $("recovery-rate").textContent="Restoring +"+r.restored.toFixed(2)+" / second";
  $("region-state").textContent=ready?"REGION READY":r.restored>0?"Restoration in progress":"Connect a life engine";
  $("revive").disabled=!ready;
  $("revive-label").textContent=ready?"AWAKEN REGION "+String(state.region+1).padStart(2,"0"):"AWAKEN REGION";
  $("revive-hint").textContent=ready?"The region is ready. Awaken it for free and uncover more of the planet.":"Fill the recovery meter to awaken the next region.";
  if(m!==lastGoal){
    if(m===0)choose(Machine.Generator,false);
    if(m===1)choose(Machine.Extractor,false);
    lastGoal=m;
  }
  $("mission-number").textContent=String(Math.min(m+1,4)).padStart(2,"0");
  $("mission-title").textContent=ready?"The world is ready. Awaken it!":stepTitles[m];
  $("mission-description").textContent=ready?"Tap the glowing AWAKEN REGION button above. No ads, no payment—this is your reward.":stepDescriptions[m];
  [...$("mission-stages").children].forEach((child,i)=>{child.className=i<m?"done":i===m?"active":"";});
  const hint=suggested(state),cellKey=state.cells.join(",")+"|"+hint;
  if(force||cellKey!==lastCells){
    lastCells=cellKey;
    const links=r.connected;
    tiles.forEach(({btn,symbol,label},i)=>{
      const type=state.cells[i];
      btn.className="tile "+kinds[type]+(type!==0&&!links[i]?" disconnected":"")+(i===hint&&type===0?" suggested":"");
      symbol.textContent=glyph[type];label.textContent=type===0?"":words[type];
      btn.setAttribute("aria-label",(type===0?"Empty tile":"Tile with "+words[type])+" row "+(Math.floor(i/5)+1)+", column "+(i%5+1)+(i===hint?", suggested next tile":""));
      btn.title=type===0?"Tap to build "+words[selected]:words[type]+(links[i]?" · connected":" · not connected");
    });
    const lines=[];
    for(let i=0;i<25;i++)if(links[i]){
      for(const to of [i+1,i+5]){
        if(to>=25||to===i+1&&i%5===4||!links[to])continue;
        const x1=50+i%5*100,y1=50+Math.floor(i/5)*100,x2=50+to%5*100,y2=50+Math.floor(to/5)*100;
        lines.push('<line class="wire" x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'"></line>');
        lines.push('<line class="wire-live" x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'"></line>');
      }
    }
    $("network-lines").innerHTML=lines.join("");
  }
  document.querySelectorAll(".tool").forEach(el=>{
    const type=Number(el.dataset.machine);
    el.classList.toggle("unaffordable",type!==0&&state.scrap<PRICE[type]);
  });
  for(const mining of [true,false]){
    const btn=$(mining?"upgrade-mining":"upgrade-power");
    const cost=upgradeCost(state,mining);
    btn.disabled=state.scrap<cost;
    $(mining?"mining-level":"power-level").textContent="Level "+(mining?state.extractorLevel:state.powerLevel);
    $(mining?"mining-price":"power-price").firstChild.textContent=readable(cost)+" SCRAP ";
  }
  const bucket=Math.floor(percentage/3)+(state.region*40);
  if(bucket!==lastPlanet||force){lastPlanet=bucket;drawPlanet(state.region,percentage/100);}
  $("planet-caption").textContent=ready?"ATMOSPHERE: RENEWED":percentage>=75?"ATMOSPHERE: REVIVING":percentage>=30?"ATMOSPHERE: RECOVERING":"ATMOSPHERE: DORMANT";
  $("planet-tag").lastChild.textContent=ready?" READY TO AWAKEN":" RESTORATION ACTIVE";
  $("planet-name").textContent=["AURORA-9","SOLACE","VERDANT","HOLLOW SKY","ECHO PRIME","NEW DAWN"][state.region%6];
}
function lerp(a,b,t){return a+(b-a)*t;}
function rgba(c,a=1){return "rgba("+c.map(v=>Math.round(v)).join(",")+","+a+")";}
function mix(a,b,t){return a.map((n,i)=>lerp(n,b[i],t));}
function drawPlanet(region,recovery){
  const canvas=$("planet"),c=canvas.getContext("2d");
  if(!c)return;
  const W=canvas.width,H=canvas.height,C=260,R=209;
  c.clearRect(0,0,W,H);
  c.save();
  const atmosphere=c.createRadialGradient(C,C,180,C,C,247);
  atmosphere.addColorStop(0,"rgba(60,227,204,0)");
  atmosphere.addColorStop(.7,"rgba(61,201,207,"+(.03+recovery*.19)+")");
  atmosphere.addColorStop(1,"rgba(55,152,225,0)");
  c.fillStyle=atmosphere;c.beginPath();c.arc(C,C,247,0,Math.PI*2);c.fill();
  c.beginPath();c.arc(C,C,R,0,Math.PI*2);c.clip();
  const ocean=mix([22,37,55],[28,116,151],recovery),ocean2=mix([43,63,77],[16,63,116],recovery);
  const bg=c.createLinearGradient(90,70,435,450);
  bg.addColorStop(0,rgba(ocean));bg.addColorStop(.65,rgba(ocean2));bg.addColorStop(1,rgba(mix(ocean2,[3,24,46],.45)));
  c.fillStyle=bg;c.fillRect(0,0,W,H);
  // Original vector landmasses; the continent geometry stays stable while ecosystems return.
  const shapes=[
    [[93,102],[160,76],[215,111],[238,158],[217,202],[185,218],[170,273],[120,276],[107,230],[72,213]],
    [[274,80],[331,64],[394,104],[414,164],[376,193],[332,179],[305,221],[260,193],[244,149]],
    [[286,265],[356,251],[397,281],[417,350],[380,404],[318,426],[285,386],[253,328]],
    [[109,338],[164,320],[207,357],[217,402],[182,451],[116,437],[86,391]]
  ];
  const dry=[76,83,90],live=[55,134,105];
  const land=mix(dry,live,Math.min(1,recovery*1.4));
  c.lineJoin="round";
  for(let n=0;n<shapes.length;n++){
    const pts=shapes[n],shift=(region%3-1)*9;c.beginPath();
    c.moveTo(pts[0][0]+shift,pts[0][1]);
    for(let j=0;j<pts.length;j++){
      const p=pts[j],q=pts[(j+1)%pts.length];
      c.quadraticCurveTo(p[0]+shift,p[1],(p[0]+q[0])/2+shift,(p[1]+q[1])/2);
    }
    c.closePath();c.fillStyle=rgba(land);c.fill();
    c.strokeStyle="rgba(150,185,173,.17)";c.lineWidth=2;c.stroke();
  }
  c.globalAlpha=.35;
  for(let j=0;j<27;j++){
    const x=105+((j*97+region*17)%310),y=94+((j*71)%315),rad=7+(j%5)*6;
    const color=mix([105,114,110],[45,188,97],recovery);
    c.fillStyle=rgba(color,.25+recovery*.28);c.beginPath();c.ellipse(x,y,rad,rad*.35,(j%4)*.4,0,2*Math.PI);c.fill();
  }
  c.globalAlpha=1;
  if(recovery<.8){
    c.strokeStyle="rgba(235,184,117,"+(.34*(1-recovery)) +")";c.lineWidth=2;
    for(const [x,y] of [[152,185],[318,126],[354,341]]){
      c.beginPath();c.moveTo(x-18,y-10);c.lineTo(x,y);c.lineTo(x-9,y+20);c.lineTo(x+21,y+36);c.stroke();
    }
  }
  if(recovery>.12){
    c.globalAlpha=Math.min(.75,(recovery-.12)*.87);
    c.strokeStyle="#f1fff8";c.lineWidth=10;c.lineCap="round";
    for(const [x,y,dx] of [[156,126,77],[333,180,61],[166,367,63],[293,322,94]]){
      c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+dx*.4,y-20,x+dx*.55,y+15,x+dx,y-12);c.stroke();
    }
    c.globalAlpha=1;
  }
  // The terminator gives a spherical day/night read rather than a flat disc.
  const shadow=c.createLinearGradient(90,130,455,360);
  shadow.addColorStop(0,"rgba(0,0,0,0)");
  shadow.addColorStop(.44,"rgba(0,0,0,.04)");
  shadow.addColorStop(.72,"rgba(2,9,21,.43)");
  shadow.addColorStop(1,"rgba(1,4,14,.89)");
  c.fillStyle=shadow;c.fillRect(0,0,W,H);
  const highlight=c.createRadialGradient(190,130,10,240,260,310);
  highlight.addColorStop(0,"rgba(226,255,255,.20)");
  highlight.addColorStop(.55,"rgba(173,225,238,.025)");
  highlight.addColorStop(1,"rgba(0,0,0,.25)");
  c.fillStyle=highlight;c.fillRect(0,0,W,H);
  c.restore();
  c.beginPath();c.arc(C,C,R+1,0,Math.PI*2);
  c.strokeStyle="rgba(161,243,240,"+(.25+recovery*.4)+")";c.lineWidth=2;c.stroke();
  // A thin atmospheric crescent makes the stages more visually distinct.
  c.beginPath();c.arc(C,C,R+7,-1.02,1.05);
  c.strokeStyle="rgba(89,219,237,"+(.17+recovery*.54)+")";c.lineWidth=5;c.stroke();
}
render(true);
persist();
function frame(ts){
  if(!lastFrame)lastFrame=ts;
  const dt=Math.max(0,Math.min(.25,(ts-lastFrame)/1000));
  lastFrame=ts;
  if(document.visibilityState!=="hidden"){
    advance(state,dt);
    if(ts-lastNotice>230){render();lastNotice=ts;}
    saveClock+=dt;
    if(saveClock>8){persist();saveClock=0;}
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="hidden")persist();
  else{const elapsed=offline(state,now());if(elapsed>3)notice("Welcome back. Your machines worked offline.");render(true);lastFrame=0;}
});
window.addEventListener("pagehide",persist);
