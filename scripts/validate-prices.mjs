/**
 * Validates `src/data/model-prices.json` and `src/data/token-usage.json` against each other.
 *
 * Errors (exit 1): a price that is not a non-negative number or null, a model with no input or
 * output price, or a Zcode model id claimed by two entries.
 * Warnings: a Zcode model in the usage export that no price entry claims (it shows as unpriced on
 * the site), and a price entry whose name is not a model in LLM_REPORT_CARD.md (it shows on the
 * Tokens leaderboard but has no card to open).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const read = (path) => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'));
const prices = read('../src/data/model-prices.json');
const usage = read('../src/data/token-usage.json');

const { module: parser } = await runnerImport(
  fileURLToPath(new URL('../src/data/parseReportCard.ts', import.meta.url)),
  { configFile: false, logLevel: 'silent' },
);
const card = parser.parseReportCard(
  readFileSync(fileURLToPath(new URL('../LLM_REPORT_CARD.md', import.meta.url)), 'utf8'),
);
const cardNames = new Set(card.models.map((model) => model.name));

const errors = [];
const warnings = [];
const owner = new Map();

for (const [name, entry] of Object.entries(prices.models)) {
  for (const field of ['input', 'output', 'cacheRead', 'cacheWrite']) {
    const value = entry[field];
    if (value !== null && !(typeof value === 'number' && value >= 0)) {
      errors.push(`${name}: ${field} must be a non-negative number or null`);
    }
  }
  if (entry.input === null || entry.output === null)
    errors.push(`${name}: input and output prices are required`);
  for (const id of entry.zcodeIds ?? []) {
    const key = id.toLowerCase();
    if (owner.has(key)) errors.push(`Zcode id "${id}" is claimed by both ${owner.get(key)} and ${name}`);
    owner.set(key, name);
  }
  if (!cardNames.has(name)) warnings.push(`${name} has a price but no entry in LLM_REPORT_CARD.md`);
}

for (const id of Object.keys(usage.models)) {
  if (!owner.has(id.toLowerCase())) warnings.push(`Zcode model "${id}" has usage but no price entry`);
}

for (const warning of warnings) console.warn(`warning: ${warning}`);
for (const error of errors) console.error(`model-prices.json: ${error}`);
if (errors.length) process.exit(1);
console.log(
  `prices: ${Object.keys(prices.models).length} models (synced ${prices.synced}); usage: ${Object.keys(usage.models).length} models, ${usage.from} to ${usage.to}`,
);
