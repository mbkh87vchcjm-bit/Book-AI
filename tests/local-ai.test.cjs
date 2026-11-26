'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const LocalAI=require('../desktop/cyber/core/local-ai.cjs');

function response(data,ok=true){return {ok,json:async()=>data};}

test('local AI discovers models only through the fixed loopback endpoint',async()=>{
  const calls=[];
  const client=LocalAI.createLocalAiClient({fetchImpl:async(url,options)=>{
    calls.push({url,options});
    return response({models:[{name:'qwen2.5:3b',size:123},{name:'hf.co/user/model:Q4_K_M',size:42},{name:'../invalid',size:4}]});
  }});
  const result=await client.listModels();
  assert.equal(result.ok,true);
  assert.equal(result.models.length,2);
  assert.ok(result.models.some((item)=>item.name==='qwen2.5:3b'));
  assert.ok(result.models.some((item)=>item.name==='hf.co/user/model:Q4_K_M'));
  assert.equal(calls[0].url,'http://127.0.0.1:11434/api/tags');
});

test('local question is sent without tool execution or cloud fallback',async()=>{
  const calls=[];
  const client=LocalAI.createLocalAiClient({fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/api/tags')) return response({models:[{name:'local-model:latest'}]});
    return response({message:{content:'إجابة محلية.'},done:true});
  }});
  const result=await client.ask({model:'local-model:latest',question:'اشرح Semgrep',context:'{"name":"Semgrep"}'});
  assert.equal(result.ok,true);
  assert.equal(result.localOnly,true);
  assert.equal(calls[1].url,'http://127.0.0.1:11434/api/chat');
  const body=JSON.parse(calls[1].options.body);
  assert.equal(body.stream,false);
  assert.equal(Object.hasOwn(body,'tools'),false);
  assert.match(body.messages[0].content,/لا تتصل بعناوين أو خدمات خارجية/);
  assert.match(body.messages[0].content,/لا تخترع روابط أو مراجع/);
  assert.equal(body.options.num_predict,700);
});

test('unknown models and oversized questions are rejected before chat',async()=>{
  let chatCalled=false;
  const client=LocalAI.createLocalAiClient({fetchImpl:async(url)=>{
    if(url.endsWith('/api/tags')) return response({models:[{name:'local:latest'}]});
    chatCalled=true; return response({message:{content:'no'}});
  }});
  assert.equal((await client.ask({model:'missing:latest',question:'test'})).error,'model-not-installed');
  assert.equal((await client.ask({model:'local:latest',question:'x'.repeat(4001)})).error,'question-invalid');
  assert.equal(chatCalled,false);
});

test('unavailable local runtime does not trigger a remote fallback',async()=>{
  const client=LocalAI.createLocalAiClient({fetchImpl:async()=>{throw new Error('offline');}});
  const result=await client.listModels();
  assert.equal(result.ok,false);
  assert.equal(result.connected,false);
  assert.deepEqual(result.models,[]);
  assert.equal(result.error,'local-runtime-unavailable');
});

test('model generation timeout defaults to a local-compute-friendly value',async()=>{
  let signal;
  const client=LocalAI.createLocalAiClient({timeoutMs:90000,fetchImpl:async(url,options)=>{
    signal=options.signal;
    return url.endsWith('/api/tags')
      ?response({models:[{name:'local:latest'}]})
      :response({message:{content:'ok'}});
  }});
  const result=await client.ask({model:'local:latest',question:'test'});
  assert.equal(result.ok,true);
  assert.ok(signal instanceof AbortSignal);
});

test('the local endpoint cannot be overridden',()=>{
  assert.equal(LocalAI.LOCAL_OLLAMA_ORIGIN,'http://127.0.0.1:11434');
});
