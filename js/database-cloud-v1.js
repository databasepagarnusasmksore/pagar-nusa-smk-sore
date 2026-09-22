(()=>{
'use strict';

const PN_DB_ENDPOINT='https://script.google.com/macros/s/AKfycbyJi_83lJ11JshOLCzIBRMX6fEi-y9UGR9eYULuqH1BivdxeqcgMB0l2ehWBIgaad8Oyw/exec';
const PN_DB_TOKEN_KEY='pnReviewAdminToken';
const PN_DB_SOURCE='pn-database';
const PN_DB_PENDING_KEY='pnExcelCloudPendingV2';
const PN_DB_LAST_SYNC_KEY='pnExcelCloudLastSyncV1';
const PN_DB_MASTER_ID_KEY='pnExcelCloudMasterFileIdV1';
const PN_DB_SYNC_DELAY=120;
const PN_DB_DOWNLOAD_CONCURRENCY=4;
const PN_DB_BACKGROUND_CHECK_MS=30*1000;
const PN_ONLINE_DB_VERSION_KEY='pnOnlineDatabaseVersionV1';
const PN_ONLINE_DB_SHEET_PREFIX='pnOnlineSheetVersionV1:';
const PN_ONLINE_PENDING_PATCHES_KEY='pnOnlinePendingPatchesV1';
const PN_ONLINE_DB_URL='https://docs.google.com/spreadsheets/d/1fg-zsfYnK6nCJZTOT-xzICkUOMgmMKTPOLWPtvHLOnM/edit';
const PN_ONLINE_DB_SHEETS=new Set(['Data Siswa','Data Pengurus','Data Alumni','Kehadiran','Kenaikan Tingkat','Prestasi','Iuran','Data Pelanggaran','Data SP 1-3','Data Keluar']);

let pnCloudBusy=false;
let pnCloudLoaded=false;
let pnCloudCheckedToken='';
let pnCloudLoadedToken='';
let pnInitialUploadPromise=null;
let pnCloudSaveBusy=false;
let pnCloudSaveTimer=0;
let pnCloudSaveQueued=false;
let pnCloudGeneration=0;
let pnCloudLastBackgroundCheck=0;
let pnOnlinePatchMap=new Map();
let pnOnlineApplySuspend=false;
let pnOnlineSyncBusy=false;
let pnOnlineSyncPromise=null;
let pnOnlineRefreshBusy=new Set();

function pnDatabasePanelOpen(){
  const drawer=document.getElementById('dbDrawer');
  return !!(drawer&&drawer.classList.contains('open'));
}

function pnDbToken(){
  try{return localStorage.getItem(PN_DB_TOKEN_KEY)||sessionStorage.getItem(PN_DB_TOKEN_KEY)||''}
  catch(_){try{return sessionStorage.getItem(PN_DB_TOKEN_KEY)||''}catch(__){return''}}
}
function pnOnlineCellKey(sheet,address){return String(sheet||'')+'!'+String(address||'').toUpperCase()}
function pnOnlineSheetVersion(sheet){try{return localStorage.getItem(PN_ONLINE_DB_SHEET_PREFIX+sheet)||''}catch(_){return''}}
function pnSetOnlineSheetVersion(sheet,version){try{if(version)localStorage.setItem(PN_ONLINE_DB_SHEET_PREFIX+sheet,String(version))}catch(_){}}
function pnSetOnlineVersion(version){try{if(version)localStorage.setItem(PN_ONLINE_DB_VERSION_KEY,String(version))}catch(_){}}
function pnColName(n){let s='';while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)}return s}

function pnPersistOnlinePatches(){
  try{
    const rows=[...pnOnlinePatchMap.values()].slice(-2000);
    if(rows.length)localStorage.setItem(PN_ONLINE_PENDING_PATCHES_KEY,JSON.stringify(rows));
    else localStorage.removeItem(PN_ONLINE_PENDING_PATCHES_KEY);
  }catch(_){}
}
function pnRestoreOnlinePatches(){
  try{
    const raw=localStorage.getItem(PN_ONLINE_PENDING_PATCHES_KEY)||'[]';
    const rows=JSON.parse(raw);
    if(!Array.isArray(rows))return;
    rows.slice(-2000).forEach(p=>{
      const sheet=String(p?.sheet||''),address=String(p?.address||'').toUpperCase();
      if(!PN_ONLINE_DB_SHEETS.has(sheet)||!/^[A-Z]{1,3}[1-9][0-9]{0,5}$/.test(address))return;
      pnOnlinePatchMap.set(pnOnlineCellKey(sheet,address),{
        sheet,address,value:p?.value??'',clear:!!p?.clear
      });
    });
  }catch(_){}
}
pnRestoreOnlinePatches();

window.pnRecordOnlineCellPatch=function(sheet,address,value,clear=false){
  if(pnOnlineApplySuspend||!PN_ONLINE_DB_SHEETS.has(String(sheet||'')))return;
  const a=String(address||'').toUpperCase();
  if(!/^[A-Z]{1,3}[1-9][0-9]{0,5}$/.test(a))return;
  pnOnlinePatchMap.set(pnOnlineCellKey(sheet,a),{sheet:String(sheet),address:a,value:value??'',clear:!!clear});
  pnPersistOnlinePatches();
};

async function pnOnlineToken(){
  let token=pnDbToken();
  if(!token&&typeof window.pnEnsureAdminServerSessionV1==='function'){
    try{token=await window.pnEnsureAdminServerSessionV1()}catch(_){}
  }
  return token||'';
}

