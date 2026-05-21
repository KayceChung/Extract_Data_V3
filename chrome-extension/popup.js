// Must match background.js
const RELAY_URL = 'https://YOUR-APP.railway.app';
const SECRET    = 'your-secret-here';

function timeAgo(isoStr) {
  if (!isoStr) return '—';
  const diffSec = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if (diffSec < 5)    return 'vừa xong';
  if (diffSec < 60)   return diffSec + 's trước';
  if (diffSec < 3600) return Math.floor(diffSec / 60) + ' phút trước';
  return new Date(isoStr).toLocaleTimeString('vi-VN');
}

function maskToken(authHeader) {
  const token = (authHeader || '').replace('Bearer ', '');
  if (!token) return '';
  return 'Bearer ' + token.slice(0, 12) + '…' + token.slice(-8);
}

const btnSync  = document.getElementById('btnSync');
const btnCheck = document.getElementById('btnCheck');
const msgEl    = document.getElementById('msg');

chrome.runtime.sendMessage({ type: 'getStatus' }, (data) => {
  const { lastSync, lastHeaders, syncError } = data || {};
  if (lastHeaders?.Authorization) {
    document.getElementById('captureStatus').innerHTML = '<span class="badge badge-ok">Đã capture</span>';
    const pre = document.getElementById('tokenPreview');
    pre.style.display = 'block';
    pre.textContent = maskToken(lastHeaders.Authorization);
  }
  if (lastSync) document.getElementById('lastSync').textContent = timeAgo(lastSync);
  if (syncError) {
    msgEl.className = 'msg-err';
    msgEl.textContent = syncError;
  }
});

btnSync.addEventListener('click', () => {
  btnSync.disabled = true;
  msgEl.className = '';
  msgEl.textContent = 'Đang gửi...';
  chrome.runtime.sendMessage({ type: 'forceSync' }, (res) => {
    btnSync.disabled = false;
    if (res?.ok) {
      msgEl.className = 'msg-ok';
      msgEl.textContent = '✓ Gửi thành công!';
      document.getElementById('lastSync').textContent = 'vừa xong';
      document.getElementById('relayStatus').innerHTML = '<span class="badge badge-ok">Online</span>';
    } else {
      msgEl.className = 'msg-err';
      msgEl.textContent = '✗ ' + (res?.error || 'Lỗi không xác định');
    }
  });
});

btnCheck.addEventListener('click', async () => {
  btnCheck.disabled = true;
  msgEl.textContent = 'Đang kiểm tra...';
  try {
    const res = await fetch(`${RELAY_URL}/ping`, { headers: { 'X-Secret': SECRET } });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('relayStatus').innerHTML = '<span class="badge badge-ok">Online</span>';
      msgEl.className = 'msg-ok';
      msgEl.textContent = data.hasHeaders ? '✓ Railway online — có headers' : '✓ Railway online — chưa có headers';
    } else {
      throw new Error('Unexpected response');
    }
  } catch (e) {
    document.getElementById('relayStatus').innerHTML = '<span class="badge badge-err">Offline</span>';
    msgEl.className = 'msg-err';
    msgEl.textContent = '✗ Không kết nối được Railway';
  }
  btnCheck.disabled = false;
});
