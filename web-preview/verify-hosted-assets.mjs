// Confirms that the public preview serves the exact tested text assets.
// Run only after the corresponding source has been deployed to that URL.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {performance} from "node:perf_hooks";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

export const PREVIEW_ORIGIN="https://relight-ux-playtest.pages.dev";
export const MAX_HOSTED_WAIT_MS=5*60*1000;
const localRoot=fileURLToPath(new URL(".",import.meta.url));
const targets=[
  ["/","index.html"],
  ["/app.mjs","app.mjs"],
  ["/model.mjs","model.mjs"],
  ["/styles.css","styles.css"]
];
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");

export class HostedAssetRedirectError extends Error{constructor(message){super(message);this.name="HostedAssetRedirectError";}}
export class HostedAssetHttpError extends Error{
  constructor(route,status){super(`${route} returned HTTP ${status}`);this.name="HostedAssetHttpError";this.status=status;}
}
export class HostedAssetNetworkError extends Error{
  constructor(route,cause){super(`${route} request failed: ${cause?.message||cause}`,{cause});this.name="HostedAssetNetworkError";}
}
export class HostedAssetRequestTimeoutError extends Error{
  constructor(route){super(`${route} request timed out`);this.name="HostedAssetRequestTimeoutError";}
}
export class HostedAssetMismatchError extends Error{
  constructor(mismatches){
    super(mismatches.map(({route,filename})=>`${route} differs from tested ${filename}`).join("; "));
    this.name="HostedAssetMismatchError";this.mismatches=mismatches;
  }
}
export class HostedAssetsWaitTimeoutError extends Error{
  constructor(message,lastMismatches=[]){super(message);this.name="HostedAssetsWaitTimeoutError";this.lastMismatches=lastMismatches;}
}

export function parsePreviewBase(configured){
  assert.equal(typeof configured,"string","preview URL must be a string");
  assert.ok(configured===PREVIEW_ORIGIN||configured===`${PREVIEW_ORIGIN}/`,
    "preview URL must be exactly the authorized origin with no credentials, query, fragment or extra path");
  const url=new URL(configured);
  assert.equal(url.origin,PREVIEW_ORIGIN,"preview URL must use the exact authorized HTTPS origin");
  assert.equal(url.username,"","preview URL must not include credentials");
  assert.equal(url.password,"","preview URL must not include credentials");
  assert.ok(url.pathname==="/"||url.pathname==="","preview URL must not include an extra path");
  assert.equal(url.search,"","preview URL must not include a query");
  assert.equal(url.hash,"","preview URL must not include a fragment");
  return new URL(`${PREVIEW_ORIGIN}/`);
}

async function loadExpectedAssets(readFileImpl,root){
  const expected=[];
  for(const [route,filename] of targets){
    const bytes=Buffer.from(await readFileImpl(resolve(root,filename)));
    expected.push({route,filename,bytes,hash:digest(bytes)});
  }
  return expected;
}

function isTimeout(error){return error?.name==="TimeoutError"||error?.name==="AbortError";}

async function fetchAssetAttempt({base,expected,fetchImpl,requestTimeoutMs,signalFactory,nowImpl,deadline}){
  const mismatches=[];
  for(const asset of expected){
    const remaining=deadline===null?requestTimeoutMs:deadline-nowImpl();
    if(remaining<=0)throw new HostedAssetsWaitTimeoutError("Timed out while checking deployed assets.",mismatches);
    const timeoutMs=Math.floor(Math.min(requestTimeoutMs,remaining));
    if(timeoutMs<1)throw new HostedAssetsWaitTimeoutError("Timed out while checking deployed assets.",mismatches);
    const budgetLimited=deadline!==null&&remaining<=requestTimeoutMs;
    const signal=signalFactory(timeoutMs);
    let response;
    try{
      // Keep redirects visible so they can fail distinctly; never follow them.
      response=await fetchImpl(new URL(asset.route,base),{redirect:"manual",signal});
    }catch(error){
      if(isTimeout(error)){
        if(budgetLimited)throw new HostedAssetsWaitTimeoutError("Timed out while checking deployed assets.",mismatches);
        throw new HostedAssetRequestTimeoutError(asset.route);
      }
      throw new HostedAssetNetworkError(asset.route,error);
    }
    if(response.status>=300&&response.status<400)
      throw new HostedAssetRedirectError(`${asset.route} redirected (HTTP ${response.status})`);
    if(response.status!==200)throw new HostedAssetHttpError(asset.route,response.status);
    let remote;
    try{remote=Buffer.from(await response.arrayBuffer());}
    catch(error){
      if(isTimeout(error)){
        if(budgetLimited)throw new HostedAssetsWaitTimeoutError("Timed out while reading deployed assets.",mismatches);
        throw new HostedAssetRequestTimeoutError(asset.route);
      }
      throw new HostedAssetNetworkError(asset.route,error);
    }
    if(deadline!==null&&nowImpl()>=deadline)
      throw new HostedAssetsWaitTimeoutError("Timed out while reading deployed assets.",mismatches);
    if(digest(remote)!==asset.hash)mismatches.push(asset);
  }
  if(deadline!==null&&nowImpl()>=deadline)
    throw new HostedAssetsWaitTimeoutError("Timed out while checking deployed assets.",mismatches);
  if(mismatches.length)throw new HostedAssetMismatchError(mismatches);
  for(const asset of expected)console.log(`PASS hosted asset ${asset.route} (${asset.filename}): sha256 ${asset.hash}`);
}

