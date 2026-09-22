(()=>{
'use strict';

const ENDPOINT='https://script.google.com/macros/s/AKfycbyJi_83lJ11JshOLCzIBRMX6fEi-y9UGR9eYULuqH1BivdxeqcgMB0l2ehWBIgaad8Oyw/exec';
const TOKEN_KEY='pnReviewAdminToken';
const SOURCE='pn-content';
let publicGallery=[];
let adminContent=[];
let adminGallery=[];
let editingContentId='';
let editingGalleryId='';
let activeTab='content';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const makeRid=()=>`cms-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function jsonp(action,payload={},timeout=18000){
  return new Promise((resolve,reject)=>{
    const cb='pnCmsCb_'+Date.now()+'_'+Math.random().toString(36).slice(2).replace(/\W/g,'');
    const script=document.createElement('script');
    let done=false;
    const clean=()=>{clearTimeout(timer);delete window[cb];script.remove()};
    window[cb]=data=>{if(done)return;done=true;clean();resolve(data)};
    const params=new URLSearchParams({action,callback:cb,_ts:String(Date.now())});
    Object.entries(payload).forEach(([k,v])=>params.set(k,String(v??'')));
    script.src=ENDPOINT+'?'+params.toString();
    script.async=true;
    script.onerror=()=>{if(done)return;done=true;clean();reject(new Error('Koneksi database konten gagal.'))};
    const timer=setTimeout(()=>{if(done)return;done=true;clean();reject(new Error('Database konten terlalu lama merespons.'))},timeout);
    document.head.appendChild(script);
  });
}

async function postReliable(action,payload={},timeout=45000){
  const rid=makeRid();
  return new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe');
    frame.name='pnCmsFrame_'+rid.replace(/\W/g,'');
    frame.style.display='none';
    frame.setAttribute('aria-hidden','true');
    const form=document.createElement('form');
    form.method='POST';form.action=ENDPOINT;form.target=frame.name;form.style.display='none';
    Object.entries({action,rid,...payload}).forEach(([k,v])=>{
      const input=document.createElement('input');input.type='hidden';input.name=k;input.value=String(v??'');form.appendChild(input);
    });

    let done=false;
    let pollTimer=0;
    let hardTimer=0;

    const cleanup=()=>{
      if(pollTimer)clearTimeout(pollTimer);
      if(hardTimer)clearTimeout(hardTimer);
      window.removeEventListener('message',onMessage);
      setTimeout(()=>frame.remove(),120);
    };
    const succeed=data=>{if(done)return;done=true;cleanup();resolve(data)};
    const fail=err=>{if(done)return;done=true;cleanup();reject(err instanceof Error?err:new Error(String(err||'Koneksi server konten gagal.')))};

    const onMessage=e=>{
      const d=e&&e.data;
      if(!d||d.source!==SOURCE||String(d.rid||'')!==rid)return;
      if(d.ok)succeed(d);
      else fail(new Error(d.message||'Perubahan konten ditolak server.'));
    };
    window.addEventListener('message',onMessage);

    const poll=async()=>{
      if(done)return;
      try{
        const r=await jsonp('contentResult',{rid},6500);
        if(done)return;
        if(r&&r.pending){pollTimer=setTimeout(poll,700);return}
        if(r&&r.ok){succeed(r);return}
        if(r&&!r.pending){fail(new Error(r.message||'Perubahan konten ditolak server.'));return}
      }catch(_){
        if(!done)pollTimer=setTimeout(poll,900);
      }
    };

    hardTimer=setTimeout(()=>fail(new Error('Server konten tidak merespons tepat waktu. Silakan coba lagi.')),timeout);
    document.body.append(frame,form);
    form.submit();
    form.remove();
    pollTimer=setTimeout(poll,1200);
  });
}

function ensureStyles(){
  if($('pnCmsStyles'))return;
  const s=document.createElement('style');s.id='pnCmsStyles';s.textContent=`
  .pnCmsCard{border:1px solid #b9d4c2!important;overflow:hidden}.pnCmsHead{display:flex;justify-content:space-between;align-items:center;gap:12px}.pnCmsHeadActions{display:flex;gap:7px;flex-wrap:wrap}.pnCmsBtn{border:0;border-radius:8px;padding:9px 12px;font-weight:900;cursor:pointer}.pnCmsBtn.green{background:#166534;color:#fff}.pnCmsBtn.teal{background:#0f766e;color:#fff}.pnCmsBtn.light{background:#e8f1eb;color:#14532d}.pnCmsBtn.red{background:#fee2e2;color:#991b1b}.pnCmsBtn:disabled{opacity:.55;cursor:not-allowed}.pnCmsStatus{margin:0 0 12px;padding:9px 11px;border-radius:8px;background:#fff7ed;border:1px solid #fed7aa;color:#92400e;font-size:11px;font-weight:800}.pnCmsStatus.ok{background:#ecfdf3;border-color:#bbf7d0;color:#166534}.pnCmsStatus.err{background:#fef2f2;border-color:#fecaca;color:#991b1b}.pnCmsTabs{display:flex;gap:8px;margin-bottom:13px}.pnCmsTab{flex:1;border:1px solid #cfe0d5;border-radius:9px;padding:10px;background:#f7fbf8;color:#14532d;font-weight:900;cursor:pointer}.pnCmsTab.active{background:#14532d;color:#fff;border-color:#14532d}.pnCmsGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px}.pnCmsField.full{grid-column:1/-1}.pnCmsField label{display:block;margin:0 0 5px;font-size:10px;font-weight:900;color:#334155}.pnCmsField input,.pnCmsField select,.pnCmsField textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:9px 10px;background:#fff;font:inherit;font-size:11px}.pnCmsField textarea{min-height:84px;resize:vertical}.pnCmsActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.pnCmsList{display:grid;gap:9px;margin-top:15px}.pnCmsItem{display:grid;grid-template-columns:1fr auto;gap:10px;padding:11px;border:1px solid #dbe7df;border-radius:10px;background:#fff}.pnCmsItem h4{margin:0 0 5px;color:#14532d;font-size:12px}.pnCmsItem p{margin:0;color:#64748b;font-size:10px;line-height:1.55}.pnCmsItemBtns{display:flex;gap:5px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.pnCmsMini{border:0;border-radius:7px;padding:7px 8px;font-size:9px;font-weight:900;cursor:pointer}.pnCmsMini.edit{background:#e0f2fe;color:#075985}.pnCmsMini.del{background:#fee2e2;color:#991b1b}.pnCmsMini.pub{background:#dcfce7;color:#166534}.pnCmsGalleryItem{grid-template-columns:82px 1fr auto;align-items:center}.pnCmsThumb{width:82px;height:62px;object-fit:cover;border-radius:8px;border:1px solid #dbe7df;background:#f1f5f9}.pnCmsPreview{width:100%;max-height:220px;object-fit:contain;border-radius:10px;background:#f8fafc;border:1px dashed #cbd5e1;margin-top:7px}.pnCmsHidden{display:none!important}.pnCmsPublicModal{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(2,6,23,.66)}.pnCmsPublicModalCard{width:min(720px,100%);max-height:85vh;overflow:auto;background:#fff;border-radius:15px;box-shadow:0 24px 70px rgba(0,0,0,.28)}.pnCmsPublicModalHead{padding:18px 20px;background:#14532d;color:#fff}.pnCmsPublicModalHead h3{margin:0;font-size:18px}.pnCmsPublicModalHead p{margin:6px 0 0;font-size:11px;opacity:.9}.pnCmsPublicModalBody{padding:20px;color:#334155;font-size:13px;line-height:1.8;white-space:normal;text-align:justify;text-justify:inter-word}.pnCmsPublicModalBody p{margin:0 0 14px;text-align:justify;text-justify:inter-word}.pnCmsPublicModalBody p:last-child{margin-bottom:0}.pnCmsPublicModalClose{float:right;border:0;background:rgba(255,255,255,.16);color:#fff;width:32px;height:32px;border-radius:50%;font-size:20px;cursor:pointer}
  @media(max-width:760px){.pnCmsGrid{grid-template-columns:1fr}.pnCmsField.full{grid-column:auto}.pnCmsHead{align-items:flex-start;flex-direction:column}.pnCmsItem,.pnCmsGalleryItem{grid-template-columns:1fr}.pnCmsThumb{width:100%;height:180px}}`;
  document.head.appendChild(s);
}

function token(){try{return localStorage.getItem(TOKEN_KEY)||sessionStorage.getItem(TOKEN_KEY)||''}catch(_){try{return sessionStorage.getItem(TOKEN_KEY)||''}catch(__){return''}}}
function setToken(v){try{localStorage.setItem(TOKEN_KEY,v)}catch(_){};try{sessionStorage.setItem(TOKEN_KEY,v)}catch(_){}}
function updateAccessButton(){
  const btn=$('pnCmsConnect');
  if(!btn)true;
  const has=!!token();
  btn.textContent=has?'✓ AKSES OTOMATIS':'🔐 HUBUNGKAN AKSES';
  btn.classList.toggle('light',has);
  btn.classList.toggle('teal',!has);
  btn.setAttribute('title',has?'Akses konten sudah terhubung otomatis dari sesi login admin.':'Hubungkan akses konten online.');
  return has;
}
function setToken(v){try{localStorage.setItem(TOKEN_KEY,v)}catch(_){};try{sessionStorage.setItem(TOKEN_KEY,v)}catch(_){}}

function setAccessButton(){updateAccessButton()}
function setStatus(text,kind=''){const st=$('pnCmsStatus');if(!st)return;st.textContent=text;st.className='pnCmsStatus '+(kind||'')}
function setBusy(btn,on,text='MENTINGGU,...'){if(!btn)return;btn.disabled=on;if(on){btn.dataset.oldText=btn.textContent;btn.textContent=text}else{btn.textContent=btn.dataset.oldText||btn.textContent}}

async function connectContent(){
  const existing=token();
  if(existing){
    updateAccessButton();
    setStatus('✓ Akses otomatis sudah terhubung. Memuat data online...','ok');
    await loadAdmin();
    retur true;
  }
  const password=prompt('Masukkan password admin untuk menghubungkan konten online:','');
  if(password===null)return false;
  const username=(typeof PN_ADMIN_USER!=='undefined'&&PN_ADMIN_USER)||'admin';
  const newToken='pnc'+Date.now().toString(36)+Math.random().toString(36).slice(2);
  setToken(newToken);updateAccessButton();
  try{
    setStatus('Mengesahkan akses konten...');
    await postReliable('contentAdminLogin',{username,password,token:newToken},30000);
    for(const wait of [250,700,1500,2800]){
      await sleep(wait);
      try{await loadAdmin();updateAccessButton();return true}catch(_){}
    }
    throw new Error('Token konten belum dikenali server.');
  }catch(err){
    try{localStorage.removeItem(TOKEN_KEY)}catch(_){};try{sessionStorage.removeItem(TOKEN_KEY)}catch(_){};updateAccessButton();
    setStatus('Gagal menghubungkan akses. '+err.message,'err');return false;
  }
}

async function loadPublic(){
  try{
    const r=await jsonp('contentPublicLean',{},16000);
    publicGallery=Array.isArray(r.gallery)?r.gallery:[];
    window.__pnContentPublic={content:Array.isArray(r.content)?r.content:[],gallery:publicGallery};
    window.dispatchEvent(new CustomEvent('pn_content_ready',{detail:window.__pnContentPublic}}));
  }catch(_){
    // Page statis tetap berhak menjadi fallback jika server sedang diam.
  }
}

async function loadAdmin(){
  const t=token();if(!t){updateAccessButton();throw new Error('Akses admin belum terhubung.')}
  try{
    const r=await jsonp('contentAdminList',{token:t},20000);
    adminContent=Array.isArray(r.content)?r.content:[];adminGallery=Array.isArray(r.gallery)?r.gallery:[];
    window.__pnCmsAdminLoadedAt=Date.now();
    renderContentList();renderGalleryList();setStatus('✓ Database konten online • '+adminContent.length+' kabar/informasi • '+adminGallery.length+'foto','ok');updateAccessButton();return r;
  }catch(err){
    const msg=String(err&&err.message||'');
    if(/sesi admin sudah dinonaktifkan|sesi konten tidak valid|perangkat tidak ditemukan/i.test(msg)){try{localStorage.removeItem(TOKEN_KEY)}catch(_){};try{sessionStorage.removeItem(TOKEN_KEY)}catch(_){}};
    updateAccessButton();setStatus(err.message,'err');throw err;
  }
}

function panelHtml(){return `
  <section id="pnContentAdminPanel" class="panel pnCmsCard">
    <div class="panelHead pnCmsHead"><div>Mengelola Foto, Kabar & Informasi Website</div><div class="pnCmsHeadActions"><button id="pnCmsConnect" class="pnCmsBtn teal">┬ HUBUNGKAN AKSES</button><button id="pnCmsReload" class="pnCmsBtn light">⇻ MUAT ULANG</button></div></div>
    <div class="panelBody">
      <div id="pnCmsStatus" class="pnCmsStatus">Login admin diperlukan untuk update konten online.</div>
      <div class="pnCmsTabs"><button id="pnCmsTabContent" class="pnCmsTab active">▣ KABAR & INFORMASI</button><button id="pnCmsTabGallery" class="pnCmsTab">🔼 GALERI / FOTO</button></div>

      <div id="pnCmsContentPane">
        <div class="pnCmsGrid">
          <div class="pnCmsField"><label>Jenis</label><select id="pnCmsType"><option>BERITA</option><option>PENGUMUMAN</option><option>INFORMASI</option></select></div>
          <div class="pnCmsField"><label>Status</label><select id="pnCmsContentStatus"><option>PUBLIK</option><option>DRAFT</option></select></div>
          <div class="pnCmsField full"><label>Judul</label><input id="pnCmsTitle" maxlength="160" placeholder="Contoh: Latihan Rutin Malam Jumat"></div>
          <div class="pnCmsField"><label>Tanggal</label><input id="pnCmsDate" type="date"></div>
          <div class="pnCmsField"><label>Urutan Tampil</label><input id="pnCmsOrder" type="number" min="1" step="1"></div>
          <div class="pnCmsField full"><label>Ringkasan Singkat</label><textarea id="pnCmsSummary" placeholder="Ringkasan yang tampil di kartu berita."></textarea></div>
          <div class="pnCmsField full"><label>Isi Kabar / Informasi Selengkapnya</label><textarea id="pnCmsBody" style="min-height:160px" placeholder="Tulis isi berita selengkapnya. Pisalkan paragraf dengan baris baru."></textarea></div>
          <div class="pnCmsActions pnCmsField full"><button id="pnCmsSaveContent" class="pnCmsBtn green">✑ SIMPAN KABAR / INFORMASI</button><button id="pnCmsNewContent" class="pnCmsBtn light">+ DATA BARU</button></div>
        </div>
        <div id="pnCmsContentList" class="pnCmsList"></div>
      </div>

      <div id="pnCmsGalleryPane" class="pnCmsHidden">
        <div class="pnCmsGrid">
          <div class="pnCmsField full"><label>Pilih Foto dari HP/Komputer</label><input id="pnCmsImageFile" type="file" accept="image/*"><img id="pnCmsImagePreview" class="pnCmsPreview pnCmsHidden" alt="Praview foto"></div>
          <div class="pnCmsField full"><label>Judul / Keterangan Foto</label><input id="pnCmsGalleryTitle" maxlength="160" placeholder="Contoh: Latihan rutin bersama"></div>
          <div class="pnCmsField"><label>Status</label><select id="pnCmsGalleryStatus"><option>PUBLIK</option><option>DRAFT</option></select></div>
          <div class="pnCmsField"><label>Urutan</label><input id="pnCmsGalleryOrder" type="number" min="1" step="1"></div>
          <div class="pnCmsField full"><label>Teks Alternatif (ALT)</label><input id="pnCmsGalleryAlt" maxlength="180" placeholder="Deskripsi singkat foo"></div>
          <div class="pnCmsField full"><label>Catatan Admin (opsional)</label><textarea id="pnCmsGalleryNote"></textarea></div>
          <div class="pnCmsActions pnCmsField full"><button id="pnCmsSaveGallery" class="pnCmsBtn green">📤 UPLOAD / SIMPAN FOTO</button><button id="pnCmsNewGallery" class="pnCmsBtn light">+ FOTO BARU</button></div>
        </div>
        <div id="pnCmsGalleryList" class="pnCmsList"></div>
      </div>
    </div>
  </section>`;}

function resetContent(){editingContentId='';$('pnCmsType').value='BERITA';$('pnCmsContentStatus').value='PUBLIK';$('pnCmsTitle').value='';$('pnCmsDate').value=new Date().ToISOString().slice(0,10);$('pnCmsOrder').value=String(Math.max(1,adminContent.length+1));$('pnCmsSummary').value='';$('pnCmsBody').value='';$('pnCmsSaveContent').textContent='✓ SIMPAN KABAR / INFORMASI'}
function editContent(id){const x=adminContent.find(v=>v.id===id);if(!x)return;editingContentId=x.id;$('pnCmsType').value=x.type||'BERITA';$('pnCmsContentStatus').value=x.status==='DRAFT'?'DRAFT':'PUBLIK';$('pnCmsTitle').value=x.title||'';$('pnCmsDate').value=x.date||'';$('pnCmsOrder').value=String(x.order||1);$('pnCmsSummary').value=x.summary||'';$('pnCmsBody').value=x.body||'';$('pnCmsSaveContent').textContent='✓ SIMPAN PERUBAHAN';$('pnContentAdminPanel').scrollIntoView({behavior:'smooth',block:'start'})}

async function saveContent(){if(!token()&&!await connectContent())return;const item={id:editingContentId,type:$('pnCmsType').value,title:$('pnCmsTitle').value.trim(),date:$('pnCmsDate').value,order:Number($('pnCmsOrder').value||1),status:$('pnCmsContentStatus').value,summary:$('pnCmsSummary').value.trim(),body:$('pnCmsBody').value.trim()};if(!item.title){setStatus('Judul kabar / informasi wajib disi.','err');return}const btn=$('pnCmsSaveContent');setBusy(btn,true,'MENYIMPAN...');try{await postReliable('contentAdminSave',{token:token(),section:'content',itemJson:JSON.stringify(item)});setStatus('✓ Kabar /informasi berhasil disimpan.','ok');resetContent();await loadAdmin();await loadPublic()}catch(err){setStatus(err.message,'err')}finally{setBusy(btn,false)}}

async function togglePublish(section,item){if(!token()&&!await connectContent())return;const next=item.status==='PUBLIK'?'DRAFT':'PUBLIK';try{await postReliable('contentAdminSave',{token:token(),section,itemJson:JSON.stringify({...item,status:next})});await loadAdmin();await loadPublic()}catch(err){setStatus(err.message,'err')}}
async function deleteItem(section,id){if(!confirm('Hapus data ini?'))return;if(!token()&&!await connectContent())return;try{await postReliable('contentAdminDelete',{token:token(),section,id});await loadAdmin();await loadPublic()}catch(err){setStatus(err.message,'err')}}

function renderContentList(){const box=$('pnCmsContentList');if(!box)return;box.innerHTML='';if(!adminContent.length){box.innerHTML='<div class="pnCmsItem"><div><h4>Belum ada data</h4><p>Tambahkan kabar, berita, pengumuman, atau informasi di atas.</p></div></div>';return}adminContent.forEach(x=>{const row=document.createElement('div');row.className='pnCmsItem';row.innerHTML=`<div><h4>${esc(x.title)}</h4><p>${esc(x.type||'INFORMASI')} • ${esc(x.date||'')} • Urutan ${esc(x.order||1)} • <b>${esc(x.status||'DRAFT')}</b><br>${esc(x.summary||'')}</p></div><div class="pnCmsItemBtns"><button class="pnCmsMini edit">EDIT</button><button class="pnCmsMini pub">${x.status==='PUBLIK'?'SEMBUMYIKAN':'TERBITKAN'}</button><button class="pnCmsMini del">HAPUS</button></div>`;const [edit,pub,del]=row.querySelectorAll('button');edit.onclick=()=>editContent(x.id);pub.onclick=()=>togglePublish('content',x);del.onclick=()=>deleteItem('content',x.id);box.appendChild(row)})}

function resetGallery(){editingGalleryId='';$('pnCmsGalleryTitle').value='';$('pnCmsGalleryAlt').value='';$('pnCmsGalleryStatus').value='PUBLIK';$('pnCmsGalleryOrder').value=String(Math.max(1,adminGallery.length+1));$('pnCmsGalleryNote').value='';$('pnCmsImageFile').value='';$('pnCmsImagePreview').src='';$('pnCmsImagePreview').classList.add('pnCmsHidden');$('pnCmsSaveGallery').textContent='📤 UPLOAD / SIMPAN FOTO'}
function editGallery(id){const x=adminGallery.find(v=>v.id===id);if(!x)return;editingGalleryId=x.id;$('pnCmsGalleryTitle').value=x.title||'';$('pnCmsGalleryAlt').value=x.alt||'';$('pnCmsGalleryStatus').value=x.status==='DRAFT'?'DRAFT':'PUBLIK';$('pnCmsGalleryOrder').value=String(x.order||1);$('pnCmsGalleryNote').value=x.note||'';$('pnCmsImageFile').value='';const p=$('pnCmsImagePreview');p.src=x.url||'';p.classList.toggle('pnCmsHidden',!x.url);$('pnCmsSaveGallery').textContent='💾 SIMPAN PERUBAHAN FOTO';$('pnContentAdminPanel').scrollIntoView({behavior:'smooth',block:'start'})}

function renderGalleryList(){const box=$('pnCmsGalleryList');if(!box)return;box.innerHTML='';if(!adminGallery.length){box.innerHTML='<div class="pnCmsItem"><div><h4>Belum ada foto</h4><p>Pilih foto dari HP+/komputer lalu upload.</p></div></div>';return}adminGallery.forEach(x=>{const row=document.createElement('div');row.className='pnCmsItem pnCmsGalleryItem';row.innerHTML=`<img class="pnCmsThumb" src="${esc(x.url)}" alt=""><div><h4>${esc(x.title||'Foto Galeri')}</h4><p>Urutan ${esc(x.order||1)} • <b>${esc(x.status||'DRAFT')}</b></p></div><div class="pnCmsItemBtns"><button class="pnCmsMini edit">EDIT</button><button class="pnCmsMini pub">${x.status==='PUBLIK'?'SEMBUNYIKAN':'TERBITKAN'}</button><button class="pnCmsMini del">HAPUS</button></div>`;const [edit,pub,del]=row.querySelectorAll('button');edit.onclick=()=>editGallery(x.id);pub.onclick=()=>togglePublish('gallery',x);del.onclick=()=>deleteItem('gallery',x.id);box.appendChild(row)})}

function readAsDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Gagal membaca foto.'));r.readAsDataURL(file)})}
async function compressImage(file){
  const data=await readAsDataURL(file);const img=new Image();img.src=data;await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(new Error('Format gambar tidak dapat dibacha.'))});
  const max=1600,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);const out=c.toDataURL('image/jpeg',.82);if(out.length>4_800_000)throw new Error('Foto masih terlalu besar. Pilih foto dengan ukuran lebih kecil.');return{base64:out.split(',')[1],mimeType:'image/jpeg',fileName:(file.name||'foto').replace(/\.[^.]+$/,'')+'.jpg',preview:out}}

async function saveGallery(){
  if(!token()&&!await connectContent())return;const title=$('pnCmsGalleryTitle').value.trim()||'Dokumentasi Kegiatan Pagar Nusa';const old=adminGallery.find(v=>v.id===editingGalleryId)||{};let url=old.url||'',fileId=old.fileId||'';const file=$('pnCmsImageFile').files?.[0];const btn=$('pnCmsSaveGallery');setBusy(btn,true,file?'MENGUPLOAD FOTO...':'MENYIMPAN...');
  try{
    if(file){const pic=await compressImage(file);const up=await postReliable('contentUploadImage',{token:token(),fileName:pic.fileName,mimeType:pic.mimeType,base64:pic.base64},70000);url=up.url;fileId=up.fileId}
    if(!url)throw new Error('Pilih foto terlebih dahulu.');
    const item={id:editingGalleryId,title,url,fileId,status:$('pnCmsGalleryStatus').value,order:Number($('pnCmsGalleryOrder').value||1),alt:$('pnCmsGalleryAlt').value.trim()||title,note:$('pnCmsGalleryNote').value.trim()};
    await postReliable('contentAdminSave',{token:token(),section:'gallery',itemJson:JSON.stringify(item)});setStatus('✓ Foto berhasil disimpan. Galeri publik diperbarui otomatis.','ok');resetGallery();await loadAdmin();await loadPublic();
  }catch(err){setStatus(err.message,'err')}finally{setBusy(btn,false)}
}

function switchTab(tab){activeTab=tab;const c=tab==='content';$('pnCmsContentPane').classList.toggle('pnCmsHidden',!c);$('pnCmsGalleryPane').classList.toggle('pnCmsHidden',c);$('pnCmsTabContent').classList.toggle('active',c);$('pnCmsTabGallery').classList.toggle('active',!c)}

function installAdmin(){
  ensureStyles();if($('pnContentAdminPanel'))return;const main=document.querySelector('#adminApp main');if(!main)return;main.insertAdjacentHTML('afterbegin',panelHtml());
  $('pnCmsConnect').onclick=connectContent;$('pnCmsReload').onclick=loadAdmin;$('pnCmsTabContent').onclick=()=>switchTab('content');$('pnCmsTabGallery').onclick=()=>switchTab('gallery');$('pnCmsSaveContent').onclick=saveContent;$('pnCmsNewContent').onclick=resetContent;$('pnCmsSaveGallery').onclick=saveGallery;$('pnCmsNewGallery').onclick=resetGallery;updateAccessButton();
  $('pnCmsImageFile').addEventListener('change',async e=>{const f=e.target.files?.[0],p=$('pnCmsImagePreview');if(!f){p.classList.add('pnCmsHidden');return}try{const d=await readAsDataURL(f);p.src=d;p.classList.remove('pnCmsHidden')}catch(_){}});
  resetContent();resetGallery();setStatus(token()?'✓ Akses otomatis admin tersimpan. Data online akan dimuat tanpa meminta password lagi.':'Login admin tersedia. HUBUNGKAN AKSES hanya diperlukan satu kali pada perangkat baru.');updateAccessButton();
}

function boot(){
  // Prioritaskan area admin saat sesi aktif; konten publik tetap punya fallback statis.
  installAdmin();
  if(token())setTimeout(loadPublic,10000);else loadPublic();
  setTimeout(installAdmin,500);
  setTimeout(installAdmin,1500);
  window.addEventListener('online',()=>{if(token())loadAdmin();else loadPublic()});
}
let pnCmsAdminOpenTimer=0;
window.addEventListener('pn:admin-session-ready',()=>{
  installAdmin();
  updateAccessButton();
  if(token())setTimeout(()=>void loadAdmin(),250);
});
window.addEventListener('pn:admin-login-success',()=>{
  installAdmin();
  updateAccessButton();
  if(token())setTimeout(()=>void loadAdmin(),350);
});
window.addEventListener('storage',e=>{
  if(e.key===TOKEN_KEY){updateAccessButton();if(token())setTimeout(()=>void loadAdmin(),250)}
});

window.addEventListener('pn:admin-open',()=>{
  clearTimeout(pnCmsAdminOpenTimer);
  pnCmsAdminOpenTimer=setTimeout(()=>{
    installAdmin();
    if(!token())return;
    const age=Date.now()-Number(window.__pnCmsAdminLoadedAt||0);
    if(age<45000)return;
    void loadAdmin();
  },4200);
});
document.addEventListener('DOMContentLoaded',boot);
})();