async function pnFlushOnlinePatches(){
  if(pnOnlineSyncPromise){
    await pnOnlineSyncPromise;
    if(pnOnlinePatchMap.size)return pnFlushOnlinePatches();
    return {ok:true,count:0};
  }
  if(!pnOnlinePatchMap.size)return {ok:true,count:0};

  const token=await pnOnlineToken();
  if(!token)throw new Error('Sesi Admin untuk Google Sheets belum aktif.');

  const entries=[...pnOnlinePatchMap.entries()].slice(0,300);
  const patches=entries.map(x=>x[1]);
  pnOnlineSyncBusy=true;
  pnCloudStatus('SHEETS MENYIMPAN...');
  pnRenderLastSync('pending');

  pnOnlineSyncPromise=(async()=>{
    const result=await pnDatabasePost('databaseSheetPatch',{token,patches:JSON.stringify(patches)},30000);
    for(const [key,snapshot] of entries){
      const current=pnOnlinePatchMap.get(key);
      if(current&&JSON.stringify(current)===JSON.stringify(snapshot))pnOnlinePatchMap.delete(key);
    }
    pnPersistOnlinePatches();

    const touched=[...new Set(patches.map(p=>p.sheet))];
    touched.forEach(sh=>pnSetOnlineSheetVersion(sh,result.version));
    pnSetOnlineVersion(result.version);
    pnSetLastSync(new Date().toISOString());
    pnCloudStatus('GOOGLE SHEETS ONLINE');
    return result;
  })();

  let result;
  try{
    result=await pnOnlineSyncPromise;
  }finally{
    pnOnlineSyncPromise=null;
    pnOnlineSyncBusy=false;
  }

  if(pnOnlinePatchMap.size){
    const next=await pnFlushOnlinePatches();
    return Object.assign({},result,{count:Number(result.count||0)+Number(next.count||0)});
  }
  return result;
}

async function pnRefreshOnlineSheet(sheet,moduleKey='',force=false){
  sheet=String(sheet||'');
  if(!PN_ONLINE_DB_SHEETS.has(sheet)||!zipEntries||!docs[sheet]||pnOnlineRefreshBusy.has(sheet))return false;

  const hasPending=[...pnOnlinePatchMap.values()].some(p=>p.sheet===sheet);
  if(hasPending){
    try{await pnFlushOnlinePatches()}catch(_){return false}
    if([...pnOnlinePatchMap.values()].some(p=>p.sheet===sheet))return false;
  }

  const token=await pnOnlineToken();
  if(!token)return false;
  pnOnlineRefreshBusy.add(sheet);
  try{
    const status=await pnDatabaseJsonp('databaseOnlineStatus',{token},12000);
    const serverVersion=String(status.version||'0');
    if(!force&&pnOnlineSheetVersion(sheet)===serverVersion)return true;
    pnCloudStatus('AMBIL '+sheet.toUpperCase());
    const r=await pnDatabaseJsonp('databaseSheetRead',{token,sheet},30000);
    const values=Array.isArray(r.values)?r.values:[];
    pnOnlineApplySuspend=true;
    try{
      for(let rr=0;rr<values.length;rr++){
        const row=values[rr]||[];
        for(let cc=0;cc<row.length;cc++){
          const addr=pnColName(cc+1)+(rr+1);
          const incoming=row[cc]??'';
          const current=cellText(docs[sheet],cellMaps[sheet],addr);
          if(String(current)===String(incoming??''))continue;
          if(incoming===''||incoming===null)clearCell(sheet,addr,true);
          else writeOrCache(sheet,addr,incoming,typeof incoming==='number');
        }
      }
      const m=(typeof modules!=='undefined'&&moduleKey&&modules[moduleKey])?modules[moduleKey]:null;
      if(m&&m.sheet===sheet&&m.primary){
        let localLast=m.start-1;
        for(let row=m.end;row>=m.start;row--){if(trim(cellText(docs[sheet],cellMaps[sheet],m.primary+row))){localLast=row;break}}
        const serverLast=Math.max(1,Number(r.rows||values.length||1));
        if(localLast>serverLast){
          const cols=Math.max(1,Number(r.cols||0));
          for(let row=serverLast+1;row<=localLast;row++){
            for(let col=1;col<=cols;col++){
              const addr=pnColName(col)+row;
              if(trim(cellText(docs[sheet],cellMaps[sheet],addr)))clearCell(sheet,addr,true);
            }
          }
        }
      }
    }finally{
      pnOnlineApplySuspend=false;
      dirtySheets.delete(sheet);
    }
    pnSetOnlineSheetVersion(sheet,r.version||serverVersion);
    pnSetOnlineVersion(r.version||serverVersion);
    pnCloudStatus('GOOGLE SHEETS ONLINE');
    if(typeof activeModule!=='undefined'&&moduleKey===activeModule){
      if(typeof renderRecords==='function')renderRecords(false);
      if(moduleKey==='attendance'&&typeof loadAttendanceCurrent==='function')loadAttendanceCurrent();
    }
    return true;
  }catch(err){
    console.warn('Refresh Google Sheets gagal:',sheet,err);
    return false;
  }finally{pnOnlineRefreshBusy.delete(sheet)}
}

async function pnRefreshOnlineCore(force=false){
  if(!zipEntries)return false;
  const jobs=[];
  if(docs['Data Siswa'])jobs.push(pnRefreshOnlineSheet('Data Siswa','siswa',force));
  if(docs['Data Pengurus'])jobs.push(pnRefreshOnlineSheet('Data Pengurus','pengurus',force));
  await Promise.all(jobs);
  if(typeof loadCaches==='function')loadCaches();
  if(typeof loadPengurusPeople==='function')loadPengurusPeople();
  if(typeof refreshDashboard==='function')refreshDashboard();
  return true;
}

window.addEventListener('pn:module-open',event=>{
  const d=event.detail||{};
  setTimeout(async()=>{
    await pnRefreshOnlineCore(false);
    if(d.sheet!=='Data Siswa'&&d.sheet!=='Data Pengurus'){
      await pnRefreshOnlineSheet(d.sheet,d.module,false);
    }
  },30);
});

