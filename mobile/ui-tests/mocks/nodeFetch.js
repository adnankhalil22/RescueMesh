// Minimal real fetch() for the jest environment (React Native's test setup stubs fetch out).
// Supports what the app uses: method, headers, JSON/text body, AbortSignal, status/ok/json()/text().
const http = require('node:http');
const https = require('node:https');

module.exports = function nodeFetch(input, init = {}) {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      { method: init.method || 'GET', headers: init.headers || {} },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            headers: { get: (k) => res.headers[String(k).toLowerCase()] ?? null },
            text: async () => body,
            json: async () => JSON.parse(body),
          });
        });
      },
    );
    req.on('error', (e) => reject(new TypeError(`Network request failed: ${e.message}`)));
    if (init.signal) {
      if (init.signal.aborted) req.destroy(new Error('aborted'));
      init.signal.addEventListener?.('abort', () => req.destroy(new Error('aborted')));
    }
    if (init.body !== undefined && init.body !== null) req.write(init.body);
    req.end();
  });
};
