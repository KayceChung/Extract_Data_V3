const RELAY_URL = 'https://extractdatav3-production.up.railway.app';
const SECRET    = 'NguyenThiThaoNhi';

const APIS = {
  route:   'https://nhaxe.vexere.com/api/v3/company/46249/routes',
  driver:  'https://nhaxe.vexere.com/api/v1/driver?company_id=46249&type=2',
  vehicle: 'https://nhaxe.vexere.com/api/v1/vehicle?filter[where][comp_id]=46249&filter[page]=1&filter[per_page]=500&filter[where][is_prg_status]=1'
};

const TRIP_FIELDS = [
  'Id','Name','Code','Time','ArrivalTime','OfficialTime',
  'VehicleInfo','VehicleId','RouteInfo',
  'FirstDriverId','SecondDriverId','ThirdDriverId',
  'FirstAssistantId','SecondAssistantId','ThirdAssistantId',
  'StatusInfo','TotalSeats','TotalBookedSeats','TotalValidSeats','Type'
].join(',');

/* ══════════════════════════════════════
   Helpers
══════════════════════════════════════ */
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
  return t ? 'Bearer ' + t.slice(0, 12) + '…' + t.slice(-8) : '';
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function extractArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const k of ['data','items','rows','results','routes','list','records','trips']) {
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
  const cols = [...new Set(arr.slice(0,20).flatMap(r => Object.keys(r || {})))];
  let h = '<table><thead><tr><th>#</th>';
  cols.forEach(c => { h += '<th>' + esc(c) + '</th>'; });
  h += '</tr></thead><tbody>';
  arr.forEach((row, i) => {
    h += '<tr><td class="row-num">' + (i+1) + '</td>';
    cols.forEach(c => {
      const val = row?.[c];
      const raw = val == null ? '' : (typeof val === 'object' ? JSON.stringify(val) : String(val));
      const short = raw.length > 60 ? raw.slice(0,60)+'…' : raw;
      h += '<td title="' + esc(raw) + '">' + esc(short) + '</td>';
    });
    h += '</tr>';
  });
  return h + '</tbody></table>';
}

// "YYYY-MM-DD" → "DD-MM-YYYY"
function toApiDate(ymd) {
  const [y, m, d] = ymd.split('-');
  return `${d}-${m}-${y}`;
}

