(()=>{
'use strict';

if(window.__pnAspelInputStatusSyncV3)return;
window.__pnAspelInputStatusSyncV3=true;

const PANEL_ID='pnAspelMonitorPanel';
let syncTimer=0;

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
          putStatus(index,person.id,person.name,status,'Data Siswa');
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

function setBadge(card,item){
  if(!item)return false;
  let badge=card.querySelector('.pnAspelBadge');
  if(!badge){
    badge=document.createElement('span');
    badge.className='pnAspelBadge';
    card.appendChild(badge);
  }
  const normalized=keyName(item.status);
  badge.textContent=item.status;
  badge.classList.remove('aktif','nonaktif','keluar');
  if(normalized.includes('keluar'))badge.classList.add('keluar');
  else if(normalized.includes('nonaktif')||normalized.includes('non aktif')||normalized.includes('tidak aktif'))badge.classList.add('nonaktif');
  badge.title='Status otomatis dari '+(item.source||'MENU INPUT DATA');
  card.dataset.pnInputStatus=item.status;
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
    if(item&&setBadge(card,item))changed++;
  });

  const source=panel.querySelector('.pnAspelSource');
  if(source)source.textContent='SUMBER: BIODATA + MENU INPUT DATA';
  const desc=panel.querySelector('.pnAspelHead p');
  if(desc)desc.textContent='Relasi Koordinator dari Portal Biodata Siswa. Status Keluar/Nonaktif disinkronkan otomatis dari MENU INPUT DATA tanpa menghapus riwayat pendampingan.';
  return changed;
}

function queueSync(delay=40){
  clearTimeout(syncTimer);
  syncTimer=setTimeout(syncCandidates,delay);
}

const observer=new MutationObserver(()=>queueSync(30));
if(document.documentElement)observer.observe(document.documentElement,{childList:true,subtree:true});

document.addEventListener('click',event=>{
  if(event.target?.closest('#pnAspelMonitorNav,#pnAspelRefresh'))queueSync(250);
},true);

document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueSync(80)});
window.addEventListener('online',()=>queueSync(100));
setInterval(()=>{
  const panel=document.getElementById(PANEL_ID);
  if(panel&&panel.offsetParent!==null)syncCandidates();
},900);

queueSync(120);
})();
