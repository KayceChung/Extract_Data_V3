// Background script - capture tickets using webRequest (no debugger)

const fs = require('fs');
const path = require('path');
let capturedToken = null;
let capturedHeaders = {
  token: null,
  cookie: null,
  userAgent: null,
  acceptLanguage: null,
  referer: null,
  originRequestId: null,
  originRequestProduct: null,
  productname: null,
  xDataMode: null
};

function writeHeadersToFile() {
  // Loại bỏ các trường null và đổi tên token thành Authorization
  const out = {};
  if (capturedHeaders.token) out['Authorization'] = 'Bearer ' + capturedHeaders.token;
  if (capturedHeaders.cookie) out['cookie'] = capturedHeaders.cookie;
  if (capturedHeaders.userAgent) out['user-agent'] = capturedHeaders.userAgent;
  if (capturedHeaders.acceptLanguage) out['accept-language'] = capturedHeaders.acceptLanguage;
  if (capturedHeaders.referer) out['referer'] = capturedHeaders.referer;
  if (capturedHeaders.originRequestId) out['origin-request-id'] = capturedHeaders.originRequestId;
  if (capturedHeaders.originRequestProduct) out['origin-request-product'] = capturedHeaders.originRequestProduct;
  if (capturedHeaders.productname) out['productname'] = capturedHeaders.productname;
  if (capturedHeaders.xDataMode) out['x-data-mode'] = capturedHeaders.xDataMode;
  try {
    const filePath = path.join(__dirname, '.vexere-headers.json');
    fs.writeFileSync(filePath, JSON.stringify(out, null, 2), 'utf8');
  } catch (e) {
    console.error('[VeXeRe] Failed to write .vexere-headers.json:', e);
  }
}
let inFlightUrls = new Set();
let CONFIG = null;
let OFFICE = null; // active office config

// Load office config at startup
async function loadConfig() {
  try {
    const res = await fetch(chrome.runtime.getURL('config.json'));
    CONFIG = await res.json();
    // Use saved officeId from storage, fall back to config.json default
    const stored = await chrome.storage.local.get('activeOfficeId');
    const activeId = stored.activeOfficeId || CONFIG.officeId;
    OFFICE = CONFIG.offices[activeId];
    // Cache office config in storage so popup can read it synchronously
    chrome.storage.local.set({
      activeOfficeId: activeId,
      officeConfig: {
        officeId: activeId,
        templates: OFFICE.whatsapp.templates || [],
        excludedPickups: OFFICE.whatsapp.excludedPickups || [],
        allOffices: CONFIG.offices || {}
      }
    });
    console.log('[VeXeRe] Config loaded for office:', OFFICE.officeName);
  } catch (e) {
    console.error('[VeXeRe] Failed to load config.json:', e);
  }
}

// Reload config after office switch
async function reloadOfficeConfig(newOfficeId) {
  if (!CONFIG || !CONFIG.offices[newOfficeId]) return;
  OFFICE = CONFIG.offices[newOfficeId];
  await chrome.storage.local.set({
    activeOfficeId: newOfficeId,
    officeConfig: {
      officeId: newOfficeId,
      templates: OFFICE.whatsapp.templates || [],
      excludedPickups: OFFICE.whatsapp.excludedPickups || [],
      allOffices: CONFIG.offices || {}
    }
  });
  console.log('[VeXeRe] Switched to office:', OFFICE.officeName);
}

loadConfig();

// === Helpers ===

function vexerePatch(path, body) {
  if (!capturedHeaders.token) {
    console.warn('[VeXeRe] No token for VeXeRe API');
    return Promise.reject('No token');
  }
  const url = `https://nhaxe.vexere.com${path}`;
  const headers = {
    'Authorization': 'Bearer ' + capturedHeaders.token,
    'Content-Type': 'application/json',
    'X-Our-Fetch': 'true'
  };
  if (capturedHeaders.cookie) headers['cookie'] = capturedHeaders.cookie;
  if (capturedHeaders.userAgent) headers['user-agent'] = capturedHeaders.userAgent;
  if (capturedHeaders.acceptLanguage) headers['accept-language'] = capturedHeaders.acceptLanguage;
  if (capturedHeaders.referer) headers['referer'] = capturedHeaders.referer;
  if (capturedHeaders.originRequestId) headers['origin-request-id'] = capturedHeaders.originRequestId;
  if (capturedHeaders.originRequestProduct) headers['origin-request-product'] = capturedHeaders.originRequestProduct;
  if (capturedHeaders.productname) headers['productname'] = capturedHeaders.productname;
  if (capturedHeaders.xDataMode) headers['x-data-mode'] = capturedHeaders.xDataMode;
  return fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  }).then(r => r.json());
}

// ...existing code for chatwootGet, chatwootPost, chatwootPatch...

// === Token & Header capture ===

chrome.webRequest.onBeforeSendHeaders.addListener(details => {
  if (!details.url.includes('vexere.com')) return;
  if (details.requestHeaders.some(h => h.name === 'X-Our-Fetch')) return;
  let changed = false;
  for (const h of details.requestHeaders) {
    const name = h.name.toLowerCase();
    if (name === 'authorization' && h.value?.startsWith('Bearer ')) {
      const newToken = h.value.substring(7);
      if (capturedHeaders.token !== newToken) {
        capturedToken = newToken;
        capturedHeaders.token = newToken;
        changed = true;
      }
    }
    if (name === 'cookie' && capturedHeaders.cookie !== h.value) { capturedHeaders.cookie = h.value; changed = true; }
    if (name === 'user-agent' && capturedHeaders.userAgent !== h.value) { capturedHeaders.userAgent = h.value; changed = true; }
    if (name === 'accept-language' && capturedHeaders.acceptLanguage !== h.value) { capturedHeaders.acceptLanguage = h.value; changed = true; }
    if (name === 'referer' && capturedHeaders.referer !== h.value) { capturedHeaders.referer = h.value; changed = true; }
    if (name === 'origin-request-id' && capturedHeaders.originRequestId !== h.value) { capturedHeaders.originRequestId = h.value; changed = true; }
    if (name === 'origin-request-product' && capturedHeaders.originRequestProduct !== h.value) { capturedHeaders.originRequestProduct = h.value; changed = true; }
    if (name === 'productname' && capturedHeaders.productname !== h.value) { capturedHeaders.productname = h.value; changed = true; }
    if (name === 'x-data-mode' && capturedHeaders.xDataMode !== h.value) { capturedHeaders.xDataMode = h.value; changed = true; }
  }
  if (changed) writeHeadersToFile();
}, { urls: ['<all_urls>'] }, ['requestHeaders']);

// ...existing code for ticket capture, message handling, etc...
