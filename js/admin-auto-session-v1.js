(()=>{
'use strict';

if(window.__pnCentralAdminAutoSessionV3)return;
window.__pnCentralAdminAutoSessionV3=true;
window.__pnCentralAdminAutoSessionV2=true;
window.__pnCentralAdminAutoSessionV1=true;

const ENDPOINT='https://script.google.com/macros/s/AKfycbyJi_83lJ11JshOLCzIBRMX6fEi-y9UGR9eYULuqH1BivdxeqcgMB0l2ehWBIgaad8Oyw/exec';
const TOKEN_KEY='pnReviewAdminToken';
const AUTH_KEY='pnAdminAuth';
const SOURCE='pn-content';
let authenticating=null;

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
function makeRid(){
  return 'admin-auto-'+Date.now()+'-'+Math.random().toString(36).slice(2);
}
function jsonp(action,payload={},timeout=6500){
  return new Promise((resolve,reject)=>{
    const cb='pnAdminAutoCb_'+Date.now()+'_'+Math.random().toString(36).slice(2).replace(/\W/g,'');
    const script=document.createElement('script');
    let done=false;
    const clean=()=>{clearTimeout(timer);try{delete window[cb]}catch(_){}script.remove()};
    window[cb]=data=>{if(done)return;done=true;clean();resolve(data||{})};
    const q=new URLSearchParams({action,callback:cb,_ts:String(Date.now())});
    Object.entries(payload).forEach(([k,v])=>q.set(k,String(v??'')));
    script.src=ENDPOINT+'?'+q.toString();
    script.async=true;
    script.onerror=()=>{if(done)return;done=true;clean();reject(new Error('Server admin tidak dapat dihubungi.'))};
    const timer=setTimeout(()=>{if(done)return;done=true;clean();reject(new Error('Server admin terlalu lama merespons.'))},timeout);
    document.head.appendChild(script);
  });
}
function postReliable(action,payload={},timeout=45000){
  const rid=makeRid();
  return new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe');
    frame.name='pnAdminAutoFrame_'+rid.replace(/\W/g,'');
    frame.style.display='none';
    frame.setAttribute('aria-hidden','true');

    const form=document.createElement('form');
    form.method='POST';
    form.action=ENDPOINT;
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
    let hardTimer=0;

    const cleanup=()=>{
      if(pollTimer)clearTimeout(pollTimer);
      if(hardTimer)clearTimeout(hardTimer);
      window.removeEventListener('message',onMessage);
      setTimeout(()=>frame.remove(),150);
    };
    const succeed=data=>{
      if(done)return;
      done=true;
      cleanup();
      resolve(data||{});
    };
    const fail=err=>{
      if(done)return;
      done=true;
      cleanup();
      reject(err instanceof Error?err:new Error(String(err||'Login admin gagal.')));
    };

    const onMessage=event=>{
      const data=event&&event.data;
      if(!data||data.source!==SOURCE||String(data.rid||'')!==rid)return;
      if(data.ok)succeed(data);
      else fail(new Error(data.message||'Login admin ditolak server.'));
    };
    window.addEventListener('message',onMessage);

    const poll=async()=>{
      if(done)return;
      try{
        const r=await jsonp('contentResult',{rid},6500);
        if(done)return;
        if(r&&r.pending){pollTimer=setTimeout(poll,700);return}
        if(r&&r.ok){succeed(r);return}
        if(r&&!r.pending){fail(new Error(r.message||'Login admin ditolak server.'));return}
      }catch(_){
        if(!done)pollTimer=setTimeout(poll,900);
      }
    };

    hardTimer=setTimeout(
      ()=>fail(new Error('Server admin belum merespons. Silakan coba lagi.')),
      timeout
    );

    document.body.append(frame,form);
    form.submit();
    form.remove();
    pollTimer=setTimeout(poll,1200);
  });
}

async function authenticate(username,password){
  const user=String(username||'').trim();
  const pass=String(password||'');
  if(!user||!pass)throw new Error('Username dan password admin wajib diisi.');
  if(authenticating)return authenticating;

  authenticating=(async()=>{
    remove(TOKEN_KEY);
    const requested=randomToken();

    const result=await postReliable(
      'contentAdminLogin',
      {username:user,password:pass,token:requested},
      45000
    );

    if(!result||!result.ok){
      throw new Error(String(result&&result.message||'Username atau password admin tidak valid.'));
    }

    const token=String(result.token||requested);
    if(!/^[A-Fa-f0-9]{64}$/.test(token)){
      throw new Error('Token sesi admin dari server tidak valid.');
    }

    save(TOKEN_KEY,token);
    save(AUTH_KEY,'1');

    window.dispatchEvent(new CustomEvent('pn:admin-session-ready',{
      detail:{ok:true,automatic:true}
    }));

    // Verifikasi ringan di belakang layar; tidak menahan proses login.
    setTimeout(async()=>{
      try{
        const r=await jsonp('contentAdminList',{token},12000);
        if(!r||!r.ok)throw new Error(r&&r.message||'Sesi admin tidak valid.');
      }catch(_){}
    },250);

    return {ok:true,token};
  })();

  try{
    return await authenticating;
  }catch(err){
    remove(TOKEN_KEY);
    window.dispatchEvent(new CustomEvent('pn:admin-session-error',{
      detail:{message:String(err&&err.message||err||'Login admin gagal.')}
    }));
    throw err;
  }finally{
    authenticating=null;
  }
}

window.pnAdminServerAuthenticateV1=authenticate;

window.addEventListener('storage',event=>{
  if(event.key===AUTH_KEY&&event.newValue!=='1')remove(TOKEN_KEY);
});
})();
