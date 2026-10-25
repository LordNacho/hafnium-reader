// Make the app free and available in every App Store territory except mainland China (which needs an ICP filing),
// including territories Apple adds later.
const { api, APP_ID } = require('./client');

(async () => {
  // Free price point in the base territory (USA).
  let freePoint = null;
  let next = `/v1/apps/${APP_ID}/appPricePoints?filter[territory]=USA&limit=200`;
  while (next && !freePoint) {
    const page = await api('GET', next);
    freePoint = page.data.find((p) => Number(p.attributes.customerPrice) === 0);
    next = page.links?.next;
  }
  if (!freePoint) throw new Error('free price point not found');

  await api('POST', '/v1/appPriceSchedules', {
    data: {
      type: 'appPriceSchedules',
      relationships: {
        app: { data: { type: 'apps', id: APP_ID } },
        baseTerritory: { data: { type: 'territories', id: 'USA' } },
        manualPrices: { data: [{ type: 'appPrices', id: '${free}' }] },
      },
    },
    included: [{ type: 'appPrices', id: '${free}', attributes: { startDate: null }, relationships: { appPricePoint: { data: { type: 'appPricePoints', id: freePoint.id } } } }],
  });
  console.log('✔ price: Free');

  const territories = [];
  next = '/v1/territories?limit=200';
  while (next) {
    const page = await api('GET', next);
    territories.push(...page.data.map((t) => t.id));
    next = page.links?.next;
  }
  // Apple wants every territory listed, each marked available or not.
  const isAvailable = (t) => t !== 'CHN';
  await api('POST', '/v2/appAvailabilities', {
    data: {
      type: 'appAvailabilities',
      attributes: { availableInNewTerritories: true },
      relationships: {
        app: { data: { type: 'apps', id: APP_ID } },
        territoryAvailabilities: { data: territories.map((t) => ({ type: 'territoryAvailabilities', id: `\${${t}}` })) },
      },
    },
    included: territories.map((t) => ({
      type: 'territoryAvailabilities',
      id: `\${${t}}`,
      attributes: { available: isAvailable(t) },
      relationships: { territory: { data: { type: 'territories', id: t } } },
    })),
  });
  console.log(`✔ available in ${territories.filter(isAvailable).length} of ${territories.length} territories (all except mainland China), plus future ones`);
})().catch((e) => {
  console.log('FAILED:', e.message);
  process.exit(1);
});