function pnPending(){
  try{return localStorage.getItem(PN_DB_PENDING_KEY)||''}catch(_){return''}
}
function pnSetPending(value){
  try{
    if(value)localStorage.setItem(PN_DB_PENDING_KEY,String(value));
    else localStorage.removeItem(PN_DB_PENDING_KEY);
  }catch(_){}
}
function pnLastSyncStored(){
  try{return localStorage.getItem(PN_DB_LAST_SYNC_KEY)||''}catch(_){return''}
}
function pnMasterFileId(){
  try{return localStorage.getItem(PN_DB_MASTER_ID_KEY)||''}catch(_){return''}
}
function pnSetMasterFileId(value){
  try{
    if(value)localStorage.setItem(PN_DB_MASTER_ID_KEY,String(value));
    else localStorage.removeItem(PN_DB_MASTER_ID_KEY);
  }catch(_){}
}
function pnParseWibTime(value){
  const raw=String(value||'').trim();
  if(!raw)return null;
  const normalized=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)?raw+'+07:00':raw;
  const d=new Date(normalized);
  return Number.isNaN(d.getTime())?null:d;
}
function pnFormatWibTime(value){
  const d=pnParseWibTime(value);
  if(!d)return '';
  const date=new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(d);
  const time=new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'Asia/Jakarta'}).format(d).replace(/\./g,':');
  return date+' • '+time+' WIB';
}
function pnEnsureLastSyncElement(){
  let el=document.getElementById('pnLastSync');
  if(el)return el;
  const name=document.getElementById('dbName');
  const picker=name&&name.closest('.picker');
  if(!picker)return null;
  el=document.createElement('div');
  el.id='pnLastSync';
  el.style.cssText='margin:10px 0 0;padding:9px 11px;border:1px solid #dbe7df;border-radius:9px;background:#f8fafc;color:#475569;font-size:11px;line-height:1.5';
  el.innerHTML='<b>🕒 Sinkronisasi terakhir:</b> belum ada';
  picker.insertAdjacentElement('afterend',el);
  return el;
}
function pnRenderLastSync(state='idle',value=''){
  const el=pnEnsureLastSyncElement();
  if(!el)return;
  if(value){try{localStorage.setItem(PN_DB_LAST_SYNC_KEY,String(value))}catch(_){}}
  const saved=value||pnLastSyncStored();
  const when=pnFormatWibTime(saved);
  let suffix='',color='#475569',background='#f8fafc',border='#dbe7df';
  if(state==='pending'){suffix=' • menyinkronkan perubahan terbaru…';color='#92400e';background='#fff7ed';border='#fed7aa'}
  else if(state==='error'){suffix=' • perubahan terbaru belum tersinkron';color='#991b1b';background='#fef2f2';border='#fecaca'}
  else if(when){color='#166534';background='#ecfdf3';border='#bbf7d0'}
  el.style.color=color;el.style.background=background;el.style.borderColor=border;
  el.innerHTML='<b>🕒 Sinkronisasi terakhir:</b> '+(when||'belum ada')+suffix;
}
function pnSetLastSync(value){pnRenderLastSync('ok',value||new Date().toISOString())}
function pnBytesToBase64(data){
  const bytes=new Uint8Array(exactArrayBuffer(data));
  const chunk=0x8000;
  let binary='';
  for(let i=0;i<bytes.length;i+=chunk){
    binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  }
  return btoa(binary);
}
function pnBase64ToArrayBuffer(value){
  const binary=atob(String(value||''));
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes.buffer;
}
function pnDatabaseJsonp(action,payload={},timeoutMs=20000){
  return new Promise((resolve,reject)=>{
    const cb='pnDbJsonp_'+Date.now()+'_'+Math.random().toString(36).slice(2).replace(/\W/g,'');
    const script=document.createElement('script');
    let done=false;
    const cleanup=()=>{clearTimeout(timer);try{delete window[cb]}catch(_){};script.remove()};
    window[cb]=data=>{if(done)return;done=true;cleanup();if(data&&data.ok)resolve(data);else{const err=new Error(data?.message||'Database pusat menolak permintaan.');err.data=data||{};reject(err)}};
    const q=new URLSearchParams({action,callback:cb,_ts:String(Date.now())});
    Object.entries(payload).forEach(([k,v])=>q.set(k,String(v??'')));
    script.src=PN_DB_ENDPOINT+'?'+q.toString();script.async=true;
    script.onerror=()=>{if(done)return;done=true;cleanup();reject(new Error('Koneksi database pusat gagal.'))};
    const timer=setTimeout(()=>{if(done)return;done=true;cleanup();reject(new Error('Database pusat terlalu lama merespons.'))},timeoutMs);
    document.head.appendChild(script);
  });
}

