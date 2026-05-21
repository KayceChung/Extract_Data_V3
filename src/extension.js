const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const RELAY_URL = 'https://extractdatav3-production.up.railway.app';
const SECRET    = 'NguyenThiThaoNhi';

const API_LABELS = { route: 'Tuyến xe', driver: 'Tài xế', vehicle: 'Phương tiện' };

let panel = null;
let statusBarItem = null;
let lastCaptured = null;

function activate(context) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(plug) VeXeRe';
  statusBarItem.tooltip = 'Mở VeXeRe panel';
  statusBarItem.command = 'vexere.openPanel';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('vexere.openPanel', function () {
      if (panel) { panel.reveal(); return; }
      panel = vscode.window.createWebviewPanel(
        'vexerePanel',
        'VeXeRe Data',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );
      panel.webview.html = getWebviewContent();
      panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === 'fetch') {
          const result = await fetchVexere(msg.apiType, context);
          panel.webview.postMessage({
            type: 'result',
            apiType: msg.apiType,
            label: API_LABELS[msg.apiType] || msg.apiType,
            result
          });
        }
        if (msg.type === 'refreshHeaders') {
          await refreshFromRailway(context);
        }
        if (msg.type === 'ready') {
          panel.webview.postMessage({ type: 'status', lastCaptured });
        }
      });
      panel.onDidDispose(() => { panel = undefined; });
      refreshFromRailway(context);
    })
  );
}
exports.activate = activate;

