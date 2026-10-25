// Keeps src/i18n/messages/en.json key-for-key in sync with sr-Latn.json (SPEC §9).
// Existing English strings are kept; new keys get the Serbian string until translated.
// Usage: node scripts/sync-messages.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';

const srPath = new URL('../src/i18n/messages/sr-Latn.json', import.meta.url);
const enPath = new URL('../src/i18n/messages/en.json', import.meta.url);
const sr = JSON.parse(readFileSync(srPath, 'utf8'));
const en = JSON.parse(readFileSync(enPath, 'utf8'));

function merge(source, target) {
  // Arrays (e.g. legal sections) stay arrays, merged element by element.
  if (Array.isArray(source)) {
    return source.map((value, index) => {
      const existing = Array.isArray(target) ? target[index] : undefined;
      if (value && typeof value === 'object')
        return merge(value, existing && typeof existing === 'object' ? existing : {});
      return typeof existing === 'string' ? existing : value;
    });
  }
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object') {
      out[key] = merge(value, target && typeof target[key] === 'object' ? target[key] : {});
    } else {
      out[key] = target && typeof target[key] === 'string' ? target[key] : value;
    }
  }
  return out;
}

const next = JSON.stringify(merge(sr, en), null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (next !== readFileSync(enPath, 'utf8')) {
    console.error('en.json is out of sync with sr-Latn.json. Run: node scripts/sync-messages.mjs');
    process.exit(1);
  }
} else {
  writeFileSync(enPath, next);
}
