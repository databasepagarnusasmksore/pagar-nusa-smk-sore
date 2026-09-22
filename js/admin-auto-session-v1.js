(()=>{
'use strict';

if(window.__pnCentralAdminAutoSessionV2)return;
window.__pnCentralAdminAutoSessionV2=true;
window.__pnCentralAdminAutoSessionV1=true;

const ENDPOINT='https://script.google.com/macros/s/AKfycbyJi_83lJ11JshOLCzIBRMX6fEi-y9UGR9eYULuqH1BivdxeqcgMB0l2ehWBIgaad8Oyw/exec';
const TOKEN_KEY='pnReviewAdminToken';
const AUTH_KEY='pnAdminAuth';
let authenticating=null;

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
function jsonpRaw(action,payload={},timeout=9000){
  return new Promise((resolve,reject)=>{
    const cb='pnAdminAuthCb_'+Date.now()+'_'+Math.random().toString(36).slice(2).replace(/\W/g,'');
    const script=document.createElement('script');
    let done=false;
    const cleanup=()=>{clearTimeout(timer);try{delete window[cb]}catch(_){}script.remove()};
    window[cb]=data=>{if(done)return;done=true;cleanup();resolve(data||{})};
    const q=new URLSearchParams({action,callback:cb,_:String(Date.now())});
    Object.entries(payload).forEach(([k,v])=>q.set(k,String(v??'')));
    script.src=ENDPOINT+'?'+q.toString();
    script.async=true;
    script.onerror=()=>{if(done)return;done=true;cleanup();reject(new Error('Server admin tidak dapat dihubungi.'))};
    const timer=setTimeout(()=>{if(done)return;done=true;cleanup();reject(new Error('Server admin terlalu lama merespons.'))},timeout);
    document.head.appendChild(script);
  });
}
function postLogin(username,password,token){
  const rid='pn-login-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const frame=document.createElement('iframe');
  frame.name='pnAdminLoginFrame_'+rid.replace(/\W/g,'');
  frame.style.display='none';
  frame.setAttribute('aria-hidden','true');
  const form=document.createElement('form');
  form.method='POST';form.action=ENDPOINT;form.target=frame.name;form.style.display='none';
  Object.entries({action:'contentAdminLogin',rid,username,password,token}).forEach(([name,value])=>{
    const input=document.createElement('input');
    input.type='hidden';input.name=name;input.value=String(value??'');
    form.appendChild(input);
  });
  document.body.append(frame,form);
  form.submit();
  form.remove();
  setTimeout(()=>frame.remove(),20000);
  return rid;
}
async function authenticate(username,password){
  const user=String(username||'').trim();
  const pass=String(password||'');
  if(!user||!pass)throw new Error('Username dan password admin wajib diisi.');
  if(authenticating)return authenticating;

  authenticating=(async()=>{
    remove(TOKEN_KEY);
    const requestedToken=randomToken();
    const rid=postLogin(user,pass,requestedToken);
    let result=null;
    let lastError=null;

    for(const wait of [200,300,450,650,900,1200,1600,2200,3000]){
      await sleep(wait);
      try{
        const r=await jsonpRaw('contentResult',{rid},7000);
        if(r&&r.pending)continue;
        result=r;
        break;
      }catch(err){lastError=err}
    }

    if(!result){
      throw lastError||new Error('Server belum menyelesaikan login admin.');
    }
    if(!result.ok){
      throw new Error(String(result.message||'Username atau password admin tidak valid.'));
    }

    const token=String(result.token||requestedToken);
    if(!/^[A-Fa-f0-9]{64}$/.test(token)){
      throw new Error('Token sesi admin dari server tidak valid.');
    }

    const verify=await jsonpRaw('contentAdminList',{token},9000);
    if(!verify||!verify.ok){
      throw new Error(String(verify&&verify.message||'Sesi admin belum aktif.'));
    }

    save(TOKEN_KEY,token);
    save(AUTH_KEY,'1');
    window.dispatchEvent(new CustomEvent('pn:admin-session-ready',{detail:{ok:true,automatic:true}}));
    return {ok:true,token};
  })();

  try{
    return await authenticating;
  }catch(err){
    remove(TOKEN_KEY);
    window.dispatchEvent(new CustomEvent('pn:admin-session-error',{detail:{message:String(err&&err.message||err||'Login admin gagal.')}}));
    throw err;
  }finally{
    authenticating=null;
  }
}

window.pnAdminServerAuthenticateV1=authenticate;

window.addEventListener('storage',e=>{
  if(e.key===AUTH_KEY&&e.newValue!=='1')remove(TOKEN_KEY);
});
})();