function pnDatabasePost(action,payload={},timeoutMs=90000){
  return new Promise((resolve,reject)=>{
    const rid='pndb-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    const frame=document.createElement('iframe');
    frame.name='pnDbFrame_'+rid.replace(/[^a-zA-Z0-9_]/g,'');
    frame.style.display='none';
    frame.setAttribute('aria-hidden','true');

    const form=document.createElement('form');
    form.method='POST';
    form.action=PN_DB_ENDPOINT;
    form.target=frame.name;
    form.style.display='none';

    Object.entries({action,rid,...payload}).forEach(([name,value])=>{
      const input=document.createElement('input');
      input.type='hidden';
      input.name=name;
      input.value=String(value??'');
      form.appendChild(input);
    });

    let done=false;
    let pollTimer=0;
    const cleanup=()=>{
      clearTimeout(timer);
      if(pollTimer)clearTimeout(pollTimer);
      window.removeEventListener('message',onMessage);
      form.remove();
      setTimeout(()=>frame.remove(),150);
    };
    const finish=(ok,data)=>{
      if(done)return;
      done=true;
      cleanup();
      if(ok){resolve(data||{ok:true});return}
      const err=new Error(data?.message||'Sinkronisasi database pusat gagal.');
      err.data=data||{};
      reject(err);
    };
    const onMessage=e=>{
      const d=e&&e.data;
      if(!d||d.source!==PN_DB_SOURCE||String(d.rid||'')!==rid)return;
      finish(!!d.ok,d);
    };

    window.addEventListener('message',onMessage);
    const timer=setTimeout(()=>finish(false,{message:'Database pusat terlalu lama merespons.'}),timeoutMs);
    const poll=async()=>{
      if(done)return;
      try{
        const r=await pnDatabaseJsonp('contentResult',{rid},7000);
        if(done)return;
        if(r&&r.pending){pollTimer=setTimeout(poll,700);return}
        finish(!!(r&&r.ok),r);
      }catch(_){if(!done)pollTimer=setTimeout(poll,900)}
    };
    document.body.appendChild(frame);
    document.body.appendChild(form);
    form.submit();
    if(['databaseManifest','databaseSave','databaseHistoryAdd','databaseUploadBegin','databaseUploadChunk','databaseUploadCommit','databaseUploadAbort','databaseSheetPatch'].includes(action))pollTimer=setTimeout(poll,500);
  });
}
function pnHistoryEsc(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function pnHistoryFormatTime(value){
  const d=pnParseWibTime(value);
  if(!d)return String(value||'-');
  const date=new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Jakarta'}).format(d);
  const time=new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'Asia/Jakarta'}).format(d).replace(/\./g,':');
  return date+' • '+time+' WIB';
}
function pnEnsureHistoryUi(){
  if(document.getElementById('pnHistoryBtn'))return;
  const sync=pnEnsureLastSyncElement();
  if(!sync)return;

  const syncNow=document.createElement('button');
  syncNow.id='pnCloudSyncNow';
  syncNow.type='button';
  syncNow.textContent='💾 BACKUP XLSM KE DRIVE';
  syncNow.style.cssText='width:100%;margin:8px 0 0;padding:11px 12px;border:0;border-radius:9px;background:#0f766e;color:#fff;font-weight:900;cursor:pointer';
  syncNow.onclick=async()=>{
    syncNow.disabled=true;
    const old=syncNow.textContent;
    try{
      let token=pnDbToken();
      if(!token&&typeof window.pnEnsureAdminServerSessionV1==='function'){
        token=await window.pnEnsureAdminServerSessionV1();
      }
      if(!token)throw new Error('Sesi Admin/cloud belum aktif.');

      if(!zipEntries){
        syncNow.textContent='💾 MENGAMBIL TEMPLATE XLSM...';
        pnCloudStatus('AMBIL CLOUD...');
        const loaded=await pnRestoreCloudDatabase({quiet:false,forceDownload:true});
        if(!loaded)throw new Error('Master cloud belum berhasil dimuat.');
        pnCloudStatus('CLOUD SIAP');
        return;
      }

      syncNow.textContent='💾 BACKUP XLSM...';
      pnCloudGeneration++;
      pnSetPending('update');
      await pnRunQueuedCloudSync();
    }catch(err){
      setStatus('Cloud belum dapat disiapkan: <b>'+esc(err.message)+'</b>','err');
    }finally{
      syncNow.disabled=false;
      syncNow.textContent=old;
    }
  };
  sync.insertAdjacentElement('afterend',syncNow);

  const live=document.createElement('a');
  live.id='pnOnlineDbLive';
  live.href=PN_ONLINE_DB_URL;
  live.target='_blank';
  live.rel='noopener';
  live.textContent='🟢 BUKA DATABASE GOOGLE SHEETS LIVE';
  live.style.cssText='display:block;text-align:center;text-decoration:none;width:100%;box-sizing:border-box;margin:8px 0 0;padding:11px 12px;border:0;border-radius:9px;background:#15803d;color:#fff;font-weight:900;cursor:pointer';
  syncNow.insertAdjacentElement('beforebegin',live);

  const btn=document.createElement('button');
  btn.id='pnHistoryBtn';btn.type='button';btn.textContent='🕘 RIWAYAT PERUBAHAN';
  btn.style.cssText='width:100%;margin:8px 0 0;padding:10px 12px;border:0;border-radius:9px;background:#0f3d24;color:#fff;font-weight:900;cursor:pointer';
  btn.onclick=()=>window.pnOpenDatabaseHistory();
  syncNow.insertAdjacentElement('afterend',btn);

  const modal=document.createElement('div');
  modal.id='pnHistoryModal';
  modal.style.cssText='display:none;position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.58);padding:18px;overflow:auto';
  modal.innerHTML='<div style="max-width:900px;margin:4vh auto;background:#fff;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.25);overflow:hidden">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;background:#0f172a;color:#fff"><div><b>RIWAYAT PERUBAHAN DATA</b><div style="font-size:11px;opacity:.8;margin-top:3px">100 perubahan terbaru • tersimpan di server</div></div><button id="pnHistoryClose" type="button" style="border:0;border-radius:8px;background:#334155;color:#fff;font-size:20px;width:36px;height:36px;cursor:pointer">×</button></div>'
    +'<div style="padding:12px 14px"><div style="display:flex;justify-content:flex-end;margin-bottom:9px"><button id="pnHistoryReload" type="button" style="border:0;border-radius:8px;background:#166534;color:#fff;padding:8px 12px;font-weight:800;cursor:pointer">↻ MUAT ULANG</button></div><div id="pnHistoryBody" style="min-height:110px"><div style="padding:18px;text-align:center;color:#64748b">Memuat riwayat…</div></div></div></div>';
  modal.addEventListener('click',e=>{if(e.target===modal)window.pnCloseDatabaseHistory()});
  document.body.appendChild(modal);
  document.getElementById('pnHistoryClose').onclick=()=>window.pnCloseDatabaseHistory();
  document.getElementById('pnHistoryReload').onclick=()=>pnLoadDatabaseHistory();
}
async function pnLoadDatabaseHistory(){
  pnEnsureHistoryUi();
  const body=document.getElementById('pnHistoryBody');
  const token=pnDbToken();
  if(!body)return;
  if(!token){body.innerHTML='<div style="padding:18px;text-align:center;color:#991b1b">HUBUNGKAN AKSES admin terlebih dahulu.</div>';return}
  body.innerHTML='<div style="padding:18px;text-align:center;color:#64748b">Memuat riwayat dari server…</div>';
  try{
    const r=await pnDatabaseJsonp('databaseHistoryList',{token,limit:100},20000);
    const rows=Array.isArray(r.history)?r.history:[];
    if(!rows.length){body.innerHTML='<div style="padding:22px;text-align:center;color:#64748b">Belum ada riwayat perubahan. Perubahan berikutnya akan dicatat otomatis.</div>';return}
    body.innerHTML='<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#f1f5f9;color:#334155"><th style="padding:9px;text-align:left">Waktu</th><th style="padding:9px;text-align:left">Aksi</th><th style="padding:9px;text-align:left">Modul / Subjek</th><th style="padding:9px;text-align:left">Detail</th><th style="padding:9px;text-align:left">Admin</th></tr></thead><tbody>'
      +rows.map(x=>{const action=String(x.action||'').toUpperCase();const badge=action==='HAPUS'?'#b91c1c':action==='UBAH'?'#b45309':'#166534';const subject=[x.module,x.subject,x.row?('Baris '+x.row):''].filter(Boolean).join(' • ');return '<tr style="border-top:1px solid #e2e8f0"><td style="padding:9px;white-space:nowrap">'+pnHistoryEsc(pnHistoryFormatTime(x.at))+'</td><td style="padding:9px"><span style="display:inline-block;padding:3px 7px;border-radius:999px;background:'+badge+';color:#fff;font-weight:900">'+pnHistoryEsc(action)+'</span></td><td style="padding:9px">'+pnHistoryEsc(subject||'-')+'</td><td style="padding:9px;min-width:220px">'+pnHistoryEsc(x.detail||'-')+'</td><td style="padding:9px">'+pnHistoryEsc(x.admin||'-')+'</td></tr>'}).join('')
      +'</tbody></table></div>';
  }catch(err){body.innerHTML='<div style="padding:18px;text-align:center;color:#991b1b">Gagal memuat riwayat: '+pnHistoryEsc(err.message)+'</div>'}
}
window.pnOpenDatabaseHistory=function(){pnEnsureHistoryUi();const m=document.getElementById('pnHistoryModal');if(m){m.style.display='block';void pnLoadDatabaseHistory()}};
window.pnCloseDatabaseHistory=function(){const m=document.getElementById('pnHistoryModal');if(m)m.style.display='none'};
async function pnLogDatabaseHistory(message){
  const token=pnDbToken();
  if(!token)return false;
  const text=String(message||'').trim();
  const match=text.match(/^\s*(SIMPAN|UBAH|HAPUS)\b/i);
  if(!match)return false;
  const changeAction=match[1].toUpperCase();
  let moduleName='',subject='',row='';
  try{moduleName=(typeof modules!=='undefined'&&modules[activeModule])?String(modules[activeModule].title||activeModule):String(activeModule||'')}catch(_){}
  try{subject=(typeof selectedPerson!=='undefined'&&selectedPerson)?String(selectedPerson.name||selectedPerson.id||''):''}catch(_){}
  try{row=(typeof selectedRow!=='undefined'&&selectedRow)?String(selectedRow):''}catch(_){}
  try{
    await pnDatabasePost('databaseHistoryAdd',{token,changeAction,module:moduleName,subject,row,detail:text},30000);
    const modal=document.getElementById('pnHistoryModal');
    if(modal&&modal.style.display!=='none')void pnLoadDatabaseHistory();
    return true;
  }catch(err){console.warn('Riwayat perubahan belum dapat dicatat:',err);return false}
}

