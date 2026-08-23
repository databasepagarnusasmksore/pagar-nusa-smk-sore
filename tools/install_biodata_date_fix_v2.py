from pathlib import Path
import re

# Backend utama: tambah endpoint admin untuk menyinkronkan Status Keanggotaan
# ke Google Sheet Biodata yang dipakai akun Koordinator.
p=Path('backend/Code.gs')
s=p.read_text(encoding='utf-8')
route_marker="  if (action === 'portalAccountAdminList') {\n"
route="""  if (action === 'aspelStatusAdminSync') {
    let result;
    try { result = aspelStatusAdminSync_(data); }
    catch (err) { result = {ok:false, message:String(err && err.message || err)}; }
    result.rid = String(data.rid || '');
    if (data.callback) return jsonp_(result, data.callback);
    return json_(result);
  }

"""
if "action === 'aspelStatusAdminSync'" not in s:
    if route_marker not in s:
        raise SystemExit('Route marker portalAccountAdminList tidak ditemukan')
    s=s.replace(route_marker,route+route_marker,1)

func_marker='function aspelMonitorAdminList_(data) {'
fn=r'''function aspelStatusAdminSync_(data) {
  const admin = requireReviewAdmin_(data.token);
  const memberId = String(data.memberId || '').trim();
  const name = String(data.name || '').trim();
  const membershipStatus = sanitize_(String(data.membershipStatus || '').trim()).slice(0,80);
  const studentStatus = sanitize_(String(data.studentStatus || '').trim()).slice(0,80);
  if (!memberId && !name) throw new Error('ID atau nama anggota wajib tersedia.');
  if (!membershipStatus) throw new Error('Status keanggotaan wajib tersedia.');

  const book = SpreadsheetApp.openById(PN_BIODATA_SPREADSHEET_ID);
  const sheet = book.getSheetByName(PN_BIODATA_SHEET_NAME);
  if (!sheet) throw new Error('Sheet Data Biodata Siswa Anggota tidak ditemukan.');
  const last = sheet.getLastRow();
  if (last < 2) throw new Error('Database Biodata masih kosong.');

  const rows = sheet.getRange(2,1,last-1,2).getDisplayValues();
  const targetId = memberId.toLowerCase();
  const targetName = normalizeAspelName_(name);
  let row = 0;
  for (let i=0;i<rows.length;i++) {
    if (targetId && String(rows[i][0]||'').trim().toLowerCase() === targetId) { row=i+2; break; }
  }
  if (!row && targetName) {
    for (let i=0;i<rows.length;i++) {
      if (normalizeAspelName_(rows[i][1]) === targetName) { row=i+2; break; }
    }
  }
  if (!row) throw new Error('Anggota tidak ditemukan pada database Biodata.');

  const beforeStatus=String(sheet.getRange(row,15).getDisplayValue()||'').trim();
  const beforeStudent=String(sheet.getRange(row,16).getDisplayValue()||'').trim();
  sheet.getRange(row,15).setValue(membershipStatus);
  if (studentStatus) sheet.getRange(row,16).setValue(studentStatus);

  const logSheet=book.getSheetByName(PN_BIODATA_LOG_SHEET_NAME);
  if (logSheet && beforeStatus !== membershipStatus) {
    logSheet.appendRow([new Date(),String(sheet.getRange(row,1).getDisplayValue()||memberId),'ADMIN INPUT DATA','',admin,'Status Keanggotaan',beforeStatus,membershipStatus]);
  }
  return {ok:true,memberId:String(sheet.getRange(row,1).getDisplayValue()||memberId),name:String(sheet.getRange(row,2).getDisplayValue()||name),membershipStatus:membershipStatus,studentStatus:studentStatus||beforeStudent,message:'Status Biodata berhasil disinkronkan ke akun Koordinator.'};
}

'''
if 'function aspelStatusAdminSync_(data)' not in s:
    if func_marker not in s:
        raise SystemExit('Function marker aspelMonitorAdminList_ tidak ditemukan')
    s=s.replace(func_marker,fn+func_marker,1)
if "aspelMonitorVersion:'2'" in s:
    s=s.replace("aspelMonitorVersion:'2'","aspelMonitorVersion:'3'",1)
p.write_text(s,encoding='utf-8')

# Portal anggota/Koordinator: refresh ulang biodata + relasi Aspel secara otomatis
# saat halaman kembali aktif dan berkala, sehingga status terbaru langsung muncul.
p=Path('biodata.html')
s=p.read_text(encoding='utf-8')
refresh_marker='function loginErrorText(e){'
refresh_code=r'''let pnPortalLiveRefreshBusy=false;
async function pnRefreshPortalLive(){
  if(pnPortalLiveRefreshBusy||!user||!currentUsername||document.hidden)return false;
  if($('portalView')?.classList.contains('hidden'))return false;
  if(!$('saveBtn')?.classList.contains('hidden'))return false;
  pnPortalLiveRefreshBusy=true;
  try{
    const token=await user.getIdToken(false);
    const r=await request('biodataGet',{username:currentUsername,memberId:currentMemberId,idToken:token});
    if(r?.biodata){
      render(r.biodata);
      $('studentName').textContent=r.biodata?.name||'Anggota';
    }
    if(r?.ukt)renderUkt(r.ukt);
    return true;
  }catch(err){
    console.warn('Refresh portal anggota:',err);
    return false;
  }finally{pnPortalLiveRefreshBusy=false}
}
window.addEventListener('focus',()=>setTimeout(pnRefreshPortalLive,250));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(pnRefreshPortalLive,250)});
setInterval(pnRefreshPortalLive,20000);
'''
if 'async function pnRefreshPortalLive()' not in s:
    if refresh_marker not in s:
        raise SystemExit('Marker loginErrorText tidak ditemukan pada biodata.html')
    s=s.replace(refresh_marker,refresh_code+refresh_marker,1)
s=re.sub(r'js/biodata-date-display-fix-v2\.js\?v=\d+','js/biodata-date-display-fix-v2.js?v=5',s)
p.write_text(s,encoding='utf-8')

# Paksa halaman admin mengambil modul force-sync terbaru.
for file in ['index.html','js/admin-session-keepalive-v1.js']:
    p=Path(file)
    s=p.read_text(encoding='utf-8')
    s=re.sub(r'js/aspel-input-status-sync-v3\.js\?v=[0-9-]+','js/aspel-input-status-sync-v3.js?v=20260823-1335',s)
    p.write_text(s,encoding='utf-8')

print('Force sync Keluar/Nonaktif dan auto-refresh portal Koordinator siap diaktifkan')
