import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLanguage, languageUrl } from '../public/i18n.js';
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

test('shared URL language overrides saved and browser preferences', () => {
 for (const lang of ['yue', 'zh', 'en']) {
  assert.equal(resolveLanguage('en', ['en-US'], '?lang='+lang), lang);
 }
 for (const [tag, lang] of [['zh-TW','zh'], ['zh-Hant','zh'], ['ZH_HK','yue']]) {
  assert.equal(resolveLanguage('en', ['en'], '?lang='+tag), lang);
 }
 for (const search of ['', '?lang=', '?lang=invalid', '?lang=toString']) {
  assert.equal(resolveLanguage('zh', ['en'], search), 'zh');
  assert.equal(resolveLanguage(null, ['zh-HK'], search), 'yue');
 }
});

test('language switch creates a shareable URL and preserves route and other parameters', () => {
 const url = languageUrl('https://example.com/?source=friend&lang=yue#write', 'en');
 assert.equal(url, 'https://example.com/?source=friend&lang=en#write');
 assert.equal(resolveLanguage('yue', ['zh-TW'], new URL(url).search), 'en');
 assert.equal(languageUrl('https://example.com/#wall', 'zh'), 'https://example.com/?lang=zh#wall');
});
