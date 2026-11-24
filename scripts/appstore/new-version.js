// Create the next iOS App Store version (if it doesn't exist yet) for an update, ready for fill-listing.js.
// Usage: node scripts/appstore/new-version.js <versionString>
const { api, APP_ID } = require('./client');

const [VERSION] = process.argv.slice(2);
if (!VERSION) throw new Error('usage: new-version.js <versionString>');

(async () => {
  const existing = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${VERSION}`);
  if (existing.data[0]) {
    console.log(`version ${VERSION} already exists: ${existing.data[0].attributes.appStoreState}`);
    return;
  }
  const v = await api('POST', '/v1/appStoreVersions', {
    data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString: VERSION }, relationships: { app: { data: { type: 'apps', id: APP_ID } } } },
  });
  console.log(`✔ created version ${VERSION} (${v.data.attributes.appStoreState})`);
})().catch((e) => {
  console.log('FAILED:', e.message);
  process.exit(1);
});
