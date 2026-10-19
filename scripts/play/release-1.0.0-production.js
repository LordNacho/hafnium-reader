// Add version code 4 to the Production track and set the en-GB store title, in one Play API edit.
const crypto = require('crypto');
const key = require(process.env.PLAY_KEY || require('os').homedir() + '/.expo/hafnium-play.json');
const PACKAGE = 'ltd.hafnium.reader';
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
const RELEASE_NOTES =
  'First release of Hafnium Reader. Add feeds by name or website address, import your subscriptions from OPML, and read your articles offline, with full articles for feeds that only give a summary. No ads, no account.';
const TITLE = 'Hafnium Reader: RSS Feeds';

const b64url = (b) => Buffer.from(b).toString('base64url');
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: key.token_uri, iat: now, exp: now + 600 }));
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), key.private_key).toString('base64url');
  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`token: HTTP ${res.status} ${data.error_description ?? data.error ?? ''}`);
  return data.access_token;
}

(async () => {
  const token = await accessToken();
  const call = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`${method} ${path.split('?')[0]}: HTTP ${res.status} ${text.slice(0, 500)}`);
      err.body = text;
      throw err;
    }
    return text ? JSON.parse(text) : {};
  };

  const edit = await call('POST', '/edits');
  console.log('1. opened edit');
  let committed = false;
  try {
    const production = await call('PUT', `/edits/${edit.id}/tracks/production`, {
      track: 'production',
      releases: [{ name: '1.0.0 (4)', versionCodes: ['4'], status: 'completed', releaseNotes: [{ language: 'en-GB', text: RELEASE_NOTES }] }],
    });
    console.log(`2. production track: ${production.releases.map((r) => `${r.name} [${r.status}] codes ${r.versionCodes}`).join('; ')}`);

    const listing = await call('PATCH', `/edits/${edit.id}/listings/en-GB`, { title: TITLE });
    console.log(`3. en-GB listing title: "${listing.title}" (short description unchanged: "${listing.shortDescription}")`);

    try {
      await call('POST', `/edits/${edit.id}:commit`);
      committed = true;
      console.log('4. committed and sent for review');
    } catch (e) {
      if (/changesNotSentForReview/.test(e.body ?? '')) {
        await call('POST', `/edits/${edit.id}:commit?changesNotSentForReview=true`);
        committed = true;
        console.log('4. committed, NOT yet sent for review: Play wants this sent from the Console (Publishing overview).');
      } else {
        throw e;
      }
    }
  } finally {
    if (!committed) {
      await call('DELETE', `/edits/${edit.id}`).catch(() => {});
      console.log('edit discarded: nothing changed');
    }
  }
})().catch((e) => {
  console.log('FAILED:', e.message);
  process.exit(1);
});
