// Submit the editable iOS version for App Review (reuses an open, unsubmitted review submission if there is one).
const { api, APP_ID } = require('./client');

(async () => {
  const versions = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&filter[appStoreState]=PREPARE_FOR_SUBMISSION`);
  const version = versions.data[0];
  if (!version) throw new Error('no iOS version waiting for submission');

  const open = await api('GET', `/v1/reviewSubmissions?filter[app]=${APP_ID}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW`);
  const submission = open.data[0] ?? (await api('POST', '/v1/reviewSubmissions', {
    data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: APP_ID } } } },
  })).data;
  console.log(`review submission ${submission.id} (${open.data[0] ? 'reused' : 'new'})`);

  const items = await api('GET', `/v1/reviewSubmissions/${submission.id}/items?include=appStoreVersion`);
  const already = items.data.some((i) => i.relationships.appStoreVersion?.data?.id === version.id);
  if (!already) {
    await api('POST', '/v1/reviewSubmissionItems', {
      data: {
        type: 'reviewSubmissionItems',
        relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } },
      },
    });
  }
  console.log(`✔ added version ${version.attributes.versionString}`);

  const done = await api('PATCH', `/v1/reviewSubmissions/${submission.id}`, { data: { type: 'reviewSubmissions', id: submission.id, attributes: { submitted: true } } });
  console.log(`✔ submitted: state ${done.data.attributes.state}`);
})().catch((e) => {
  console.log('FAILED:', e.message);
  process.exit(1);
});
