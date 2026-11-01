// Offline negative fixtures for the hosted asset checker.
import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {
  HostedAssetHttpError,HostedAssetNetworkError,
  HostedAssetRedirectError,HostedAssetRequestTimeoutError,HostedAssetsWaitTimeoutError,
  MAX_HOSTED_WAIT_MS,PREVIEW_ORIGIN,parsePreviewBase,verifyHostedAssets,waitForHostedAssets
} from "./verify-hosted-assets.mjs";

const fixtureFiles=[
  ["/","index.html"],
  ["/app.mjs","app.mjs"],
  ["/model.mjs","model.mjs"],
  ["/styles.css","styles.css"]
];
async function expectedAssets(){
  return new Map(await Promise.all(fixtureFiles.map(async([route,filename])=>[
    route,Buffer.from(await readFile(new URL(`./${filename}`,import.meta.url)))
  ])));
}
function hostedResponse(bytes,status=200){return new Response(bytes,{status});}

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
    assert.equal(options.redirect,"manual");
    assert.ok(options.signal instanceof AbortSignal);
    const filename=new URL(url).pathname==="/"||new URL(url).pathname==="/index.html"?
      "index.html":new URL(url).pathname.slice(1);
    const bytes=await import("node:fs/promises").then(fs=>fs.readFile(new URL(`./${filename}`,import.meta.url)));
    return new Response(bytes,{status:200});
  }});
  assert.deepEqual(requests.map(request=>new URL(request.url).pathname),[
    "/","/app.mjs","/model.mjs","/styles.css"
  ]);
});

test("checker rejects redirects, non-200 responses and stale bytes offline",async()=>{
  await assert.rejects(verifyHostedAssets({fetchImpl:async()=>new Response("moved",{
    status:302,headers:{location:`${PREVIEW_ORIGIN}/elsewhere`}
  })}),/HTTP 302/);
  await assert.rejects(verifyHostedAssets({fetchImpl:async()=>new Response("missing",{status:404})}),/HTTP 404/);
  let requests=0;
  await assert.rejects(verifyHostedAssets({fetchImpl:async()=>{requests++;return new Response("stale html",{status:200});}}),
    /differs from tested index\.html/);
  assert.equal(requests,4,"strict one-shot verification completes once and never waits for deployment");
});

test("request signal bounds a stalled hosted fetch",async()=>{
  // AbortSignal.timeout() uses an unreferenced timer on Node 22. Keep the
  // test process alive until the abort fires so this fixture is deterministic.
  const keepAlive=setTimeout(()=>{},100);
  try{
    await assert.rejects(verifyHostedAssets({timeoutMs:5,fetchImpl:async(_url,{signal})=>
      new Promise((_resolve,reject)=>{
        signal.addEventListener("abort",()=>reject(new DOMException("fixture timed out","TimeoutError")),{once:true});
        if(signal.aborted)reject(new DOMException("fixture timed out","TimeoutError"));
      })
    }),HostedAssetRequestTimeoutError);
  }finally{clearTimeout(keepAlive);}
});

test("wait accepts an immediate complete match and preloads each expected asset once",async()=>{
  const files=await expectedAssets(),requests=[],reads=[];
  await waitForHostedAssets({
    readFileImpl:async path=>{reads.push(path);return readFile(path);},
    fetchImpl:async(url,options)=>{
      requests.push(new URL(url).pathname);
      assert.equal(options.redirect,"manual");
      assert.ok(options.signal instanceof AbortSignal);
      return hostedResponse(files.get(new URL(url).pathname));
    },
    nowImpl:()=>0,sleepImpl:async()=>assert.fail("matching assets must not wait")
  });
  assert.deepEqual(requests,fixtureFiles.map(([route])=>route));
  assert.equal(reads.length,4);
});

