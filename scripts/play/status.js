// Read-only check of Google Play API access: open an edit, list tracks and the listing, then delete the edit
// without committing. Nothing on Google Play changes.
const crypto = require('crypto');
const key = require(process.env.PLAY_KEY || require('os').homedir() + '/.expo/hafnium-play.json');
const PACKAGE = 'ltd.hafnium.reader';
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;

const b64url = (b) => Buffer.from(b).toString('base64url');

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: key.token_uri,
    iat: now,
    exp: now + 600,
  }));
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), key.private_key).toString('base64url');
  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`token: HTTP ${res.status} ${data.error ?? ''} ${data.error_description ?? ''}`);
  return data.access_token;
}

(async () => {
  const token = await accessToken();
  console.log('OAuth token: OK');
  const call = async (method, path) => {
    const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  };
  const edit = await call('POST', '/edits');
  console.log('opened edit (not committed)');
  try {
    const tracks = await call('GET', `/edits/${edit.id}/tracks`);
    for (const t of tracks.tracks ?? []) {
      const releases = (t.releases ?? []).map((r) => `${r.name ?? '?'} [${r.status}] codes ${JSON.stringify(r.versionCodes ?? [])}`);
      console.log(`track ${t.track}: ${releases.join('; ') || 'no releases'}`);
    }
    const listings = await call('GET', `/edits/${edit.id}/listings`);
    for (const l of listings.listings ?? []) console.log(`listing ${l.language}: "${l.title}" | short: "${l.shortDescription}"`);
  } finally {
    await call('DELETE', `/edits/${edit.id}`);
    console.log('deleted edit: nothing changed on Google Play');
  }
})().catch((e) => {
  console.log('FAILED:', e.message);
  process.exit(1);
});