async function refreshFromRailway(context) {
  if (panel) panel.webview.postMessage({ type: 'loading', loading: true });
  try {
    const res = await fetch(`${RELAY_URL}/headers`, {
      headers: { 'X-Secret': SECRET }
    });
    if (res.status === 404) {
      if (panel) panel.webview.postMessage({ type: 'railwayStatus', error: 'Railway chưa có headers. Hãy mở nhaxe.vexere.com trong Chrome.' });
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    saveHeaders(data.headers, context);
    lastCaptured = data.lastUpdated;
    if (statusBarItem) statusBarItem.text = '$(check) VeXeRe';
    if (panel) panel.webview.postMessage({ type: 'status', lastCaptured });
    vscode.window.setStatusBarMessage('VeXeRe: Headers đã được tải từ Railway!', 3000);
  } catch (e) {
    const errMsg = e.message.includes('fetch') ? 'Không kết nối được Railway. Kiểm tra URL.' : e.message;
    if (panel) panel.webview.postMessage({ type: 'railwayStatus', error: errMsg });
    console.error('[VeXeRe] Railway error:', e.message);
  } finally {
    if (panel) panel.webview.postMessage({ type: 'loading', loading: false });
  }
}

function saveHeaders(headers, context) {
  try {
    const wsFolders = vscode.workspace.workspaceFolders;
    const headerPath = wsFolders?.length
      ? path.join(wsFolders[0].uri.fsPath, '.vexere-headers.json')
      : path.join(context.extensionPath, '.vexere-headers.json');
    fs.writeFileSync(headerPath, JSON.stringify(headers, null, 2), 'utf8');
  } catch (e) {
    vscode.window.showErrorMessage('VeXeRe: Không lưu được headers: ' + e.message);
  }
}

function deactivate() {}
exports.deactivate = deactivate;

async function fetchVexere(apiType, context) {
  const urls = {
    route:   'https://nhaxe.vexere.com/api/v3/company/46249/routes',
    driver:  'https://nhaxe.vexere.com/api/v1/driver?company_id=46249&type=2',
    vehicle: 'https://nhaxe.vexere.com/api/v1/vehicle?filter[where][comp_id]=46249&filter[page]=1&filter[per_page]=500&filter[where][is_prg_status]=1'
  };
  const url = urls[apiType];
  if (!url) return { error: 'Unknown API type: ' + apiType };

  let headers = { 'accept': 'application/json' };
  try {
    const wsFolders = vscode.workspace.workspaceFolders;
    const headerPath = wsFolders?.length
      ? path.join(wsFolders[0].uri.fsPath, '.vexere-headers.json')
      : path.join(context.extensionPath, '.vexere-headers.json');
    if (fs.existsSync(headerPath)) {
      headers = { ...headers, ...JSON.parse(fs.readFileSync(headerPath, 'utf8')) };
    }
  } catch (e) {}

  try {
    const res = await fetch(url, { headers });
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

function getWebviewContent() {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VeXeRe Data</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }

    /* Status bar */
    .status-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 4px; margin-bottom: 16px; font-size: 12px; }
    .status-waiting { background: color-mix(in srgb, var(--vscode-editorWarning-foreground) 12%, transparent); border: 1px solid color-mix(in srgb, var(--vscode-editorWarning-foreground) 35%, transparent); }
    .status-ok      { background: color-mix(in srgb, var(--vscode-terminal-ansiGreen) 12%, transparent); border: 1px solid color-mix(in srgb, var(--vscode-terminal-ansiGreen) 35%, transparent); }
    .status-err     { background: color-mix(in srgb, var(--vscode-errorForeground) 12%, transparent); border: 1px solid color-mix(in srgb, var(--vscode-errorForeground) 35%, transparent); }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot-waiting { background: var(--vscode-editorWarning-foreground); animation: pulse 1.5s infinite; }
    .dot-ok  { background: var(--vscode-terminal-ansiGreen); }
    .dot-err { background: var(--vscode-errorForeground); }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

    /* Section label */
    .section-label { font-size: 11px; font-weight: 600; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; }

    /* API grid buttons */
    .api-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
    .api-btn { padding: 12px 8px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-panel-border); border-radius: 4px; cursor: pointer; text-align: center; transition: background .1s; }
    .api-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .api-btn.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: var(--vscode-button-background); }
    .api-btn:disabled { opacity: .5; cursor: not-allowed; }
    .api-icon { font-size: 20px; display: block; margin-bottom: 5px; }
    .api-label { font-size: 12px; font-weight: 500; }

    /* Result area */
    .result-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .result-title { font-weight: 600; font-size: 13px; }
    .count-badge { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 1px 8px; border-radius: 10px; font-size: 11px; }
    .btn-sm { padding: 3px 10px; font-size: 11px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 2px; cursor: pointer; }
    .btn-sm:hover { background: var(--vscode-button-secondaryHoverBackground); }

    /* Table */
    .table-wrap { overflow: auto; max-height: 460px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead th { position: sticky; top: 0; background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background)); padding: 6px 10px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--vscode-panel-border); white-space: nowrap; z-index: 1; }
    tbody tr:nth-child(even) { background: color-mix(in srgb, var(--vscode-foreground) 3%, transparent); }
    tbody tr:hover { background: var(--vscode-list-hoverBackground); }
    td { padding: 5px 10px; border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 60%, transparent); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row-num { color: var(--vscode-descriptionForeground); text-align: right; min-width: 32px; user-select: none; }

    /* JSON view */
    .json-view { background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 12px; max-height: 460px; overflow: auto; font-family: var(--vscode-editor-font-family); font-size: 12px; white-space: pre; word-break: break-all; }

    /* Spinner */
    .spinner { display: inline-block; width: 10px; height: 10px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: spin .7s linear infinite; vertical-align: middle; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Loading placeholder */
    .loading-box { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 32px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; color: var(--vscode-descriptionForeground); font-size: 12px; }
    .empty-box { display: flex; align-items: center; justify-content: center; padding: 32px; border: 1px dashed var(--vscode-panel-border); border-radius: 4px; color: var(--vscode-descriptionForeground); font-size: 12px; }
  </style>
</head>
<body>

  <!-- Status bar -->
  <div id="statusBar" class="status-bar status-waiting">
    <span class="dot dot-waiting" id="statusDot"></span>
    <span id="statusText"><span class="spinner"></span> Đang lấy headers từ Railway...</span>
    <button class="btn-sm" style="margin-left:auto" onclick="refreshHeaders()">↻ Refresh headers</button>
  </div>

  <!-- API buttons -->
  <div class="section-label">Chọn API để lấy dữ liệu</div>
  <div class="api-grid">
    <button class="api-btn" id="btn-route"   onclick="fetchData('route')">
      <span class="api-icon">🚌</span>
      <span class="api-label">Tuyến xe</span>
    </button>
    <button class="api-btn" id="btn-driver"  onclick="fetchData('driver')">
      <span class="api-icon">👤</span>
      <span class="api-label">Tài xế</span>
    </button>
    <button class="api-btn" id="btn-vehicle" onclick="fetchData('vehicle')">
      <span class="api-icon">🚐</span>
      <span class="api-label">Phương tiện</span>
    </button>
  </div>

  <!-- Result panel -->
  <div id="resultSection">
    <div class="empty-box" id="emptyBox">Chọn một API ở trên để xem dữ liệu.</div>

    <div id="loadingBox" class="loading-box" style="display:none">
      <span class="spinner"></span> Đang tải dữ liệu...
    </div>

    <div id="resultArea" style="display:none">
      <div class="result-header">
        <span class="result-title" id="resultTitle"></span>
        <span class="count-badge" id="countBadge"></span>
        <div style="margin-left:auto;display:flex;gap:6px">
          <button class="btn-sm" id="toggleViewBtn" onclick="toggleView()">⇄ JSON</button>
          <button class="btn-sm" onclick="copyJSON(event)">⎘ Copy JSON</button>
        </div>
      </div>
      <div id="tableView" class="table-wrap"></div>
      <div id="jsonView"  class="json-view" style="display:none"></div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    vscode.postMessage({ type: 'ready' });

    let currentData = null;
    let isTableView = true;

    /* ─── Fetch ─── */
    function fetchData(apiType) {
      ['route','driver','vehicle'].forEach(id => {
        document.getElementById('btn-' + id).classList.remove('active');
        document.getElementById('btn-' + id).disabled = true;
      });
      document.getElementById('btn-' + apiType).classList.add('active');

      document.getElementById('emptyBox').style.display   = 'none';
      document.getElementById('resultArea').style.display = 'none';
      document.getElementById('loadingBox').style.display = 'flex';

      vscode.postMessage({ type: 'fetch', apiType });
    }

    function refreshHeaders() {
      const bar = document.getElementById('statusBar');
      bar.className = 'status-bar status-waiting';
      document.getElementById('statusDot').className = 'dot dot-waiting';
      document.getElementById('statusText').innerHTML = '<span class="spinner"></span> Đang lấy headers từ Railway...';
      vscode.postMessage({ type: 'refreshHeaders' });
    }

    /* ─── Data helpers ─── */
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

    function esc(str) {
      return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function buildTable(arr) {
      if (!arr.length) return '<p style="padding:16px;color:var(--vscode-descriptionForeground)">Không có bản ghi nào.</p>';
      const cols = [...new Set(arr.slice(0,20).flatMap(r => Object.keys(r || {})))];
      let h = '<table><thead><tr><th style="text-align:center">#</th>';
      cols.forEach(c => { h += '<th>' + esc(c) + '</th>'; });
      h += '</tr></thead><tbody>';
      arr.forEach((row, i) => {
        h += '<tr><td class="row-num">' + (i+1) + '</td>';
        cols.forEach(c => {
          const val = row?.[c];
          const raw = val == null ? '' : (typeof val === 'object' ? JSON.stringify(val) : String(val));
          const short = raw.length > 70 ? raw.slice(0,70) + '…' : raw;
          h += '<td title="' + esc(raw) + '">' + esc(short) + '</td>';
        });
        h += '</tr>';
      });
      h += '</tbody></table>';
      return h;
    }

    /* ─── Render ─── */
    function renderResult(data, label) {
      currentData = data;
      isTableView = true;

      ['route','driver','vehicle'].forEach(id => {
        document.getElementById('btn-' + id).disabled = false;
      });
      document.getElementById('loadingBox').style.display = 'none';
      document.getElementById('resultArea').style.display = 'block';
      document.getElementById('resultTitle').textContent  = label;
      document.getElementById('toggleViewBtn').textContent = '⇄ JSON';
      document.getElementById('toggleViewBtn').style.display = '';

      const arr = extractArray(data);
      const countBadge = document.getElementById('countBadge');

      if (arr) {
        countBadge.textContent = arr.length + ' bản ghi';
        countBadge.style.display = 'inline';
        document.getElementById('tableView').innerHTML = buildTable(arr);
        document.getElementById('tableView').style.display = 'block';
        document.getElementById('jsonView').style.display  = 'none';
      } else {
        countBadge.style.display = 'none';
        document.getElementById('jsonView').textContent   = JSON.stringify(data, null, 2);
        document.getElementById('tableView').style.display = 'none';
        document.getElementById('jsonView').style.display  = 'block';
        document.getElementById('toggleViewBtn').style.display = 'none';
        isTableView = false;
      }
    }

    function toggleView() {
      isTableView = !isTableView;
      if (isTableView) {
        const arr = extractArray(currentData);
        document.getElementById('tableView').innerHTML    = buildTable(arr);
        document.getElementById('tableView').style.display = 'block';
        document.getElementById('jsonView').style.display  = 'none';
        document.getElementById('toggleViewBtn').textContent = '⇄ JSON';
      } else {
        document.getElementById('jsonView').textContent   = JSON.stringify(currentData, null, 2);
        document.getElementById('tableView').style.display = 'none';
        document.getElementById('jsonView').style.display  = 'block';
        document.getElementById('toggleViewBtn').textContent = '⇄ Bảng';
      }
    }

    function copyJSON(e) {
      navigator.clipboard.writeText(JSON.stringify(currentData, null, 2)).then(() => {
        const btn = e.target;
        btn.textContent = '✓ Đã copy!';
        setTimeout(() => { btn.textContent = '⎘ Copy JSON'; }, 1800);
      });
    }

    /* ─── Messages from extension ─── */
    window.addEventListener('message', event => {
      const msg = event.data;

      if (msg.type === 'result') {
        renderResult(msg.result, msg.label || msg.apiType);
      }

      if (msg.type === 'status') {
        const bar  = document.getElementById('statusBar');
        const dot  = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        if (msg.lastCaptured) {
          bar.className = 'status-bar status-ok';
          dot.className = 'dot dot-ok';
          const t = new Date(msg.lastCaptured).toLocaleTimeString('vi-VN');
          text.textContent = '✓ Headers từ Railway — capture lúc ' + t;
        }
      }

      if (msg.type === 'railwayStatus' && msg.error) {
        const bar  = document.getElementById('statusBar');
        const dot  = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        bar.className = 'status-bar status-err';
        dot.className = 'dot dot-err';
        text.textContent = '✗ ' + msg.error;
        ['route','driver','vehicle'].forEach(id => {
          document.getElementById('btn-' + id).disabled = false;
        });
        document.getElementById('loadingBox').style.display = 'none';
        document.getElementById('emptyBox').style.display   = 'flex';
      }
    });
  </script>
</body>
</html>`;
}
