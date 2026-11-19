// Raster icons and the multi-size favicon.ico, generated from public/favicon.svg (O-13, #62).
//
// The PNG and ICO files are committed; run this only after changing the mark. sharp is not a
// project dependency, so install it for the run without touching package.json or the lockfile:
//
//   npm install --no-save sharp@0.34.5 && node scripts/gen-icons.mjs
//
// favicon.svg is the mark on a rounded square. Full-bleed icons (apple-touch-icon, the maskable
// icon) take the square without rounded corners, since the platform crops them itself; the
// maskable icon shrinks the glyph so it stays inside the 80% safe zone.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const rounded = readFileSync(`${publicDir}favicon.svg`, 'utf8');
const fullBleed = rounded.replace(/ rx="\d+"/, '');
const maskable = fullBleed.replace(/(<path[^>]*\/>\s*)+/, (glyph) =>
  `<g transform="translate(256 256) scale(0.8) translate(-256 -256)">${glyph}</g>`,
);

// The SVG is drawn at 2048 px (density 288 on a 512 viewBox) and scaled down, for smooth edges.
const png = (svg, size) => sharp(Buffer.from(svg), { density: 288 }).resize(size, size).png().toBuffer();

const targets = [
  ['icon-192.png', rounded, 192],
  ['icon-512.png', rounded, 512],
  ['apple-touch-icon.png', fullBleed, 180],
  ['icon-maskable-512.png', maskable, 512],
];
for (const [name, svg, size] of targets) {
  writeFileSync(`${publicDir}${name}`, await png(svg, size));
}

// An ICO file whose entries are PNG images (supported by every current browser).
const icoSizes = [16, 32, 48];
const images = await Promise.all(icoSizes.map((size) => png(rounded, size)));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((image, index) => {
  const entry = 6 + 16 * index;
  header.writeUInt8(icoSizes[index], entry);
  header.writeUInt8(icoSizes[index], entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
writeFileSync(`${publicDir}favicon.ico`, Buffer.concat([header, ...images]));
