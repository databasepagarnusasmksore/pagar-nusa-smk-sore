(()=>{
'use strict';

if(window.__pnAspelInputStatusSyncV5)return;
window.__pnAspelInputStatusSyncV5=true;

const PANEL_ID='pnAspelMonitorPanel';
const ENDPOINT='https://script.google.com/macros/s/AKfycbyJi_83lJ11JshOLCzIBRMX6fEi-y9UGR9eYULuqH1BivdxeqcgMB0l2ehWBIgaad8Oyw/exec';
const TOKEN_KEY='pnReviewAdminToken';
const EXIT_SYNC_KEY='pnAspelExitStatusSyncV5';
let syncTimer=0,mutationHookInstalled=false,serverSyncBusy=false,firstForcePending=true;

const clean=v=>String(v??'').trim();
const keyName=v=>clean(v).toLowerCase().replace(/\s+/g,' ');
const personKey=(id,name)=>clean(id).toUpperCase()||('NAME:'+keyName(name));
const savedValue=key=>{try{return localStorage.getItem(key)||sessionStorage.getItem(key)||''}catch(_){return''}};

function jsonp(action,payload={},timeoutMs=18000){
  return new Promise((resolve,reject)=>{
    const cb='pnAspelStatusCb_'+Date.now()+'_'+Math.random().toString(36).slice(2).replace(/[^a-z0-9_]/gi,'');
    const script=document.createElement('script');let done=false;
    const cleanup=()=>{clearTimeout(timer);try{delete window[cb]}catch(_){}script.remove()};
    window[cb]=data=>{if(done)return;done=true;cleanup();data&&data.ok?resolve(data):reject(new Error(data?.message||'Sinkron status ditolak server.'))};
    const qs=new URLSearchParams({action,callback:cb,_:String(Date.now())});Object.entries(payload).forEach(([k,v])=>qs.set(k,String(v??'')));
    script.src=ENDPOINT+'?'+qs.toString();script.async=true;
    script.onerror=()=>{if(done)return;done=true;cleanup();reject(new Error('Jaringan sinkron status bermasalah.'))};
    const timer=setTimeout(()=>{if(done)return;done=true;cleanup();reject(new Error('Sinkron status terlalu lama.'))},timeoutMs);
    document.head.appendChild(script);
  });
}

function putStatus(index,id,name,status,studentStatus='',source=''){
  status=clean(status);if(!status)return;const item={id:clean(id),name:clean(name),status,studentStatus:clean(studentStatus),source:clean(source)};
  const idKey=clean(id).toUpperCase(),nameKey=keyName(name);if(idKey)index.byId.set(idKey,item);if(nameKey)index.byName.set(nameKey,item);
}

function liveStatusIndex(){
  const index={byId:new Map(),byName:new Map()};
  try{if(typeof students!=='undefined'&&Array.isArray(students))students.forEach(p=>{if(p)putStatus(index,p.id,p.name,p.memberStatus,p.studentStatus,'Data Siswa')})}catch(_){}
  try{
    if(typeof docs!=='undefined'&&docs&&docs['Data Keluar']&&typeof cellText==='function'&&typeof cellMaps!=='undefined'&&cellMaps?.['Data Keluar']){
      for(let row=6;row<=300;row++){
        const id=clean(cellText(docs['Data Keluar'],cellMaps['Data Keluar'],'D'+row)),name=clean(cellText(docs['Data Keluar'],cellMaps['Data Keluar'],'E'+row)),status=clean(cellText(docs['Data Keluar'],cellMaps['Data Keluar'],'G'+row));
        const n=keyName(status);if((!id&&!name)||!(n.includes('keluar')||n.includes('nonaktif')||n.includes('non aktif')||n.includes('tidak aktif')))continue;
        putStatus(index,id,name,status,'','Data Keluar');
      }
    }
  }catch(_){}
  return index;
}

function exitStatusMap(){
  const map={};
  try{
    if(typeof docs!=='undefined'&&docs&&docs['Data Keluar']&&typeof cellText==='function'&&typeof cellMaps!=='undefined'&&cellMaps?.['Data Keluar']){
      for(let row=6;row<=300;row++){
        const id=clean(cellText(docs['Data Keluar'],cellMaps['Data Keluar'],'D'+row)),name=clean(cellText(docs['Data Keluar'],cellMaps['Data Keluar'],'E'+row)),status=clean(cellText(docs['Data Keluar'],cellMaps['Data Keluar'],'G'+row));
        const n=keyName(status);if((!id&&!name)||!(n.includes('keluar')||n.includes('nonaktif')||n.includes('non aktif')||n.includes('tidak aktif')))continue;
        map[personKey(id,name)]={id,name,status};
      }
    }
  }catch(_){}
  return map;
}
function readPreviousMap(){try{return JSON.parse(localStorage.getItem(EXIT_SYNC_KEY)||'{}')||{}}catch(_){return{}}}
function savePreviousMap(map){try{localStorage.setItem(EXIT_SYNC_KEY,JSON.stringify(map))}catch(_){}}

async function pushStatus(item){
  const token=savedValue(TOKEN_KEY);if(!token||!item)return false;const index=liveStatusIndex();
  const live=(clean(item.id)&&index.byId.get(clean(item.id).toUpperCase()))||(keyName(item.name)&&index.byName.get(keyName(item.name)))||item;
  await jsonp('aspelStatusAdminSync',{token,memberId:live.id||item.id,name:live.name||item.name,membershipStatus:live.status||item.status,studentStatus:live.studentStatus||''});
  return true;
}

async function syncExitStatusesToServer(force=false){
  if(serverSyncBusy)return false;
  const token=savedValue(TOKEN_KEY);if(!token)return false;
  const current=exitStatusMap(),previous=readPreviousMap(),changes=[];
  Object.entries(current).forEach(([key,item])=>{if(force||!previous[key]||previous[key].status!==item.status)changes.push(item)});
  Object.entries(previous).forEach(([key,item])=>{if(current[key])return;const index=liveStatusIndex();const live=(clean(item.id)&&index.byId.get(clean(item.id).toUpperCase()))||(keyName(item.name)&&index.byName.get(keyName(item.name)));if(live)changes.push(live)});
  if(!changes.length){
    if(Object.keys(current).length&&force)firstForcePending=false;
    return false;
  }
  serverSyncBusy=true;
  try{
    let allOk=true,synced=0;
    for(const item of changes){
      try{await pushStatus(item);synced++}
      catch(err){allOk=false;console.warn('Sinkron status Aspel:',err)}
    }
    if(allOk){
      savePreviousMap(current);
      firstForcePending=false;
      window.dispatchEvent(new CustomEvent('pn:aspel-status-synced',{detail:{count:synced,forced:!!force}}));
      return true;
    }
    firstForcePending=true;
    return false;
  }finally{serverSyncBusy=false}
}

function statusFor(index,id,name){const idKey=clean(id).toUpperCase(),nameKey=keyName(name);return(idKey&&index.byId.get(idKey))||(nameKey&&index.byName.get(nameKey))||null}
function candidateIdentity(card){const name=clean(card.querySelector('.pnAspelCandidateName')?.textContent),meta=clean(card.querySelector('.pnAspelCandidateMeta')?.textContent),first=clean(meta.split('•')[0]);const id=/^(PN-|PGR-|[A-Z]{2,}-?\d|\d{6,})/i.test(first)?first:'';return{id,name}}
function rememberOriginalBadge(card,badge){if(card.dataset.pnOriginalBadgeSaved==='1')return;card.dataset.pnOriginalBadgeSaved='1';card.dataset.pnOriginalBadgeText=clean(badge?.textContent);card.dataset.pnOriginalBadgeClass=badge?.className||'pnAspelBadge';card.dataset.pnOriginalBadgeTitle=badge?.title||''}
function setLiveMeta(card,item){const meta=card.querySelector('.pnAspelCandidateMeta');if(!meta)return;let live=meta.querySelector('.pnAspelLiveStatus');if(!live){live=document.createElement('span');live.className='pnAspelLiveStatus';meta.appendChild(live)}live.textContent=' • STATUS TERBARU: '+item.status;live.style.fontWeight='1000'}
function clearLiveMeta(card){card.querySelector('.pnAspelLiveStatus')?.remove()}
function setBadge(card,item){if(!item)return false;let badge=card.querySelector('.pnAspelBadge');if(!badge){badge=document.createElement('span');badge.className='pnAspelBadge';card.appendChild(badge)}rememberOriginalBadge(card,badge);const n=keyName(item.status),cls=n.includes('keluar')?'keluar':(n.includes('nonaktif')||n.includes('non aktif')||n.includes('tidak aktif')?'nonaktif':'');badge.textContent=item.status;badge.classList.remove('aktif','nonaktif','keluar');if(cls)badge.classList.add(cls);badge.title='Status otomatis dari '+(item.source||'MENU INPUT DATA');card.dataset.pnInputStatus=item.status;setLiveMeta(card,item);return true}
function restoreBadge(card){if(card.dataset.pnOriginalBadgeSaved!=='1'||!card.dataset.pnInputStatus)return false;const badge=card.querySelector('.pnAspelBadge');if(badge){badge.textContent=card.dataset.pnOriginalBadgeText||'Calon Anggota';badge.className=card.dataset.pnOriginalBadgeClass||'pnAspelBadge';badge.title=card.dataset.pnOriginalBadgeTitle||''}delete card.dataset.pnInputStatus;clearLiveMeta(card);return true}
function syncCandidates(){const panel=document.getElementById(PANEL_ID);if(!panel)return 0;const index=liveStatusIndex();let changed=0;panel.querySelectorAll('.pnAspelCandidate').forEach(card=>{const who=candidateIdentity(card),item=statusFor(index,who.id,who.name);if(item){if(setBadge(card,item))changed++}else if(restoreBadge(card))changed++});const source=panel.querySelector('.pnAspelSource');if(source)source.textContent='SUMBER: BIODATA + MENU INPUT DATA';return changed}
function queueSync(delay=60,force=false){clearTimeout(syncTimer);syncTimer=setTimeout(()=>{syncCandidates();syncExitStatusesToServer(force||firstForcePending)},delay)}
function installMutationHook(){if(mutationHookInstalled||typeof window.afterMutation!=='function')return false;const original=window.afterMutation;window.afterMutation=async function(...args){const result=await original.apply(this,args);queueSync(25,true);setTimeout(()=>{syncCandidates();syncExitStatusesToServer(true)},450);return result};mutationHookInstalled=true;return true}

window.pnForceAspelStatusSync=()=>syncExitStatusesToServer(true);
const observer=new MutationObserver(()=>queueSync(100,false));if(document.documentElement)observer.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',e=>{
  if(e.target?.closest('#pnAspelMonitorNav,#pnAspelRefresh'))queueSync(180,true);
  const btn=e.target?.closest('button');
  if(btn&&/SIMPAN|UBAH|HAPUS/i.test(clean(btn.textContent)))setTimeout(()=>queueSync(80,true),900);
},true);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueSync(80,true)});
window.addEventListener('online',()=>queueSync(100,true));
window.addEventListener('pn:database-panel-open',()=>queueSync(500,true));
window.addEventListener('pn:admin-open',()=>queueSync(900,true));
setInterval(()=>{installMutationHook();syncCandidates();syncExitStatusesToServer(firstForcePending)},2500);
installMutationHook();
queueSync(350,true);
setTimeout(()=>syncExitStatusesToServer(true),1400);
})();
