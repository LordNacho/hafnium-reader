#!/usr/bin/env node
// Render the app icon, Android adaptive layers, splash image and store graphics from design/icon/*.svg.
// Usage: npm run icons

import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (name) => path.join(root, 'design/icon', name);
const BG = '#0d1322';

// [source svg, output path, width, height, flatten (no alpha)]
const OUTPUTS = [
  ['icon.svg', 'assets/icon.png', 1024, 1024, true], // iOS app icon: Apple rejects transparency
  ['background.svg', 'assets/android-icon-background.png', 1024, 1024, true],
  ['foreground.svg', 'assets/android-icon-foreground.png', 1024, 1024, false],
  ['monochrome.svg', 'assets/android-icon-monochrome.png', 1024, 1024, false],
  ['splash.svg', 'assets/splash-icon.png', 1024, 1024, false],
  ['icon.svg', 'assets/favicon.png', 48, 48, true],
  ['icon.svg', 'store/assets/app-store-icon-1024.png', 1024, 1024, true],
  ['icon.svg', 'store/assets/play-icon-512.png', 512, 512, true],
  ['feature-graphic.svg', 'store/assets/play-feature-graphic-1024x500.png', 1024, 500, true],
];

await mkdir(path.join(root, 'store/assets'), { recursive: true });
for (const [svg, out, width, height, flatten] of OUTPUTS) {
  const input = await readFile(src(svg));
  // Render at a high density so curves stay crisp, then resize down to the target.
  let image = sharp(input, { density: Math.ceil((72 * Math.max(width, height) * 2) / 1024) }).resize(width, height);
  if (flatten) image = image.flatten({ background: BG }).removeAlpha();
  await image.png({ compressionLevel: 9 }).toFile(path.join(root, out));
  console.log(`${out}  ${width}x${height}${flatten ? '' : '  (transparent)'}`);
}
