const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

// === CONFIG — thay bằng URL Railway thực tế của bạn ===
const RELAY_URL = 'https://YOUR-APP.railway.app'; // ← đổi sau khi deploy
const SECRET    = 'your-secret-here';             // ← phải khớp với VEXERE_SECRET trên Railway
// ======================================================

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
          panel.webview.postMessage({ type: 'result', apiType: msg.apiType, result });
        }
        if (msg.type === 'refreshHeaders') {
          await refreshFromRailway(context);
        }
        if (msg.type === 'ready') {
          panel.webview.postMessage({ type: 'status', lastCaptured });
        }
      });
      panel.onDidDispose(() => { panel = undefined; });

      // Auto-fetch headers from Railway when panel first opens
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

function getWebviewContent() {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VeXeRe Data</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; margin: 0; }
    .status-bar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 4px; margin-bottom: 20px; font-size: 12px; }
    .status-waiting { background: color-mix(in srgb, var(--vscode-editorWarning-foreground) 15%, transparent); border: 1px solid color-mix(in srgb, var(--vscode-editorWarning-foreground) 40%, transparent); }
    .status-ok      { background: color-mix(in srgb, var(--vscode-terminal-ansiGreen) 15%, transparent);        border: 1px solid color-mix(in srgb, var(--vscode-terminal-ansiGreen) 40%, transparent); }
    .status-err     { background: color-mix(in srgb, var(--vscode-errorForeground) 15%, transparent);           border: 1px solid color-mix(in srgb, var(--vscode-errorForeground) 40%, transparent); }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot-waiting { background: var(--vscode-editorWarning-foreground); animation: pulse 1.5s infinite; }
    .dot-ok  { background: var(--vscode-terminal-ansiGreen); }
    .dot-err { background: var(--vscode-errorForeground); }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
    .section-label { font-size: 11px; font-weight: 600; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .btn-group { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
    button { padding: 6px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; cursor: pointer; font-size: 12px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .result-box { background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 12px; max-height: 500px; overflow: auto; font-family: var(--vscode-editor-font-family); font-size: 12px; white-space: pre; word-break: break-all; }
    .spinner { display: inline-block; width: 10px; height: 10px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: spin 0.7s linear infinite; margin-right: 6px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="statusBar" class="status-bar status-waiting">
    <span class="dot dot-waiting" id="statusDot"></span>
    <span id="statusText"><span class="spinner"></span>Đang lấy headers từ Railway...</span>
    <button class="btn-secondary" style="margin-left:auto;padding:3px 10px;font-size:11px" onclick="refreshHeaders()">↻ Refresh</button>
  </div>

  <div class="section-label">Lấy dữ liệu</div>
  <div class="btn-group">
    <button onclick="fetchData('route')">Tuyến xe</button>
    <button onclick="fetchData('driver')">Tài xế</button>
    <button onclick="fetchData('vehicle')">Phương tiện</button>
  </div>

  <div class="section-label">Kết quả</div>
  <div class="result-box" id="result">Chưa có dữ liệu.</div>

  <script>
    const vscode = acquireVsCodeApi();
    vscode.postMessage({ type: 'ready' });

    function fetchData(apiType) {
      document.getElementById('result').innerHTML = '<span class="spinner"></span>Đang tải...';
      vscode.postMessage({ type: 'fetch', apiType });
    }

    function refreshHeaders() {
      const bar = document.getElementById('statusBar');
      bar.className = 'status-bar status-waiting';
      document.getElementById('statusDot').className = 'dot dot-waiting';
      document.getElementById('statusText').innerHTML = '<span class="spinner"></span>Đang lấy headers từ Railway...';
      vscode.postMessage({ type: 'refreshHeaders' });
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'result') {
        document.getElementById('result').textContent = JSON.stringify(msg.result, null, 2);
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
      }
    });
  </script>
</body>
</html>`;
}

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