function pnCloudStatus(label='DATABASE CLOUD'){
  const badge=document.getElementById('saveMode');
  if(badge){
    badge.textContent=label;
    badge.className='badge ok';
  }
}

async function pnDownloadCloudWorkbook(token,quiet,options={}){
  let manifest;
  try{
    manifest=await pnDatabasePost('databaseManifest',{token},30000);
  }catch(err){
    const msg=String(err?.message||'');
    if(!/Action tidak dikenal|tidak dikenal/i.test(msg))throw err;
    const legacy=await pnDatabasePost('databaseGet',{token},90000);
    if(!legacy.exists)return {exists:false};
    if(!legacy.base64)throw new Error('Isi database pusat tidak tersedia.');
    return {exists:true,fileId:legacy.fileId||'',name:legacy.name,size:legacy.size,updatedAt:legacy.updatedAt,bytes:pnBase64ToArrayBuffer(legacy.base64)};
  }

  if(!manifest.exists)return {exists:false};
  if(!/^[A-Fa-f0-9]{64}$/.test(String(manifest.ticket||'')))throw new Error('Ticket database cloud tidak tersedia.');
  const count=Number(manifest.chunkCount||0);
  const size=Number(manifest.size||0);
  if(!Number.isInteger(count)||count<1||count>64||!Number.isFinite(size)||size<1)throw new Error('Metadata database cloud tidak valid.');

  // FAST PATH:
  // Jika salinan browser sudah sama persis dengan timestamp master server,
  // jangan download ulang seluruh Excel. Cukup gunakan workbook lokal yang sudah terbuka.
  const forceDownload=!!options.forceDownload;
  const serverUpdated=String(manifest.updatedAt||'').trim();
  const localUpdated=String(pnLastSyncStored()||'').trim();
  const serverName=String(manifest.name||'').trim();
  const localName=String(originalName||'').trim();
  const sameName=!serverName||!localName||serverName===localName;
  if(!forceDownload&&zipEntries&&serverUpdated&&localUpdated===serverUpdated&&sameName){
    pnCloudStatus('CLOUD TERBARU');
    if(!quiet)setStatus('✓ Database browser sudah sama dengan <b>SERVER CLOUD</b>. Tidak perlu download ulang file Excel.','ok');
    return {exists:true,reusedLocal:true,fileId:manifest.fileId||'',name:manifest.name,size,updatedAt:manifest.updatedAt};
  }

  const chunks=new Array(count);
  let next=0,done=0;
  const updateProgress=()=>{
    pnCloudStatus('MUAT CLOUD '+done+'/'+count);
    if(!quiet)setStatus('Mengunduh database cloud bertahap: <b>'+done+' / '+count+'</b> bagian...');
  };
  updateProgress();

  async function worker(){
    while(true){
      const index=next++;
      if(index>=count)return;
      const r=await pnDatabaseJsonp('databaseChunk',{ticket:manifest.ticket,index},45000);
      if(!r.exists||Number(r.index)!==index||!r.base64)throw new Error('Potongan database cloud '+(index+1)+' tidak valid.');
      chunks[index]=new Uint8Array(pnBase64ToArrayBuffer(r.base64));
      done++;
      updateProgress();
    }
  }

  const workers=[];
  const concurrency=Math.min(PN_DB_DOWNLOAD_CONCURRENCY,count);
  for(let i=0;i<concurrency;i++)workers.push(worker());
  await Promise.all(workers);

  const out=new Uint8Array(size);
  let offset=0;
  for(const part of chunks){
    if(!part)throw new Error('Database cloud belum lengkap.');
    if(offset+part.length>out.length)throw new Error('Ukuran database cloud tidak sesuai metadata.');
    out.set(part,offset);
    offset+=part.length;
  }
  if(offset!==size)throw new Error('Database cloud tidak lengkap ('+offset+' dari '+size+' byte).');

  return {exists:true,fileId:manifest.fileId||'',name:manifest.name,size,updatedAt:manifest.updatedAt,bytes:out.buffer};
}

