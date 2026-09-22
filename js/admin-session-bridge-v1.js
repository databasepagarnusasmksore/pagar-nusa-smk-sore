(()=>{
'use strict';
if(window.__pnAdminSessionBridgeV1)return;
window.__pnAdminSessionBridgeV1=true;
const ENDPOINT='https://script.google.com/macros/s/AKfycbyJi_83lJ11JshOLCzIBRMX6fEi-y9UGR9eYULuqH1BivdxeqcgMB0l2ehWBIgaad8Oyw/exec';
const TOKEN_KEY='pnReviewAdminToken',SOURCE='pn-content';
let pending=null;
function currentToken(){try{return sessionStorage.getItem(TOKEN_KEY)||localStorage.getItem(TOKEN_KEY)||''}catch(_){return''}}
function saveToken(v){try{sessionStorage.setItem(TOKEN_KEY,String(v||''))}catch(_){};try{localStorage.setItem(TOKEN_KEY,String(v||''))}catch(_){}}
function clearToken(){try{sessionStorage.removeItem(TOKEN_KEY)}catch(_){};try{localStorage.removeItem(TOKEN_KEY)}catch(_){}}
function randomToken(){const a=new Uint8Array(32);crypto.getRandomValues(a);return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('')}
function jsonpResult(rid,timeout=6000){return new Promise((resolve,reject)=>{const cb='pnBridgeCb_'+Date.now()+'_'+Math.random().toString(36).slice(2).replace(/\\W/g,'');const s=document.createElement('script');let done=false;const clean=()=>{clearTimeout(timer);try{delete window[cb]}catch(_){}s.remove()};window[cb]=d=>{if(done)return;done=true;clean();resolve(d||{})};const q=new URLSearchParams({action:'contentResult',rid,callback:cb,_:String(Date.now())});s.src=ENDPOINT+'?'+q.toString();s.async=true;s.onerror=()=>{if(done)return;done=true;clean();reject(new Error('Server admin belum dapat dihubungi.'))};const timer=setTimeout(()=>{if(done)return;done=true;clean();reject(new Error('Server admin belum merespons.'))},timeout);document.head.appendChild(s)})}
function loginOnce(username,password,requestedToken,timeout=30000){const rid='pn-bridge-'+Date.now()+'-'+Math.random().toString(36).slice(2);return new Promise((resolve,reject)=>{const f=document.createElement('iframe');f.name='pnBridgeFrame_'+rid.replace(/\\W/g,'');f.style.display='none';f.setAttribute('aria-hidden','true');const form=document.createElement('form');form.method='POST';form.action=ENDPOINT;form.target=f.name;form.style.display='none';Object.entries({action:'contentAdminLogin',rid,username,password,token:requestedToken}).forEach(([n,v])=>{const i=document.createElement('input');i.type='hidden';i.name=n;i.value=String(v??'');form.appendChild(i)});let done=false,pollTimer=0,hardTimer=0;const clean=()=>{if(pollTimer)clearTimeout(pollTimer);if(hardTimer)clearTimeout(hardTimer);window.removeEventListener('message',onMessage);setTimeout(()=>f.remove(),150)};const finish=(ok,d)=>{if(done)return;done=true;clean();ok?resolve(d||{}):reject(new Error(d?.message||'Login server admin gagal.'))};const onMessage=e=>{const d=e&&e.data;if(!d||d.source!==SOURCE||String(d.rid||'')!==rid)return;finish(!!d.ok,d)};window.addEventListener('message',onMessage);const poll=async()=>{if(done)return;try{const r=await jsonpResult(rid,6000);if(done)return;if(r&&r.pending){pollTimer=setTimeout(poll,800);return}if(r&&r.ok){finish(true,r);return}if(r&&!r.pending){finish(false,r);return}}catch(_){if(!done)pollTimer=setTimeout(poll,1000)}};hardTimer=setTimeout(()=>finish(false,{message:'Server admin belum merespons. Coba lagi beberapa saat.'}),timeout);document.body.append(f,form);form.submit();form.remove();pollTimer=setTimeout(poll,1000)})}
window.pnEnsureAdminServerSessionV1=async function(){const t=currentToken();if(t)return t;if(pending)return pending;let auth=false;try{auth=localStorage.getItem('pnAdminAuth')==='1'||sessionStorage.getItem('pnAdminAuth')==='1'}catch(_){}if(!auth)throw new Error('Silakan login admin terlebih dahulu.');const c=window.__pnAdminEphemeralCredentials;if(!c||!c.password)throw new Error('Keluar Admin lalu login sekali lagi. Sesudah itu akses server aktif otomatis tanpa password kedua.');pending=(async()=>{const requested=randomToken();const r=await loginOnce(String(c.username||'admin'),String(c.password||''),requested,30000);const token=String(r&&r.token||requested);if(!/^[a-f0-9]{64}$/i.test(token))throw new Error('Token sesi admin tidak valid.');saveToken(token);try{window.dispatchEvent(new CustomEvent('pn:admin-session-ready',{detail:{ok:true,bridge:true}}))}catch(_){}return token})();try{return await pending}catch(e){clearToken();throw e}finally{pending=null}};
window.pnClearAdminSessionBridgeV1=function(){pending=null;clearToken();try{delete window.__pnAdminEphemeralCredentials}catch(_){window.__pnAdminEphemeralCredentials=null}};

async function warmSession(){
  const c=window.__pnAdminEphemeralCredentials;
  if(!c||!c.password)return currentToken();
  try{
    const token=await window.pnEnsureAdminServerSessionV1();
    try{window.dispatchEvent(new CustomEvent('pn:google-sheets-session-ready',{detail:{ok:true,token:true}}))}catch(_){}
    return token;
  }catch(err){
    console.warn('Sesi Google Sheets belum siap:',err);
    return '';
  }
}

window.addEventListener('pn:admin-credentials-ready',()=>{setTimeout(warmSession,0)});
window.addEventListener('pn:admin-open',()=>{setTimeout(warmSession,25)});
window.pnWarmAdminServerSessionV1=warmSession;
})();
