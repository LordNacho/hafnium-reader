// Minimal App Store Connect API client using the team API key. Usage:
//   node asc.js show                      -> app name/subtitle per locale (read-only)
//   node asc.js rename "New name"         -> set the app name on every locale of the editable app info
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');

const KEY_ID = '2K4H6DSW5Z';
const ISSUER = 'd373c5af-0c25-4410-b9ed-c47a9728d5fe';
const APP_ID = '6824207089';
const key = fs.readFileSync(`${os.homedir()}/.expo/hafnium-asc.p8`, 'utf8');

function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })}.${b64({ iss: ISSUER, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' })}`;
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${unsigned}.${sig}`;
}

async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : {};
}

async function appInfos() {
  const data = await api('GET', `/v1/apps/${APP_ID}/appInfos?include=appInfoLocalizations`);
  const locs = Object.fromEntries((data.included ?? []).filter((i) => i.type === 'appInfoLocalizations').map((i) => [i.id, i]));
  return data.data.map((info) => ({
    id: info.id,
    state: info.attributes.state ?? info.attributes.appStoreState,
    localizations: (info.relationships.appInfoLocalizations.data ?? []).map((r) => locs[r.id]).filter(Boolean),
  }));
}

(async () => {
  const [cmd, arg] = process.argv.slice(2);
  const infos = await appInfos();
  if (cmd === 'rename') {
    const editable = infos.find((i) => /PREPARE_FOR_SUBMISSION|DEVELOPER_REJECTED|REJECTED|WAITING_FOR_REVIEW/.test(i.state ?? '')) ?? infos[0];
    for (const loc of editable.localizations) {
      await api('PATCH', `/v1/appInfoLocalizations/${loc.id}`, { data: { type: 'appInfoLocalizations', id: loc.id, attributes: { name: arg } } });
      console.log(`renamed ${loc.attributes.locale}: "${loc.attributes.name}" -> "${arg}"`);
    }
  }
  for (const info of await appInfos()) {
    for (const loc of info.localizations) {
      console.log(`appInfo ${info.state}: ${loc.attributes.locale} name="${loc.attributes.name}" subtitle="${loc.attributes.subtitle ?? ''}"`);
    }
  }
})().catch((e) => {
  console.log('FAILED:', e.message);
  process.exit(1);
});