async function pnRestoreCloudDatabase(options={}){
  const quiet=!!options.quiet;
  const token=pnDbToken();
  if(!token||pnCloudBusy||pnCloudSaveBusy)return false;

  pnCloudBusy=true;
  pnCloudCheckedToken=token;
  try{
    if(!quiet)setStatus('Menghubungkan database Excel utama dari server...');
    const result=await pnDownloadCloudWorkbook(token,quiet,options);
    if(!result.exists){
      pnCloudLoaded=false;
      if(!quiet)setStatus('Database Excel pusat belum tersedia. Upload database sekali dari perangkat utama.');
      return false;
    }

    if(result.reusedLocal){
      pnCloudLoaded=true;
      pnCloudLoadedToken=token;
      pnSetPending('');
      pnCloudStatus();
      pnSetLastSync(result.updatedAt);
      pnSetMasterFileId(result.fileId);
      if(!quiet)setStatus('✓ Database yang sudah tersimpan di browser masih <b>VERSI TERBARU</b>. Tidak ada download ulang.','ok');
      return true;
    }

    const bytes=result.bytes;
    fileHandle=null;
    autosaveMode=false;
    await prepareWorkbook(bytes,result.name||'Database_Pagar_Nusa_BROWSER.xlsm');
    await cacheDatabase(bytes,result.name||originalName,null,false);

    pnCloudLoaded=true;
    pnCloudLoadedToken=token;
    dirty=false;
    dirtySheets.clear();
    pnSetPending('');
    pnCloudStatus();
    pnSetLastSync(result.updatedAt);
    pnSetMasterFileId(result.fileId);
    setStatus('✓ Database utama dimuat dari <b>SERVER CLOUD</b>. Data yang sama siap digunakan dari perangkat ini.','ok');
    return true;
  }catch(err){
    console.warn('Database cloud belum dapat dimuat:',err);
    pnCloudStatus('CLOUD GAGAL');
    if(!quiet)setStatus('Database cloud belum dapat dimuat: <b>'+esc(err.message)+'</b>. Salinan browser tetap dapat digunakan.','err');
    return false;
  }finally{
    pnCloudBusy=false;
  }
}
window.restoreCloudDatabase=pnRestoreCloudDatabase;

async function pnSaveCloudWorkbook(out,name,initialOnly){
  const token=pnDbToken();
  if(!token)throw new Error('Sesi database pusat belum aktif. Login admin terlebih dahulu.');

  const bytes=out instanceof Uint8Array?out:new Uint8Array(exactArrayBuffer(out));
  const expectedFileId=initialOnly?'':pnMasterFileId();
  const expectedUpdatedAt=initialOnly?'':pnLastSyncStored();
  const chunkBytes=1536*1024;
  const total=Math.ceil(bytes.length/chunkBytes);
  if(!bytes.length)throw new Error('Database yang akan disimpan kosong.');

  let uploadId='';
  try{
    pnCloudStatus('CLOUD 0/'+total);
    const begin=await pnDatabasePost('databaseUploadBegin',{
      token,
      name:name||originalName||'Database_Pagar_Nusa_BROWSER.xlsm',
      size:bytes.length,
      total,
      initialOnly:initialOnly?'1':'0',
      expectedFileId,
      expectedUpdatedAt
    },30000);
    uploadId=String(begin.uploadId||'');
    if(!uploadId)throw new Error('Server tidak memberikan ID upload database.');

    let next=0,done=0;
    const workers=[];
    const concurrency=Math.min(4,total);

    const worker=async()=>{
      while(true){
        const index=next++;
        if(index>=total)return;
        const start=index*chunkBytes;
        const end=Math.min(bytes.length,start+chunkBytes);
        const part=bytes.subarray(start,end);
        await pnDatabasePost('databaseUploadChunk',{
          token,uploadId,index,total,
          base64:pnBytesToBase64(part)
        },60000);
        done++;
        pnCloudStatus('CLOUD '+done+'/'+total);
        pnRenderLastSync('pending');
      }
    };

    for(let i=0;i<concurrency;i++)workers.push(worker());
    await Promise.all(workers);

    pnCloudStatus('CLOUD SIMPAN...');
    const result=await pnDatabasePost('databaseUploadCommit',{
      token,uploadId,total
    },90000);

    pnCloudLoaded=true;
    pnCloudCheckedToken=token;
    pnCloudLoadedToken=token;
    pnCloudLastBackgroundCheck=Date.now();
    pnCloudStatus('CLOUD TERSIMPAN');
    pnSetLastSync(result.updatedAt);
    pnSetMasterFileId(result.fileId);
    pnRenderLastSync('success');
    return result;
  }catch(err){
    if(uploadId){
      pnDatabasePost('databaseUploadAbort',{token,uploadId,total},15000).catch(()=>{});
    }
    throw err;
  }
}

function pnInitialUploadBytes(rawBytes){
  if(rawBytes)return exactArrayBuffer(rawBytes);
  return buildCurrentWorkbook();
}

