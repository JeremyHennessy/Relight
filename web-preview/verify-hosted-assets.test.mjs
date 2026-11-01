// Offline negative fixtures for the hosted asset checker.
import assert from "node:assert/strict";
import test from "node:test";
import {PREVIEW_ORIGIN,parsePreviewBase,verifyHostedAssets} from "./verify-hosted-assets.mjs";

test("checker accepts only the exact authorized preview origin and root",()=>{
  assert.equal(parsePreviewBase(PREVIEW_ORIGIN).href,`${PREVIEW_ORIGIN}/`);
  assert.equal(parsePreviewBase(`${PREVIEW_ORIGIN}/`).href,`${PREVIEW_ORIGIN}/`);
  for(const candidate of [
    "http://relight-ux-playtest.pages.dev/",
    "https://relight-ux-playtest.pages.dev.evil.invalid/",
    "https://user@relight-ux-playtest.pages.dev/",
    "https://user:secret@relight-ux-playtest.pages.dev/",
    `${PREVIEW_ORIGIN}/?preview=1`,
    `${PREVIEW_ORIGIN}/#fragment`,
    `${PREVIEW_ORIGIN}/extra`,
    `${PREVIEW_ORIGIN}/./extra/..`
  ])assert.throws(()=>parsePreviewBase(candidate),undefined,candidate);
});

test("offline fixtures cover root HTML and exact public asset routes",async()=>{
  const requests=[];
  await verifyHostedAssets({fetchImpl:async(url,options)=>{
    requests.push({url:new URL(url).href,options});
    assert.equal(options.redirect,"error");
    assert.ok(options.signal instanceof AbortSignal);
    const filename=new URL(url).pathname==="/"||new URL(url).pathname==="/index.html"?
      "index.html":new URL(url).pathname.slice(1);
    const bytes=await import("node:fs/promises").then(fs=>fs.readFile(new URL(`./${filename}`,import.meta.url)));
    return new Response(bytes,{status:200});
  }});
  assert.deepEqual(requests.map(request=>new URL(request.url).pathname),[
    "/","/index.html","/app.mjs","/model.mjs","/styles.css"
  ]);
});

test("checker rejects redirects, non-200 responses and stale bytes offline",async()=>{
  await assert.rejects(verifyHostedAssets({fetchImpl:async()=>new Response("moved",{
    status:302,headers:{location:`${PREVIEW_ORIGIN}/elsewhere`}
  })}),/HTTP 302/);
  await assert.rejects(verifyHostedAssets({fetchImpl:async()=>new Response("missing",{status:404})}),/HTTP 404/);
  await assert.rejects(verifyHostedAssets({fetchImpl:async()=>new Response("stale html",{status:200})}),
    /differs from tested index\.html/);
});

test("request signal bounds a stalled hosted fetch",async()=>{
  // AbortSignal.timeout() uses an unreferenced timer on Node 22. Keep the
  // test process alive until the abort fires so this fixture is deterministic.
  const keepAlive=setTimeout(()=>{},100);
  try{
    await assert.rejects(verifyHostedAssets({timeoutMs:5,fetchImpl:async(_url,{signal})=>
      new Promise((_resolve,reject)=>{
        signal.addEventListener("abort",()=>reject(new Error("fixture timed out")),{once:true});
        if(signal.aborted)reject(new Error("fixture timed out"));
      })
    }),/fixture timed out/);
  }finally{clearTimeout(keepAlive);}
});
