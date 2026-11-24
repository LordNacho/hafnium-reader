// Publish to Google Play in one API edit: upload an app bundle, put it on the Production track, set the store
// contact details and (optionally) the en-GB listing text and graphics from store/, then commit.
//
// Usage: node scripts/play/publish.js <bundle.aab> [--listing] [--dry-run]
//   --listing   also set title and descriptions (store/out/google.md), icon, feature graphic and phone screenshots
//   --dry-run   do everything, ask Google to validate the edit, then discard it (nothing changes on Play)
// Committing sends the changes for review, unless Play says they must be sent from the Console.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
const config = require(path.join(ROOT, 'store/config.json'));
const key = require(process.env.PLAY_KEY || require('os').homedir() + '/.expo/hafnium-play.json');
const PACKAGE = app.android.package;
const LANG = 'en-GB';
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}`;

const args = process.argv.slice(2);
const bundlePath = args.find((a) => !a.startsWith('--'));
const withListing = args.includes('--listing');
const dryRun = args.includes('--dry-run');
if (!bundlePath) throw new Error('usage: publish.js <bundle.aab> [--listing] [--dry-run]');

const md = fs.readFileSync(path.join(ROOT, 'store/out/google.md'), 'utf8');
const section = (title) => {
  const m = md.match(new RegExp(`^## ${title}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));
  if (!m) throw new Error(`section "${title}" not found in google.md`);
  return m[1].trim();
};

const b64url = (b) => Buffer.from(b).toString('base64url');
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: key.token_uri, iat: now, exp: now + 3600 }));
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
  const call = async (method, url, body, contentType = 'application/json') => {
    const res = await fetch(url.startsWith('http') ? url : `${API}${url}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': contentType } : {}) },
      body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body,
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`${method} ${url.replace(/^https:\/\/[^/]+/, '').split('?')[0]}: HTTP ${res.status} ${text.slice(0, 600)}`);
      err.body = text;
      throw err;
    }
    return text ? JSON.parse(text) : {};
  };

  const edit = await call('POST', '/edits');
  console.log(`opened edit for ${PACKAGE}`);
  let committed = false;
  try {
    const bundle = await call('POST', `${UPLOAD}/edits/${edit.id}/bundles?uploadType=media`, fs.readFileSync(bundlePath), 'application/octet-stream');
    const versionCode = String(bundle.versionCode);
    console.log(`✔ uploaded bundle: version code ${versionCode}`);

    const notes = section('Release Notes');
    const track = await call('PUT', `/edits/${edit.id}/tracks/production`, {
      track: 'production',
      releases: [{ name: `${app.version} (${versionCode})`, versionCodes: [versionCode], status: 'completed', releaseNotes: [{ language: LANG, text: notes }] }],
    });
    console.log(`✔ production: ${track.releases.map((r) => `${r.name} [${r.status}]`).join('; ')}`);

    const details = await call('PATCH', `/edits/${edit.id}/details`, { contactEmail: config.supportEmail, contactWebsite: config.siteUrl, defaultLanguage: LANG });
    console.log(`✔ contact details: ${details.contactEmail}, ${details.contactWebsite}`);

    if (withListing) {
      const listing = await call('PUT', `/edits/${edit.id}/listings/${LANG}`, {
        language: LANG,
        title: section('App Name'),
        shortDescription: section('Short Description'),
        fullDescription: section('Full Description'),
      });
      console.log(`✔ listing: "${listing.title}"`);
      const images = [
        ['icon', ['store/assets/play-icon-512.png']],
        ['featureGraphic', ['store/assets/play-feature-graphic-1024x500.png']],
        ['phoneScreenshots', fs.readdirSync(path.join(ROOT, 'store/assets/screenshots')).filter((f) => f.endsWith('.png')).sort().map((f) => `store/assets/screenshots/${f}`)],
      ];
      for (const [type, files] of images) {
        await call('DELETE', `/edits/${edit.id}/listings/${LANG}/${type}`);
        for (const f of files) await call('POST', `${UPLOAD}/edits/${edit.id}/listings/${LANG}/${type}?uploadType=media`, fs.readFileSync(path.join(ROOT, f)), 'image/png');
        console.log(`✔ ${type}: ${files.length} image(s)`);
      }
    }

    // After a rejection (and for some new apps) Play only accepts changes that are then sent for review from the Console.
    // A brand-new app may only have a draft release; the first release is then rolled out from the Console.
    const validate = () =>
      call('POST', `/edits/${edit.id}:validate`).then(
        () => false,
        (e) => {
          if (/changesNotSentForReview/.test(e.body ?? '')) return true;
          throw e;
        },
      );
    let consoleOnly;
    try {
      consoleOnly = await validate();
    } catch (e) {
      if (!/Only releases with status draft/.test(e.body ?? '')) throw e;
      await call('PUT', `/edits/${edit.id}/tracks/production`, {
        track: 'production',
        releases: [{ name: `${app.version} (${versionCode})`, versionCodes: [versionCode], status: 'draft', releaseNotes: [{ language: LANG, text: notes }] }],
      });
      console.log('✔ production release saved as a draft (new app: roll it out from Play Console)');
      consoleOnly = await validate();
    }
    // Validation itself is refused in that state; committing still checks everything.
    console.log(consoleOnly ? '✔ every step accepted; Play wants this sent for review from the Console' : '✔ Google validated the edit');
    if (dryRun) {
      console.log('dry run: discarding the edit');
      return;
    }
    try {
      await call('POST', `/edits/${edit.id}:commit`);
      committed = true;
      console.log('✔ committed and sent for review');
    } catch (e) {
      if (/changesNotSentForReview/.test(e.body ?? '')) {
        await call('POST', `/edits/${edit.id}:commit?changesNotSentForReview=true`);
        committed = true;
        console.log('✔ committed, NOT yet sent for review: send it from Play Console (Publishing overview).');
      } else {
        throw e;
      }
    }
  } finally {
    if (!committed) {
      await call('DELETE', `/edits/${edit.id}`).catch(() => {});
      console.log('edit discarded: nothing changed on Google Play');
    }
  }
})().catch((e) => {
  console.log('FAILED:', e.message);
  process.exit(1);
});
