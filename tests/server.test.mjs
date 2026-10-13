import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.mjs';

test('anonymous letters persist, isolate ownership, accept support, paginate and hide reported posts', async () => {
 const directory=mkdtempSync(join(tmpdir(),'zan-fong-test-'));
 const path=join(directory,'test.sqlite');let server=createApp(path);
 const listen=()=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 await listen();let base=`http://127.0.0.1:${server.address().port}`;
 const clients=Array.from({length:4},()=>({cookie:''}));
 async function call(client,path,method='GET',data,extra={}) {
   const response=await fetch(base+'/api/'+path,{method,headers:{Cookie:client.cookie,...(method!=='GET'?{'Content-Type':'application/json'}:{}),...extra},...(data!==undefined?{body:JSON.stringify(data)}:{})});
   if(response.headers.get('set-cookie'))client.cookie=response.headers.get('set-cookie').split(';')[0];
   return {status:response.status,body:await response.json()};
 }
 try {
  for(const c of clients)assert.equal((await call(c,'letters')).status,200);
  const [alice,bob,charlie,dana]=clients;
  assert.equal((await call(alice,'letters','POST',{body:' ',mood:'其他'})).status,400);
  assert.equal((await call(alice,'letters','POST',{body:'x'.repeat(201),mood:'其他'})).status,400);
  assert.equal((await call(alice,'letters','POST',null)).status,400);
  assert.equal((await call(alice,'letters','POST',{body:'no',mood:'其他'},{Origin:'https://foreign.example'})).status,403);
  assert.equal((await call(alice,'letters','POST',{body:'p.o.l.i.t.i.c.s',mood:'其他'})).status,422);
  const created=await call(alice,'letters','POST',{body:'測試文字 <script>alert(1)</script>',mood:'未說出口'});
  assert.equal(created.status,201);const id=created.body.id;
  assert.equal((await call(bob,'letters')).body.letters[0].mine,false);
  assert.equal((await call(bob,'letters?mine=1')).body.letters.length,0);
  assert.equal((await call(bob,`letters/${id}`,'DELETE')).status,403);
  assert.equal((await call(bob,`letters/${id}/reaction`,'POST',{kind:'light'})).status,400);
  for(let i=0;i<2;i++)assert.equal((await call(bob,`letters/${id}/reaction`,'POST',{kind:'heard'})).status,200);
  assert.deepEqual((await call(bob,'letters')).body.letters[0].reactions,['heard']);
  assert.equal((await call(alice,'letters?mine=1')).body.letters[0].supported,true);
  assert.equal((await call(alice,`letters/${id}/reaction`,'POST',{kind:'heard'})).status,400);
  for(const c of [bob,bob,charlie])await call(c,`letters/${id}/report`,'POST',{});
  assert.equal((await call(bob,'letters')).body.letters.length,1);
  await call(dana,`letters/${id}/report`,'POST',{});
  assert.equal((await call(bob,'letters')).body.letters.length,0);
  assert.equal((await call(alice,'letters?mine=1')).body.letters[0].hidden,1);
  for(let i=0;i<10;i++)await call(alice,'letters','POST',{body:`pagination ${i}`,mood:'其他'});
  const first=await call(bob,'letters');const second=await call(bob,'letters?page=1');
  assert.equal(first.body.letters.length,9);assert.equal(first.body.more,true);assert.equal(second.body.letters.length,1);
  assert.equal(new Set([...first.body.letters,...second.body.letters].map(l=>l.id)).size,10);
  assert.equal((await call(bob,'letters?mood=想念')).body.letters.length,0);
  await new Promise(resolve=>server.close(resolve));server=createApp(path);await listen();base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await call(alice,'letters?mine=1')).body.letters.length,9);
  assert.equal((await call(alice,`letters/${id}`,'DELETE')).status,200);
  assert.equal((await call(alice,`letters/${id}`,'DELETE')).status,404);
  const boundary='abcdefghij'.repeat(20);
  assert.equal((await call(alice,'letters','POST',{body:boundary,mood:'其他'})).status,201);
  assert.equal((await call(alice,'letters','POST',{body:boundary+'x',mood:'其他'})).status,400);
  const injection="a'); DROP TABLE letters; --";
  assert.equal((await call(alice,'letters','POST',{body:injection,mood:'其他'})).status,201);
  assert.equal((await call(bob,'letters?mood='+encodeURIComponent("' OR 1=1 --"))).body.letters.length,0);
  assert.ok((await call(alice,'letters?mine=1')).body.letters.some(l=>l.body===injection));
 } finally {await new Promise(resolve=>server.close(resolve));rmSync(directory,{recursive:true,force:true});}
});
