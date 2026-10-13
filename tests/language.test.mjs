import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLanguage } from '../public/i18n.js';
test('browser language maps to supported interfaces in preference order', () => {
 for (const tag of ['zh-TW','zh-Hant-TW','zh-Hant','zh-CN','zh']) assert.equal(resolveLanguage(null,[tag]),'zh');
 for (const tag of ['zh-HK','zh-Hant-HK','yue','yue-Hant-HK','ZH_hk']) assert.equal(resolveLanguage(null,[tag]),'yue');
 assert.equal(resolveLanguage(null,['en-US','zh-TW']),'en');
 assert.equal(resolveLanguage(null,['fr-FR','zh-TW','en']),'zh');
 assert.equal(resolveLanguage(null,[]),'en');
 assert.equal(resolveLanguage(null,['ja-JP']),'en');
});
test('manual choice wins and obsolete preferences fall back to browser', () => {
 for(const lang of ['yue','zh','en']) assert.equal(resolveLanguage(lang,['zh-TW','en']),lang);
 assert.equal(resolveLanguage('invalid',['en-GB']),'en');
 assert.equal(resolveLanguage('invalid',['zh-HK']),'yue');
});
