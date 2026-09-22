(()=>{
'use strict';

if(window.__pnCentralAdminAutoSessionV1)return;
window.__pnCentralAdminAutoSessionV1=true;

const ENDPOINT='https://script.google.com/macros/s/AKfycbyJi_83lJ11JshOLCzIBRMX6fEi-y9UGR9eYULuqH1BivdxeqcgMB0l2ehWBIgaad8Oyw/exec';
const TOKEN_KEY='pnReviewAdminToken';
const AUTH_KEY='pnAdminAuth';
let creating=false;

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function save(key,value){
  try{sessionStorage.setItem(key,String(value))}catch(_){}
  try{localStorage.setItem(key,String(value))}catch(_){}
}
function remove(key){
  try{sessionStorage.removeItem(key)}catch(_){}
  try{localStorage.removeItem(key)}catch(_){}
}
function randomToken(){
  const a=new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
}
function jsonp(action,payload={},timeout=9000){
  return new Promise((resolve,reject)=>{
    const cb='pnAutoSession_'+Date.now()+'_'+Math.random().toString(36).slice(2).replace(/\W/g,'');
    const script=document.createElement('script');
    let done=false;
    const cleanup=()=>{clearTimeout(timer);try{delete window[cb]}catch(_){}script.remove()};
    window[cb]=data=>{if(done)return;done=true;cleanup();data&&data.ok?resolve(data):reject(new Error(data?.message||'Sesi admin belum siap.'))};
    const q=new URLSearchParams({action,callback:cb,_:String(Date.now())});
    Object.entries(payload).forEach(([k,v])=>q.set(k,String(v??'')));
    script.src=ENDPOINT+'?'+q.toString();
    script.async=true;
    script.onerror=()=>{if(done)return;done=true;cleanup();reject(new Error('Server sesi admin tidak dapat dihubungi.'))};
    const timer=setTimeout(()=>{if(done)return;done=true;cleanup();reject(new Error('Server sesi admin terlalu lama merespons.'))},timeout);
    document.head.appendChild(script);
  });
}
function postLogin(username,password,token){
  const rid='pn-auto-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const frame=document.createElement('iframe');
  frame.name='pnAutoSessionFrame_'+rid.replace(/\W/g,'');
  frame.style.display='none';
  frame.setAttribute('aria-hidden','true');
  const form=document.createElement('form');
  form.method='POST';form.action=ENDPOINT;form.target=frame.name;form.style.display='none';
  const data={action:'contentAdminLogin',rid,username,password,token};
  Object.entries(data).forEach(([name,value])=>{
    const input=document.createElement('input');
    input.type='hidden';input.name=name;input.value=String(value??'');
    form.appendChild(input);
  });
  document.body.append(frame,form);
  form.submit();
  form.remove();
  setTimeout(()=>frame.remove(),15000);
}
async function createSession(username,password){
  if(creating)return false;
  creating=true;
  const token=randomToken();
  save(AUTH_KEY,'1');
  save(TOKEN_KEY,token);
  try{
    window.dispatchEvent(new CustomEvent('pn:admin-session-starting',{detail:{automatic:true}}));
    postLogin(username,password,token);
    let lastError=null;
    for(const wait of [250,450,700,1100,1700,2500,3500]){
      await sleep(wait);
      try{
        await jsonp('contentAdminList',{token},7000);
        save(TOKEN_KEY,token);
        window.dispatchEvent(new CustomEvent('pn:admin-session-ready',{detail:{ok:true,automatic:true}}));
        return true;
      }catch(err){lastError=err}
    }
    throw lastError||new Error('Sesi admin belum berhasil dibuat.');
  }catch(err){
    remove(TOKEN_KEY);
    window.dispatchEvent(new CustomEvent('pn:admin-session-error',{detail:{message:String(err?.message||err||'Gagal membuat sesi admin otomatis.')}}));
    return false;
  }finally{
    creating=false;
  }
}

window.addEventListener('pn:admin-authenticated',event=>{
  const detail=event&&event.detail||{};
  const username=String(detail.username||'').trim();
  const password=String(detail.password||'');
  if(!username||!password)return;
  void createSession(username,password);
});

window.addEventListener('storage',e=>{
  if(e.key===AUTH_KEY&&e.newValue!=='1')remove(TOKEN_KEY);
});
})();
