// Shared App Store Connect API client: JWT auth with the team API key on this machine.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');

const KEY_ID = '2K4H6DSW5Z';
const ISSUER = 'd373c5af-0c25-4410-b9ed-c47a9728d5fe';
const APP_ID = '6824207089';
const key = fs.readFileSync(process.env.ASC_KEY || `${os.homedir()}/.expo/hafnium-asc.p8`, 'utf8');

function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })}.${b64({ iss: ISSUER, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' })}`;
  return `${unsigned}.${crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

async function api(method, path, body) {
  const url = path.startsWith('http') ? path : `https://api.appstoreconnect.apple.com${path}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${method} ${path.split('?')[0]}: HTTP ${res.status} ${text.slice(0, 900)}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

module.exports = { api, APP_ID };