// "YYYY-MM-DD" → "DD/MM"
function toDisplayDate(ymd) {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}`;
}

function getDatesInRange(from, to) {
  const dates = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0,10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function todayISO() {
  return new Date().toISOString().slice(0,10);
}

function formatTime(val) {
  if (!val && val !== 0) return '—';
  if (typeof val === 'number') {
    if (val < 86400) {
      const h = Math.floor(val / 3600);
      const m = Math.floor((val % 3600) / 60);
      return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
    }
    const d = new Date(val > 1e10 ? val : val * 1000);
    return d.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
  }
  if (typeof val === 'string') {
    if (val.includes('T')) return val.split('T')[1].slice(0,5);
    return val.slice(0,5);
  }
  return String(val);
}

function getVehicleBKS(info) {
  if (!info) return '—';
  if (typeof info === 'string') return info;
  return info.plate_number || info.plate || info.license_plate
      || info.plateNumber  || info.LicensePlate || info.Plate
      || info.name || info.Name || info.alias
      || (info.id ? 'ID:' + info.id : '—');
}

function getStatusLabel(info) {
  if (!info) return '—';
  if (typeof info === 'string') return info;
  return info.name || info.Name || info.label || info.status || String(info.id || '—');
}

function getRouteName(info) {
  if (!info) return '—';
  if (typeof info === 'string') return info;
  return info.name || info.Name || info.alias
      || ((info.from_area || info.departure) && (info.to_area || info.destination)
          ? `${info.from_area||info.departure} → ${info.to_area||info.destination}`
          : null)
      || String(info.id || '—');
}

/* ══════════════════════════════════════
   Boot
══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Default dates
  const today = todayISO();
  document.getElementById('dateFrom').value = today;
  document.getElementById('dateTo').value   = today;

  // Status init
  chrome.runtime.sendMessage({ type: 'getStatus' }, (data) => {
    const { lastSync, lastHeaders, syncError } = data || {};
    if (lastHeaders?.Authorization) {
      document.getElementById('captureStatus').innerHTML = '<span class="badge badge-ok">Đã capture</span>';
      const pre = document.getElementById('tokenPreview');
      pre.style.display = 'block';
      pre.textContent = maskToken(lastHeaders.Authorization);
    }
    if (lastSync) document.getElementById('lastSync').textContent = timeAgo(lastSync);
    if (syncError) setMsg('msg-err', syncError);
  });

  // Tab switching
  document.getElementById('tabBtnData').addEventListener('click', () => switchTab('data'));
  document.getElementById('tabBtnTrip').addEventListener('click', () => switchTab('trip'));

  // Data tab buttons
  document.getElementById('btn-route')  .addEventListener('click', () => fetchQuick('route',   'Tuyến xe'));
  document.getElementById('btn-driver') .addEventListener('click', () => fetchQuick('driver',  'Tài xế'));
  document.getElementById('btn-vehicle').addEventListener('click', () => fetchQuick('vehicle', 'Phương tiện'));
  document.getElementById('toggleBtn') .addEventListener('click', toggleView);
  document.getElementById('btnCopy')   .addEventListener('click', copyQuick);

  // Top action buttons
  document.getElementById('btnSync') .addEventListener('click', doSync);
  document.getElementById('btnCheck').addEventListener('click', doCheck);

  // Trip tab
  document.getElementById('btnRefreshRoutes').addEventListener('click', loadRoutes);
  document.getElementById('btnFetchTrips')   .addEventListener('click', fetchTrips);
  document.getElementById('btnCopyTrip')     .addEventListener('click', copyTripData);

  // Auto-load routes on start
  loadRoutes();
});

/* ══════════════════════════════════════
   Tabs
══════════════════════════════════════ */
function switchTab(name) {
  document.getElementById('panelData').style.display = name === 'data' ? 'block' : 'none';
  document.getElementById('panelTrip').style.display = name === 'trip' ? 'block' : 'none';
  document.getElementById('tabBtnData').classList.toggle('active', name === 'data');
  document.getElementById('tabBtnTrip').classList.toggle('active', name === 'trip');
}

/* ══════════════════════════════════════
   Top buttons
══════════════════════════════════════ */
function setMsg(cls, text) {
  const m = document.getElementById('msg');
  m.className = cls;
  m.textContent = text;
}

function doSync() {
  const btn = document.getElementById('btnSync');
  btn.disabled = true;
  setMsg('', 'Đang gửi...');
  chrome.runtime.sendMessage({ type: 'forceSync' }, (res) => {
    btn.disabled = false;
    if (res?.ok) {
      setMsg('msg-ok', '✓ Gửi thành công!');
      document.getElementById('lastSync').textContent = 'vừa xong';
      document.getElementById('relayStatus').innerHTML = '<span class="badge badge-ok">Online</span>';
    } else {
      setMsg('msg-err', '✗ ' + (res?.error || 'Lỗi không xác định'));
    }
  });
}

async function doCheck() {
  const btn = document.getElementById('btnCheck');
  btn.disabled = true;
  setMsg('', 'Đang kiểm tra...');
  try {
    const res  = await fetch(`${RELAY_URL}/ping`, { headers: { 'X-Secret': SECRET } });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('relayStatus').innerHTML = '<span class="badge badge-ok">Online</span>';
      setMsg('msg-ok', data.hasHeaders ? '✓ Railway online — có headers' : '✓ Railway online — chưa có headers');
    } else throw new Error();
  } catch {
    document.getElementById('relayStatus').innerHTML = '<span class="badge badge-err">Offline</span>';
    setMsg('msg-err', '✗ Không kết nối được Railway');
  }
  btn.disabled = false;
}

/* ══════════════════════════════════════
   Quick data tab
══════════════════════════════════════ */
let currentData = null;
let isTableView = true;

async function fetchQuick(apiType, label) {
  ['route','driver','vehicle'].forEach(id => {
    document.getElementById('btn-' + id).classList.remove('active');
    document.getElementById('btn-' + id).disabled = true;
  });
  document.getElementById('btn-' + apiType).classList.add('active');
  document.getElementById('emptyBox').style.display   = 'none';
  document.getElementById('resultArea').style.display = 'none';
  document.getElementById('loadingRow').style.display = 'flex';

  try {
    const { lastHeaders } = await chrome.storage.local.get('lastHeaders');
    if (!lastHeaders) throw new Error('Chưa có headers. Hãy mở nhaxe.vexere.com trước.');
    const res  = await fetch(APIS[apiType], { headers: { accept: 'application/json', ...lastHeaders } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    renderQuick(data, label);
  } catch (e) {
    document.getElementById('loadingRow').style.display = 'none';
    document.getElementById('emptyBox').style.display   = 'flex';
    document.getElementById('emptyBox').textContent     = '✗ ' + e.message;
    document.getElementById('emptyBox').style.color     = '#dc3545';
  }

  ['route','driver','vehicle'].forEach(id => {
    document.getElementById('btn-' + id).disabled = false;
  });
}

function renderQuick(data, label) {
  currentData = data; isTableView = true;
  document.getElementById('loadingRow').style.display  = 'none';
  document.getElementById('resultArea').style.display  = 'block';
  document.getElementById('resultTitle').textContent   = label;
  document.getElementById('toggleBtn').textContent     = '⇄ JSON';
  document.getElementById('toggleBtn').style.display   = '';

  const arr = extractArray(data);
  if (arr) {
    document.getElementById('countPill').textContent      = arr.length + ' bản ghi';
    document.getElementById('tableView').innerHTML        = buildTable(arr);
    document.getElementById('tableView').style.display   = 'block';
    document.getElementById('jsonView').style.display    = 'none';
  } else {
    document.getElementById('countPill').textContent      = '';
    document.getElementById('jsonView').textContent      = JSON.stringify(data, null, 2);
    document.getElementById('tableView').style.display   = 'none';
    document.getElementById('jsonView').style.display    = 'block';
    document.getElementById('toggleBtn').style.display   = 'none';
    isTableView = false;
  }
}

function toggleView() {
  isTableView = !isTableView;
  if (isTableView) {
    document.getElementById('tableView').innerHTML    = buildTable(extractArray(currentData));
    document.getElementById('tableView').style.display = 'block';
    document.getElementById('jsonView').style.display  = 'none';
    document.getElementById('toggleBtn').textContent   = '⇄ JSON';
  } else {
    document.getElementById('jsonView').textContent   = JSON.stringify(currentData, null, 2);
    document.getElementById('tableView').style.display = 'none';
    document.getElementById('jsonView').style.display  = 'block';
    document.getElementById('toggleBtn').textContent   = '⇄ Bảng';
  }
}

function copyQuick() {
  const btn = document.getElementById('btnCopy');
  navigator.clipboard.writeText(JSON.stringify(currentData, null, 2)).then(() => {
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = '⎘ Copy'; }, 1800);
  });
}

/* ══════════════════════════════════════
   Route dropdown
══════════════════════════════════════ */
async function loadRoutes() {
  const sel = document.getElementById('routeSelect');
  const btn = document.getElementById('btnRefreshRoutes');
  sel.disabled = true;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-sm"></span>';
  sel.innerHTML = '<option value="">-- Đang tải tuyến... --</option>';

  try {
    const { lastHeaders } = await chrome.storage.local.get('lastHeaders');
    const hdrs = lastHeaders ? { accept: 'application/json', ...lastHeaders } : { accept: 'application/json' };
    const res   = await fetch(APIS.route, { headers: hdrs });
    const data  = await res.json();
    const routes = extractArray(data) || [];

    sel.innerHTML = '<option value="">-- Tất cả tuyến --</option>';
    routes.forEach(r => {
      const id   = r.id || r.Id || r.route_id || r.routeId || '';
      const name = r.name || r.Name || r.alias || r.Alias
                || (r.departure && r.destination ? r.departure + ' → ' + r.destination : null)
                || `Route ${id}`;
      const opt  = document.createElement('option');
      opt.value  = String(id);
      opt.textContent = name;
      sel.appendChild(opt);
    });
  } catch {
    sel.innerHTML = '<option value="">-- Lỗi tải tuyến --</option>';
  }

  sel.disabled = false;
  btn.disabled = false;
  btn.textContent = '↻';
}

/* ══════════════════════════════════════
   Trip fetch
══════════════════════════════════════ */
let tripData = null;

async function fetchTrips() {
  const routeId  = document.getElementById('routeSelect').value;
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo   = document.getElementById('dateTo').value;

  if (!dateFrom || !dateTo) { showTripError('Vui lòng chọn ngày.'); return; }
  if (dateFrom > dateTo)    { showTripError('Ngày bắt đầu phải ≤ ngày kết thúc.'); return; }

  const dates = getDatesInRange(dateFrom, dateTo);
  if (dates.length > 31)    { showTripError('Khoảng thời gian tối đa 31 ngày.'); return; }

  // Show loading
  document.getElementById('tripEmpty').style.display   = 'none';
  document.getElementById('tripError').style.display   = 'none';
  document.getElementById('tripResult').style.display  = 'none';
  document.getElementById('tripLoading').style.display = 'flex';
  document.getElementById('btnFetchTrips').disabled    = true;

  try {
    const { lastHeaders } = await chrome.storage.local.get('lastHeaders');
    if (!lastHeaders) throw new Error('Chưa có headers. Hãy mở nhaxe.vexere.com trước.');
    const hdrs = { accept: 'application/json', ...lastHeaders };

    // Load drivers for mapping
    document.getElementById('tripLoadingMsg').textContent = 'Đang tải danh sách tài xế...';
    const driverRes  = await fetch(APIS.driver, { headers: hdrs });
    const driverData = await driverRes.json();
    const driverMap  = buildDriverMap(extractArray(driverData) || []);

    // Fetch trips in parallel for each date
    document.getElementById('tripLoadingMsg').textContent =
      `Đang tải chuyến (${dates.length} ngày)...`;

    const results = await Promise.all(dates.map(async (ymd) => {
      const url = `https://nhaxe.vexere.com/api/v1/trip/get_trips?comp_id=46249`
                + `&fields=${encodeURIComponent(TRIP_FIELDS)}`
                + `&date=${toApiDate(ymd)}&is_show_on_bks=1`;
      try {
        const res  = await fetch(url, { headers: hdrs });
        if (!res.ok) return [];
        const data = await res.json();
        let arr    = extractArray(data) || [];
        if (routeId) {
          arr = arr.filter(t => {
            const ri = t.RouteInfo;
            if (!ri) return false;
            return String(ri.id || ri.Id || ri.route_id || '') === String(routeId);
          });
        }
        return arr.map(t => ({ ...t, _ymd: ymd }));
      } catch { return []; }
    }));

    const allTrips = results.flat();
    tripData = allTrips;
    renderTrips(allTrips, driverMap);

  } catch (e) {
    showTripError(e.message);
  }

  document.getElementById('tripLoading').style.display = 'none';
  document.getElementById('btnFetchTrips').disabled    = false;
}