function pnInitializeCloudFromCurrent(rawBytes=null,rawName=''){
  if(!zipEntries)return Promise.resolve(false);
  if(pnCloudLoaded)return Promise.resolve(true);
  if(pnInitialUploadPromise)return pnInitialUploadPromise;

  const token=pnDbToken();
  if(!token){
    setStatus('Database tersimpan di browser. Untuk menyimpan sebagai <b>DATABASE UTAMA LINTAS PERANGKAT</b>, klik HUBUNGKAN AKSES terlebih dahulu.','err');
    return Promise.resolve(false);
  }

  pnInitialUploadPromise=(async()=>{
    try{
      // Selalu cek master cloud terlebih dahulu. Ini membersihkan status upload lama
      // dan mencegah workbook besar dikirim ulang jika master sudah ada di Drive.
      try{
        const existing=await pnDatabasePost('databaseManifest',{token},15000);
        if(existing&&existing.exists){
          pnSetPending('');
          setStatus('Database utama sudah tersedia di <b>SERVER CLOUD</b>. Memuat master cloud tanpa upload ulang...','ok');
          const loaded=await pnRestoreCloudDatabase({quiet:false,forceDownload:true});
          if(loaded)return true;
          throw new Error('Master cloud ditemukan tetapi belum berhasil dimuat.');
        }
      }catch(checkErr){
        if(String(checkErr?.message||'').includes('Master cloud ditemukan'))throw checkErr;
        console.warn('Pemeriksaan master cloud belum selesai:',checkErr);
      }

      pnSetPending('initial');
      pnCloudStatus('UPLOAD CLOUD...');
      setStatus('Mengunggah database utama ke server untuk pertama kali. <b>Aplikasi tetap dapat digunakan selama proses berjalan.</b>');
      const out=pnInitialUploadBytes(rawBytes);
      const name=rawName||originalName;
      await pnSaveCloudWorkbook(out,name,true);
      dirty=false;
      dirtySheets.clear();
      await cacheDatabase(out,name||originalName,null,false);
      pnSetPending('');
      pnCloudStatus();
      setStatus('✓ Database utama berhasil diunggah <b>SEKALI</b> ke server. Perangkat lain sekarang cukup login admin; tidak perlu upload ulang.','ok');
      return true;
    }catch(err){
      if(err.data&&err.data.code==='MASTER_EXISTS'){
        pnSetPending('');
        setStatus('Database utama sudah ada di server. File dari perangkat ini <b>TIDAK MENIMPA</b> database pusat. Memuat database pusat...','ok');
        await pnRestoreCloudDatabase({quiet:false,forceDownload:true});
        return true;
      }
      try{
        const check=await pnDatabasePost('databaseManifest',{token},30000);
        if(check&&check.exists){
          pnCloudLoaded=true;
          pnCloudLoadedToken=token;
          pnSetPending('');
          pnCloudStatus();
          setStatus('✓ Database utama sudah tersimpan di <b>SERVER CLOUD</b>. Konfirmasi upload diterima setelah pemeriksaan server.','ok');
          return true;
        }
      }catch(_){}
      console.error(err);
      pnCloudStatus('CLOUD TERTUNDA');
      setStatus('Upload database pusat belum selesai: <b>'+esc(err.message)+'</b>. Data lokal tetap aman dan akan dicoba lagi otomatis.','err');
      return false;
    }finally{
      pnInitialUploadPromise=null;
    }
  })();

  return pnInitialUploadPromise;
}

async function pnRunQueuedCloudSync(){
  pnCloudSaveTimer=0;
  if(pnCloudSaveBusy){
    pnCloudSaveQueued=true;
    return;
  }
  if(!zipEntries||!pnDbToken())return;

  pnCloudSaveBusy=true;
  pnCloudSaveQueued=false;
  const generation=pnCloudGeneration;
  pnCloudStatus('MENYIMPAN CLOUD...');
  pnRenderLastSync('pending');
  setStatus('☁ <b>Menyimpan perubahan ke cloud...</b> Data lokal sudah aman; tunggu sampai muncul CLOUD TERSIMPAN.','ok');

  try{
    const out=buildCurrentWorkbook();
    await pnSaveCloudWorkbook(out,originalName,false);
    if(pnCloudGeneration===generation&&!pnCloudSaveQueued){
      pnSetPending('');
      pnCloudStatus('CLOUD TERSIMPAN');
      setStatus('☁ ✓ <b>CLOUD TERSIMPAN.</b> Data terbaru sudah siap dibuka dari perangkat lain.','ok');
    }
  }catch(err){
    console.error('Sinkronisasi database cloud gagal:',err);
    const code=String(err?.data?.code||'');
    if(code==='MASTER_CHANGED'||code==='MASTER_VERSION_REQUIRED'){
      pnSetPending('update');
      pnCloudStatus('KONFLIK CLOUD');
      pnRenderLastSync('error');
      setStatus('<b>KONFLIK AMAN:</b> cloud berubah sejak sinkronisasi terakhir. Data lokal dan cloud <b>tetap dipertahankan</b>; tidak ada yang ditimpa otomatis.','err');
    }else{
      pnSetPending('update');
      pnCloudStatus('CLOUD TERTUNDA');
      pnRenderLastSync('error');
      setStatus('Data sudah aman di perangkat ini. Sinkronisasi cloud akan dicoba lagi otomatis: <b>'+esc(err.message)+'</b>','err');
    }
  }finally{
    pnCloudSaveBusy=false;
    if(pnCloudSaveQueued||pnCloudGeneration>generation){
      pnScheduleCloudSync(false);
    }
  }
}

function pnScheduleCloudSync(markChange=true){
  if(!zipEntries||!pnDbToken())return false;
  if(markChange)pnCloudGeneration++;
  if(pnPending()!=='initial')pnSetPending('update');
  if(markChange)pnRenderLastSync('pending');

  if(pnCloudSaveBusy){
    pnCloudSaveQueued=true;
    return true;
  }
  if(pnCloudSaveTimer)return true;

  pnCloudSaveTimer=setTimeout(pnRunQueuedCloudSync,PN_DB_SYNC_DELAY);
  return true;
}

const pnOriginalChooseDatabase=window.chooseDatabase;
if(typeof pnOriginalChooseDatabase==='function'){
  window.chooseDatabase=async function(){
    const beforeEntries=zipEntries;
    const beforeName=originalName;
    await pnOriginalChooseDatabase();
    if(!zipEntries||(zipEntries===beforeEntries&&originalName===beforeName))return;
    void pnInitializeCloudFromCurrent();
  };
}

const pnOriginalLoadSelectedFile=window.loadSelectedFile;
if(typeof pnOriginalLoadSelectedFile==='function'){
  window.loadSelectedFile=async function(file){
    if(!file)return;
    const beforeEntries=zipEntries;
    const rawPromise=(typeof file.arrayBuffer==='function')
      ? file.arrayBuffer().catch(()=>null)
      : Promise.resolve(null);

    await pnOriginalLoadSelectedFile(file);
    if(!zipEntries||zipEntries===beforeEntries)return;

    const raw=await rawPromise;
    void pnInitializeCloudFromCurrent(raw,file.name||originalName);
  };
}

const pnOriginalPersistWorkingCopy=window.persistWorkingCopy;
if(typeof pnOriginalPersistWorkingCopy==='function'){
  window.persistWorkingCopy=async function(){
    const localResult=await pnOriginalPersistWorkingCopy();
    if(!zipEntries)return localResult;
    dirty=false;
    dirtySheets.clear();
    return Object.assign({},localResult,{cloud:false,cloudQueued:false,onlinePrimary:true});
  };
}