test("wait retries only stale HTTP 200 bytes and requires a full matching attempt",async()=>{
  const files=await expectedAssets(),requests=[],sleeps=[],reads=[];let now=0;
  await waitForHostedAssets({
    budgetMs:1000,pollIntervalMs:125,nowImpl:()=>now,sleepImpl:async ms=>{sleeps.push(ms);now+=ms;},
    readFileImpl:async path=>{reads.push(path);return readFile(path);},
    fetchImpl:async(url)=>{
      const route=new URL(url).pathname,attempt=Math.floor(requests.length/4);
      requests.push(route);
      return hostedResponse(attempt===0?Buffer.from("previous deployment"):files.get(route));
    }
  });
  assert.deepEqual(requests,[...fixtureFiles.map(([route])=>route),...fixtureFiles.map(([route])=>route)]);
  assert.deepEqual(sleeps,[125]);
  assert.equal(now,125);
  assert.equal(reads.length,4,"expected hashes must be loaded only once across retries");
});

test("mixed old and new assets never pass until all four match in one attempt",async()=>{
  const files=await expectedAssets(),requests=[];
  await waitForHostedAssets({
    budgetMs:500,pollIntervalMs:10,nowImpl:(()=>{let now=0;return()=>now;})(),sleepImpl:async()=>{},
    fetchImpl:async url=>{
      const route=new URL(url).pathname,attempt=Math.floor(requests.length/4);
      requests.push(route);
      return hostedResponse(attempt===0&&route==="/app.mjs"?Buffer.from("old app from previous deployment"):files.get(route));
    }
  });
  assert.equal(requests.length,8,"a mixed attempt must finish, then restart at the root");
  assert.deepEqual(requests.slice(0,4),fixtureFiles.map(([route])=>route));
  assert.deepEqual(requests.slice(4),fixtureFiles.map(([route])=>route));
});

test("perpetually stale successful assets stop at the bounded wait deadline",async()=>{
  let now=0,requests=0;const waits=[];
  await assert.rejects(waitForHostedAssets({
    budgetMs:1000,pollIntervalMs:400,requestTimeoutMs:100,
    nowImpl:()=>now,sleepImpl:async ms=>{waits.push(ms);now+=ms;},
    fetchImpl:async()=>{requests++;return hostedResponse("stale deployment");}
  }),error=>{
    assert.ok(error instanceof HostedAssetsWaitTimeoutError);
    assert.match(error.message,/waiting for the deployed assets/);
    assert.equal(error.lastMismatches.length,4);
    return true;
  });
  assert.equal(requests,12,"three complete 4-asset attempts fit the fixture budget");
  assert.deepEqual(waits,[400,400,200]);
  assert.equal(now,1000);
});

test("forbidden and other HTTP failures are distinct terminal responses",async()=>{
  for(const status of [401,403,503]){
    let requests=0;
    await assert.rejects(waitForHostedAssets({
      fetchImpl:async()=>{requests++;return hostedResponse("denied or unavailable",status);},
      sleepImpl:async()=>assert.fail("HTTP failures must not retry")
    }),error=>{
      assert.ok(error instanceof HostedAssetHttpError);
      assert.equal(error.status,status);
      assert.match(error.message,new RegExp(`HTTP ${status}`));
      return true;
    });
    assert.equal(requests,1);
  }
});

test("redirects remain a distinct terminal error and are never followed",async()=>{
  let requests=0;
  await assert.rejects(waitForHostedAssets({
    fetchImpl:async()=>{requests++;return new Response("redirect",{status:302,headers:{location:`${PREVIEW_ORIGIN}/other`}});},
    sleepImpl:async()=>assert.fail("redirects must not retry")
  }),HostedAssetRedirectError);
  assert.equal(requests,1);
});

test("network failures remain distinct terminal errors",async()=>{
  let requests=0;
  await assert.rejects(waitForHostedAssets({
    fetchImpl:async()=>{requests++;throw new TypeError("EAI_AGAIN fixture.invalid");},
    sleepImpl:async()=>assert.fail("network failures must not retry")
  }),error=>error instanceof HostedAssetNetworkError&&/EAI_AGAIN/.test(error.message));
  assert.equal(requests,1);
});

