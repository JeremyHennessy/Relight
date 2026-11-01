import {Machine,PRICE,TARGET,fresh,freshCampaign,isCampaign,repairGreenhouse,redeemMineKit,loaded,valid,connected,neighbors,rates,place,upgrade,upgradeCost,isReady,estimateRecoverySeconds,claim,resetGrid,advance,offline,mission,suggested} from "./model.mjs";

const SAVE="relight.webplaytest.v1";
const FIRST="relight.webplaytest.onboarded.v1";
const TUTORIAL="relight.webplaytest.tutorial.v1";
const MAX_DISPLAYED_ETA_SECONDS=365*24*60*60;
const glyph={0:"+",1:"✦",2:"◇",3:"⬡",4:"✳",5:"ϟ"};
const words={0:"REMOVE",1:"CORE",2:"RELAY",3:"MINE",4:"LIFE",5:"POWER"};
const kinds={0:"empty",1:"core",2:"relay",3:"extractor",4:"restorer",5:"generator"};
const statusWords={active:"ACTIVE",disconnected:"OFF","fuel-starved":"FUEL","fuel-limited":"LIMIT",throttled:"LOW"};
const stepTitles=[
  "Give the life engine a boost.",
  "Build a second scrap miner.",
  "Watch the world wake up.",
  "Keep the light spreading."
];
const stepDescriptions=[
  "POWER is already selected. Tap the glowing square beside LIFE to boost the planet's recovery.",
  "MINE is already selected for you. Tap the glowing NEXT square to add a second scrap miner.",
  "You've built a working network. Watch the recovery meter fill, then tap AWAKEN REGION.",
  "Your first region is alive. Add relays, improve efficiency and revive the next region."
];
const $=id=>document.getElementById(id);
const now=()=>Math.floor(Date.now()/1000);
function setTextIfChanged(el,value){if(el&&el.textContent!==value)el.textContent=value;}
let state=fresh(),selected=Machine.Generator,lastGoal=-1,lastPlanet=-1,lastCells="",lastNotice=0,saveClock=0,lastFrame=0,toastTimeout=null;
let storageUnavailable=false,saveWriteProtected=false,lastVerifiedSave=null;
let firstPreferenceReadFailed=false,tutorialRecordReadFailed=false,tutorialRecordPresent=false;
const storageWarning="Progress can't be saved in this browser. You can keep playing, but progress won't persist after reload.";
const unreadableSaveWarning="An existing save can't be read. It was left untouched; this session won't persist after reload.";
const unverifiedSaveWarning="This browser couldn't verify the saved progress. This session will continue in memory.";
const changedSaveWarning="The existing save changed outside this session and was left untouched. This session will continue in memory.";
function storageGetSave(){
  try{return window.localStorage.getItem(SAVE);}
  catch(e){markStorageUnavailable(e,unreadableSaveWarning,true);return null;}
}
function storageGetFirst(){
  try{return window.localStorage.getItem(FIRST);}
  catch(e){firstPreferenceReadFailed=true;console.warn("Tutorial preference could not be read; showing the guide.",e);return null;}
}
function storageSetFirst(value){
  try{window.localStorage.setItem(FIRST,value);return true;}
  catch(e){console.warn("Tutorial preference could not be saved.",e);return false;}
}
function readTutorialRecord(){
  try{
    const raw=window.localStorage.getItem(TUTORIAL);
    tutorialRecordPresent=raw!==null;
    const record=JSON.parse(raw||"null");
    if(!record||typeof record!=="object"||Array.isArray(record))return null;
    if(record.mode!=="live"||typeof record.active!=="boolean"||typeof record.complete!=="boolean"||
      (record.active&&record.complete)||!Number.isInteger(record.initialRegion)||record.initialRegion<0)return null;
    return {active:record.active,complete:record.complete,mode:"live",initialRegion:record.initialRegion};
  }catch(e){tutorialRecordReadFailed=true;console.warn("Walkthrough progress could not be read; it can be restarted.",e);return null;}
}
let tutorialRecord=readTutorialRecord();
let tutorialActive=tutorialRecord?.active===true&&tutorialRecord.mode==="live";
let practiceMode=false,practiceReturn=null;
let tutorialInitialRegion=tutorialRecord?.initialRegion??state.region;
let firstPreference=storageGetFirst();
let allowFirstTutorialStart=false;
function writeTutorialRecord(record){
  tutorialRecord=record;
  try{window.localStorage.setItem(TUTORIAL,JSON.stringify(record));return true;}
  catch(e){console.warn("Walkthrough progress could not be saved; it can be restarted.",e);return false;}
}
function markStorageUnavailable(error,message=storageWarning,protectSave=false){
  if(!storageUnavailable)console.warn("Browser storage unavailable; progress will not persist.",error);
  storageUnavailable=true;
  if(protectSave)saveWriteProtected=true;
  setSaveStatus(message,"warning");
  if($("toast")){
    $("toast").style.borderColor="#e09b88";
  }
}
function markStorageAvailable(){
  if(!storageUnavailable)return;
  storageUnavailable=false;
  setSaveStatus("Progress saving is available again. A verified copy is stored in this browser.","success");
}
const savedRaw=storageGetSave();
allowFirstTutorialStart=savedRaw===null&&!firstPreference&&!tutorialActive&&!tutorialRecord&&!tutorialRecordPresent&&!tutorialRecordReadFailed&&!saveWriteProtected&&!storageUnavailable;
if(saveWriteProtected)state=fresh();
else if(savedRaw!==null){
  try{
    const saved=JSON.parse(savedRaw);
    if(valid(saved))state=loaded(saved);
    else{
      state=fresh();
      markStorageUnavailable(new Error("Saved world data failed validation."),unreadableSaveWarning,true);
    }
  }catch(e){
    state=fresh();
    markStorageUnavailable(e,unreadableSaveWarning,true);
  }
}else if(!firstPreference&&!tutorialActive&&!tutorialRecord&&!tutorialRecordPresent&&!tutorialRecordReadFailed&&!firstPreferenceReadFailed&&!storageUnavailable){
  state=freshCampaign();
}
if(!saveWriteProtected)lastVerifiedSave=savedRaw;
function applyOfflineProgress(at){
  const before={savedAt:state.savedAt,scrap:state.scrap,restoration:state.restoration};
  const elapsedSeconds=before.savedAt<=0?0:Math.max(0,at-before.savedAt);
  const appliedSeconds=offline(state,at);
  return {
    elapsedSeconds,appliedSeconds,
    recoveryGained:state.restoration-before.restoration,
    scrapNet:state.scrap-before.scrap
  };
}
const offlineResult=applyOfflineProgress(now());
const away=offlineResult.appliedSeconds;
function setSaveStatus(message,tone){
  const el=$("save-status");
  if(!el)return;
  el.textContent=message;
  el.dataset.tone=tone;
  el.hidden=!message;
}
function formatDuration(seconds){
  const whole=Math.floor(seconds);
  if(whole>=3600){
    const hours=Math.floor(whole/3600),minutes=Math.floor(whole%3600/60);
    return hours+"h"+(minutes?" "+minutes+"m":"");
  }
  if(whole>=60){
    const minutes=Math.floor(whole/60),remaining=whole%60;
    return minutes+"m"+(remaining?" "+remaining+"s":"");
  }
  return whole+"s";
}
function signedAmount(value,unit){
  const rounded=Math.round(Math.abs(value)*10)/10;
  const sign=value>0?"+":value<0?"−":"";
  return sign+rounded.toFixed(1)+" "+unit;
}
function planetMilestonePercent(s){
  const regionPercent=Math.min(100,100*s.restoration/TARGET(s.region));
  return Math.floor(((s.region%3)+regionPercent/100)/3*100);
}
function showRecap(title,details,includeOfflineCaps=false){
  const panel=$("progress-recap");
  $("recap-title").textContent=title;
  const list=$("recap-details");list.replaceChildren();
  for(const detail of details){
    const line=document.createElement("p");line.textContent=detail;list.append(line);
  }
  $("recap-caps").hidden=!includeOfflineCaps;
  panel.hidden=false;
}
function showOfflineRecap(result){
  const capped=result.elapsedSeconds>result.appliedSeconds;
  const elapsed=capped?" of "+formatDuration(result.elapsedSeconds)+" away":"";
  const title=isReady(state)?"Region ready while you were away":"Offline progress applied";
  showRecap(title,[
    "Applied "+formatDuration(result.appliedSeconds)+" offline progress"+elapsed+".",
    "Recovery gained: "+signedAmount(result.recoveryGained,"points")+".",
    "Scrap net: "+signedAmount(result.scrapNet,"scrap")+".",
    "Planet milestone: "+planetMilestonePercent(state)+"% of its three-region cycle."
  ],true);
}
function showClaimRecap(scrapReward){
  const planetName=["AURORA-9","SOLACE","VERDANT","HOLLOW SKY","ECHO PRIME","NEW DAWN"][Math.floor(state.region/3)%6];
  showRecap("Region awakened",[
    "Claimed "+signedAmount(scrapReward,"scrap")+".",
    "Next region recovery target: "+TARGET(state.region)+" points.",
    planetName+" milestone progress: "+planetMilestonePercent(state)+"% toward the next planet (three regions)."
  ]);
}
let tutorialFinished=false;
let lastTutorialStage=-1;
const walkthroughStages=[
  {title:"Connect POWER beside LIFE",copy:"Place a connected POWER generator next to LIFE.",why:"POWER adds network capacity and boosts adjacent LIFE. The status above compares connected demand with available capacity."},
  {title:"Grow the scrap supply",copy:"Add a second connected MINE.",why:"MINE produces the scrap you need to build. LIFE also spends scrap to restore the region."},
  {title:"Extend the relay path",copy:"Add a RELAY to an open tile connected to your network.",why:"A connected relay carries energy farther across the grid, so later machines can join the network."},
  {title:"Add another LIFE engine",copy:"Build a second connected LIFE engine.",why:"LIFE turns scrap into recovery and uses network capacity. Watch consumers and capacity together; demand above capacity slows output."},
  {title:"Awaken the ready region",copy:"Keep LIFE supplied until recovery reaches its target, then AWAKEN REGION.",why:"The meter is the claim condition. Awakening grants the normal region reward once and starts the next region."}
];
function tutorialBuildStage(){
  const links=connected(state);
  let mineCount=0,boost=false;
  for(let i=0;i<state.cells.length;i++)if(links[i]){
    if(state.cells[i]===Machine.Extractor)mineCount++;
    if(state.cells[i]===Machine.Restorer&&
      neighbors(i).some(n=>links[n]&&state.cells[n]===Machine.Generator))boost=true;
  }
  if(!boost)return 0;
  if(mineCount<2)return 1;
  if(state.cells.filter((type,index)=>type===Machine.Relay&&links[index]).length<2)return 2;
  if(state.cells.filter((type,index)=>type===Machine.Restorer&&links[index]).length<2)return 3;
  return 4;
}
function tutorialStage(){
  const buildStage=tutorialBuildStage();
  if(buildStage<4)return buildStage;
  return state.region>tutorialInitialRegion?5:4;
}
function legalTutorialTiles(machine){
  if(state.scrap<PRICE[machine])return [];
  const targets=[];
  for(let index=0;index<state.cells.length;index++)if(state.cells[index]===Machine.Empty){
    const cells=state.cells.slice();cells[index]=machine;
    const trial={...state,cells},links=connected(trial);
    if(!links[index])continue;
    if(machine===Machine.Generator&&!neighbors(index).some(n=>cells[n]===Machine.Restorer&&links[n]))continue;
    targets.push(index);
  }
  return targets;
}
function tutorialBlocker(machine,targets,r){
  if(state.scrap<PRICE[machine]){
    if(r.mined<=0)
      return " No connected MINE produces scrap. Reconnect one or replay in practice; skip keeps this world unchanged.";
    if(!isReady(state)&&r.mined<=r.used)
      return " Scrap cannot grow: connected MINE output does not cover LIFE use. Connect more MINE or reduce LIFE demand; replay in practice if stuck.";
    return " Wait for connected MINE production: this costs "+PRICE[machine]+" scrap; you have "+Math.floor(state.scrap)+".";
  }
  return targets.length===0?
    " No connected empty tile is available. Clear a route only if you choose, or skip the walkthrough.":"";
}
function clearTutorialHighlights(){
  document.querySelectorAll(".tutorial-highlight").forEach(el=>el.classList.remove("tutorial-highlight"));
}
function finishWalkthrough(){
  tutorialActive=false;tutorialFinished=true;
  if(!practiceMode)writeTutorialRecord({active:false,complete:true,mode:"live",initialRegion:tutorialInitialRegion});
}
function campaignLayout(){
  const phase=state.campaign?.phase;
  if(!phase||phase==="open")return {columns:5,rows:5,indices:Array.from({length:25},(_,i)=>i),target:-1};
  if(phase==="repair"||phase==="restore")return {columns:3,rows:1,indices:[12,13,14],target:phase==="repair"?13:-1};
  if(phase==="mine-kit"||phase==="first-region")return {columns:3,rows:2,indices:[12,13,14,17,18,19],target:phase==="mine-kit"?17:-1};
  return {columns:3,rows:3,indices:[7,8,9,12,13,14,17,18,19],target:phase==="expansion"?7:phase==="power"?9:-1};
}
function runCampaignAction(event){
  const phase=state.campaign?.phase;
  let result;
  if(phase==="repair")result=repairGreenhouse(state);
  else if(phase==="mine-kit")result=redeemMineKit(state,17);
  else if(phase==="expansion")result=place(state,7,Machine.Extractor);
  else if(phase==="power")result=place(state,9,Machine.Generator);
  else return;
  notice(result.message,!result.ok);
  if(result.ok){persist();render(true);}
  if(event?.detail===0&&result.ok){
    const next=document.querySelector(".tile.suggested")||($("campaign-action").hidden?$("mission-title"):$("campaign-action"));
    next?.focus({preventScroll:true});
  }
}
function renderCampaign(){
  const campaign=state.campaign;
  const active=!!campaign&&campaign.phase!=="open";
  document.body.classList.toggle("campaign-opening",active);
  $("campaign-action").hidden=true;
  if(active){
    const phase=campaign.phase;
    const prompts={
      repair:["Bring the greenhouse back online","A relay is broken. Repair the highlighted link with 4 scrap.","REPAIR RELAY · 4 SCRAP"],
      restore:["The greenhouse is waking","Its LIFE engine is restoring the ground. At 5 restored points, you earn a MINE starter kit."],
      "mine-kit":["You earned a MINE kit","Install your free starter MINE at the highlighted site. The kit stays yours even if scrap runs out.","INSTALL EARNED MINE · FREE"],
      "first-region":["Keep the greenhouse alive","The MINE now feeds LIFE. Let restoration reach 100%, then awaken this region."],
      expansion:["A new site is open","Your first awakening revealed a new site. Place a second MINE there.","PLACE MINE · 12 SCRAP"],
      power:["The reactor is strained","Two MINEs plus LIFE exceed reactor capacity. Place POWER beside the greenhouse.","PLACE POWER · 15 SCRAP"]
    };
    const [title,copy,action]=prompts[phase]||prompts.repair;
    const environmentCopy={
      repair:"One broken relay keeps the ruined greenhouse dark.",
      restore:"The relay is repaired. LIFE is restoring the dark greenhouse.",
      "mine-kit":"The greenhouse is recovering. An earned MINE kit opens automation.",
      "first-region":"MINE feeds LIFE. Keep this region supplied until it awakens.",
      expansion:"Your first region is awake. A new site opens the next network step.",
      power:"Two MINEs and LIFE strain the reactor. Add POWER beside the greenhouse."
    }[phase];
    setTextIfChanged($("world-title"),"A reactor still burns.");
    setTextIfChanged($("world-copy"),environmentCopy||"The planet is recovering.");
    setTextIfChanged($("mission-eyebrow"),"BLACKOUT · FIRST LIGHT");
    setTextIfChanged($("mission-number"),phase==="repair"?"01":phase==="restore"?"02":phase==="mine-kit"?"03":phase==="first-region"?"04":phase==="expansion"?"05":"06");
    setTextIfChanged($("mission-title"),title);
    setTextIfChanged($("mission-description"),copy);
    $("mission-stages").setAttribute("aria-label","Opening progress");
    const completed={repair:0,restore:1,"mine-kit":2,"first-region":3,expansion:4,power:5}[phase]||0;
    [...$("mission-stages").children].forEach((dot,index)=>{dot.className=index<completed?"done":index===completed?"active":"";});
    if(action){
      $("campaign-action").textContent=action;
      $("campaign-action").hidden=false;
      const costs={repair:4,"mine-kit":0,expansion:PRICE[Machine.Extractor],power:PRICE[Machine.Generator]};
      $("campaign-action").disabled=state.scrap<(costs[phase]||0);
      $("campaign-wallet").hidden=!(costs[phase]>0);
      $("campaign-wallet").textContent="Available: "+readable(state.scrap)+" scrap";
    }else{
      $("campaign-wallet").hidden=true;
    }
    $("tutorial-controls").hidden=!practiceMode;
    $("tutorial-return").hidden=!practiceMode;
    $("tutorial-skip").hidden=true;$("tutorial-done").hidden=true;$("tutorial-why").hidden=true;$("tutorial-mode-label").hidden=!practiceMode;
    if(practiceMode)setTextIfChanged($("tutorial-mode-label"),"Temporary practice · reload returns to your saved world; nothing transfers.");
    const layout=campaignLayout();
    $("tiles").style.gridTemplateColumns=`repeat(${layout.columns},minmax(0,1fr))`;
    $("tiles").style.gridTemplateRows=`repeat(${layout.rows},minmax(0,1fr))`;
    $("network-board").style.aspectRatio=`${layout.columns} / ${layout.rows}`;
    $("network-board-title").textContent=phase==="repair"||phase==="restore"?"Ruined greenhouse · broken relay":phase==="mine-kit"||phase==="first-region"?"Greenhouse · first MINE site":"Frontier · new site";
    $("network-eyebrow").textContent=phase==="repair"||phase==="restore"?"FIRST LIGHT / REPAIR LINK":phase==="mine-kit"||phase==="first-region"?"GREENHOUSE / STARTER SITE":"NEW FRONTIER / EXPANSION";
  }else{
    const defaultTitle="Every world<br>deserves <em>another dawn.</em>";
    if($("world-title").innerHTML!==defaultTitle)$("world-title").innerHTML=defaultTitle;
    setTextIfChanged($("world-copy"),"The planet has gone quiet. Restore its energy network, power the machines and watch life return—one region at a time.");
    $("campaign-wallet").hidden=true;
    $("network-board").style.aspectRatio="1 / 1";
    $("tiles").style.gridTemplateColumns="repeat(5,minmax(0,1fr))";
    $("tiles").style.gridTemplateRows="repeat(5,minmax(0,1fr))";
    $("network-board-title").textContent="Build the connection.";
    $("network-eyebrow").textContent="THE GRID / NETWORK 5×5";
    $("tutorial-controls").hidden=!practiceMode;
    $("tutorial-return").hidden=!practiceMode;
    $("tutorial-mode-label").hidden=!practiceMode;
    if(practiceMode)setTextIfChanged($("tutorial-mode-label"),"Temporary practice · reload returns to your saved world; nothing transfers.");
  }
  return active;
}
function renderTutorial(){
  if(state.campaign&&state.campaign.phase!=="open")return;
  const why=$("tutorial-why"),controls=$("tutorial-controls"),skip=$("tutorial-skip"),leave=$("tutorial-return"),done=$("tutorial-done"),modeLabel=$("tutorial-mode-label");
  if(!tutorialActive&&!tutorialFinished){
    clearTutorialHighlights();lastTutorialStage=-1;
    controls.hidden=!practiceMode;
    why.hidden=true;skip.hidden=true;leave.hidden=!practiceMode;done.hidden=true;modeLabel.hidden=!practiceMode;
    setTextIfChanged($("mission-eyebrow"),"YOUR NEXT MOVE");
    return;
  }
  const stage=tutorialActive?tutorialStage():5;
  if(!Number.isInteger(stage)||stage<0||stage>5){
    if(tutorialActive)finishWalkthrough();
    return renderTutorial();
  }
  const stageChanged=stage!==lastTutorialStage;
  if(stageChanged){clearTutorialHighlights();lastTutorialStage=stage;}
  const steps=[...$("mission-stages").children];
  steps.forEach((dot,index)=>dot.className=index<stage?"done":index===stage&&stage<5?"active":"");
  if(stage>=5){
    if(tutorialActive)finishWalkthrough();
    setTextIfChanged($("mission-eyebrow"),"WALKTHROUGH COMPLETE");
    setTextIfChanged($("mission-number"),"✓");
    setTextIfChanged($("mission-title"),"You brought a region back to life.");
    setTextIfChanged($("mission-description"),"Your normal claim reward is shown in the recap. Your saved world stays separate from practice.");
    controls.hidden=false;why.hidden=true;skip.hidden=true;leave.hidden=!practiceMode;done.hidden=practiceMode;
    modeLabel.hidden=!practiceMode;
    if(practiceMode)modeLabel.textContent="Temporary practice · nothing transfers to your saved world.";
    if(window.matchMedia("(max-width: 650px)").matches)
      mobileFeedback(practiceMode?"Walkthrough complete · return to your saved world.":"Walkthrough complete · see the reward recap below.");
    return;
  }
  const entry=walkthroughStages[stage];
  if(!entry){
    if(tutorialActive)finishWalkthrough();
    return renderTutorial();
  }
  setTextIfChanged($("mission-eyebrow"),"GUIDED WALKTHROUGH · "+(stage+1)+" / 5");
  setTextIfChanged($("mission-number"),String(stage+1).padStart(2,"0"));
  const r=rates(state);
  let copy=entry.copy;
  const machine=[Machine.Generator,Machine.Extractor,Machine.Relay,Machine.Restorer][stage];
  const targets=stage<4?legalTutorialTiles(machine):[];
  if(stage<4&&targets.length===0)copy+=tutorialBlocker(machine,targets,r);
  if(stage===4&&isReady(state))copy="The region is ready. Activate AWAKEN REGION beside the recovery meter.";
  setTextIfChanged($("mission-title"),stage===4&&!isReady(state)?"Restore the region to its target":entry.title);
  setTextIfChanged($("mission-description"),copy);
  setTextIfChanged(why,stage===3?entry.why+" Current network: "+r.consumers+" consumers / "+r.capacity+" capacity; output "+Math.round(r.fraction*100)+"%.":entry.why);
  why.hidden=false;
  controls.hidden=false;skip.hidden=practiceMode;leave.hidden=!practiceMode;done.hidden=true;
  modeLabel.hidden=!practiceMode;
  if(practiceMode)modeLabel.textContent="Temporary practice · reload returns to your saved world.";
  if(window.matchMedia("(max-width: 650px)").matches){
    const mobileSteps=[
      "1/5 · Add POWER by LIFE: it boosts recovery and adds capacity.",
      "2/5 · Add MINE: scrap builds machines and fuels LIFE.",
      "3/5 · Extend RELAY: it carries energy across the grid.",
      "4/5 · Add LIFE: it spends scrap and uses network capacity."
    ];
    let mobileCopy=stage===4?
      (isReady(state)?"5/5 · Region ready. Tap AWAKEN to claim once.":"5/5 · Grow recovery to the target, then AWAKEN."):
      "Walkthrough "+mobileSteps[stage];
    if(stage<4&&targets.length===0)mobileCopy+=tutorialBlocker(machine,targets,r);
    mobileFeedback(mobileCopy);
  }
  let firstTarget=null;
  if(stage<4){
    document.querySelectorAll(".quick-tool,.tool").forEach(el=>{
      if(Number(el.dataset.machine)===machine)el.classList.add("tutorial-highlight");
    });
    // Keep one legal recommendation visually clear. Every other valid tile
    // remains playable, and the suggestion is recalculated after each action.
    const hint=suggested(state);
    const target=targets.includes(hint)?hint:targets[0];
    if(target!==undefined){
      firstTarget=document.querySelector(`[data-index="${target}"]`);
      firstTarget?.classList.add("tutorial-highlight");
    }
    if(targets.length===0&&state.scrap<PRICE[machine]){
      $("scrap").classList.add("tutorial-highlight");
      $("mining-rate").classList.add("tutorial-highlight");
    }
    if(stage===3){$("power-note").classList.add("tutorial-highlight");$("recovery-rate").classList.add("tutorial-highlight");}
  }else if(isReady(state)){firstTarget=$("revive");firstTarget.classList.add("tutorial-highlight");}
  else{firstTarget=$("recovery-progress");firstTarget.classList.add("tutorial-highlight");}
  if(stageChanged&&window.matchMedia("(max-width: 650px)").matches){
    const target=firstTarget||document.querySelector(`.quick-tool[data-machine="${machine}"]`);
    const instruction=$("mobile-feedback"),rect=target?.getBoundingClientRect();
    if(rect&&(rect.top<0||rect.bottom>innerHeight))
      instruction.scrollIntoView({behavior:"instant",block:"start",inline:"nearest"});
  }
}
function startWalkthrough(){
  if(isCampaign(state)){
    if(state.campaign.phase!=="open"){
      closeGuide(true);render(true);return;
    }
    if(!practiceMode){
      state.savedAt=now();
      practiceReturn={state,tutorialRecord,tutorialActive,tutorialFinished,tutorialInitialRegion,lastVerifiedSave,storageUnavailable,saveWriteProtected};
      practiceMode=true;tutorialActive=false;tutorialFinished=false;state=freshCampaign();selected=Machine.Generator;
      closeGuide(true);render(true);
      if(window.matchMedia("(max-width: 650px)").matches)$("mission-title").scrollIntoView({behavior:"instant",block:"start"});
      return;
    }
    closeGuide(true);render(true);return;
  }
  if(tutorialActive){closeGuide(true);render(true);return;}
  const savedTutorialFinished=tutorialFinished;
  tutorialFinished=false;
  if(allowFirstTutorialStart){
    tutorialActive=true;
    tutorialInitialRegion=state.region;
    writeTutorialRecord({active:true,complete:false,mode:"live",initialRegion:tutorialInitialRegion});
    allowFirstTutorialStart=false;
  }else{
    state.savedAt=now();
    practiceReturn={state,tutorialRecord,tutorialActive,tutorialFinished:savedTutorialFinished,tutorialInitialRegion,lastVerifiedSave,storageUnavailable,saveWriteProtected};
    practiceMode=true;tutorialActive=false;state=freshCampaign();selected=Machine.Generator;
    tutorialInitialRegion=state.region;
  }
  closeGuide(true);render(true);
  const firstControl=[...document.querySelectorAll(".tutorial-highlight")].find(el=>el.getClientRects().length>0);
  firstControl?.focus({preventScroll:true});
  if(window.matchMedia("(max-width: 650px)").matches)
    $("mobile-feedback").scrollIntoView({behavior:"instant",block:"start",inline:"nearest"});
}
function skipWalkthrough(){
  if(practiceMode){returnToSavedWorld();return;}
  tutorialActive=false;tutorialFinished=false;
  writeTutorialRecord({active:false,complete:false,mode:"live",initialRegion:tutorialInitialRegion});
  render(true);
}
function returnToSavedWorld(event){
  if(!practiceMode||!practiceReturn)return;
  const saved=practiceReturn;
  practiceMode=false;state=saved.state;selected=Machine.Generator;
  tutorialRecord=saved.tutorialRecord;tutorialActive=saved.tutorialActive;tutorialFinished=saved.tutorialFinished;tutorialInitialRegion=saved.tutorialInitialRegion;
  lastVerifiedSave=saved.lastVerifiedSave;storageUnavailable=saved.storageUnavailable;saveWriteProtected=saved.saveWriteProtected;
  practiceReturn=null;
  const returned=applyOfflineProgress(now());
  render(true);persist();
  if(returned.appliedSeconds>2)showOfflineRecap(returned);
  if(event?.detail===0)$("how-to-play").focus({preventScroll:true});
}
function persist(){
  if(practiceMode)return;
  state.savedAt=now();
  if(saveWriteProtected)return;
  const serialized=JSON.stringify(state);
  let current;
  try{current=window.localStorage.getItem(SAVE);}
  catch(e){markStorageUnavailable(e,unreadableSaveWarning,true);return;}
  if(current!==lastVerifiedSave){
    markStorageUnavailable(new Error("Saved world data changed outside this session."),changedSaveWarning,true);
    return;
  }
  try{window.localStorage.setItem(SAVE,serialized);}
  catch(e){markStorageUnavailable(e,storageWarning);return;}
  let saved;
  try{saved=window.localStorage.getItem(SAVE);}
  catch(e){markStorageUnavailable(e,unverifiedSaveWarning,true);return;}
  if(saved!==serialized){
    markStorageUnavailable(new Error("Saved world data did not match the current session."),unverifiedSaveWarning,true);
    return;
  }
  lastVerifiedSave=serialized;
  markStorageAvailable();
}
const readable=n=>n>=1e6?(n/1e6).toFixed(1)+"M":n>=1e3?(n/1e3).toFixed(1)+"K":Number(n).toFixed(0);
function machineStatuses(type,index,r){
  if(type===Machine.Empty)return [];
  if(!r.connected[index])return ["disconnected"];
  const statuses=[];
  if(type===Machine.Restorer&&state.scrap<=0&&r.used>0){
    if(r.mined===0)statuses.push("fuel-starved");
    else if(r.mined<r.used)statuses.push("fuel-limited");
  }
  if((type===Machine.Extractor||type===Machine.Restorer)&&r.fraction<1)statuses.push("throttled");
  return statuses.length?statuses:["active"];
}
function effectiveRecoveryRate(r){
  return state.scrap<=0&&r.used>r.mined&&r.used>0?
    r.restored*Math.min(1,r.mined/r.used):r.restored;
}
function machineStatusLabel(statuses){
  if(statuses.includes("disconnected"))return "OFF";
  if(statuses.includes("fuel-starved"))return "FUEL";
  if(statuses.includes("fuel-limited")&&statuses.includes("throttled"))return "FUEL/LOW";
  if(statuses.includes("fuel-limited"))return "LIMIT";
  if(statuses.includes("throttled"))return "LOW";
  return statuses.includes("active")?"ACTIVE":"";
}
function machineStatusDescription(statuses,r){
  const descriptions=[];
  if(statuses.includes("disconnected"))descriptions.push("disconnected from the reactor");
  if(statuses.includes("fuel-starved"))descriptions.push("fuel-starved; no scrap or mining available");
  if(statuses.includes("fuel-limited"))descriptions.push("fuel-limited; mining supplies "+Math.round(Math.min(1,r.mined/r.used)*100)+" percent of LIFE demand");
  if(statuses.includes("throttled"))descriptions.push("power-throttled to "+Math.round(r.fraction*100)+" percent output");
  if(statuses.includes("active"))descriptions.push("active and connected");
  return descriptions.join("; ");
}
function machineExplanation(r){
  if(selected===Machine.Empty)return "REMOVE · tap a structure to clear it; choose a machine to inspect its status.";
  const machines=[];
  for(let i=0;i<state.cells.length;i++)if(state.cells[i]===selected)machines.push(i);
  if(!machines.length)return words[selected]+" · none built yet. Choose an empty tile to add one.";
  const counts={active:0,disconnected:0,"fuel-starved":0,"fuel-limited":0,throttled:0};
  for(const i of machines)for(const status of machineStatuses(selected,i,r))counts[status]++;
  const summary=Object.entries(counts).filter(([,count])=>count)
    .map(([name,count])=>count+" "+({"fuel-starved":"fuel-starved","fuel-limited":"fuel-limited",throttled:"power-throttled"}[name]||name)).join(", ");
  const details=[];
  if(counts.disconnected)details.push("connect a RELAY path to the reactor");
  if(counts["fuel-starved"])details.push("no scrap or mining is available to LIFE");
  if(counts["fuel-limited"])details.push("mining supplies "+Math.round(Math.min(1,r.mined/r.used)*100)+"% of LIFE fuel use");
  if(counts.throttled)details.push("connected output is limited to "+Math.round(r.fraction*100)+"% by power capacity");
  if(selected===Machine.Restorer){
    const fuelLimited=state.scrap<=0&&r.used>r.mined;
    const rate=effectiveRecoveryRate(r);
    details.push("network recovery "+(fuelLimited?"currently":"up to")+" +"+rate.toFixed(2)+"/s");
  }else if(counts.active){
    if(selected===Machine.Extractor)details.push("network mining +"+r.mined.toFixed(2)+" scrap/s");
    else if(selected===Machine.Generator)details.push("usable network capacity "+r.capacity);
    else if(selected===Machine.Relay)details.push("connected to the reactor network");
    else details.push("reactor network online");
  }
  return words[selected]+" · "+summary+(details.length?" · "+details.join("; "):"")+".";
}
function readableEta(seconds){
  let total=Math.ceil(seconds);
  if(total<60)return total+"s";
  const minutes=Math.floor(total/60),remainingSeconds=total%60;
  if(minutes<60)return minutes+"m"+(remainingSeconds?" "+remainingSeconds+"s":"");
  const hours=Math.floor(minutes/60),remainingMinutes=minutes%60;
  return hours+"h"+(remainingMinutes?" "+remainingMinutes+"m":"");
}
function mobileFeedback(message,warning=false){
  const inline=$("mobile-feedback");
  if(!inline)return;
  if(inline.textContent!==message)inline.textContent=message;
  inline.classList.toggle("warning",warning);
}
function notice(message,warning=false){
  const el=$("toast");el.textContent=message;
  el.style.borderColor=warning?"#e09b88":"#599a8e";
  el.classList.add("visible");
  // On small screens the fixed toast is hidden, and a reserved feedback line
  // beside the toolbelt provides the same message without covering content.
  // Successful guided actions advance the stage; keep that instruction as the
  // sole live update instead of briefly announcing the generic toast as well.
  if((!tutorialActive&&!tutorialFinished)||warning)mobileFeedback(message,warning);
  clearTimeout(toastTimeout);
  toastTimeout=setTimeout(()=>{
    el.classList.remove("visible");
    if(tutorialActive||tutorialFinished)renderTutorial();
    else mobileFeedback($("selected-tool-text")?.textContent||"Choose a tool and tap an empty square.");
  },3500);
}
const tiles=[];
for(let i=0;i<25;i++){
  const btn=document.createElement("button");
  btn.type="button";btn.className="tile empty";btn.dataset.index=i;
  const symbol=document.createElement("span");symbol.className="tile-icon";
  const label=document.createElement("span");label.className="tile-name";
  const status=document.createElement("span");status.className="tile-status";status.setAttribute("aria-hidden","true");
  btn.append(symbol,label,status);
  btn.addEventListener("click",event=>tap(i,event));
  $("tiles").append(btn);tiles.push({btn,symbol,label});
}
function choose(machine,manual=true){
  selected=machine;
  $("machine-readout").textContent=machineExplanation(rates(state));
  document.querySelectorAll(".tool, .quick-tool").forEach(el=>{
    el.setAttribute("aria-pressed",String(Number(el.dataset.machine)===selected));
  });
  const hint=suggested(state),goal=mission(state);
  const guided=(goal===0&&selected===Machine.Generator)||
    (goal===1&&selected===Machine.Extractor);
  $("selected-tool-text").textContent=selected===Machine.Empty?
    "REMOVE selected · tap a structure":
    guided&&hint>=0?
      words[selected]+" selected · tap the glowing NEXT tile":
      words[selected]+" selected · tap an empty square";
  if(manual)notice(selected===Machine.Empty?
    "Tap a structure to remove it.":
    guided&&hint>=0?
      words[selected]+" selected. Tap the glowing NEXT tile.":
      words[selected]+" selected. Now tap an empty square.");
}
document.querySelectorAll(".tool, .quick-tool").forEach(el=>el.addEventListener("click",()=>choose(Number(el.dataset.machine))));
$("campaign-action").addEventListener("click",runCampaignAction);
function tap(index,event){
  if(isCampaign(state)&&state.campaign.phase!=="open"){
    if(index===campaignLayout().target)runCampaignAction(event);
    return;
  }
  const previousTutorialStage=tutorialActive?tutorialStage():-1;
  const result=place(state,index,selected);
  notice(result.message,!result.ok);
  if(result.ok){
    persist();render(true);
    if(event?.detail===0&&tutorialActive&&tutorialStage()!==previousTutorialStage){
      const next=[...document.querySelectorAll(".tutorial-highlight")].find(el=>el.getClientRects().length>0);
      next?.focus({preventScroll:true});
    }
  }
}
$("upgrade-mining").addEventListener("click",()=>{
  const r=upgrade(state,true);notice(r.message,!r.ok);if(r.ok){persist();render(true);}
});
$("upgrade-power").addEventListener("click",()=>{
  const r=upgrade(state,false);notice(r.message,!r.ok);if(r.ok){persist();render(true);}
});
$("revive").addEventListener("click",event=>{
  const previousScrap=state.scrap;
  const r=claim(state);
  if(!r.ok)notice(r.message,true);
  if(r.ok){
    persist();render(true);
    showClaimRecap(state.scrap-previousScrap);
    if(event.detail===0)$("region-state").focus({preventScroll:true});
  }
});
$("dismiss-recap").addEventListener("click",()=>{$("progress-recap").hidden=true;});
$("repair").addEventListener("click",()=>{
  if(!window.confirm("Reset the network to its starting layout? Structures will not be refunded. Region and upgrades stay saved."))return;
  const r=resetGrid(state);notice(r.message);persist();render(true);
});
const welcome=$("welcome");
function openGuide(){
  if(isCampaign(state)){
    $("begin-label").textContent=state.campaign.phase==="open"&&!practiceMode?"REPLAY OPENING IN PRACTICE":"CONTINUE OPENING";
    $("dismiss-help").textContent="Return to the greenhouse";
    $("welcome-copy").textContent=state.campaign.phase==="open"&&!practiceMode?
      "Replay the first repair, earned MINE kit, region awakening and POWER unlock in a temporary world. Your current save stays separate.":
      "Bring the greenhouse online, earn a MINE kit through restoration, awaken the first region, then introduce POWER when the reactor is strained.";
    document.querySelector(".guide-steps").hidden=true;
  }else{
    $("dismiss-help").textContent="Explore without walkthrough";
    document.querySelector(".guide-steps").hidden=false;
  $("begin-label").textContent=tutorialActive?"RESUME WALKTHROUGH":allowFirstTutorialStart?"START GUIDED WALKTHROUGH":"REPLAY IN PRACTICE WORLD";
  $("welcome-copy").textContent=tutorialActive?
    "Your walkthrough resumes from the actual machines and progress in this saved world.":
    allowFirstTutorialStart?
      "Follow five goals on the real grid. Each completes only after the connected machines or recovery meet its goal.":
      "Replay with a temporary practice network. Practice changes never transfer; reloading or choosing Return brings you back to your saved world.";
  }
  if(typeof welcome.showModal==="function"&&!welcome.open)welcome.showModal();
  else welcome.setAttribute("open","");
}
function closeGuide(startPlaying=false){
  storageSetFirst("yes");
  firstPreference="yes";
  if(!startPlaying&&!tutorialActive)allowFirstTutorialStart=false;
  if(typeof welcome.close==="function"&&welcome.open)welcome.close();
  else welcome.removeAttribute("open");
  // The visual planet intro is tall on a phone. After onboarding, bring the
  // grid-local recovery status into view with the board just below it. This
  // affects navigation only, never the saved world.
  if(startPlaying){
    const firstPlayTarget=window.matchMedia("(max-width: 650px)").matches?
      document.querySelector("#mobile-feedback"):
      document.querySelector(".network-card");
    firstPlayTarget?.scrollIntoView({
      behavior:"instant",block:"start"
    });
  }
}
$("how-to-play").addEventListener("click",openGuide);
$("begin").addEventListener("click",startWalkthrough);
$("dismiss-help").addEventListener("click",()=>closeGuide(false));
$("tutorial-skip").addEventListener("click",skipWalkthrough);
$("tutorial-return").addEventListener("click",returnToSavedWorld);
$("tutorial-done").addEventListener("click",()=>{tutorialFinished=false;render(true);});
welcome.addEventListener("cancel",()=>{storageSetFirst("yes");firstPreference="yes";if(!tutorialActive)allowFirstTutorialStart=false;});
if(!firstPreference&&!isCampaign(state))openGuide();
if(away>2){notice("Offline progress applied.");showOfflineRecap(offlineResult);}
function render(force=false){
  if(!valid(state)){console.error("Invalid world, resetting safely");state=fresh();persist();}
  const campaignOpening=renderCampaign();
  const r=rates(state),m=mission(state),ready=isReady(state),percentage=Math.min(100,100*state.restoration/TARGET(state.region));
  const explanation=machineExplanation(r);
  if($("machine-readout").textContent!==explanation)$("machine-readout").textContent=explanation;
  $("sector").textContent="SECTOR "+String(state.region+1).padStart(2,"0");
  $("scrap").textContent=readable(state.scrap);
  const totalMachines=state.cells.filter(type=>type!==Machine.Empty&&type!==Machine.Core).length;
  const connectedMachines=state.cells.reduce((count,type,index)=>
    count+(type!==Machine.Empty&&type!==Machine.Core&&r.connected[index]?1:0),0);
  const disconnectedMachines=totalMachines-connectedMachines;
  $("power").textContent=connectedMachines+" / "+totalMachines;
  $("mining-rate").textContent="+"+r.mined.toFixed(1)+" scrap / second";
  const networkNote=disconnectedMachines?
    disconnectedMachines+" machine"+(disconnectedMachines===1?" is":"s are")+" disconnected. Build a RELAY path to the reactor.":
    "All placed machines are connected.";
  const output=Math.round(r.fraction*100);
  const capacityNote=r.fraction<1?
    "Power shortage: "+r.consumers+" connected consumers for usable capacity "+r.capacity+"; output "+output+"%.":
    "Power: "+r.consumers+" connected consumers, usable capacity "+r.capacity+"; output "+output+"%.";
  $("power-note").textContent=networkNote+" "+capacityNote;
  $("restored-percent").textContent=Math.floor(percentage)+"%";
  $("recovery-fill").style.width=percentage+"%";
  $("recovery-progress").setAttribute("aria-valuenow",String(Math.floor(percentage)));
  $("recovery-rate").textContent="Restore +"+effectiveRecoveryRate(r).toFixed(2)+"/s";
  const eta=estimateRecoverySeconds(state);
  const target=TARGET(state.region);
  const hasLife=state.cells.includes(Machine.Restorer);
  const hasMine=state.cells.includes(Machine.Extractor);
  const hasConnectedMine=state.cells.some((type,index)=>type===Machine.Extractor&&r.connected[index]);
  $("region-state").textContent=ready?"Ready · tap AWAKEN REGION":eta===null?
    (hasLife?"Reconnect a LIFE engine":"Build a LIFE engine"):
    !Number.isFinite(target)||Number.isNaN(eta)?"Active time estimate unavailable":
    eta===Infinity&&r.mined>0?"Active time estimate unavailable":
    eta===Infinity?(hasMine&&!hasConnectedMine?"Reconnect a MINE to fuel recovery":"Connect a MINE to fuel recovery"):
    eta>MAX_DISPLAYED_ETA_SECONDS?">1y active to awaken":
    "~"+readableEta(eta)+" active to awaken";
  if(campaignOpening){
    const phase=state.campaign.phase;
    const campaignStatus={
      repair:"Greenhouse dark · relay repair needed",
      restore:state.restoration>=5?"MINE kit earned · installing now":
        Math.floor(state.restoration)+" / 5 points to MINE kit",
      "mine-kit":"MINE kit earned · one-time reward",
      "first-region":ready?"First region ready to awaken": "First region · "+Math.floor(percentage)+"% restored",
      expansion:"New site unlocked · second MINE needed",
      power:"Power output "+Math.round(r.fraction*100)+"% · POWER can relieve the overload"
    };
    $("region-state").textContent=campaignStatus[phase]||"Opening objective";
  }
  $("revive").hidden=!ready||campaignOpening&&state.campaign.phase!=="first-region";
  $("revive").disabled=!ready||campaignOpening&&state.campaign.phase!=="first-region";
  $("revive-label").textContent=ready?"AWAKEN REGION "+String(state.region+1).padStart(2,"0"):"AWAKEN REGION";
  $("revive-hint").hidden=!ready;
  if(m!==lastGoal){
    if(m===0)choose(Machine.Generator,false);
    if(m===1)choose(Machine.Extractor,false);
    lastGoal=m;
  }
  // A mission change can happen without a new tool selection. Do not leave
  // the "glowing NEXT tile" prompt on screen when no suggestion exists.
  if(ready)
    $("selected-tool-text").textContent="REGION READY · tap AWAKEN REGION here";
  else if(m>=2)
    $("selected-tool-text").textContent=selected===Machine.Empty?
      "REMOVE selected · tap a structure":words[selected]+" selected · tap an empty square";
  if(campaignOpening){
    const campaignHint={
      repair:"Repair the highlighted broken relay.",
      restore:"Relay connected · LIFE is restoring the greenhouse.",
      "mine-kit":"Starter MINE kit earned · install it at the highlighted site.",
      "first-region":"MINE connected · LIFE is restoring the first region.",
      expansion:"New frontier open · install the highlighted MINE.",
      power:"Reactor strained · install POWER beside LIFE."
    }[state.campaign.phase];
    if(campaignHint)setTextIfChanged($("selected-tool-text"),campaignHint);
  }
  if(!campaignOpening&&!tutorialActive&&!tutorialFinished){
    setTextIfChanged($("mission-number"),String(Math.min(m+1,4)).padStart(2,"0"));
    setTextIfChanged($("mission-title"),ready?"The world is ready. Awaken it!":stepTitles[m]);
    setTextIfChanged($("mission-description"),ready?"Tap the glowing AWAKEN REGION button by the grid. No ads, no payment—this is your reward.":stepDescriptions[m]);
    [...$("mission-stages").children].forEach((child,i)=>{const next=i<m?"done":i===m?"active":"";if(child.className!==next)child.className=next;});
  }
  const hint=suggested(state),layout=campaignLayout(),phase=state.campaign?.phase||"legacy";
  const cellKey=state.cells.join(",")+"|"+hint+"|"+(state.scrap>0?"fuel":"empty")+"|"+r.fraction+"|"+phase;
  if(force||cellKey!==lastCells){
    lastCells=cellKey;
    const visible=new Map(layout.indices.map((index,position)=>[index,{column:position%layout.columns+1,row:Math.floor(position/layout.columns)+1}]));
    const links=r.connected;
    tiles.forEach(({btn,symbol,label},i)=>{
      const type=state.cells[i];
      const statuses=machineStatuses(type,i,r);
      const statusLabel=machineStatusLabel(statuses);
      const place=visible.get(i),campaignTarget=campaignOpening&&i===layout.target;
      const campaignActionLabel=campaignTarget?({repair:"REPAIR","mine-kit":"MINE",expansion:"MINE",power:"POWER"}[phase]||""):"";
      btn.style.display=place?"flex":"none";
      if(place){btn.style.gridColumn=String(place.column);btn.style.gridRow=String(place.row);}
      btn.disabled=campaignOpening&&!campaignTarget;
      btn.className="tile "+kinds[type]+statuses.map(status=>" state-"+status).join("")+(campaignTarget||!campaignOpening&&i===hint&&type===0?" suggested":"");
      if(campaignActionLabel)btn.dataset.campaignAction=campaignActionLabel;else delete btn.dataset.campaignAction;
      symbol.textContent=glyph[type];label.textContent=type===0?"":words[type];
      btn.querySelector(".tile-status").textContent=statusLabel;
      const accessibleStatus=machineStatusDescription(statuses,r);
      const campaignLabel=phase==="repair"&&i===13?"Broken greenhouse relay site; repair the relay here":
        phase==="mine-kit"&&i===17?"Highlighted site for your earned starter MINE":
        phase==="expansion"&&i===7?"Newly opened site for the second MINE":
        phase==="power"&&i===9?"Highlighted connected site for POWER beside the greenhouse":null;
      const coordinates=" row "+(Math.floor(i/5)+1)+", column "+(i%5+1);
      const campaignAccessibleLabel=type!==Machine.Empty?
        "Tile with "+words[type]+coordinates+(accessibleStatus?"; "+accessibleStatus:"")+"; opening structure" :
        campaignLabel||"Empty sealed site; opens later";
      btn.setAttribute("aria-label",campaignOpening?campaignAccessibleLabel:
        (type===0?"Empty tile":"Tile with "+words[type])+" row "+(Math.floor(i/5)+1)+", column "+(i%5+1)+(statuses.length?"; "+accessibleStatus:"")+(i===hint?", suggested next tile":""));
      btn.title=campaignOpening?(type!==Machine.Empty?words[type]+coordinates+(accessibleStatus?" · "+accessibleStatus:""):campaignLabel||"Empty site; opens later"):
        type===0?"Tap to build "+words[selected]:words[type]+(statuses.length?" · "+accessibleStatus:"");
    });
    const lines=[];
    const shown=new Set(layout.indices);
    for(let i=0;i<25;i++)if(links[i]){
      for(const to of [i+1,i+5]){
        if(to>=25||to===i+1&&i%5===4||!links[to]||!shown.has(i)||!shown.has(to))continue;
        const a=visible.get(i),b=visible.get(to);
        const x1=(a.column-.5)*500/layout.columns,y1=(a.row-.5)*500/layout.rows;
        const x2=(b.column-.5)*500/layout.columns,y2=(b.row-.5)*500/layout.rows;
        lines.push('<line class="wire" x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'"></line>');
        lines.push('<line class="wire-live" x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'"></line>');
      }
    }
    $("network-lines").innerHTML=lines.join("");
  }
  document.querySelectorAll(".tool, .quick-tool").forEach(el=>{
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
  // One planet spans three restoration regions in the Unity game.
  // Reviving a region must preserve the visual reward; only moving to the
  // next planet may reset its environment. Keep the same 24 recovery buckets
  // as the native renderer to prevent independent browser drift.
  const planetIndex=Math.floor(state.region/3);
  const planetRecovery=((state.region%3)+percentage/100)/3;
  const campaignPhase=campaignOpening?state.campaign.phase:null;
  const firstCampaignPlanet=campaignOpening&&state.region===0;
  const planetVisualRecovery=firstCampaignPlanet?
    campaignPhase==="repair"?0:Math.min(1/3,.09+(1/3-.09)*percentage/100):planetRecovery;
  const planetBucket=Math.max(0,Math.min(24,Math.floor(planetVisualRecovery*24)));
  const planetKey=planetIndex*100+planetBucket;
  if(planetKey!==lastPlanet||force){
    lastPlanet=planetKey;
    drawPlanet(planetIndex,planetBucket/24);
  }
  $("planet-caption").textContent=campaignOpening?
    campaignPhase==="repair"?"GREENHOUSE: DARK":campaignPhase==="power"?"NETWORK: OVERLOADED":
      campaignPhase==="expansion"?"FRONTIER: OPEN":"GREENHOUSE: RESTORING":
    planetRecovery>=.96?"ATMOSPHERE: RENEWED":planetRecovery>=.2?"ATMOSPHERE: RECOVERING":"ATMOSPHERE: DORMANT";
  $("planet-tag").lastChild.textContent=campaignOpening?
    campaignPhase==="repair"?" GREENHOUSE OFFLINE":campaignPhase==="power"?" REACTOR OVERLOADED":
      campaignPhase==="expansion"?" NEW SITE OPEN":" GREENHOUSE ONLINE":
    ready?" READY TO AWAKEN":" RESTORATION ACTIVE";
  $("planet-name").textContent=["AURORA-9","SOLACE","VERDANT","HOLLOW SKY","ECHO PRIME","NEW DAWN"][planetIndex%6];
  if(!$("toast").classList.contains("visible")&&!tutorialActive&&!tutorialFinished)
    mobileFeedback($("selected-tool-text").textContent);
  renderTutorial();
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
  else{
    if(!practiceMode){
      const returned=applyOfflineProgress(now());
      if(returned.appliedSeconds>3){notice("Offline progress applied.");showOfflineRecap(returned);}
    }
    render(true);lastFrame=0;
  }
});
window.addEventListener("pagehide",persist);
