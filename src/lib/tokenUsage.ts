import type { ModelEntry } from '../data/types';

/**
 * Token-usage extraction from the report card's free-text notes (no parser change).
 *
 * Three kinds of note carry the data, all authored in the 30-day Zcode usage log update:
 *  - per model, a "Cost / efficiency" note containing "Zcode 30-day usage log" (calls,
 *    billed tokens, optional cache reads — GLM 5.3 Flash's separate "176M-token burn … ~$33"
 *    note must be ignored);
 *  - on the Zcode harness, a "30-day usage log" total note (plus the window dates);
 *  - on the same harness, a "burn ranks:" note listing indicative dollar costs per model.
 *
 * The parser splits note cells on top-level semicolons, so each sentence is its own note
 * string; every regex below is applied to that single note only.
 */

/** Multiplier per magnitude suffix, shared by {@link parseTokenAmount}. */
const MAGNITUDES: Record<string, number> = { K: 1_000, M: 1_000_000, B: 1_000_000_000 };

/**
 * Parses a compact token amount: "564M" → 564_000_000, "2.17B" → 2_170_000_000,
 * "1.8M" → 1_800_000, "13K" → 13_000. Case-insensitive suffix, tolerant of surrounding
 * whitespace. Returns `NaN` for anything else.
 */
export function parseTokenAmount(text: string): number {
  const match = /^\s*([\d.]+)\s*([KMB])\s*$/i.exec(text);
  if (!match) return Number.NaN;
  return Math.round(Number(match[1]) * MAGNITUDES[match[2].toUpperCase()]);
}

/** Formats with at most 3 significant digits and no trailing zeros ("1.80" → "1.8"). */
function significant(value: number): string {
  return String(Number(value.toPrecision(3)));
}

/** Formats a token count compactly: 2.17B → "2.17B", 564e6 → "564M", 1.8e6 → "1.8M". */
export function formatTokens(tokens: number): string {
  if (tokens >= MAGNITUDES.B) return `${significant(tokens / MAGNITUDES.B)}B`;
  if (tokens >= MAGNITUDES.M) return `${significant(tokens / MAGNITUDES.M)}M`;
  if (tokens >= MAGNITUDES.K) return `${significant(tokens / MAGNITUDES.K)}K`;
  return String(tokens);
}

/** The per-model usage log extracted from one note. */
export interface ModelUsage {
  calls: number;
  billedTokens: number;
  /** Cache-read tokens, or null when the note does not mention them. */
  cacheReads: number | null;
  /** The ISO date the note opens with, or null when it has none. */
  date: string | null;
}

const USAGE_PHRASE = 'Zcode 30-day usage log';
const CALLS_PATTERN = /([\d,]+)\s+(?:model\s+)?calls/;
const BILLED_PATTERN = /([\d.]+\s*[KMB])\s+billed tokens/;
const CACHE_PATTERN = /([\d.]+\s*[KMB])\s+cache reads/;
const DATE_PATTERN = /^\((\d{4}-\d{2}-\d{2})\)/;

