// Confirms that the public preview serves the exact tested text assets.
// Run only after the corresponding source has been deployed to that URL.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

export const PREVIEW_ORIGIN="https://relight-ux-playtest.pages.dev";
const localRoot=fileURLToPath(new URL(".",import.meta.url));
const targets=[
  ["/","index.html"],
  ["/index.html","index.html"],
  ["/app.mjs","app.mjs"],
  ["/model.mjs","model.mjs"],
  ["/styles.css","styles.css"]
];
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");

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

export async function verifyHostedAssets({
  configured=process.env.RELIGHT_BROWSER_URL||`${PREVIEW_ORIGIN}/`,
  fetchImpl=fetch,
  readFileImpl=readFile,
  root=localRoot,
  timeoutMs=8000
}={}){
  assert.ok(Number.isFinite(timeoutMs)&&timeoutMs>0,"request timeout must be a positive number");
  const base=parsePreviewBase(configured);
  for(const [route,filename] of targets){
    const local=await readFileImpl(resolve(root,filename));
    const response=await fetchImpl(new URL(route,base),{
      redirect:"error",signal:AbortSignal.timeout(timeoutMs)
    });
    assert.equal(response.status,200,`${route} returned HTTP ${response.status}`);
    const remote=Buffer.from(await response.arrayBuffer());
    assert.equal(digest(remote),digest(local),`${route} differs from tested ${filename}`);
    console.log(`PASS hosted asset ${route} (${filename}): sha256 ${digest(local)}`);
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  await verifyHostedAssets();