export async function verifyHostedAssets({
  configured=process.env.RELIGHT_BROWSER_URL||`${PREVIEW_ORIGIN}/`,
  fetchImpl=fetch,
  readFileImpl=readFile,
  root=localRoot,
  timeoutMs=8000,
  signalFactory=AbortSignal.timeout
}={}){
  assert.ok(Number.isFinite(timeoutMs)&&timeoutMs>=1,"request timeout must be at least one millisecond");
  const base=parsePreviewBase(configured);
  const expected=await loadExpectedAssets(readFileImpl,root);
  await fetchAssetAttempt({base,expected,fetchImpl,requestTimeoutMs:timeoutMs,signalFactory,nowImpl:Date.now,deadline:null});
}

export async function waitForHostedAssets({
  configured=process.env.RELIGHT_BROWSER_URL||`${PREVIEW_ORIGIN}/`,
  fetchImpl=fetch,
  readFileImpl=readFile,
  root=localRoot,
  // Allow delayed Pages deployments a bounded five-minute grace period.
  budgetMs=MAX_HOSTED_WAIT_MS,
  pollIntervalMs=10_000,
  requestTimeoutMs=8000,
  nowImpl=()=>performance.now(),
  sleepImpl=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  signalFactory=AbortSignal.timeout
}={}){
  assert.ok(Number.isFinite(budgetMs)&&budgetMs>0&&budgetMs<=MAX_HOSTED_WAIT_MS,
    "wait budget must be positive and no more than five minutes");
  assert.ok(Number.isFinite(pollIntervalMs)&&pollIntervalMs>0,"poll interval must be a positive number");
  assert.ok(Number.isFinite(requestTimeoutMs)&&requestTimeoutMs>=1,"request timeout must be at least one millisecond");
  const base=parsePreviewBase(configured);
  const expected=await loadExpectedAssets(readFileImpl,root);
  const deadline=nowImpl()+budgetMs;
  let lastMismatches=[];
  while(true){
    if(nowImpl()>=deadline){
      const stale=lastMismatches.length?`; last attempt had stale assets: ${lastMismatches.map(x=>x.route).join(", ")}`:"";
      throw new HostedAssetsWaitTimeoutError(`Timed out waiting for the deployed assets to match the tested source${stale}.`,lastMismatches);
    }
    try{
      await fetchAssetAttempt({base,expected,fetchImpl,requestTimeoutMs,signalFactory,nowImpl,deadline});
      return;
    }catch(error){
      if(!(error instanceof HostedAssetMismatchError))throw error;
      lastMismatches=error.mismatches;
    }
    const remaining=deadline-nowImpl();
    if(remaining<=0){
      const stale=`; last attempt had stale assets: ${lastMismatches.map(x=>x.route).join(", ")}`;
      throw new HostedAssetsWaitTimeoutError(`Timed out waiting for the deployed assets to match the tested source${stale}.`,lastMismatches);
    }
    await sleepImpl(Math.min(pollIntervalMs,remaining));
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  // The CLI waits only for stale 200/hash mismatches; the exported one-shot stays strict.
  await waitForHostedAssets();