window.afterMutation=async function(msg){
  await window.persistWorkingCopy();
  void pnLogDatabaseHistory(msg);
  try{
    const r=await pnFlushOnlinePatches();
    setStatus('<b>'+esc(msg)+'</b>. ✓ <b>TERSIMPAN DI GOOGLE SHEETS</b> dan siap dibuka dari perangkat lain'+(r.count?(' ('+r.count+' sel diperbarui).'):'.'),'ok');
  }catch(err){
    pnRenderLastSync('error');
    pnCloudStatus('SHEETS TERTUNDA');
    setStatus('<b>'+esc(msg)+'</b>. Lokal aman, tetapi Google Sheets belum tersimpan: <b>'+esc(err.message)+'</b>. Akan dicoba lagi otomatis.','err');
  }
};

window.pnSyncGoogleSheetsNow=async function(){
  const status=document.getElementById('status');
  try{
    const token=await pnOnlineToken();
    if(!token)throw new Error('Sesi Admin Google Sheets belum aktif. Silakan login Admin sekali lagi.');

    if(status){status.className='status';status.innerHTML='↻ <b>Menyinkronkan Google Sheets...</b>'}
    pnCloudStatus('SHEETS MENYIMPAN...');

    const pending=await pnFlushOnlinePatches();
    if(zipEntries){
      await pnRefreshOnlineCore(true);
      if(typeof activeModule!=='undefined'&&typeof modules!=='undefined'&&modules[activeModule]){
        const m=modules[activeModule];
        if(m.sheet!=='Data Siswa'&&m.sheet!=='Data Pengurus'){
          await pnRefreshOnlineSheet(m.sheet,activeModule,true);
        }
      }
    }

    pnCloudStatus('GOOGLE SHEETS ONLINE');
    pnSetLastSync(new Date().toISOString());
    pnRenderLastSync('success');
    if(status){
      status.className='status ok';
      status.innerHTML='✓ <b>GOOGLE SHEETS ONLINE.</b> Semua perubahan yang tertunda sudah dikirim dan data terbaru sudah dibaca dari Drive'+(pending&&pending.count?(' ('+pending.count+' sel disimpan).'):'.');
    }
    return true;
  }catch(err){
    pnCloudStatus('SHEETS TERTUNDA');
    pnRenderLastSync('error');
    if(status){
      status.className='status err';
      status.innerHTML='Google Sheets belum selesai disinkronkan: <b>'+esc(err&&err.message||err)+'</b>';
    }
    return false;
  }
};

async function pnMaybeLoadCloud(force=false){
  if(!pnDatabasePanelOpen())return false;
  if(pnCloudBusy||pnCloudSaveBusy)return false;

  let token=pnDbToken();
  if(!token&&typeof window.pnEnsureAdminServerSessionV1==='function'){
    try{token=await window.pnEnsureAdminServerSessionV1()}catch(err){
      pnCloudStatus('BELUM TERHUBUNG');
      if(!zipEntries)setStatus('Database lokal belum ada. Login Admin sekali lagi agar master cloud dapat dimuat otomatis.','err');
      return false;
    }
  }
  if(!token)return false;

  if(!zipEntries){
    pnCloudStatus('MENYIAPKAN DATA...');
    setStatus('Menyiapkan mesin data perangkat ini. Setelah siap, seluruh data LIVE dibaca dari Google Sheets...','ok');
    const loaded=await pnRestoreCloudDatabase({quiet:false,forceDownload:true});
    if(loaded){
      setTimeout(async()=>{
        await pnRefreshOnlineCore(true);
        if(typeof activeModule!=='undefined'&&typeof modules!=='undefined'&&modules[activeModule]){
          const m=modules[activeModule];
          if(m.sheet!=='Data Siswa'&&m.sheet!=='Data Pengurus'){
            await pnRefreshOnlineSheet(m.sheet,activeModule,true);
          }
        }
      },60);
    }
    return loaded;
  }

  pnCloudStatus('GOOGLE SHEETS ONLINE');
  return true;

  const pending=pnPending();
  if(pending==='initial'){
    if(!pnInitialUploadPromise)void pnInitializeCloudFromCurrent();
    return true;
  }
  if(pending==='update'){
    pnScheduleCloudSync(false);
    return true;
  }

  const now=Date.now();
  if(!force&&pnCloudLastBackgroundCheck&&now-pnCloudLastBackgroundCheck<PN_DB_BACKGROUND_CHECK_MS)return true;
  pnCloudLastBackgroundCheck=now;

  if(token===pnCloudLoadedToken&&pnCloudLoaded&&!force)return true;
  if(token===pnCloudCheckedToken&&!pnCloudLoaded&&!force)return false;
  pnCloudStatus('LOCAL SIAP • CEK CLOUD');
  void pnRestoreCloudDatabase({quiet:true});
  return true;
}

setTimeout(()=>pnRenderLastSync('idle'),120);
setTimeout(()=>pnEnsureHistoryUi(),180);
window.addEventListener('pn:database-panel-open',()=>{
  setTimeout(async()=>{
    await pnMaybeLoadCloud(true);
    if(!zipEntries)return;
    await pnRefreshOnlineCore(true);
    if(typeof activeModule!=='undefined'&&typeof modules!=='undefined'&&modules[activeModule]){
      const m=modules[activeModule];
      if(m.sheet!=='Data Siswa'&&m.sheet!=='Data Pengurus'){
        await pnRefreshOnlineSheet(m.sheet,activeModule,true);
      }
    }
    pnCloudStatus('GOOGLE SHEETS ONLINE');
  },60);
});
setInterval(()=>{
  if(pnOnlinePatchMap.size)pnFlushOnlinePatches().catch(()=>{});
  if(pnDatabasePanelOpen())pnMaybeLoadCloud(false);
},PN_DB_BACKGROUND_CHECK_MS);
window.addEventListener('online',()=>{
  pnCloudCheckedToken='';
  if(pnOnlinePatchMap.size)pnFlushOnlinePatches().catch(()=>{});
  pnMaybeLoadCloud();
});
})();
