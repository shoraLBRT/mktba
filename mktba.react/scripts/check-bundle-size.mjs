// Size budget for the public article page (issue #59). Run after `npm run build`.
//
// Reads the React Router manifest the build writes to build/client/assets/manifest-*.js, collects
// every JS module the browser loads for a first visit to an article (the client entry plus the
// matched route modules with their imports), gzips each one and fails when the total is over
// BUDGET_GZIP_BYTES. Two pages are measured: the Russian article at /:slug (the main audience; the
// table is printed for it) and the English one at /en/:slug.
//
// Each language's strings come only with its own pages (I-02, #106): the English page must not load
// a chunk that only the Russian pages' route (`routes/russian`) brings, the Russian strings.
//
// Updating the budget: build, run `node scripts/check-bundle-size.mjs`, and set BUDGET_GZIP_BYTES
// to roughly 10-15% above the measured total. Raise it only in a PR that says why the page grew.
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BUDGET_GZIP_BYTES = 240 * 1024;
const PAGES = [
  { name: '/:slug', chain: ['root', 'routes/public-layout', 'routes/russian', 'routes/article'] },
  { name: '/en/:slug', chain: ['root', 'routes/public-layout', 'en/routes/article'] },
];
const RUSSIAN_ONLY_ROUTE = 'routes/russian';

const clientDir = fileURLToPath(new URL('../build/client', import.meta.url));
const assetsDir = path.join(clientDir, 'assets');

const manifestFile = readdirSync(assetsDir).find((f) => /^manifest-.*\.js$/.test(f));
if (!manifestFile) {
  console.error(`No React Router manifest in ${assetsDir}: run \`npm run build\` first.`);
  process.exit(1);
}
const source = readFileSync(path.join(assetsDir, manifestFile), 'utf8');
const manifest = JSON.parse(source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1));

const routeOf = (id) => {
  const route = manifest.routes[id];
  if (!route) {
    console.error(`Route "${id}" is missing from the manifest: update PAGES.`);
    process.exit(1);
  }
  return route;
};

const modulesOf = (chain) => {
  const modules = new Set([manifest.entry.module, ...manifest.entry.imports]);
  for (const id of chain) {
    const route = routeOf(id);
    modules.add(route.module);
    for (const dep of route.imports ?? []) modules.add(dep);
  }
  return modules;
};

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
let failed = false;

for (const [index, page] of PAGES.entries()) {
  const modules = modulesOf(page.chain);
  let total = 0;
  const rows = [...modules].map((url) => {
    const bytes = gzipSync(readFileSync(path.join(clientDir, url)), { level: 9 }).length;
    total += bytes;
    return { url, bytes };
  });

  if (index === 0) {
    rows.sort((a, b) => b.bytes - a.bytes);
    for (const { url, bytes } of rows) console.log(`${kb(bytes).padStart(10)}  ${url}`);
    console.log('');
  }
  console.log(`${page.name} first load: ${rows.length} JS chunks, ${kb(total)} gzip (budget ${kb(BUDGET_GZIP_BYTES)})`);

  if (total > BUDGET_GZIP_BYTES) {
    console.error(`${page.name} is over budget by ${kb(total - BUDGET_GZIP_BYTES)}. Shrink the page or raise the budget (see the header of this script).`);
    failed = true;
  }

  if (!page.chain.includes(RUSSIAN_ONLY_ROUTE)) {
    // What the Russian pages' route brings beyond the entry and the root: the Russian strings.
    const shared = modulesOf(['root']);
    const leaked = [...modulesOf([RUSSIAN_ONLY_ROUTE])].filter(
      (url) => !shared.has(url) && url !== routeOf(RUSSIAN_ONLY_ROUTE).module && modules.has(url),
    );
    if (leaked.length > 0) {
      console.error(`${page.name} loads the Russian strings (${leaked.join(', ')}): only the Russian pages may (I-02, #106).`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
