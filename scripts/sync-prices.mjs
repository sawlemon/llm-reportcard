/**
 * Refreshes `src/data/model-prices.json` from LiteLLM's community price map.
 *
 *   npm run prices:sync            # dry run: prints what would change, writes nothing
 *   npm run prices:sync -- --write # applies the changes
 *
 * Only entries that name a `litellm` key are touched, and only their four price fields and the
 * top-level `synced` date. Prices are stored in USD per 1M tokens. A key LiteLLM no longer has is
 * reported and left unchanged rather than deleted.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PRICES_PATH = fileURLToPath(new URL('../src/data/model-prices.json', import.meta.url));
const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

const write = process.argv.includes('--write');
const file = JSON.parse(readFileSync(PRICES_PATH, 'utf8'));

const response = await fetch(LITELLM_URL);
if (!response.ok) {
  console.error(`Could not fetch LiteLLM prices: HTTP ${response.status}`);
  process.exit(1);
}
const litellm = await response.json();

const perMillion = (value) => (typeof value === 'number' ? Math.round(value * 1e6 * 1e4) / 1e4 : null);
const FIELDS = [
  ['input', 'input_cost_per_token'],
  ['output', 'output_cost_per_token'],
  ['cacheRead', 'cache_read_input_token_cost'],
  ['cacheWrite', 'cache_creation_input_token_cost'],
];

let changes = 0;
const missing = [];
for (const [name, entry] of Object.entries(file.models)) {
  if (!entry.litellm) continue;
  const source = litellm[entry.litellm];
  if (!source) {
    missing.push(`${name} (${entry.litellm})`);
    continue;
  }
  for (const [field, key] of FIELDS) {
    const next = perMillion(source[key]);
    if (next !== entry[field]) {
      console.log(`${name}: ${field} ${entry[field]} -> ${next}`);
      entry[field] = next;
      changes += 1;
    }
  }
}

if (missing.length) console.warn(`Not in LiteLLM (left unchanged): ${missing.join(', ')}`);
console.log(`${changes} price change${changes === 1 ? '' : 's'}.`);

if (write) {
  file.synced = new Date().toISOString().slice(0, 10);
  writeFileSync(PRICES_PATH, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`Wrote ${PRICES_PATH}`);
} else if (changes) {
  console.log('Dry run — re-run with --write to apply.');
}
