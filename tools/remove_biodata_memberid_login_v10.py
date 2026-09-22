from pathlib import Path

path = Path('biodata.html')
text = path.read_text(encoding='utf-8')

# Portal Biodata V12: login hanya Email + Password.
text = text.replace('Masukkan Username, email, dan password akun masing-masing.', 'Masukkan email dan password akun masing-masing.')
text = text.replace('Portal Biodata aktif · UKT 1–5 + ASPEL · versi 10.', 'Portal Biodata aktif · UKT 1–5 + ASPEL · versi 12.')
text = text.replace('Portal Biodata aktif · UKT 1–5 + ASPEL · versi 11.', 'Portal Biodata aktif · UKT 1–5 + ASPEL · versi 12.')

# Jangan pernah menambahkan kembali field Username / ID Anggota ke login.
username_row = '      <div class="formRow"><label for="username">Username</label><input id="username" type="text" autocomplete="username" placeholder="Contoh: anggota01" required></div>\n'
member_row = '      <div class="formRow"><label for="memberId">ID Anggota</label><input id="memberId" type="text" autocomplete="off" placeholder="Contoh: PN-2026-001" required></div>\n'
text = text.replace(username_row, '').replace(member_row, '')

path.write_text(text, encoding='utf-8')
print('Portal Biodata V12 dipertahankan: login Email + Password.')
