import { messages, locales, examples, resolveLanguage, languageUrl } from './i18n.js';
import { attachWater } from './water.js';
import { attachListening } from './listen.js';
const main = document.querySelector('#main');
const modal = document.querySelector('#modal');
const content = document.querySelector('#modal-content');
const canonicalMoods = ['', '未說出口', '有點疲累', '想念', '慢慢放下', '其他'];
const readPreference = key => { try { return localStorage.getItem(key); } catch { return null; } };
let language = resolveLanguage(readPreference('still-language'), navigator.languages?.length ? navigator.languages : [navigator.language], location.search);
let filter = '', page = 0, generation = 0, draft = '', draftMood = '未說出口', draftVisibility = 'public';
let toastTimer, cleanupWater = () => {}, busy = false, openDialog = null;
const t = key => messages[language][key] || key;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text = key => escape(t(key));
const lines = key => text(key).replaceAll('\n','<br>');
const icon = {
 arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>',
 hear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 13c-4-8 7-13 10-6 2 5-4 6-4 9 0 5-7 5-7 0M10 10c0-4 5-4 5 0l-3 3"/></svg>',
 mark: '<img class="brand-mark" src="/logo.png" width="48" height="48" alt="">',
 check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>'
};
const moodLabel = mood => t('m'+Math.max(0,canonicalMoods.indexOf(mood)));
function toast(message) {
 const el=document.querySelector('#toast'); el.textContent=message; el.classList.add('visible');
 clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('visible'),4500);
}
async function api(path, method='GET', data) {
 let response;
 try { response=await fetch('/api/'+path,{method,headers:method==='GET'?{}:{'Content-Type':'application/json'},...(data!==undefined?{body:JSON.stringify(data)}:{})}); }
 catch { throw Error(t('network')); }
 let result;try{result=await response.json();}catch{throw Error(t('errorGeneric'));}
 if(!response.ok){const key=response.status===422&&['politics','abuse','spam'].includes(result.code)?result.code:'error'+response.status;throw Error(t(Object.hasOwn(messages[language],key)?key:'errorGeneric'));}
 return result;
}
function privateLetters() {
 try { const value=JSON.parse(localStorage.getItem('zan-fong-private')||'[]'); return Array.isArray(value)?value.filter(l=>typeof l?.id==='string'&&typeof l?.body==='string'):[]; }
 catch { return []; }
}
function savePrivate(letters) {
 try { localStorage.setItem('zan-fong-private',JSON.stringify(letters)); }
 catch { throw Error(t('storageError')); }
}
function setBusy(value) {
 busy=value; document.querySelector('#language').disabled=value;
 document.querySelector('.close').disabled=value;
}
function showDialog(renderer,kind='') {
 openDialog={renderer,kind}; renderDialog(); if(!modal.open)modal.showModal();
}
function renderDialog() {
 content.innerHTML=openDialog.renderer(); modal.className=openDialog.kind;
 const heading=content.querySelector('h2'); if(heading){heading.id='dialog-title';modal.setAttribute('aria-labelledby','dialog-title');}
}
function closeDialog() { if(busy)return; modal.close(); openDialog=null; }
modal.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
modal.addEventListener('close',()=>{openDialog=null;});
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
document.querySelector('.close').onclick=closeDialog;
document.querySelector('.skip-link').onclick=event=>{event.preventDefault();main.focus();main.scrollIntoView();};
function shell() {
 document.documentElement.lang=locales[language]; document.documentElement.dataset.language=language;
 document.title=t('title');document.querySelector('meta[name="description"]').content=t('description');
 document.querySelector('.skip-link').textContent=t('skip');
 document.querySelector('.brand').setAttribute('aria-label',t('brand')+' · '+t('home'));
 document.querySelector('.brand').innerHTML=icon.mark+'<span>'+text('brand')+'</span>';
 document.querySelector('nav').setAttribute('aria-label',t('nav'));
 document.querySelectorAll('[data-nav]').forEach(link=>link.innerHTML=text(link.dataset.nav==='write'?'write':link.dataset.nav)+(link.dataset.nav==='write'?icon.arrow:''));
 document.querySelector('#language').setAttribute('aria-label',t('language'));document.querySelector('#language').value=language;
 document.querySelector('.close').setAttribute('aria-label',t('close'));
 document.querySelector('.footer-brand').innerHTML=icon.mark+'<span>'+text('brand')+'</span>';
 document.querySelector('.footer-note').textContent=t('footer');document.querySelector('#about-button').textContent=t('about');
 document.querySelector('#motion-toggle').textContent=t('motionOn');
}
document.querySelector('#language').onchange=event=>{
 language=event.target.value;try{localStorage.setItem('still-language',language);}catch{}
 history.replaceState(history.state, '', languageUrl(location.href, language));
 // Re-render interface only. Writing state and original message bodies remain intact.
 if(modal.open)closeDialog();document.querySelector('#toast').classList.remove('visible');shell();route(false);
};
document.querySelector('#about-button').onclick=()=>showDialog(()=>`<h2>${text('aboutTitle')}</h2><p>${text('aboutBody')}</p><h3>${text('privacyTitle')}</h3><p>${text('privacyBody')}</p><p>${text('cookieBody')}</p><h3>${text('reportTitle')}</h3><p>${text('careBody')}</p>`);
function home() {
 main.innerHTML=`<section class="hero"><div class="hero-copy"><h1><span>${text('hero1')}</span><span>${text('hero2')}</span></h1><p class="hero-description">${lines('intro')}</p><div class="hero-actions"><a class="button primary" href="#write">${text('writeMine')}${icon.arrow}</a><a class="quiet-link" href="#wall">${text('readOthers')}</a></div><p class="anonymous-note">${text('anonymousNote')}</p></div><div class="water-space"><canvas id="water" tabindex="0" role="button" aria-label="${text('waterLabel')}"></canvas><button id="clear-water" class="clear-water text-button">${text('clearWater')}</button><p class="water-caption"><span class="pointer-hint">${text('waterHint')}</span><span class="touch-hint">${text('waterTouch')}</span></p></div><p class="hero-aside">${text('aside')}</p></section><section class="invitation"><div class="invitation-art" aria-hidden="true">${icon.mark}</div><div><h2>${text('invitation')}</h2><p>${lines('inviteBody')}</p></div><a class="circle-link" href="#wall" aria-label="${text('readOthers')}">${icon.arrow}</a></section>`;
 cleanupWater=attachWater(document.querySelector('#water'),document.querySelector('#motion-toggle'),t);
}
function reaction(letter) {
 const supported=letter.reactions?.includes('heard');
 return `<div class="reactions"><button class="reaction ${supported?'selected':''}" data-id="${escape(letter.id)}" ${supported?'disabled':''}>${supported?icon.check:icon.hear}<span>${text(supported?'heardDone':'heard')}</span></button></div>`;
}
function card(letter,sample=false,local=false) {
 const date=Number.isFinite(Number(letter.created))?new Intl.DateTimeFormat(locales[language],{month:'short',day:'numeric'}).format(new Date(Number(letter.created))):'';
 return `<article class="letter-card"><div class="card-meta"><span>${escape(moodLabel(letter.mood))}</span><span>${sample?text('sample'):local?text('private'):escape(date)}</span></div><p class="letter-body">${escape(letter.body)}</p><button class="read-letter text-button">${text('read')}${icon.arrow}</button><div class="card-bottom"><span>${local?text('private'):text('stranger')}</span>${sample?`<span>${text('sampleOnly')}</span>`:letter.mine||local?`<button class="text-button delete" data-id="${escape(letter.id)}" data-local="${local}">${text('remove')}</button>`:`<button class="report text-button" data-id="${escape(letter.id)}">${text('report')}</button>`}</div>${letter.mine?`<p class="owner-status">${text(letter.hidden?'hidden':letter.supported?'supported':'savedStatus')}</p>`:!sample&&!local?reaction(letter):''}</article>`;
}
async function wall(mine=false,request=generation) {
 main.innerHTML=`<section class="page-heading">${mine?'':`<a class="archive-back text-button" href="#wall">${text('listenBack')}</a>`}<h1>${text(mine?'mine':'wallTitle')}</h1><p>${text(mine?'mineIntro':'wallIntro')}</p></section>${mine?`<p class="storage-note">${text('storage')}</p>`:`<div class="filters" aria-label="${text('filters')}">${canonicalMoods.map((m,i)=>`<button class="filter ${m===filter?'active':''}" aria-pressed="${m===filter}" data-mood="${escape(m)}">${text('m'+i)}</button>`).join('')}</div>`}<section id="letters" class="letters" aria-live="polite" aria-busy="true"><p class="empty">${text('loading')}</p></section><div id="pagination" class="pagination"></div>${mine?`<section class="private-section"><h2>${text('private')}</h2><div id="private-letters" class="letters"></div></section>`:`<p class="wall-end">${text('wallEnd')}</p>`}`;
 document.querySelectorAll('.filter').forEach(button=>button.onclick=()=>{filter=button.dataset.mood;page=0;wall(false,++generation);});
 if(mine){const letters=privateLetters();document.querySelector('#private-letters').innerHTML=letters.length?letters.map(l=>card(l,false,true)).join(''):`<p class="empty">${text('noPrivate')}</p>`;bindCards();}
 try {
  const result=await api(`letters?mine=${mine?1:0}&page=${page}&mood=${encodeURIComponent(filter)}`);if(request!==generation)return;
  const list=document.querySelector('#letters');list.setAttribute('aria-busy','false');
  list.innerHTML=result.letters.length?result.letters.map(l=>card(l)).join(''):mine?`<div class="empty"><p>${text('noPublic')}</p><a class="quiet-link" href="#write">${text('write')}${icon.arrow}</a></div>`:filter===''&&page===0?`<p class="sample-notice">${text('sampleNotice')}</p>${examples[language].map((body,i)=>card({body,mood:canonicalMoods[i+1]},true)).join('')}`:`<p class="empty">${text('noFilter')}</p>`;
  document.querySelector('#pagination').innerHTML=`${page>0?`<button id="prev" class="button secondary">${text('prev')}</button>`:''}${result.more?`<button id="next" class="button secondary">${text('next')}${icon.arrow}</button>`:''}`;
  const turn=n=>{page+=n;wall(mine,++generation);window.scrollTo(0,0);};document.querySelector('#prev')?.addEventListener('click',()=>turn(-1));document.querySelector('#next')?.addEventListener('click',()=>turn(1));bindCards();
 }catch(error){if(request===generation){const list=document.querySelector('#letters');list.setAttribute('aria-busy','false');list.innerHTML=`<div class="empty"><p>${text('loadError')}</p><button class="button secondary" id="retry">${text('retry')}</button></div>`;document.querySelector('#retry').onclick=()=>wall(mine,++generation);}}
}
function bindSupport(root=document) {
 root.querySelectorAll('.reaction:not(:disabled)').forEach(button=>button.onclick=async()=>{
  const id=button.dataset.id;
  const matches=()=>[...document.querySelectorAll('.reaction')].filter(b=>b.dataset.id===id);
  matches().forEach(b=>b.disabled=true);
  try{await api('letters/'+id+'/reaction','POST',{kind:'heard'});matches().forEach(b=>{b.classList.add('selected');b.innerHTML=icon.check+'<span>'+text('heardDone')+'</span>';});button.dispatchEvent(new CustomEvent('heard',{bubbles:true}));toast(t('heardToast'));}
  catch(error){matches().forEach(b=>b.disabled=false);toast(error.message);}
 });
}
function bindCards() {
 document.querySelectorAll('.read-letter').forEach(button=>button.onclick=()=>{
  const article=button.closest('article');const body=article.querySelector('.letter-body').textContent;const mood=article.querySelector('.card-meta>span').textContent;
  showDialog(()=>`<p class="reading-label">${escape(mood)}</p><h2>${text('readingTitle')}</h2><p class="reading-body">${escape(body)}</p><p class="reading-end">${text('readingEnd')}</p>`,'reading-dialog');
  const support=article.querySelector('.reactions');if(support){content.append(support.cloneNode(true));bindSupport(content);}
 });
 bindSupport();
 document.querySelectorAll('.delete').forEach(button=>button.onclick=()=>{
  showDialog(()=>`<h2>${text('deleteTitle')}</h2><p>${text('deleteBody')}</p><div class="dialog-actions"><button class="button primary" id="confirm-delete">${text('confirmDelete')}</button><button class="button secondary" id="cancel-delete">${text('keep')}</button></div>`);
  document.querySelector('#cancel-delete').onclick=closeDialog;
  document.querySelector('#confirm-delete').onclick=async event=>{event.currentTarget.disabled=true;setBusy(true);try{if(button.dataset.local==='true')savePrivate(privateLetters().filter(l=>l.id!==button.dataset.id));else await api('letters/'+button.dataset.id,'DELETE');setBusy(false);closeDialog();wall(true,++generation);toast(t('deleted'));}catch(error){setBusy(false);document.querySelector('#confirm-delete').disabled=false;toast(error.message);}};
 });
 document.querySelectorAll('.report').forEach(button=>button.onclick=()=>{
  showDialog(()=>`<h2>${text('reportTitle')}</h2><p>${text('reportBody')}</p><button class="button primary" id="confirm-report">${text('reportSend')}</button>`);
  document.querySelector('#confirm-report').onclick=async event=>{event.currentTarget.disabled=true;setBusy(true);try{await api('letters/'+button.dataset.id+'/report','POST',{});setBusy(false);closeDialog();button.disabled=true;button.textContent=t('reported');toast(t('reportToast'));button.dispatchEvent(new CustomEvent('reported',{bubbles:true}));}catch(error){setBusy(false);document.querySelector('#confirm-report').disabled=false;toast(error.message);}};
 });
}
function write() {
 main.innerHTML=`<section class="page-heading write-heading"><h1>${text('writeTitle')}</h1><p>${text('writeIntro')}</p></section><form class="writing-paper" id="write-form" novalidate><label class="sr-only" for="body">${text('bodyLabel')}</label><div class="paper-top">${text('dear')}${icon.mark}</div><textarea id="body" maxlength="200" placeholder="${text('placeholder')}" aria-describedby="form-error" required>${escape(draft)}</textarea><div class="paper-bottom"><span>${text('pauseHint')}</span><span id="char-count">${draft.length} / 200</span></div><p id="form-error" class="form-error" role="alert"></p><div class="write-options"><label for="mood">${text('mood')}</label><select id="mood">${canonicalMoods.slice(1).map(m=>`<option value="${escape(m)}" ${m===draftMood?'selected':''}>${escape(moodLabel(m))}</option>`).join('')}</select></div><fieldset class="visibility"><legend>${text('visibility')}</legend>${['public','private'].map(value=>`<label><input type="radio" name="visibility" value="${value}" ${draftVisibility===value?'checked':''}><span>${text(value)}<small>${text(value+'Help')}</small></span></label>`).join('')}</fieldset><p class="privacy-hint" id="privacy-hint">${text(draftVisibility+'Warning')}</p><p class="policy-note" id="policy-note" ${draftVisibility==='private'?'hidden':''}>${text('policy')}</p><div class="submit-row"><span>${text('anonymousNote')}</span><button class="button primary" type="submit">${text('preview')}${icon.arrow}</button></div></form>`;
 const body=document.querySelector('#body');body.oninput=()=>{draft=body.value;document.querySelector('#char-count').textContent=draft.length+' / 200';body.removeAttribute('aria-invalid');document.querySelector('#form-error').textContent='';};
 document.querySelector('#mood').onchange=event=>draftMood=event.target.value;
 document.querySelectorAll('[name="visibility"]').forEach(radio=>radio.onchange=()=>{draftVisibility=radio.value;document.querySelector('#privacy-hint').textContent=t(draftVisibility+'Warning');document.querySelector('#policy-note').hidden=draftVisibility==='private';});
 document.querySelector('#write-form').onsubmit=event=>{
  event.preventDefault();const value=body.value.trim();if(!value||value.length>200){document.querySelector('#form-error').textContent=t('invalid');body.setAttribute('aria-invalid','true');body.focus();return;}
  const local=draftVisibility==='private',mood=draftMood;
  showDialog(()=>`<h2>${text(local?'previewPrivate':'previewPublic')}</h2><p class="preview-body">${escape(value)}</p><p class="preview-caption">${text(local?'previewPrivateHelp':'previewPublicHelp')}</p><div class="dialog-actions"><button class="button primary" id="publish">${text(local?'savePrivate':'publish')}${icon.arrow}</button><button class="text-button" id="back-edit">${text('edit')}</button></div><p id="save-error" class="form-error" role="alert"></p>`);
  document.querySelector('#back-edit').onclick=closeDialog;
  document.querySelector('#publish').onclick=async event=>{
   const button=event.currentTarget;button.disabled=true;button.textContent=t('saving');document.querySelector('#back-edit').disabled=true;setBusy(true);
   try{if(local)savePrivate([{id:crypto.randomUUID(),body:value,mood,created:Date.now()},...privateLetters()]);else await api('letters','POST',{body:value,mood});draft='';setBusy(false);closeDialog();location.hash='done';}
   catch(error){setBusy(false);document.querySelector('#save-error').textContent=error.message;button.disabled=false;button.textContent=t('retry');document.querySelector('#back-edit').disabled=false;}
  };
 };
}
function done(){main.innerHTML=`<section class="done"><div class="settled-mark">${icon.mark}</div><h1>${lines('savedTitle')}</h1><p>${lines('savedIntro')}</p><div class="hero-actions"><a class="button primary" href="#mine">${text('backMine')}${icon.arrow}</a><a class="quiet-link" href="#wall">${text('readOthers')}</a></div></section>`;}
function route(scroll=true) {
 if(location.hash==='#main'){main.focus();return;}
 cleanupWater();cleanupWater=()=>{};const view=location.hash.slice(1)||'home';++generation;page=0;
 document.body.dataset.view=view;document.querySelector('#motion-toggle').hidden=view!=='home'&&view!=='wall';
 document.querySelectorAll('[data-nav]').forEach(a=>{if(a.dataset.nav===view||(view==='archive'&&a.dataset.nav==='wall'))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 if(view==='wall')cleanupWater=attachListening(main,{api,t,escape,icon,reaction,bindCards,moodLabel});else if(view==='archive'||view==='mine')wall(view==='mine');else if(view==='write')write();else if(view==='done')done();else home();
 if(scroll){window.scrollTo(0,0);main.focus({preventScroll:true});}
}
window.addEventListener('hashchange',()=>route());window.addEventListener('beforeunload',event=>{if(draft.trim()||busy){event.preventDefault();event.returnValue='';}});
shell();route();