function buildDriverMap(drivers) {
  const map = {};
  drivers.forEach(d => {
    const id   = d.id   || d.Id   || d.driver_id;
    const name = d.name || d.Name || d.full_name || d.fullname || String(id);
    if (id != null) map[String(id)] = name;
  });
  return map;
}

function getDriverNames(trip, driverMap) {
  const ids = [
    trip.FirstDriverId, trip.SecondDriverId, trip.ThirdDriverId,
    trip.FirstAssistantId, trip.SecondAssistantId, trip.ThirdAssistantId
  ].filter(v => v != null && v !== 0 && v !== '');

  if (!ids.length) return '—';
  return ids.map(id => driverMap[String(id)] || ('ID:' + id)).join(' / ');
}

function renderTrips(trips, driverMap) {
  document.getElementById('tripLoading').style.display = 'none';
  document.getElementById('tripCount').textContent     = trips.length + ' chuyến';

  const tbody = document.getElementById('tripTableBody');
  if (!trips.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:16px;color:#888">Không có chuyến nào trong khoảng thời gian này.</td></tr>';
    document.getElementById('tripResult').style.display = 'block';
    return;
  }

  tbody.innerHTML = trips.map((t, i) => {
    const bks     = getVehicleBKS(t.VehicleInfo);
    const drivers = getDriverNames(t, driverMap);
    const route   = getRouteName(t.RouteInfo);
    const status  = getStatusLabel(t.StatusInfo);
    const time    = formatTime(t.Time || t.OfficialTime);
    const code    = t.Code || t.Name || t.Id || '—';
    const date    = toDisplayDate(t._ymd);

    return `<tr>
      <td class="row-num">${i+1}</td>
      <td>${esc(date)}</td>
      <td title="${esc(String(code))}">${esc(String(code))}</td>
      <td title="${esc(route)}" style="max-width:140px">${esc(route)}</td>
      <td>${esc(time)}</td>
      <td class="bks-cell" title="${esc(bks)}">${esc(bks)}</td>
      <td title="${esc(drivers)}" style="max-width:160px">${esc(drivers)}</td>
      <td>${esc(status)}</td>
    </tr>`;
  }).join('');

  document.getElementById('tripResult').style.display = 'block';
}

function showTripError(msg) {
  document.getElementById('tripLoading').style.display = 'none';
  document.getElementById('tripEmpty').style.display   = 'none';
  document.getElementById('tripResult').style.display  = 'none';
  const el = document.getElementById('tripError');
  el.style.display = 'block';
  el.textContent   = '✗ ' + msg;
  document.getElementById('btnFetchTrips').disabled = false;
}

function copyTripData() {
  const btn = document.getElementById('btnCopyTrip');
  navigator.clipboard.writeText(JSON.stringify(tripData, null, 2)).then(() => {
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = '⎘ Copy JSON'; }, 1800);
  });
}
