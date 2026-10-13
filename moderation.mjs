import { readFileSync } from 'node:fs';
const policy = JSON.parse(readFileSync(new URL('./moderation-policy.json', import.meta.url), 'utf8'));
const clean = text => text.normalize('NFKC').replace(/[\p{Cf}\p{M}]/gu, '').toLowerCase();
const compact = text => clean(text).replace(/[\s\p{P}\p{S}_]/gu, '');
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function englishPattern(term) {
 const letters=clean(term).replace(/\s/g,'').split('').map(escaped).join('[\\s\\p{P}\\p{S}_]*');
 return new RegExp('(?<![a-z])'+letters+'(?![a-z])','u');
}
const political=policy.politicalEnglish.map(englishPattern), abuse=policy.abusiveEnglish.map(englishPattern);
export function moderate(text) {
 const normalized=clean(text), flattened=compact(text);
 const latin=normalized.replace(/[013457]/g,c=>({'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t'}[c]));
 if(policy.politicalTerms.some(term=>flattened.includes(compact(term)))||political.some(pattern=>pattern.test(latin)))return 'politics';
 if(policy.abusiveTerms.some(term=>flattened.includes(compact(term)))||abuse.some(pattern=>pattern.test(latin)))return 'abuse';
 if((policy.blockLinks&&/(?:https?:\/\/|www\.|\b[a-z\d-]+\.(?:com|net|org|io|cn|hk)\b)/i.test(normalized))||new RegExp('(.)\\1{'+(policy.maxRepeatedCharacter-1)+',}','u').test(flattened))return 'spam';
 return null;
}