test("request timeouts remain distinct terminal errors",async()=>{
  let requests=0;
  await assert.rejects(waitForHostedAssets({
    budgetMs:1000,requestTimeoutMs:100,nowImpl:()=>0,
    fetchImpl:async()=>{requests++;throw new DOMException("request timed out","TimeoutError");},
    sleepImpl:async()=>assert.fail("request timeouts must not retry")
  }),HostedAssetRequestTimeoutError);
  assert.equal(requests,1);
});

test("a stalled response body aborts as a terminal request timeout",async()=>{
  const keepAlive=setTimeout(()=>{},100);let requests=0;
  try{
    await assert.rejects(waitForHostedAssets({
      budgetMs:1000,requestTimeoutMs:5,nowImpl:()=>0,
      fetchImpl:async(_url,{signal})=>{
        requests++;
        return {status:200,arrayBuffer:()=>new Promise((_resolve,reject)=>{
          signal.addEventListener("abort",()=>reject(signal.reason),{once:true});
          if(signal.aborted)reject(signal.reason);
        })};
      }
    }),HostedAssetRequestTimeoutError);
    assert.equal(requests,1);
  }finally{clearTimeout(keepAlive);}
});

test("a successful response body crossing the deadline cannot be accepted",async()=>{
  const files=await expectedAssets();let now=0,requests=0;
  await assert.rejects(waitForHostedAssets({
    budgetMs:100,requestTimeoutMs:1000,nowImpl:()=>now,
    fetchImpl:async url=>{
      requests++;
      const bytes=files.get(new URL(url).pathname);
      return {status:200,arrayBuffer:async()=>{now=101;return bytes;}};
    }
  }),error=>error instanceof HostedAssetsWaitTimeoutError&&/reading deployed assets/.test(error.message));
  assert.equal(requests,1);
});

test("invalid origin is rejected before any hosted request",async()=>{
  let requests=0;
  await assert.rejects(waitForHostedAssets({
    configured:`${PREVIEW_ORIGIN}/?wrong=1`,fetchImpl:async()=>{requests++;return hostedResponse("unused");}
  }),/exactly the authorized origin/);
  assert.equal(requests,0);
});

test("hosted wait cannot exceed its documented five-minute maximum",async()=>{
  assert.equal(MAX_HOSTED_WAIT_MS,300_000);
  let requests=0;
  await assert.rejects(waitForHostedAssets({
    budgetMs:MAX_HOSTED_WAIT_MS+1,fetchImpl:async()=>{requests++;return hostedResponse("unused");}
  }),/no more than five minutes/);
  assert.equal(requests,0);
});

test("each hosted request timeout is capped by the remaining wait budget",async()=>{
  const timeouts=[];let now=0;
  await assert.rejects(waitForHostedAssets({
    budgetMs:50,requestTimeoutMs:1000,nowImpl:()=>now,sleepImpl:async ms=>{now+=ms;},
    signalFactory:ms=>{timeouts.push(ms);return AbortSignal.timeout(ms);},
    fetchImpl:async()=>{now+=10;return hostedResponse(Buffer.from("stale"));}
  }),HostedAssetsWaitTimeoutError);
  assert.deepEqual(timeouts,[50,40,30,20]);
});

test("fractional near-deadline time uses a real integer AbortSignal timeout then expires cleanly",async()=>{
  let now=0,requests=0;
  await assert.rejects(waitForHostedAssets({
    budgetMs:1000.5,requestTimeoutMs:4000,nowImpl:()=>now,
    fetchImpl:async(_url,{signal})=>{
      requests++;
      assert.ok(signal instanceof AbortSignal,"the first request uses the real AbortSignal.timeout factory");
      assert.equal(signal.aborted,false);
      now=1000;
      return hostedResponse("stale first asset");
    }
  }),HostedAssetsWaitTimeoutError);
  assert.equal(requests,1,"less than 1ms remaining must expire before creating a second signal");
});
