// Relight browser playtest model. Mirrors Assets/Scripts/Core/WorldModel.cs at
// migration/unity-6000.3-lts@094fb11d; web saves are intentionally separate.
export const Machine=Object.freeze({Empty:0,Core:1,Relay:2,Extractor:3,Restorer:4,Generator:5});
export const PRICE=Object.freeze({[Machine.Relay]:4,[Machine.Extractor]:12,[Machine.Restorer]:18,[Machine.Generator]:15});
export const WIDTH=5, MAX_OFFLINE=8*3600, MINING_OFFLINE=30*60;
export const TARGET=region=>100*(1+region*0.5);
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
  return [s.region,s.extractorLevel,s.powerLevel,s.savedAt].every(Number.isInteger);
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
  if(!Number.isInteger(index)||index<0||index>=25||index===12)return {ok:false,message:"The core cannot be replaced."};
  if(![0,2,3,4,5].includes(machine))return {ok:false,message:"Unknown structure."};
  if(machine===Machine.Empty){
    if(s.cells[index]===0)return {ok:false,message:"Nothing to remove here."};
    s.cells[index]=0;return {ok:true,message:"Structure removed. No scrap refunded."};
  }
  if(s.cells[index]!==0)return {ok:false,message:"Tile occupied. Select REMOVE to clear it."};
  if(s.scrap<PRICE[machine])return {ok:false,message:"Not enough scrap. Your mines keep producing."};
  s.scrap-=PRICE[machine];s.cells[index]=machine;
  return {ok:true,message:"Structure built. Watch the network respond."};
}
export function upgrade(s,mining){
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
export function claim(s){
  if(!isReady(s))return {ok:false,message:"Restore the region before awakening it."};
  s.restoration=0;s.region++;s.scrap+=40+s.region*10;
  return {ok:true,message:"Region revived! A new frontier awaits."};
}
export function resetGrid(s){
  s.cells=fresh().cells;
  return {ok:true,message:"Starting network restored. Progress preserved."};
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