function parseCalls(note: string): number | null {
  const match = CALLS_PATTERN.exec(note);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function parseBilled(note: string): number | null {
  const match = BILLED_PATTERN.exec(note);
  return match ? parseTokenAmount(match[1]) : null;
}

/** The first note (per aspect, pros then cons) containing the usage-log phrase. */
function findModelUsageNote(entry: ModelEntry): string | undefined {
  for (const aspect of entry.aspects) {
    for (const note of aspect.pros) if (note.includes(USAGE_PHRASE)) return note;
    for (const note of aspect.cons) if (note.includes(USAGE_PHRASE)) return note;
  }
  return undefined;
}

/**
 * Extracts the "Zcode 30-day usage log" note of a model or harness entry, parsing calls,
 * billed tokens, optional cache reads and the note's leading date. Returns null when there
 * is no such note or it lacks calls/billed numbers (the GLM-style "…-token burn … ~$33"
 * cost note does not contain the phrase and is never matched).
 */
export function modelUsage(entry: ModelEntry): ModelUsage | null {
  const note = findModelUsageNote(entry);
  if (!note) return null;

  const calls = parseCalls(note);
  const billedTokens = parseBilled(note);
  if (calls === null || billedTokens === null) return null;

  const cacheMatch = CACHE_PATTERN.exec(note);
  const dateMatch = DATE_PATTERN.exec(note);
  return {
    calls,
    billedTokens,
    cacheReads: cacheMatch ? parseTokenAmount(cacheMatch[1]) : null,
    date: dateMatch ? dateMatch[1] : null,
  };
}

/** The Zcode harness's whole-log totals. */
export interface ZcodeTotals {
  calls: number;
  billedTokens: number;
  cacheReads: number | null;
  /** The log window as authored, e.g. "Sep 2–Oct 1", or null. */
  window: string | null;
}

const TOTALS_PHRASE = '30-day usage log';
const TOTALS_CALLS_PATTERN = /([\d,]+)\s+model calls/;
const TOTALS_BILLED_PATTERN = /([\d.]+[KMB])\s+billed tokens/;
const TOTALS_CACHE_PATTERN = /([\d.]+[KMB])\s+additional tokens served as cache reads/;
/** First parenthetical group that contains a comma — e.g. "(Sep 2–Oct 1, read from …)". */
const WINDOW_PATTERN = /\(([^)]*?),/;

function findHarnessNote(harnesses: ModelEntry[], phrase: string): string | undefined {
  for (const harness of harnesses) {
    for (const aspect of harness.aspects) {
      for (const note of aspect.pros) if (note.includes(phrase)) return note;
      for (const note of aspect.cons) if (note.includes(phrase)) return note;
    }
  }
  return undefined;
}

/**
 * Reads the Zcode harness's "30-day usage log" total note: calls, billed tokens, cache
 * reads and the log window (text inside the first comma-bearing parentheses). Returns null
 * when no harness carries such a note or it lacks calls/billed numbers.
 */
export function zcodeTotals(harnesses: ModelEntry[]): ZcodeTotals | null {
  const note = findHarnessNote(harnesses, TOTALS_PHRASE);
  if (!note) return null;

  const callsMatch = TOTALS_CALLS_PATTERN.exec(note);
  const billedMatch = TOTALS_BILLED_PATTERN.exec(note);
  if (!callsMatch || !billedMatch) return null;

  const cacheMatch = TOTALS_CACHE_PATTERN.exec(note);
  const windowMatch = WINDOW_PATTERN.exec(note);
  return {
    calls: Number(callsMatch[1].replace(/,/g, '')),
    billedTokens: parseTokenAmount(billedMatch[1]),
    cacheReads: cacheMatch ? parseTokenAmount(cacheMatch[1]) : null,
    window: windowMatch ? windowMatch[1].trim() : null,
  };
}

const COSTS_PHRASE = 'burn ranks:';
/** " Sonnet 5 ~$1,295" → short name "Sonnet 5", dollars 1295. */
const COST_ITEM_PATTERN = /^\s*(.+?)\s+~\$([\d,]+)/;

/**
 * Parses the harness's "burn ranks:" note into short model names and indicative dollar
 * costs: the text after "burn ranks:" up to the first "(", split at the item separators —
 * commas followed by whitespace, so the thousands separators inside "~$1,295" do not split
 * an item — each item shaped "<name> ~$<dollars>". Short names match full model names via
 * {@link costFor}.
 */
export function estimatedCosts(harnesses: ModelEntry[]): Map<string, number> {
  const costs = new Map<string, number>();
  const note = findHarnessNote(harnesses, COSTS_PHRASE);
  if (!note) return costs;

  const afterLabel = note.slice(note.indexOf(COSTS_PHRASE) + COSTS_PHRASE.length);
  const openParen = afterLabel.indexOf('(');
  const list = openParen === -1 ? afterLabel : afterLabel.slice(0, openParen);

  for (const item of list.split(/,(?=\s)/)) {
    const match = COST_ITEM_PATTERN.exec(item);
    if (match) costs.set(match[1], Number(match[2].replace(/,/g, '')));
  }
  return costs;
}

/**
 * The indicative monthly cost for a model: matches a short name where the model's name is
 * exactly the short name or ends with " " + short name ("Opus 5" matches "Claude Opus 5"
 * but not "Claude Opus 5.5"). Returns undefined when no short name matches.
 */
export function costFor(model: ModelEntry, costs: Map<string, number>): number | undefined {
  for (const [shortName, dollars] of costs) {
    if (model.name === shortName || model.name.endsWith(` ${shortName}`)) return dollars;
  }
  return undefined;
}

/** One leaderboard row: a model with a usage log, plus its indicative cost when priced. */
export interface UsageRow {
  model: ModelEntry;
  usage: ModelUsage;
  cost?: number;
}

/** Every model that has a "Zcode 30-day usage log" note, with its indicative cost. */
export function usageRows(models: ModelEntry[], harnesses: ModelEntry[]): UsageRow[] {
  const costs = estimatedCosts(harnesses);
  const rows: UsageRow[] = [];
  for (const model of models) {
    const usage = modelUsage(model);
    if (!usage) continue;
    const cost = costFor(model, costs);
    rows.push(cost === undefined ? { model, usage } : { model, usage, cost });
  }
  return rows;
}

export type UsageSort = 'tokens' | 'cost';

/**
 * Leaderboard order. "tokens": billed tokens descending. "cost": models with an indicative
 * cost first (cost descending), then the unpriced rest by billed tokens descending. Ties
 * keep the input order (stable sort).
 */
export function sortUsageRows(rows: UsageRow[], sort: UsageSort): UsageRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (sort === 'cost') {
      const aCost = a.cost ?? null;
      const bCost = b.cost ?? null;
      if (aCost !== null && bCost !== null) return bCost - aCost;
      if (aCost !== null) return -1;
      if (bCost !== null) return 1;
    }
    return b.usage.billedTokens - a.usage.billedTokens;
  });
  return sorted;
}
