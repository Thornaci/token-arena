// Fails when any locale catalog is out of sync with the base (English)
// catalog: missing keys, extra keys, or non-string values. Run in CI so a
// translation can never silently fall back to raw message keys.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MESSAGES_DIR = new URL('../messages/', import.meta.url).pathname;
const BASE_LOCALE = 'en';

function loadCatalog(file) {
  const raw = JSON.parse(readFileSync(join(MESSAGES_DIR, file), 'utf8'));
  delete raw.$schema;
  return raw;
}

const files = readdirSync(MESSAGES_DIR).filter((f) => f.endsWith('.json'));
const baseFile = `${BASE_LOCALE}.json`;
if (!files.includes(baseFile)) {
  console.error(`check-i18n: missing base catalog messages/${baseFile}`);
  process.exit(1);
}

const base = loadCatalog(baseFile);
const baseKeys = new Set(Object.keys(base));
let failed = false;

function report(locale, label, keys) {
  if (keys.length === 0) return;
  failed = true;
  console.error(`\n${locale}: ${label} (${keys.length})`);
  for (const key of keys.sort()) console.error(`  - ${key}`);
}

for (const file of files) {
  const locale = file.replace(/\.json$/, '');
  const catalog = loadCatalog(file);

  const nonStrings = Object.entries(catalog)
    .filter(([, value]) => typeof value !== 'string')
    .map(([key]) => key);
  report(locale, 'non-string values (catalogs must stay flat)', nonStrings);

  if (locale === BASE_LOCALE) continue;
  const keys = new Set(Object.keys(catalog));
  report(locale, `keys missing vs ${BASE_LOCALE}`, [...baseKeys].filter((k) => !keys.has(k)));
  report(locale, `extra keys not in ${BASE_LOCALE}`, [...keys].filter((k) => !baseKeys.has(k)));
}

if (failed) {
  console.error('\ncheck-i18n: FAILED');
  process.exit(1);
}
console.log(`check-i18n: OK — ${files.length} locale(s), ${baseKeys.size} key(s)`);
