// Relight browser playtest model. Mirrors Assets/Scripts/Core/WorldModel.cs at
// migration/unity-6000.3-lts@094fb11d; web saves are intentionally separate.
export const Machine=Object.freeze({Empty:0,Core:1,Relay:2,Extractor:3,Restorer:4,Generator:5});
export const PRICE=Object.freeze({[Machine.Relay]:4,[Machine.Extractor]:12,[Machine.Restorer]:18,[Machine.Generator]:15});
export const WIDTH=5, MAX_OFFLINE=8*3600, MINING_OFFLINE=30*60;
export const TARGET=region=>100*(1+region*0.5);
export const CAMPAIGN_VERSION=3;
export const CAMPAIGN_PHASES=Object.freeze(["repair","restore","mine-kit","mine-disconnected","ridge-link","first-region","investment-choice","field-link","frontier-life","expansion","power","investment-growth","investment-second","open"]);
const LEGACY_CAMPAIGN_PHASES=new Set(["repair","restore","mine-kit","first-region","expansion","power","open"]);
const VERSION_TWO_PHASES=new Set(["repair","restore","mine-kit","first-region","investment-choice","investment-growth","investment-second","open"]);
const VERSION_THREE_PHASES=new Set(["repair","restore","mine-kit","mine-disconnected","ridge-link","first-region","investment-choice","field-link","frontier-life","open"]);
const INTRO_AREA=new Set([12,13,14,17,18,19]);
const EXPANDED_AREA=new Set([7,8,9,12,13,14,17,18,19]);
export const STARTER_MINE_SITES=Object.freeze([8,10,17]);
export const isCampaign=s=>!!s?.campaign;
export function freshCampaign(){
  const cells=Array(25).fill(0);
  cells[12]=Machine.Core;cells[14]=Machine.Restorer;
  return {cells,scrap:10,restoration:0,region:0,extractorLevel:0,powerLevel:0,savedAt:0,totalPlayed:0,
    campaign:{version:CAMPAIGN_VERSION,phase:"repair",mineKit:"locked",firstInvestment:null,starterMineSite:null,ridgeRelay:false,fieldRelay:false}};
}
export function freshVersionTwoCampaign(){
  const s=freshCampaign();
  s.campaign.version=2;
  delete s.campaign.starterMineSite;
  delete s.campaign.ridgeRelay;
  delete s.campaign.fieldRelay;
  return s;
}
export function fresh(){
  const cells=Array(25).fill(0);
  cells[12]=Machine.Core; cells[11]=Machine.Extractor; cells[13]=Machine.Relay; cells[14]=Machine.Restorer;
  return {cells,scrap:30,restoration:0,region:0,extractorLevel:0,powerLevel:0,savedAt:0,totalPlayed:0};
}
export function valid(s){
  if(!s||!Array.isArray(s.cells)||s.cells.length!==25||s.cells[12]!==1)return false;
  if(!s.cells.every(v=>Number.isInteger(v)&&v>=0&&v<=5))return false;
  if(![s.scrap,s.restoration,s.region,s.extractorLevel,s.powerLevel,s.savedAt,s.totalPlayed]
      .every(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0))return false;
  if(![s.region,s.extractorLevel,s.powerLevel,s.savedAt].every(Number.isInteger))return false;
  if(s.campaign!==undefined){
    const c=s.campaign;
    if(!c||typeof c!=="object"||Array.isArray(c)||![1,2,CAMPAIGN_VERSION].includes(c.version)||
      !(c.version===1?LEGACY_CAMPAIGN_PHASES:c.version===2?VERSION_TWO_PHASES:VERSION_THREE_PHASES).has(c.phase)||!(["locked","earned","redeemed"].includes(c.mineKit)))return false;
    if(c.version>=2&&(!Object.hasOwn(c,"firstInvestment")||(c.firstInvestment!==null&&c.firstInvestment!=="mine"&&c.firstInvestment!=="power")))return false;
    if(c.version===3&&(!Object.hasOwn(c,"starterMineSite")||
      (c.starterMineSite!==null&&!STARTER_MINE_SITES.includes(c.starterMineSite))||
      !Object.hasOwn(c,"ridgeRelay")||typeof c.ridgeRelay!=="boolean"||
      !Object.hasOwn(c,"fieldRelay")||typeof c.fieldRelay!=="boolean"))return false;
    if(c.version===2&&["repair","restore","mine-kit","mine-disconnected","first-region"].includes(c.phase)&&c.firstInvestment!==null)return false;
    if(c.version===2&&["investment-choice","investment-growth","investment-second"].includes(c.phase)){
      const links=connected(s);
      if(s.cells[13]!==Machine.Relay||s.cells[14]!==Machine.Restorer||!links[13]||!links[14])return false;
    }
    const extraMachines=s.cells.filter((v,i)=>v!==Machine.Empty&&i!==12);
    if(c.version<3){
      if(c.phase==="repair"&&(s.region!==0||c.mineKit!=="locked"||s.cells[13]!==0||s.cells[14]!==Machine.Restorer||extraMachines.length!==1))return false;
      if(c.phase==="restore"&&(s.region!==0||s.restoration>=5||c.mineKit!=="locked"||s.cells[13]!==Machine.Relay||s.cells[14]!==Machine.Restorer||extraMachines.length!==2))return false;
      if(c.phase==="mine-kit"&&(s.region!==0||c.mineKit!=="earned"||s.restoration<5||s.cells[13]!==Machine.Relay||s.cells[14]!==Machine.Restorer||s.cells[17]!==0||extraMachines.length!==2))return false;
      if(c.phase==="first-region"&&(s.region!==0||c.mineKit!=="redeemed"||s.cells[13]!==Machine.Relay||s.cells[14]!==Machine.Restorer||s.cells[17]!==Machine.Extractor||extraMachines.length!==3))return false;
    }
    if(c.version===1){
      if(c.phase==="expansion"&&(s.region!==1||c.mineKit!=="redeemed"||s.cells[13]!==Machine.Relay||s.cells[14]!==Machine.Restorer||s.cells[17]!==Machine.Extractor||s.cells[7]!==0||s.cells[9]!==0))return false;
      if(c.phase==="power"&&(s.region!==1||c.mineKit!=="redeemed"||s.cells[17]!==Machine.Extractor||s.cells[7]!==Machine.Extractor||s.cells[9]!==0))return false;
      if(c.phase==="open"&&(s.region<1||c.mineKit!=="redeemed"))return false;
    }else if(c.version===2){
      if(c.phase==="investment-choice"&&(s.region!==1||c.mineKit!=="redeemed"||c.firstInvestment!==null||s.cells[17]!==Machine.Extractor||s.cells[7]!==0||s.cells[9]!==0||extraMachines.length!==3))return false;
      if(c.phase==="investment-growth"){
        if(s.region!==1||c.mineKit!=="redeemed"||s.cells[17]!==Machine.Extractor||!c.firstInvestment||s.restoration>=25||extraMachines.length!==4)return false;
        if(c.firstInvestment==="mine"&&(s.cells[7]!==Machine.Extractor||s.cells[9]!==0))return false;
        if(c.firstInvestment==="power"&&(s.cells[9]!==Machine.Generator||s.cells[7]!==0))return false;
      }
      if(c.phase==="investment-second"){
        if(s.region!==1||c.mineKit!=="redeemed"||s.cells[17]!==Machine.Extractor||s.restoration<25||!c.firstInvestment||extraMachines.length!==4)return false;
        if(c.firstInvestment==="mine"&&(s.cells[7]!==Machine.Extractor||s.cells[9]!==0))return false;
        if(c.firstInvestment==="power"&&(s.cells[9]!==Machine.Generator||s.cells[7]!==0))return false;
      }
      if(c.phase==="open"&&(s.region<1||c.mineKit!=="redeemed"||!c.firstInvestment))return false;
    }else{
      const mineSites=s.cells.map((type,index)=>type===Machine.Extractor?index:-1).filter(index=>index>=0);
      const common=s.region===0&&s.cells[12]===Machine.Core&&s.cells[14]===Machine.Restorer;
      const poweredAnchors=s.cells[13]===Machine.Relay&&connected(s)[13]&&s.cells[14]===Machine.Restorer&&connected(s)[14];
      if(["repair","restore","mine-kit","mine-disconnected","ridge-link","investment-choice"].includes(c.phase)&&c.firstInvestment!==null)return false;
      if(["repair","restore","mine-kit","mine-disconnected"].includes(c.phase)&&c.starterMineSite!==null)return false;
      if(c.phase==="repair"&&(!common||c.mineKit!=="locked"||s.cells[13]!==Machine.Empty||c.ridgeRelay||c.fieldRelay||extraMachines.length!==1))return false;
      if(c.phase==="restore"&&(!common||s.cells[13]!==Machine.Relay||!poweredAnchors||c.mineKit!=="locked"||c.ridgeRelay||c.fieldRelay||s.restoration>=5||extraMachines.length!==2))return false;
      if(c.phase==="mine-kit"&&(!common||!poweredAnchors||c.mineKit!=="earned"||c.ridgeRelay||c.fieldRelay||s.restoration<5||mineSites.length!==0||extraMachines.length!==2))return false;
      if(c.phase==="mine-disconnected"){
        const mineIndex=mineSites[0];
        if(!common||!poweredAnchors||c.mineKit!=="earned"||c.ridgeRelay||c.fieldRelay||c.starterMineSite!==null||s.restoration<5||mineSites.length!==1||!STARTER_MINE_SITES.includes(mineIndex)||connected(s)[mineIndex]||extraMachines.length!==3)return false;
      }
      if(c.phase==="ridge-link"){
        const mineIndex=mineSites[0];
        if(!common||!poweredAnchors||c.mineKit!=="redeemed"||c.ridgeRelay||c.fieldRelay||c.firstInvestment!==null||mineSites.length!==1||c.starterMineSite!==mineIndex||!connected(s)[mineIndex]||s.cells[18]!==Machine.Empty||extraMachines.length!==3)return false;
      }
      if(c.phase==="first-region"||c.phase==="investment-choice"||c.phase==="field-link"){
        const mineIndex=mineSites[0];
        if(!common||!poweredAnchors||c.mineKit!=="redeemed"||!c.ridgeRelay||mineSites.length<1||
          c.starterMineSite!==mineIndex||!connected(s)[mineIndex]||s.cells[18]!==Machine.Relay||extraMachines.length<4)return false;
        if(c.phase==="first-region"&&c.firstInvestment===null&&(s.cells[23]!==Machine.Empty||s.cells[9]!==Machine.Empty||mineSites.length!==1||c.fieldRelay||s.cells[19]!==Machine.Empty))return false;
        if(c.phase==="first-region"&&c.firstInvestment!==null){
          if(c.firstInvestment==="mine"&&(s.cells[23]!==Machine.Extractor||s.cells[9]!==Machine.Empty||mineSites.length!==2))return false;
          if(c.firstInvestment==="power"&&(s.cells[9]!==Machine.Generator||s.cells[23]!==Machine.Empty||mineSites.length!==1))return false;
          if(c.fieldRelay?s.cells[19]!==Machine.Relay:s.cells[19]!==Machine.Empty)return false;
        }
        if(c.phase==="investment-choice"&&(s.restoration<25||s.scrap<15||c.firstInvestment!==null||s.cells[23]!==Machine.Empty||s.cells[9]!==Machine.Empty||mineSites.length!==1||c.fieldRelay||s.cells[19]!==Machine.Empty))return false;
        if(c.phase==="field-link"&&(!c.firstInvestment||s.restoration<50||s.scrap<PRICE[Machine.Relay]||s.cells[c.firstInvestment==="mine"?23:9]!== (c.firstInvestment==="mine"?Machine.Extractor:Machine.Generator)||c.fieldRelay||s.cells[19]!==Machine.Empty||mineSites.length!==(c.firstInvestment==="mine"?2:1)))return false;
      }
      if(c.phase==="frontier-life"&&(!poweredAnchors||s.region<1||c.mineKit!=="redeemed"||!c.firstInvestment||!c.ridgeRelay||!c.fieldRelay||s.cells[19]!==Machine.Relay||s.cells[24]!==Machine.Empty||c.starterMineSite===null||s.cells[c.starterMineSite]!==Machine.Extractor||!connected(s)[c.starterMineSite]))return false;
      if(c.phase==="open"){
        if(s.region<1||c.mineKit!=="redeemed"||!c.firstInvestment||c.starterMineSite===null||!c.ridgeRelay||!c.fieldRelay)return false;
      }
    }
  }
  return true;
}
export const loaded=s=>valid(s)?s:fresh();
export function neighbors(i){
  const x=i%5,y=Math.floor(i/5),out=[];
  if(x>0)out.push(i-1);if(x<4)out.push(i+1);
  if(y>0)out.push(i-5);if(y<4)out.push(i+5);
  return out;
}
export function connected(s){
  const flags=Array(25).fill(false),queue=[12];flags[12]=true;
  while(queue.length){
    const i=queue.shift();
    for(const n of neighbors(i))if(!flags[n]&&s.cells[n]!==Machine.Empty){flags[n]=true;queue.push(n);}
  }
  return flags;
}
function placeStarterMine(s,index,move=false){
  const c=s.campaign;
  if(!Number.isInteger(index)||index<0||index>=25||index===12||!STARTER_MINE_SITES.includes(index))
    return {ok:false,message:"Choose one of the marked starter MINE sockets."};
  if(c.phase==="mine-kit"){
    if(c.mineKit!=="earned"||s.cells.some(type=>type===Machine.Extractor))return {ok:false,message:"The starter MINE kit is not available."};
  }else if((c.phase==="mine-disconnected"||c.phase==="ridge-link")&&move){
    const old=s.cells.findIndex(type=>type===Machine.Extractor);
    if(old<0||s.cells[index]!==Machine.Empty)return {ok:false,message:"Choose an empty socket to move the starter MINE."};
  }else return {ok:false,message:"The starter MINE socket is not available now."};
  if(s.cells[index]!==Machine.Empty)return {ok:false,message:"That socket is occupied. The starter kit remains safe."};
  const nextCells=s.cells.slice();
  if(move){const old=nextCells.findIndex(type=>type===Machine.Extractor);nextCells[old]=Machine.Empty;}
  nextCells[index]=Machine.Extractor;
  const isConnected=connected({...s,cells:nextCells})[index];
  s.cells=nextCells;
  if(isConnected){
    c.mineKit="redeemed";c.starterMineSite=index;c.phase="ridge-link";
    return {ok:true,message:"MINE connected. Place a RELAY at the ridge socket to carry power into the field."};
  }
  c.mineKit="earned";c.starterMineSite=null;
  c.phase="mine-disconnected";
  return {ok:true,message:"MINE is offline here. Move it to a lit socket, or undo the placement and try another site."};
}
function undoStarterMine(s,index){
  if(s.campaign?.phase!=="mine-disconnected"||s.cells[index]!==Machine.Extractor)
    return {ok:false,message:"Only the disconnected starter MINE can be undone."};
  s.cells[index]=Machine.Empty;s.campaign.phase="mine-kit";s.campaign.mineKit="earned";
  return {ok:true,message:"Starter MINE placement undone. The same kit is ready to try another socket."};
}
function adjacent(s,i,m,links){return neighbors(i).filter(n=>links[n]&&s.cells[n]===m).length;}
export function rates(s){
  const links=connected(s);
  let generators=0,consumers=0;
  for(let i=0;i<25;i++)if(links[i]){
    if(s.cells[i]===Machine.Generator)generators++;
    if(s.cells[i]===Machine.Extractor||s.cells[i]===Machine.Restorer)consumers++;
  }
  const capacity=2+generators*2+s.powerLevel;
  const fraction=consumers===0?1:Math.min(1,capacity/consumers);
  let mined=0,used=0,restored=0;
  for(let i=0;i<25;i++)if(links[i]){
    if(s.cells[i]===Machine.Extractor)
      mined+=(1+s.extractorLevel*.5)*(1+Math.min(2,adjacent(s,i,Machine.Relay,links))*.25)*fraction;
    if(s.cells[i]===Machine.Restorer){
      used+=.7*fraction;
      restored+=.7*(1+Math.min(2,adjacent(s,i,Machine.Generator,links))*.2)*fraction;
    }
  }
  return {mined,used,restored,consumers,capacity,fraction,connected:links};
}
export function place(s,index,machine){
  const phase=s.campaign?.phase;
  if(!Number.isInteger(index)||index<0||index>=25||index===12)return {ok:false,message:"The core cannot be replaced."};
  if(![0,2,3,4,5].includes(machine))return {ok:false,message:"Unknown structure."};
  if(s.campaign?.version===3&&phase!=="open"){
    if(phase==="mine-kit"&&machine===Machine.Extractor)return placeStarterMine(s,index);
    if(phase==="mine-disconnected"){
      if(machine===Machine.Empty)return undoStarterMine(s,index);
      if(machine===Machine.Extractor)return placeStarterMine(s,index,true);
    }
    if(phase==="ridge-link"&&machine===Machine.Empty&&index===s.campaign.starterMineSite){
      s.cells[index]=Machine.Empty;s.campaign.starterMineSite=null;s.campaign.mineKit="earned";s.campaign.phase="mine-kit";
      return {ok:true,message:"MINE moved safely. Your earned kit is ready to place again."};
    }
    if(phase==="ridge-link"&&machine===Machine.Extractor)return placeStarterMine(s,index,true);
    if(phase==="ridge-link"&&machine===Machine.Relay&&index===18){}
    else if(phase==="investment-choice"&&((machine===Machine.Extractor&&index===23)||(machine===Machine.Generator&&index===9))){}
    else if(phase==="field-link"&&machine===Machine.Relay&&index===19){}
    else if(phase==="frontier-life"&&machine===Machine.Restorer&&index===24){}
    else return {ok:false,message:"That action has not been introduced yet."};
  }
  if(phase&&phase!=="open"&&s.campaign?.version!==3){
    const campaign=s.campaign;
    const choice=campaign?.version>=2&&phase==="investment-choice"&&
      ((machine===Machine.Extractor&&index===7)||(machine===Machine.Generator&&index===9));
    const second=campaign?.version===2&&phase==="investment-second"&&
      ((campaign.firstInvestment==="mine"&&machine===Machine.Generator&&index===9)||
       (campaign.firstInvestment==="power"&&machine===Machine.Extractor&&index===7));
    const allowed=choice||second||
      (campaign?.version===1&&phase==="expansion"&&machine===Machine.Extractor&&index===7)||
      (campaign?.version===1&&phase==="power"&&machine===Machine.Generator&&index===9);
    if(!allowed)return {ok:false,message:"That action has not been introduced yet."};
  }
  if(machine===Machine.Empty){
    if(s.cells[index]===0)return {ok:false,message:"Nothing to remove here."};
    if(phase==="open"&&s.cells.includes(Machine.Extractor)){
      const trial=s.cells.slice();trial[index]=Machine.Empty;
      const beforeRates=rates(s),afterRates=rates({...s,cells:trial});
      if(beforeRates.mined>0&&afterRates.mined===0)
        return {ok:false,message:"Keep at least one connected MINE so the greenhouse can keep running."};
    }
    s.cells[index]=0;return {ok:true,message:"Structure removed. No scrap refunded."};
  }
  if(s.cells[index]!==0)return {ok:false,message:"Tile occupied. Select REMOVE to clear it."};
  if(s.campaign?.version===3&&phase==="open"){
    const trial=s.cells.slice();trial[index]=machine;const links=connected({...s,cells:trial});
    if(!links[index])return {ok:false,message:"Extend a connected RELAY path before building at that site."};
    if(machine===Machine.Generator&&!neighbors(index).some(n=>s.cells[n]===Machine.Restorer&&links[n]))
      return {ok:false,message:"POWER must connect beside an active LIFE site."};
  }
  if(s.scrap<PRICE[machine])return {ok:false,message:"Not enough scrap. Your mines keep producing."};
  if(phase==="expansion"||phase==="power"||phase==="investment-choice"||phase==="investment-second"||
    phase==="ridge-link"||phase==="field-link"||phase==="frontier-life"){
    const trial=s.cells.slice();trial[index]=machine;
    if(!(EXPANDED_AREA.has(index)||[18,19,23,24].includes(index))||!connected({...s,cells:trial})[index])return {ok:false,message:"That new site is not connected yet."};
    if(machine===Machine.Generator&&!neighbors(index).some(n=>s.cells[n]===Machine.Restorer))return {ok:false,message:"POWER must connect beside the greenhouse."};
  }
  s.scrap-=PRICE[machine];s.cells[index]=machine;
  if(s.campaign?.version===3&&phase==="ridge-link"){
    s.campaign.ridgeRelay=true;s.campaign.phase="first-region";
  }
  if(s.campaign?.version===3&&phase==="field-link"){
    s.campaign.fieldRelay=true;s.campaign.phase="first-region";
  }
  if(s.campaign?.version===3&&phase==="frontier-life")s.campaign.phase="open";
  if(phase==="expansion")s.campaign.phase="power";
  if(phase==="power")s.campaign.phase="open";
  if(phase==="investment-choice"){
    s.campaign.firstInvestment=machine===Machine.Extractor?"mine":"power";
    s.campaign.phase=s.campaign.version===2?(s.restoration>=25?"investment-second":"investment-growth"):
      s.campaign.version===3?"first-region":"open";
  }
  if(phase==="investment-second")s.campaign.phase="open";
  if(!connected(s)[index])
    return {ok:true,message:"Structure built, but it is disconnected. Build a RELAY path back to the reactor to connect it."};
  return {ok:true,message:"Structure built. Watch the network respond."};
}
export function repairGreenhouse(s){
  if(s.campaign?.phase!=="repair")return {ok:false,message:"There is no broken greenhouse relay to repair."};
  if(s.cells[13]!==Machine.Empty||!connected(s)[12])return {ok:false,message:"The relay site is no longer available."};
  if(s.scrap<4)return {ok:false,message:"The relay repair needs 4 scrap."};
  s.scrap-=4;s.cells[13]=Machine.Relay;s.campaign.phase="restore";
  return {ok:true,message:"Relay repaired. The greenhouse is drawing power."};
}
export function redeemMineKit(s,index=17){
  if(s.campaign?.version===3){
    if(s.campaign.phase==="mine-disconnected")return placeStarterMine(s,index,true);
    if(s.campaign.phase==="mine-kit")return placeStarterMine(s,index);
  }
  if(s.campaign?.phase!=="mine-kit"||s.campaign.mineKit!=="earned")return {ok:false,message:"No earned MINE kit is ready."};
  const trial=s.cells.slice();if(Number.isInteger(index)&&index>=0&&index<trial.length)trial[index]=Machine.Extractor;
  if(index!==17||!INTRO_AREA.has(index)||s.cells[index]!==Machine.Empty||!connected({...s,cells:trial})[index])
    return {ok:false,message:"Choose the highlighted connected site for the starter MINE."};
  s.cells[index]=Machine.Extractor;s.campaign.mineKit="redeemed";s.campaign.phase="first-region";
  return {ok:true,message:"Starter MINE installed. It was earned, so no scrap was spent."};
}
export function upgrade(s,mining){
  if(s.campaign&&s.campaign.phase!=="open")return {ok:false,message:"Upgrades unlock after the first POWER installation."};
  const level=mining?s.extractorLevel:s.powerLevel;
  const cost=Math.floor(20*Math.pow(1.8,Math.min(level,40)));
  if(s.scrap<cost)return {ok:false,message:"Not enough scrap for this upgrade."};
  s.scrap-=cost;
  if(mining)s.extractorLevel++;else s.powerLevel++;
  return {ok:true,message:mining?"Mining efficiency increased.":"Power capacity increased."};
}
export function upgradeCost(s,mining){
  return Math.floor(20*Math.pow(1.8,Math.min(mining?s.extractorLevel:s.powerLevel,40)));
}
export const isReady=s=>s.restoration>=TARGET(s.region);
// Estimate active-play time using today's connected network. Stored scrap
// provides a full-rate window before progress slows to the sustainable mining
// rate. A null result means no LIFE is connected. Infinity can mean the current
// stock cannot finish without mining, or arithmetic overflow for extreme saves;
// callers should distinguish those cases using the current production rates.
export function estimateRecoverySeconds(s){
  const remaining=Math.max(0,TARGET(s.region)-s.restoration);
  if(remaining===0)return 0;
  const r=rates(s);
  if(r.restored<=0)return null;
  const fullRateSeconds=remaining/r.restored;
  if(r.used<=0||r.mined>=r.used)return fullRateSeconds;

  const deficit=r.used-r.mined;
  const fullRateRunway=s.scrap/deficit;
  if(fullRateRunway>=fullRateSeconds)return fullRateSeconds;
  const remainingAfterReserve=Math.max(0,remaining-fullRateRunway*r.restored);
  const sustainableRate=r.mined>0?r.restored*r.mined/r.used:0;
  if(sustainableRate<=0)return Infinity;
  return fullRateRunway+remainingAfterReserve/sustainableRate;
}
export function claim(s){
  if(!isReady(s))return {ok:false,message:"Restore the region before awakening it."};
  if(s.campaign?.version===3&&s.campaign.phase==="first-region"&&(!s.campaign.firstInvestment||!s.campaign.fieldRelay))
    return {ok:false,message:"Connect the ridge and choose its priority before awakening this region."};
  if(s.campaign&&s.campaign.phase!=="first-region"&&s.campaign.phase!=="open")
    return {ok:false,message:s.campaign.version===2?"Complete both first-investment sites before awakening this region.":"Complete the opening network before awakening this region."};
  s.restoration=0;s.region++;s.scrap+=40+s.region*10;
  if(s.campaign?.phase==="first-region")
    s.campaign.phase=s.campaign.version===1?"expansion":s.campaign.version===3?"frontier-life":"investment-choice";
  return {ok:true,message:"Region revived! A new frontier awaits."};
}
export function resetGrid(s){
  if(s.campaign&&s.campaign.phase!=="open")return {ok:false,message:"The opening campaign cannot be reset."};
  s.cells=fresh().cells;
  return {ok:true,message:s.campaign?"Starting network restored. Opening unlocks and progress preserved.":"Starting network restored. Progress preserved."};
}
export function advance(s,seconds,miningSeconds=seconds){
  if(!Number.isFinite(seconds)||seconds<=0)return;
  seconds=Math.min(seconds,MAX_OFFLINE);
  if(!Number.isFinite(miningSeconds))return;
  miningSeconds=Math.max(0,Math.min(seconds,miningSeconds));
  const r=rates(s);
  s.scrap+=miningSeconds*r.mined;
  const room=Math.max(0,TARGET(s.region)-s.restoration);
  const desired=Math.min(room,seconds*r.restored);
  if(desired>0&&r.restored>0){
    const required=desired*r.used/r.restored;
    if(required>0){
      const spent=Math.min(s.scrap,required);
      s.scrap-=spent;s.restoration+=desired*(spent/required);
    }
  }
  s.totalPlayed+=seconds;
  if(s.campaign?.phase==="restore"&&s.restoration>=5){
    s.campaign.phase="mine-kit";s.campaign.mineKit="earned";
  }
  if(s.campaign?.version===3&&s.campaign.phase==="first-region"&&s.campaign.ridgeRelay&&
    s.campaign.firstInvestment===null&&s.restoration>=25&&s.scrap>=Math.max(PRICE[Machine.Extractor],PRICE[Machine.Generator]))
    s.campaign.phase="investment-choice";
  else if(s.campaign?.version===3&&s.campaign.phase==="first-region"&&s.campaign.firstInvestment!==null&&
    !s.campaign.fieldRelay&&s.restoration>=50&&s.scrap>=PRICE[Machine.Relay])
    s.campaign.phase="field-link";
  if(s.campaign?.version===2&&s.campaign.phase==="investment-growth"&&s.restoration>=25)
    s.campaign.phase="investment-second";
}
export function offline(s,now){
  const elapsed=s.savedAt<=0?0:Math.max(0,now-s.savedAt);
  const applied=Math.min(MAX_OFFLINE,elapsed);
  advance(s,applied,Math.min(applied,MINING_OFFLINE));
  s.savedAt=now;
  return applied;
}
export function mission(s){
  if(s.region>0)return 3;
  const links=connected(s);
  let mineCount=0,boost=false;
  for(let i=0;i<25;i++)if(links[i]){
    if(s.cells[i]===Machine.Extractor)mineCount++;
    if(s.cells[i]===Machine.Restorer&&adjacent(s,i,Machine.Generator,links)>0)boost=true;
  }
  if(!boost)return 0;
  if(mineCount<2)return 1;
  return 2;
}
export function suggested(s){
  switch(mission(s)){
    case 0:return [19,9,13].find(i=>s.cells[i]===0)??-1;
    case 1:{
      const links=connected(s);
      return [7,17,10,16].find(i=>s.cells[i]===0&&neighbors(i).some(n=>links[n]))??-1;
    }
    default:return -1;
  }
}
