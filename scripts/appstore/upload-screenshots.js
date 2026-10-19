// Upload iPhone screenshots to the editable iOS version's en-US localization, replacing any already in the set.
// Usage: node scripts/appstore/upload-screenshots.js [displayType]   (default APP_IPHONE_67, the 6.7"/6.9" slot)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { api, APP_ID } = require('./client');

const DISPLAY_TYPE = process.argv[2] || 'APP_IPHONE_67';
const DIR = path.join(__dirname, '../../store/assets/app-store-screenshots');
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const versions = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&filter[appStoreState]=PREPARE_FOR_SUBMISSION&include=appStoreVersionLocalizations`);
  const vLoc = (versions.included ?? []).find((i) => i.type === 'appStoreVersionLocalizations' && i.attributes.locale === 'en-US');

  const sets = await api('GET', `/v1/appStoreVersionLocalizations/${vLoc.id}/appScreenshotSets?include=appScreenshots`);
  let set = sets.data.find((s) => s.attributes.screenshotDisplayType === DISPLAY_TYPE);
  if (set) {
    for (const ref of set.relationships.appScreenshots?.data ?? []) await api('DELETE', `/v1/appScreenshots/${ref.id}`);
    console.log(`using existing ${DISPLAY_TYPE} set (cleared)`);
  } else {
    set = (await api('POST', '/v1/appScreenshotSets', {
      data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: DISPLAY_TYPE }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: vLoc.id } } } },
    })).data;
    console.log(`created ${DISPLAY_TYPE} set`);
  }

  for (const file of FILES) {
    const bytes = fs.readFileSync(path.join(DIR, file));
    const shot = (await api('POST', '/v1/appScreenshots', {
      data: { type: 'appScreenshots', attributes: { fileName: file, fileSize: bytes.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } } },
    })).data;
    for (const op of shot.attributes.uploadOperations) {
      const headers = Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value]));
      const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
      if (!res.ok) throw new Error(`upload part for ${file}: HTTP ${res.status}`);
    }
    await api('PATCH', `/v1/appScreenshots/${shot.id}`, {
      data: { type: 'appScreenshots', id: shot.id, attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(bytes).digest('hex') } },
    });
    let state = 'UPLOAD_COMPLETE';
    for (let i = 0; i < 30 && !/COMPLETE$|FAILED/.test(state.replace('UPLOAD_COMPLETE', '')); i++) {
      await sleep(2000);
      const a = (await api('GET', `/v1/appScreenshots/${shot.id}`)).data.attributes.assetDeliveryState;
      state = a?.state ?? 'UNKNOWN';
      if (state === 'FAILED') throw new Error(`${file}: Apple rejected it: ${JSON.stringify(a.errors ?? [])}`);
    }
    console.log(`✔ ${file} (${state})`);
  }
})().catch((e) => {
  console.log('FAILED:', e.message);
  process.exit(1);
});
