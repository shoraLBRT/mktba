// Size budget for the public article page (issue #59). Run after `npm run build`.
//
// Reads the React Router manifest the build writes to build/client/assets/manifest-*.js, collects
// every JS module the browser loads for a first visit to an article at /:slug (the client entry plus the
// root, public-layout and article route modules with their imports), gzips each one and fails when
// the total is over BUDGET_GZIP_BYTES.
//
// Updating the budget: build, run `node scripts/check-bundle-size.mjs`, and set BUDGET_GZIP_BYTES
// to roughly 10-15% above the measured total. Raise it only in a PR that says why the page grew.
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BUDGET_GZIP_BYTES = 240 * 1024;
const ROUTE_CHAIN = ['root', 'routes/public-layout', 'routes/article'];

const clientDir = fileURLToPath(new URL('../build/client', import.meta.url));
const assetsDir = path.join(clientDir, 'assets');

const manifestFile = readdirSync(assetsDir).find((f) => /^manifest-.*\.js$/.test(f));
if (!manifestFile) {
  console.error(`No React Router manifest in ${assetsDir}: run \`npm run build\` first.`);
  process.exit(1);
}
const source = readFileSync(path.join(assetsDir, manifestFile), 'utf8');
const manifest = JSON.parse(source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1));

const modules = new Set([manifest.entry.module, ...manifest.entry.imports]);
for (const id of ROUTE_CHAIN) {
  const route = manifest.routes[id];
  if (!route) {
    console.error(`Route "${id}" is missing from the manifest: update ROUTE_CHAIN.`);
    process.exit(1);
  }
  modules.add(route.module);
  for (const dep of route.imports ?? []) modules.add(dep);
}

let total = 0;
const rows = [...modules].map((url) => {
  const bytes = gzipSync(readFileSync(path.join(clientDir, url)), { level: 9 }).length;
  total += bytes;
  return { url, bytes };
});
rows.sort((a, b) => b.bytes - a.bytes);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
for (const { url, bytes } of rows) console.log(`${kb(bytes).padStart(10)}  ${url}`);
console.log(`\n/:slug first load: ${rows.length} JS chunks, ${kb(total)} gzip (budget ${kb(BUDGET_GZIP_BYTES)})`);

if (total > BUDGET_GZIP_BYTES) {
  console.error(`Over budget by ${kb(total - BUDGET_GZIP_BYTES)}. Shrink the page or raise the budget (see the header of this script).`);
  process.exit(1);
}
