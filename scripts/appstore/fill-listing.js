// Fill the App Store Connect record for the editable iOS version from store/out/apple.md:
// app info (subtitle, privacy URL, categories), content rights, age rating, version text and URLs,
// copyright, build, review notes. Safe to re-run: every step overwrites with the same values.
// Usage: node scripts/appstore/fill-listing.js <versionString> <buildNumber>
const fs = require('fs');
const path = require('path');
const { api, APP_ID } = require('./client');

const [VERSION = '1.0.0', BUILD = '2'] = process.argv.slice(2);
const md = fs.readFileSync(path.join(__dirname, '../../store/out/apple.md'), 'utf8');
const section = (title) => {
  const m = md.match(new RegExp(`^## ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));
  if (!m) throw new Error(`section "${title}" not found in apple.md`);
  return m[1].trim();
};

const TEXT = {
  subtitle: section('Subtitle'),
  promotionalText: section('Promotional Text'),
  description: section('Description'),
  keywords: section('Keywords'),
  reviewNotes: section('Review Notes'),
};
const URLS = { support: 'https://reader.hafnium.ltd/support.html', marketing: 'https://reader.hafnium.ltd', privacy: 'https://reader.hafnium.ltd/privacy.html' };

// Answers for the age rating questionnaire: nothing objectionable, no web browsing, chat, UGC, ads or gambling.
const FREQUENCY_NONE = [
  'alcoholTobaccoOrDrugUseOrReferences', 'contests', 'gamblingSimulated', 'gunsOrOtherWeapons', 'horrorOrFearThemes',
  'matureOrSuggestiveThemes', 'medicalOrTreatmentInformation', 'profanityOrCrudeHumor', 'sexualContentGraphicAndNudity',
  'sexualContentOrNudity', 'violenceCartoonOrFantasy', 'violenceRealistic', 'violenceRealisticProlongedGraphicOrSadistic',
];
const BOOLEAN_FALSE = [
  'advertising', 'ageAssurance', 'gambling', 'healthOrWellnessTopics', 'lootBox', 'messagingAndChat', 'parentalControls',
  'socialMedia', 'unrestrictedWebAccess', 'userGeneratedContent',
];

const step = async (label, fn) => {
  await fn();
  console.log(`✔ ${label}`);
};

(async () => {
  const infos = await api('GET', `/v1/apps/${APP_ID}/appInfos?include=appInfoLocalizations,ageRatingDeclaration`);
  const info = infos.data.find((i) => i.attributes.state === 'PREPARE_FOR_SUBMISSION') ?? infos.data[0];
  const infoLoc = (infos.included ?? []).find((i) => i.type === 'appInfoLocalizations' && i.attributes.locale === 'en-US');
  const declId = info.relationships.ageRatingDeclaration.data.id;

  await step(`app info: subtitle "${TEXT.subtitle}", privacy policy URL`, () =>
    api('PATCH', `/v1/appInfoLocalizations/${infoLoc.id}`, {
      data: { type: 'appInfoLocalizations', id: infoLoc.id, attributes: { subtitle: TEXT.subtitle, privacyPolicyUrl: URLS.privacy } },
    }));

  await step('categories: News, Productivity', () =>
    api('PATCH', `/v1/appInfos/${info.id}`, {
      data: {
        type: 'appInfos', id: info.id,
        relationships: { primaryCategory: { data: { type: 'appCategories', id: 'NEWS' } }, secondaryCategory: { data: { type: 'appCategories', id: 'PRODUCTIVITY' } } },
      },
    }));

  await step('content rights: shows third-party content', () =>
    api('PATCH', `/v1/apps/${APP_ID}`, { data: { type: 'apps', id: APP_ID, attributes: { contentRightsDeclaration: 'USES_THIRD_PARTY_CONTENT' } } }));

  await step('age rating questionnaire', () =>
    api('PATCH', `/v1/ageRatingDeclarations/${declId}`, {
      data: {
        type: 'ageRatingDeclarations', id: declId,
        attributes: Object.fromEntries([...FREQUENCY_NONE.map((k) => [k, 'NONE']), ...BOOLEAN_FALSE.map((k) => [k, false])]),
      },
    }));

  const versions = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&filter[appStoreState]=PREPARE_FOR_SUBMISSION&include=appStoreVersionLocalizations`);
  const version = versions.data[0];
  if (!version) throw new Error('no editable iOS version (PREPARE_FOR_SUBMISSION) found');
  const vLoc = (versions.included ?? []).find((i) => i.type === 'appStoreVersionLocalizations' && i.attributes.locale === 'en-US');

  await step(`version ${VERSION}, copyright`, () =>
    api('PATCH', `/v1/appStoreVersions/${version.id}`, {
      data: { type: 'appStoreVersions', id: version.id, attributes: { versionString: VERSION, copyright: `${new Date().getFullYear()} Hafnium Research` } },
    }));

  await step(`version text: description (${TEXT.description.length} chars), keywords (${TEXT.keywords.length}), promotional text, URLs`, () =>
    api('PATCH', `/v1/appStoreVersionLocalizations/${vLoc.id}`, {
      data: {
        type: 'appStoreVersionLocalizations', id: vLoc.id,
        attributes: { description: TEXT.description, keywords: TEXT.keywords, promotionalText: TEXT.promotionalText, supportUrl: URLS.support, marketingUrl: URLS.marketing },
      },
    }));

  const builds = await api('GET', `/v1/builds?filter[app]=${APP_ID}&filter[version]=${BUILD}&filter[processingState]=VALID`);
  const build = builds.data[0];
  if (!build) throw new Error(`build ${BUILD} not found or not processed`);
  await step(`attach build ${BUILD}`, () =>
    api('PATCH', `/v1/appStoreVersions/${version.id}/relationships/build`, { data: { type: 'builds', id: build.id } }));

  const existing = await api('GET', `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`).catch(() => ({ data: null }));
  const reviewAttrs = { notes: TEXT.reviewNotes, contactEmail: 'info@hafnium.ltd', demoAccountRequired: false };
  await step('review notes and contact email', () =>
    existing.data
      ? api('PATCH', `/v1/appStoreReviewDetails/${existing.data.id}`, { data: { type: 'appStoreReviewDetails', id: existing.data.id, attributes: reviewAttrs } })
      : api('POST', '/v1/appStoreReviewDetails', {
          data: { type: 'appStoreReviewDetails', attributes: reviewAttrs, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } },
        }));

  console.log(`\nversion id: ${version.id}\nversion localization id: ${vLoc.id}`);
})().catch((e) => {
  console.log('FAILED:', e.message);
  process.exit(1);
});
