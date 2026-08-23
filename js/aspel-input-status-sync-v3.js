(()=>{
'use strict';

if(window.__pnAspelInputStatusSyncV3)return;
window.__pnAspelInputStatusSyncV3=true;

const PANEL_ID='pnAspelMonitorPanel';
let syncTimer=0;
let mutationHookInstalled=false;

const clean=v=>String(v??'').trim();
const keyName=v=>clean(v).toLowerCase().replace(/\s+/g,' ');

function putStatus(index,id,name,status,source){
  status=clean(status);
  if(!status)return;
  const item={status,source:clean(source)};
  const idKey=clean(id).toUpperCase();
  const nameKey=keyName(name);
  if(idKey)index.byId.set(idKey,item);
  if(nameKey)index.byName.set(nameKey,item);
}

function liveStatusIndex(){
  const index={byId:new Map(),byName:new Map()};

  try{
    if(typeof students!=='undefined'&&Array.isArray(students)){
      students.forEach(person=>{
        if(!person)return;
        const status=clean(person.memberStatus);
        const normalized=keyName(status);
        if(normalized.includes('nonaktif')||normalized.includes('non aktif')||normalized.includes('tidak aktif')){
          putStatus(index,person.id,person.name,status,'MENU INPUT DATA • Data Siswa');
        }
      });
    }
  }catch(_){}

  try{
    if(typeof docs!=='undefined'&&docs&&docs['Data Keluar']&&typeof cellText==='function'&&typeof cellMaps!=='undefined'&&cellMaps&&cellMaps['Data Keluar']){
      for(let row=6;row<=300;row++){
        const id=clean(cellText(docs['Data Keluar'],cellMaps['Data Keluar'],'D'+row));
        const name=clean(cellText(docs['Data Keluar'],cellMaps['Data Keluar'],'E'+row));
        const finalStatus=clean(cellText(docs['Data Keluar'],cellMaps['Data Keluar'],'G'+row));
        if((!id&&!name)||!finalStatus)continue;
        const normalized=keyName(finalStatus);
        if(!(normalized.includes('keluar')||normalized.includes('nonaktif')||normalized.includes('non aktif')||normalized.includes('tidak aktif')))continue;
        putStatus(index,id,name,finalStatus,'MENU INPUT DATA • Data Keluar');
      }
    }
  }catch(_){}

  return index;
}

function statusFor(index,id,name){
  const idKey=clean(id).toUpperCase();
  const nameKey=keyName(name);
  return (idKey&&index.byId.get(idKey))||(nameKey&&index.byName.get(nameKey))||null;
}

function candidateIdentity(card){
  const name=clean(card.querySelector('.pnAspelCandidateName')?.textContent);
  const meta=clean(card.querySelector('.pnAspelCandidateMeta')?.textContent);
  const first=clean(meta.split('•')[0]);
  const id=/^(PN-|PGR-|[A-Z]{2,}-?\d)/i.test(first)?first:'';
  return {id,name};
}

function rememberOriginalBadge(card,badge){
  if(card.dataset.pnOriginalBadgeSaved==='1')return;
  card.dataset.pnOriginalBadgeSaved='1';
  card.dataset.pnOriginalBadgeText=clean(badge?.textContent);
  card.dataset.pnOriginalBadgeClass=badge?.className||'pnAspelBadge';
  card.dataset.pnOriginalBadgeTitle=badge?.title||'';
}

function setLiveMeta(card,item){
  const meta=card.querySelector('.pnAspelCandidateMeta');
  if(!meta)return;
  let live=meta.querySelector('.pnAspelLiveStatus');
  if(!live){
    live=document.createElement('span');
    live.className='pnAspelLiveStatus';
    meta.appendChild(live);
  }
  live.textContent=' • STATUS TERBARU: '+item.status;
  live.style.fontWeight='1000';
}

function clearLiveMeta(card){
  card.querySelector('.pnAspelLiveStatus')?.remove();
}

function setBadge(card,item){
  if(!item)return false;
  let badge=card.querySelector('.pnAspelBadge');
  if(!badge){
    badge=document.createElement('span');
    badge.className='pnAspelBadge';
    card.appendChild(badge);
  }
  rememberOriginalBadge(card,badge);

  const normalized=keyName(item.status);
  const targetClass=normalized.includes('keluar')?'keluar':(
    normalized.includes('nonaktif')||normalized.includes('non aktif')||normalized.includes('tidak aktif')?'nonaktif':''
  );
  let changed=false;

  if(clean(badge.textContent)!==item.status){badge.textContent=item.status;changed=true}
  ['aktif','nonaktif','keluar'].forEach(cls=>{
    const shouldHave=cls===targetClass;
    if(badge.classList.contains(cls)!==shouldHave){badge.classList.toggle(cls,shouldHave);changed=true}
  });
  const title='Status otomatis dari '+(item.source||'MENU INPUT DATA');
  if(badge.title!==title){badge.title=title;changed=true}
  if(card.dataset.pnInputStatus!==item.status){card.dataset.pnInputStatus=item.status;changed=true}
  setLiveMeta(card,item);
  return changed;
}

function restoreBadge(card){
  if(card.dataset.pnOriginalBadgeSaved!=='1'||!card.dataset.pnInputStatus)return false;
  const badge=card.querySelector('.pnAspelBadge');
  if(badge){
    badge.textContent=card.dataset.pnOriginalBadgeText||'Calon Anggota';
    badge.className=card.dataset.pnOriginalBadgeClass||'pnAspelBadge';
    badge.title=card.dataset.pnOriginalBadgeTitle||'';
  }
  delete card.dataset.pnInputStatus;
  clearLiveMeta(card);
  return true;
}

function syncCandidates(){
  const panel=document.getElementById(PANEL_ID);
  if(!panel)return 0;
  const index=liveStatusIndex();
  let changed=0;
  panel.querySelectorAll('.pnAspelCandidate').forEach(card=>{
    const who=candidateIdentity(card);
    const item=statusFor(index,who.id,who.name);
    if(item){
      if(setBadge(card,item))changed++;
    }else if(restoreBadge(card))changed++;
  });

  const source=panel.querySelector('.pnAspelSource');
  const sourceText='SUMBER: BIODATA + MENU INPUT DATA';
  if(source&&clean(source.textContent)!==sourceText)source.textContent=sourceText;
  const desc=panel.querySelector('.pnAspelHead p');
  const descText='Relasi Koordinator dari Portal Biodata Siswa. Status Keluar/Nonaktif disinkronkan otomatis dari MENU INPUT DATA tanpa menghapus riwayat pendampingan.';
  if(desc&&clean(desc.textContent)!==descText)desc.textContent=descText;
  return changed;
}

function queueSync(delay=40){
  clearTimeout(syncTimer);
  syncTimer=setTimeout(syncCandidates,delay);
}

function installMutationHook(){
  if(mutationHookInstalled||typeof window.afterMutation!=='function')return false;
  const original=window.afterMutation;
  window.afterMutation=async function(...args){
    const result=await original.apply(this,args);
    queueSync(25);
    setTimeout(()=>queueSync(25),350);
    return result;
  };
  mutationHookInstalled=true;
  return true;
}

const observer=new MutationObserver(()=>queueSync(30));
if(document.documentElement)observer.observe(document.documentElement,{childList:true,subtree:true});

document.addEventListener('click',event=>{
  if(event.target?.closest('#pnAspelMonitorNav,#pnAspelRefresh'))queueSync(120);
},true);

document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueSync(80)});
window.addEventListener('online',()=>queueSync(100));
setInterval(()=>{
  installMutationHook();
  const panel=document.getElementById(PANEL_ID);
  if(panel&&panel.offsetParent!==null)syncCandidates();
},700);

installMutationHook();
queueSync(120);
})();