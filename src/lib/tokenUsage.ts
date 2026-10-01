import type { ModelEntry } from '../data/types';
import pricesJson from '../data/model-prices.json';
import usageJson from '../data/token-usage.json';

/**
 * Token usage and cost, from two JSON files rather than the report card's prose:
 *
 * - `src/data/token-usage.json` — per-model token counts exported from Zcode's usage database
 *   (`npm run usage:export -- --write`). `input` already includes cache reads and cache writes;
 *   `output` already includes reasoning.
 * - `src/data/model-prices.json` — list prices in USD per 1M tokens, keyed by report-card model
 *   name, plus the Zcode model ids each name covers (`npm run prices:sync -- --write`).
 */

/** List prices for one model, in USD per 1M tokens. A null cache price falls back to `input`. */
export interface ModelPrice {
  litellm: string | null;
  zcodeIds: string[];
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
}

export interface PriceFile {
  synced: string | null;
  models: Record<string, ModelPrice>;
}

/** Raw token counts for one Zcode model id over the export window. */
export interface UsageCounts {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface UsageFile {
  days: number;
  from: string;
  to: string;
  models: Record<string, UsageCounts>;
}

export const PRICES = pricesJson as PriceFile;
export const USAGE = usageJson as UsageFile;

/** 2_170_000_000 → "2.17B", 564_000_000 → "564M", 1_800_000 → "1.8M" (≤ 3 significant digits). */
export function formatTokens(tokens: number): string {
  const units: Array<[number, string]> = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (tokens >= size) return `${Number((tokens / size).toPrecision(3))}${suffix}`;
  }
  return String(tokens);
}

/** $172.34 → "$172", $95.82 → "$96", $8.14 → "$8.14", $0.27 → "$0.27". */
export function formatCost(dollars: number): string {
  const rounded = dollars >= 10 ? Math.round(dollars) : Math.round(dollars * 100) / 100;
  return `$${rounded.toLocaleString('en-US')}`;
}

export type ChipTier = 'white' | 'red' | 'green' | 'black' | 'purple';

/** Casino chip colour for a cost, by the usual denominations: $1 white, $5 red, $25 green, $100 black, $500 purple. */
export function chipTier(dollars: number): ChipTier {
  if (dollars >= 500) return 'purple';
  if (dollars >= 100) return 'black';
  if (dollars >= 25) return 'green';
  if (dollars >= 5) return 'red';
  return 'white';
}

/** Cost in USD of `counts` at `price`; null when the model has no input or output price. */
export function costOf(counts: UsageCounts, price: ModelPrice | undefined): number | null {
  if (!price || price.input === null || price.output === null) return null;
  const uncached = Math.max(counts.input - counts.cacheRead - counts.cacheWrite, 0);
  const total =
    uncached * price.input +
    counts.cacheRead * (price.cacheRead ?? price.input) +
    counts.cacheWrite * (price.cacheWrite ?? price.input) +
    counts.output * price.output;
  return total / 1e6;
}

/** A model's usage over the export window, summed across every Zcode id its price entry claims. */
export interface ModelUsage {
  /** Input + output tokens (input includes cached tokens). */
  billedTokens: number;
  cacheReads: number;
  /** Indicative cost at list prices; null when the model has no price. */
  cost: number | null;
}

function sumCounts(list: UsageCounts[]): UsageCounts {
  return list.reduce(
    (sum, counts) => ({
      input: sum.input + counts.input,
      output: sum.output + counts.output,
      reasoning: sum.reasoning + counts.reasoning,
      cacheRead: sum.cacheRead + counts.cacheRead,
      cacheWrite: sum.cacheWrite + counts.cacheWrite,
    }),
    { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
  );
}

function toUsage(counts: UsageCounts, price: ModelPrice | undefined): ModelUsage {
  return {
    billedTokens: counts.input + counts.output,
    cacheReads: counts.cacheRead,
    cost: costOf(counts, price),
  };
}

function usageById(usage: UsageFile): Map<string, UsageCounts> {
  return new Map(Object.entries(usage.models).map(([id, counts]) => [id.toLowerCase(), counts]));
}

/** Usage for a price-file name, or null when none of its Zcode ids logged any usage. */
export function usageForName(
  name: string,
  prices: PriceFile = PRICES,
  usage: UsageFile = USAGE,
): ModelUsage | null {
  const price = prices.models[name];
  if (!price) return null;
  const byId = usageById(usage);
  const matched = price.zcodeIds.flatMap((id) => byId.get(id.toLowerCase()) ?? []);
  return matched.length ? toUsage(sumCounts(matched), price) : null;
}

/** Usage for a report-card model or harness entry, matched by exact name. */
export function modelUsage(
  entry: ModelEntry,
  prices: PriceFile = PRICES,
  usage: UsageFile = USAGE,
): ModelUsage | null {
  return usageForName(entry.name, prices, usage);
}

/** One leaderboard row. `model` is absent for a logged model with no report-card entry yet. */
export interface UsageRow {
  key: string;
  name: string;
  model?: ModelEntry;
  usage: ModelUsage;
}

/**
 * Every model with logged usage: priced names (matched to report-card models where one exists),
 * then any Zcode id no price entry claims, shown under its raw id with no cost.
 */
export function usageRows(
  models: ModelEntry[],
  prices: PriceFile = PRICES,
  usage: UsageFile = USAGE,
): UsageRow[] {
  const byName = new Map(models.map((model) => [model.name, model]));
  const claimed = new Set(
    Object.values(prices.models).flatMap((price) => price.zcodeIds.map((id) => id.toLowerCase())),
  );
  const priced = Object.keys(prices.models).flatMap((name) => {
    const found = usageForName(name, prices, usage);
    return found ? [{ key: name, name, model: byName.get(name), usage: found }] : [];
  });
  const unpriced = Object.entries(usage.models)
    .filter(([id]) => !claimed.has(id.toLowerCase()))
    .map(([id, counts]) => ({ key: id, name: id, usage: toUsage(counts, undefined) }));
  return [...priced, ...unpriced];
}

export interface UsageTotals {
  billedTokens: number;
  cacheReads: number;
  /** Sum of every priced model's cost. */
  cost: number;
  from: string;
  to: string;
}

export function usageTotals(rows: UsageRow[], usage: UsageFile = USAGE): UsageTotals {
  return {
    billedTokens: rows.reduce((sum, row) => sum + row.usage.billedTokens, 0),
    cacheReads: rows.reduce((sum, row) => sum + row.usage.cacheReads, 0),
    cost: rows.reduce((sum, row) => sum + (row.usage.cost ?? 0), 0),
    from: usage.from,
    to: usage.to,
  };
}

export type UsageSort = 'tokens' | 'cost';

/** By tokens: billed descending. By cost: priced rows by cost descending, then the rest by tokens. */
export function sortUsageRows(rows: UsageRow[], sort: UsageSort): UsageRow[] {
  const byTokens = (a: UsageRow, b: UsageRow) => b.usage.billedTokens - a.usage.billedTokens;
  if (sort === 'tokens') return [...rows].sort(byTokens);
  return [...rows].sort((a, b) => {
    if (a.usage.cost !== null && b.usage.cost !== null) return b.usage.cost - a.usage.cost;
    if (a.usage.cost !== null) return -1;
    if (b.usage.cost !== null) return 1;
    return byTokens(a, b);
  });
}

/** "2026-09-01" → "Sep 1". */
export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
