#!/usr/bin/env node
// Renders app-store listing text and the GitHub Pages site from templates.
//
//   node scripts/store.mjs
//
// Inputs:  store/config.json, store/templates/{apple,google}.md, store/templates/site/*
// Outputs: store/out/{apple,google}.md, docs/*.html, docs/style.css
//
// Placeholders: {{NAME}} {{DEVELOPER_NAME}} {{SUPPORT_EMAIL}} {{SITE_URL}} {{LAST_UPDATED}}
// A placeholder whose config value is empty is left in place (and reported) so it
// is easy to spot in the output. Exits 1 if any store field exceeds its limit.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storeDir = path.join(root, 'store');
const templatesDir = path.join(storeDir, 'templates');
const siteDir = path.join(templatesDir, 'site');
const outDir = path.join(storeDir, 'out');
const docsDir = path.join(root, 'docs');

const CONFIG_KEYS = {
  NAME: 'name',
  DEVELOPER_NAME: 'developerName',
  SUPPORT_EMAIL: 'supportEmail',
  SITE_URL: 'siteUrl',
  LAST_UPDATED: 'lastUpdated',
};

const LIMITS = {
  apple: {
    'App Name': 30,
    Subtitle: 30,
    'Promotional Text': 170,
    Description: 4000,
    Keywords: 100,
    "What's New": 4000,
  },
  google: {
    'App Name': 30,
    'Short Description': 80,
    'Full Description': 4000,
  },
};

const len = (s) => [...s].length;

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render(template, values, { html = false } = {}) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    const value = values[key];
    if (value === undefined || value === '') return match;
    return html ? escapeHtml(value) : value;
  });
}

function leftoverPlaceholders(text) {
  return [...new Set(text.match(/\{\{[^{}]*\}\}/g) ?? [])];
}

/** Splits a markdown file into { "Field": "body" } on "## Field" headings. */
function parseSections(md) {
  const sections = {};
  const parts = md.split(/^## +(.+?)\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    sections[parts[i]] = parts[i + 1].trim();
  }
  return sections;
}

async function main() {
  const config = JSON.parse(await readFile(path.join(storeDir, 'config.json'), 'utf8'));
  const warnings = [];
  const errors = [];

  const values = {};
  for (const [placeholder, key] of Object.entries(CONFIG_KEYS)) {
    let value = typeof config[key] === 'string' ? config[key].trim() : '';
    if (key === 'siteUrl') value = value.replace(/\/+$/, '');
    if (!value) warnings.push(`config.${key} is empty ({{${placeholder}}} left unrendered)`);
    values[placeholder] = value;
  }

  await mkdir(outDir, { recursive: true });
  await mkdir(docsDir, { recursive: true });

  const rows = [];

  // Store listings
  for (const store of Object.keys(LIMITS)) {
    const template = await readFile(path.join(templatesDir, `${store}.md`), 'utf8');
    const output = render(template, values);
    const outFile = path.join(outDir, `${store}.md`);
    await writeFile(outFile, output);

    for (const p of leftoverPlaceholders(output)) {
      warnings.push(`store/out/${store}.md: leftover placeholder ${p}`);
    }

    const sections = parseSections(output);
    for (const [field, limit] of Object.entries(LIMITS[store])) {
      const text = sections[field];
      if (text === undefined) {
        errors.push(`${store}: missing section "## ${field}"`);
        rows.push({ store, field, length: '-', limit, status: 'MISSING' });
        continue;
      }
      const n = len(text);
      const ok = n <= limit;
      if (!ok) errors.push(`${store}: ${field} is ${n} characters (limit ${limit})`);
      rows.push({ store, field, length: n, limit, status: ok ? 'ok' : 'TOO LONG' });
    }

    if (store === 'apple' && sections.Keywords !== undefined) {
      const kw = sections.Keywords;
      if (/,\s/.test(kw) || /\s,/.test(kw)) errors.push('apple: Keywords must not have spaces around commas');
      if (/\n/.test(kw)) errors.push('apple: Keywords must be a single line');
      const words = kw.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
      const seen = new Set();
      for (const w of words) {
        if (seen.has(w)) warnings.push(`apple: keyword "${w}" is repeated`);
        seen.add(w);
      }
      const indexed = `${sections['App Name'] ?? ''} ${sections.Subtitle ?? ''} news`
        .toLowerCase()
        .split(/[^\p{L}\p{N}-]+/u)
        .filter(Boolean);
      for (const w of words) {
        for (const part of w.split(/\s+/)) {
          if (indexed.includes(part)) {
            warnings.push(`apple: keyword "${w}" repeats "${part}" from the name, subtitle or category`);
          }
        }
      }
    }
  }

  // Website
  const siteFiles = await readdir(siteDir);
  const written = [];
  for (const file of siteFiles) {
    if (!/\.(html|css)$/.test(file)) continue;
    const template = await readFile(path.join(siteDir, file), 'utf8');
    const output = render(template, values, { html: file.endsWith('.html') });
    await writeFile(path.join(docsDir, file), output);
    written.push(`docs/${file}`);
    for (const p of leftoverPlaceholders(output)) {
      warnings.push(`docs/${file}: leftover placeholder ${p}`);
    }
  }

  // GitHub Pages serves a custom domain only when docs/CNAME names it.
  if (values.SITE_URL) {
    const host = new URL(values.SITE_URL).hostname;
    if (!host.endsWith('.github.io')) {
      await writeFile(path.join(docsDir, 'CNAME'), `${host}\n`);
      written.push('docs/CNAME');
    }
  }

  // Report
  console.log(`Wrote store/out/apple.md, store/out/google.md, ${written.join(', ')}\n`);
  const header = ['Store', 'Field', 'Length', 'Limit', 'Status'];
  const table = [header, ...rows.map((r) => [r.store, r.field, String(r.length), String(r.limit), r.status])];
  const widths = header.map((_, i) => Math.max(...table.map((row) => len(row[i]))));
  const line = (row) => row.map((cell, i) => (i === 2 || i === 3 ? cell.padStart(widths[i]) : cell.padEnd(widths[i]))).join('  ');
  console.log(line(table[0]));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of table.slice(1)) console.log(line(row));

  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
  if (errors.length) {
    console.error(`\nErrors (${errors.length}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('\nAll character limits pass.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
