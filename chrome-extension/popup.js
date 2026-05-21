const RELAY_URL = 'https://extractdatav3-production.up.railway.app';
const SECRET    = 'NguyenThiThaoNhi';

const APIS = {
  route:   'https://nhaxe.vexere.com/api/v3/company/46249/routes',
  driver:  'https://nhaxe.vexere.com/api/v1/driver?company_id=46249&type=2',
  vehicle: 'https://nhaxe.vexere.com/api/v1/vehicle?filter[where][comp_id]=46249&filter[page]=1&filter[per_page]=500&filter[where][is_prg_status]=1'
};

/* ── Helpers ── */
function timeAgo(isoStr) {
  if (!isoStr) return '—';
  const d = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if (d < 5)    return 'vừa xong';
  if (d < 60)   return d + 's trước';
  if (d < 3600) return Math.floor(d / 60) + ' phút trước';
  return new Date(isoStr).toLocaleTimeString('vi-VN');
}

function maskToken(auth) {
  const t = (auth || '').replace('Bearer ', '');
  if (!t) return '';
  return 'Bearer ' + t.slice(0, 12) + '…' + t.slice(-8);
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function extractArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const k of ['data','items','rows','results','routes','list','records']) {
      if (Array.isArray(data[k])) return data[k];
    }
    for (const v of Object.values(data)) {
      if (Array.isArray(v)) return v;
    }
  }
  return null;
}

function buildTable(arr) {
  if (!arr.length) return '<p style="padding:12px;color:#888;font-size:12px">Không có bản ghi.</p>';
  const cols = [...new Set(arr.slice(0, 20).flatMap(r => Object.keys(r || {})))];
  let h = '<table><thead><tr><th>#</th>';
  cols.forEach(c => { h += '<th>' + esc(c) + '</th>'; });
  h += '</tr></thead><tbody>';
  arr.forEach((row, i) => {
    h += '<tr><td class="row-num">' + (i + 1) + '</td>';
    cols.forEach(c => {
      const val = row?.[c];
      const raw = val == null ? '' : (typeof val === 'object' ? JSON.stringify(val) : String(val));
      const short = raw.length > 60 ? raw.slice(0, 60) + '…' : raw;
      h += '<td title="' + esc(raw) + '">' + esc(short) + '</td>';
    });
    h += '</tr>';
  });
  return h + '</tbody></table>';
}

/* ── State ── */
let currentData = null;
let isTableView = true;

/* ── Init: load status from storage ── */
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
    const m = document.getElementById('msg');
    m.className = 'msg-err';
    m.textContent = syncError;
  }
});

/* ── Sync button ── */
document.getElementById('btnSync').addEventListener('click', () => {
  const btn = document.getElementById('btnSync');
  const msg = document.getElementById('msg');
  btn.disabled = true;
  msg.className = '';
  msg.textContent = 'Đang gửi...';
  chrome.runtime.sendMessage({ type: 'forceSync' }, (res) => {
    btn.disabled = false;
    if (res?.ok) {
      msg.className = 'msg-ok';
      msg.textContent = '✓ Gửi thành công!';
      document.getElementById('lastSync').textContent = 'vừa xong';
      document.getElementById('relayStatus').innerHTML = '<span class="badge badge-ok">Online</span>';
    } else {
      msg.className = 'msg-err';
      msg.textContent = '✗ ' + (res?.error || 'Lỗi không xác định');
    }
  });
});

/* ── Check Railway button ── */
document.getElementById('btnCheck').addEventListener('click', async () => {
  const btn = document.getElementById('btnCheck');
  const msg = document.getElementById('msg');
  btn.disabled = true;
  msg.className = '';
  msg.textContent = 'Đang kiểm tra...';
  try {
    const res  = await fetch(`${RELAY_URL}/ping`, { headers: { 'X-Secret': SECRET } });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('relayStatus').innerHTML = '<span class="badge badge-ok">Online</span>';
      msg.className = 'msg-ok';
      msg.textContent = data.hasHeaders ? '✓ Railway online — có headers' : '✓ Railway online — chưa có headers';
    } else {
      throw new Error('unexpected');
    }
  } catch {
    document.getElementById('relayStatus').innerHTML = '<span class="badge badge-err">Offline</span>';
    msg.className = 'msg-err';
    msg.textContent = '✗ Không kết nối được Railway';
  }
  btn.disabled = false;
});

/* ── Fetch API ── */
async function fetchAPI(apiType, label) {
  // Highlight active button, disable all
  ['route', 'driver', 'vehicle'].forEach(id => {
    const b = document.getElementById('btn-' + id);
    b.classList.remove('active');
    b.disabled = true;
  });
  document.getElementById('btn-' + apiType).classList.add('active');

  document.getElementById('resultArea').style.display = 'none';
  document.getElementById('loadingRow').style.display = 'flex';
  document.getElementById('msg').textContent = '';

  try {
    // Get stored headers
    const storage = await chrome.storage.local.get('lastHeaders');
    const storedHeaders = storage.lastHeaders;
    if (!storedHeaders) {
      throw new Error('Chưa có headers. Hãy mở nhaxe.vexere.com trước.');
    }

    const res = await fetch(APIS[apiType], {
      headers: { 'accept': 'application/json', ...storedHeaders }
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    renderResult(data, label);

  } catch (e) {
    document.getElementById('loadingRow').style.display = 'none';
    const msg = document.getElementById('msg');
    msg.className = 'msg-err';
    msg.textContent = '✗ ' + e.message;
  }

  ['route', 'driver', 'vehicle'].forEach(id => {
    document.getElementById('btn-' + id).disabled = false;
  });
}

/* ── Render result ── */
function renderResult(data, label) {
  currentData  = data;
  isTableView  = true;

  document.getElementById('loadingRow').style.display  = 'none';
  document.getElementById('resultArea').style.display  = 'block';
  document.getElementById('resultTitle').textContent   = label;
  document.getElementById('toggleBtn').textContent     = '⇄ JSON';
  document.getElementById('toggleBtn').style.display   = '';

  const arr = extractArray(data);
  if (arr) {
    document.getElementById('countPill').textContent      = arr.length + ' bản ghi';
    document.getElementById('tableView').innerHTML        = buildTable(arr);
    document.getElementById('tableView').style.display    = 'block';
    document.getElementById('jsonView').style.display     = 'none';
  } else {
    document.getElementById('countPill').textContent      = '';
    document.getElementById('jsonView').textContent       = JSON.stringify(data, null, 2);
    document.getElementById('tableView').style.display    = 'none';
    document.getElementById('jsonView').style.display     = 'block';
    document.getElementById('toggleBtn').style.display    = 'none';
    isTableView = false;
  }
}

function toggleView() {
  isTableView = !isTableView;
  if (isTableView) {
    const arr = extractArray(currentData);
    document.getElementById('tableView').innerHTML     = buildTable(arr);
    document.getElementById('tableView').style.display = 'block';
    document.getElementById('jsonView').style.display  = 'none';
    document.getElementById('toggleBtn').textContent   = '⇄ JSON';
  } else {
    document.getElementById('jsonView').textContent    = JSON.stringify(currentData, null, 2);
    document.getElementById('tableView').style.display = 'none';
    document.getElementById('jsonView').style.display  = 'block';
    document.getElementById('toggleBtn').textContent   = '⇄ Bảng';
  }
}

function copyResult(e) {
  navigator.clipboard.writeText(JSON.stringify(currentData, null, 2)).then(() => {
    e.target.textContent = '✓ Copied!';
    setTimeout(() => { e.target.textContent = '⎘ Copy'; }, 1800);
  });
}
