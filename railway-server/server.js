const http = require('http');

const PORT   = process.env.PORT   || 3000;
const SECRET = process.env.VEXERE_SECRET || ''; // set this on Railway dashboard

let storedHeaders = null;
let lastUpdated   = null;

function checkSecret(req) {
  if (!SECRET) return true; // no secret configured → open
  return req.headers['x-secret'] === SECRET;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Secret');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!checkSecret(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  // Chrome extension POSTs headers here
  if (req.method === 'POST' && req.url === '/headers') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        storedHeaders = JSON.parse(body);
        lastUpdated   = new Date().toISOString();
        console.log('[relay] Headers updated at', lastUpdated);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, lastUpdated }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // VS Code extension GETs headers here
  if (req.method === 'GET' && req.url === '/headers') {
    if (!storedHeaders) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No headers stored yet' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ headers: storedHeaders, lastUpdated }));
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, hasHeaders: !!storedHeaders, lastUpdated }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`[relay] VeXeRe relay server running on port ${PORT}`);
  if (!SECRET) console.warn('[relay] WARNING: VEXERE_SECRET is not set — server is open!');
});
