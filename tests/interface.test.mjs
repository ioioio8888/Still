import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messages, examples } from '../public/i18n.js';
import { moderate } from '../moderation.mjs';

test('all three language dictionaries cover the same complete interface',()=>{
 const keys=Object.keys(messages.yue).sort();
 for(const lang of ['yue','zh','en']){
  assert.deepEqual(Object.keys(messages[lang]).sort(),keys);
  for(const value of Object.values(messages[lang]))assert.equal(typeof value,'string');
  assert.equal(examples[lang].length,3);
 }
 assert.ok(!Object.values(messages.en).some(value=>/[\u3400-\u9fff]/u.test(value)));
 assert.notEqual(messages.yue.writeTitle,messages.zh.writeTitle);
});

test('automatic moderation catches explicit content and common separator disguises',()=>{
 for(const text of ['政\u200b治','政。治','選 舉','选举','ＰＯＬＩＴＩＣＳ','p.o.l.i.t.i.c.s','political debate','p0l1t1cs'])assert.equal(moderate(text),'politics',text);
 for(const text of ['屌 你 老 母','fuck you','k.i.l.l yourself'])assert.equal(moderate(text),'abuse',text);
 for(const text of ['https://example.com','www.example.org','哈'.repeat(25)])assert.equal(moderate(text),'spam',text);
 for(const text of ['今日有啲攰，想休息。','今天想念一位朋友。','I feel tired today.','A lovely metropolitan park.'])assert.equal(moderate(text),null,text);
});
