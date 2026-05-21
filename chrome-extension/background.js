// === CONFIG — thay bằng URL Railway thực tế của bạn ===
const RELAY_URL = 'https://extractdatav3-production.up.railway.app';
const SECRET    = 'NguyenThiThaoNhi';
// ======================================================

let sessionLastToken = null; // dedup within service worker lifecycle

function extractHeaders(requestHeaders) {
  const out = {};
  for (const h of requestHeaders) {
    const name = h.name.toLowerCase();
    switch (name) {
      case 'authorization':
        if (h.value?.startsWith('Bearer ')) out['Authorization'] = h.value;
        break;
      case 'cookie':                  out['cookie'] = h.value;                  break;
      case 'user-agent':              out['user-agent'] = h.value;              break;
      case 'accept-language':         out['accept-language'] = h.value;         break;
      case 'referer':                 out['referer'] = h.value;                 break;
      case 'origin-request-id':       out['origin-request-id'] = h.value;       break;
      case 'origin-request-product':  out['origin-request-product'] = h.value;  break;
      case 'productname':             out['productname'] = h.value;             break;
      case 'x-data-mode':             out['x-data-mode'] = h.value;             break;
    }
  }
  return out;
}

async function sendToRelay(headers) {
  try {
    const res = await fetch(`${RELAY_URL}/headers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Secret': SECRET
      },
      body: JSON.stringify(headers)
    });
    if (res.ok) {
      const data = await res.json();
      await chrome.storage.local.set({
        lastSync: data.lastUpdated,
        lastHeaders: headers,
        syncError: null
      });
      console.log('[VeXeRe] Headers synced to Railway at', data.lastUpdated);
    } else {
      throw new Error('HTTP ' + res.status);
    }
  } catch (e) {
    await chrome.storage.local.set({
      lastHeaders: headers,
      syncError: e.message
    });
    console.warn('[VeXeRe] Relay error:', e.message);
  }
}

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!details.requestHeaders) return;
    if (details.requestHeaders.some(h => h.name === 'X-Our-Fetch')) return;

    const headers = extractHeaders(details.requestHeaders);
    if (!headers['Authorization']) return;

    // Only send when token changes (dedup within lifecycle)
    if (headers['Authorization'] === sessionLastToken) return;
    sessionLastToken = headers['Authorization'];

    sendToRelay(headers); // fire-and-forget
  },
  { urls: ['*://*.vexere.com/*'] },
  ['requestHeaders', 'extraHeaders']
);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'getStatus') {
    chrome.storage.local.get(['lastSync', 'lastHeaders', 'syncError'], sendResponse);
    return true;
  }
  if (msg.type === 'forceSync') {
    chrome.storage.local.get('lastHeaders', async ({ lastHeaders }) => {
      if (!lastHeaders) {
        sendResponse({ ok: false, error: 'Chưa capture được headers. Hãy mở nhaxe.vexere.com trước.' });
        return;
      }
      try {
        const res = await fetch(`${RELAY_URL}/headers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Secret': SECRET },
          body: JSON.stringify(lastHeaders)
        });
        if (res.ok) {
          const data = await res.json();
          await chrome.storage.local.set({ lastSync: data.lastUpdated, syncError: null });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'Railway trả về lỗi ' + res.status });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    });
    return true;
  }
});
