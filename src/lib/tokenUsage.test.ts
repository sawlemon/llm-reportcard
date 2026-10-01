import { describe, expect, it } from 'vitest';
import reportCard from 'virtual:report-card';
import type { ModelEntry } from '../data/types';
import {
  PRICES,
  USAGE,
  chipTier,
  costOf,
  formatCost,
  formatTokens,
  modelUsage,
  shortDate,
  sortUsageRows,
  usageRows,
  usageTotals,
  type PriceFile,
  type UsageCounts,
  type UsageFile,
} from './tokenUsage';

function counts(partial: Partial<UsageCounts>): UsageCounts {
  return { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, ...partial };
}

function entry(name: string): ModelEntry {
  return {
    id: `fixture--${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    provider: 'Fixture Labs',
    providerId: 'fixture-labs',
    aspects: [],
    coveredAspects: [],
    prosCount: 0,
    consCount: 0,
  };
}

const prices: PriceFile = {
  synced: '2026-10-01',
  models: {
    'Big Model': {
      litellm: 'big',
      zcodeIds: ['big-model', 'Big-Model-Alt'],
      input: 2,
      output: 10,
      cacheRead: 0.2,
      cacheWrite: 2.5,
    },
    'Cheap Model': {
      litellm: 'cheap',
      zcodeIds: ['cheap'],
      input: 0.1,
      output: 0.5,
      cacheRead: null,
      cacheWrite: null,
    },
    'Idle Model': { litellm: 'idle', zcodeIds: ['idle'], input: 1, output: 1, cacheRead: 0.1, cacheWrite: 1 },
  },
};

const usage: UsageFile = {
  days: 30,
  from: '2026-09-01',
  to: '2026-10-01',
  models: {
    'big-model': counts({
      input: 1_000_000,
      output: 100_000,
      cacheRead: 800_000,
      cacheWrite: 100_000,
    }),
    'big-model-alt': counts({ input: 1_000_000, output: 0 }),
    cheap: counts({ input: 2_000_000, output: 1_000_000, cacheRead: 1_000_000 }),
    'mystery-model': counts({ input: 4_000_000, output: 0 }),
  },
};

describe('formatting', () => {
  it('formats token counts to at most three significant digits', () => {
    expect(formatTokens(2_170_000_000)).toBe('2.17B');
    expect(formatTokens(564_000_000)).toBe('564M');
    expect(formatTokens(1_800_000)).toBe('1.8M');
    expect(formatTokens(13_000)).toBe('13K');
    expect(formatTokens(512)).toBe('512');
  });

  it('formats costs: whole dollars from $100, cents below', () => {
    expect(formatCost(1295.4)).toBe('$1,295');
    expect(formatCost(95.82)).toBe('$96');
    expect(formatCost(8.144)).toBe('$8.14');
    expect(formatCost(0.27)).toBe('$0.27');
  });

  it('colours chips by casino denomination', () => {
    expect([0.4, 5, 24.9, 25, 100, 499, 500].map(chipTier)).toEqual([
      'white',
      'red',
      'red',
      'green',
      'black',
      'black',
      'purple',
    ]);
  });

  it('formats ISO days as short month dates', () => {
    expect(shortDate('2026-09-01')).toBe('Sep 1');
  });
});

describe('costOf', () => {
  it('charges uncached input, cache reads, cache writes and output at their own rates', () => {
    const cost = costOf(usage.models['big-model'], prices.models['Big Model']);
    // 100K uncached × $2 + 800K read × $0.2 + 100K write × $2.5 + 100K out × $10, per 1M
    expect(cost).toBeCloseTo(0.2 + 0.16 + 0.25 + 1, 10);
  });

  it('falls back to the input price when a cache price is null', () => {
    expect(costOf(usage.models.cheap, prices.models['Cheap Model'])).toBeCloseTo(0.2 + 0.5, 10);
  });

  it('is null without a price or without input/output prices', () => {
    expect(costOf(usage.models.cheap, undefined)).toBeNull();
    expect(costOf(usage.models.cheap, { ...prices.models['Cheap Model'], output: null })).toBeNull();
  });
});

describe('modelUsage', () => {
  it('sums every Zcode id an entry claims, case-insensitively', () => {
    const found = modelUsage(entry('Big Model'), prices, usage)!;
    expect(found.billedTokens).toBe(2_100_000);
    expect(found.cacheReads).toBe(800_000);
    expect(found.cost).toBeCloseTo(1.61 + 2, 10);
  });

  it('is null for a priced model with no logged usage, and for an unpriced name', () => {
    expect(modelUsage(entry('Idle Model'), prices, usage)).toBeNull();
    expect(modelUsage(entry('Nobody'), prices, usage)).toBeNull();
  });
});

describe('usageRows, totals and sorting', () => {
  const rows = usageRows([entry('Big Model')], prices, usage);

  it('lists priced models with usage, then unclaimed Zcode ids under their raw id', () => {
    expect(rows.map((row) => row.name)).toEqual(['Big Model', 'Cheap Model', 'mystery-model']);
    expect(rows[0].model?.name).toBe('Big Model');
    expect(rows[1].model).toBeUndefined();
    expect(rows[2].usage.cost).toBeNull();
  });

  it('totals tokens and priced cost over the window', () => {
    const totals = usageTotals(rows, usage);
    expect(totals.billedTokens).toBe(2_100_000 + 3_000_000 + 4_000_000);
    expect(totals.cost).toBeCloseTo(3.61 + 0.7, 10);
    expect([totals.from, totals.to]).toEqual(['2026-09-01', '2026-10-01']);
  });

  it('sorts by tokens, or by cost with unpriced rows last', () => {
    expect(sortUsageRows(rows, 'tokens').map((row) => row.name)).toEqual([
      'mystery-model',
      'Cheap Model',
      'Big Model',
    ]);
    expect(sortUsageRows(rows, 'cost').map((row) => row.name)).toEqual([
      'Big Model',
      'Cheap Model',
      'mystery-model',
    ]);
  });
});

describe('the committed data files', () => {
  it('never store call counts', () => {
    for (const counts of Object.values(USAGE.models)) expect(counts).not.toHaveProperty('calls');
  });

  it('price every model in the usage export', () => {
    const claimed = new Set(
      Object.values(PRICES.models).flatMap((price) => price.zcodeIds.map((id) => id.toLowerCase())),
    );
    expect(Object.keys(USAGE.models).filter((id) => !claimed.has(id.toLowerCase()))).toEqual([]);
  });

  it('give report-card models with usage a cost', () => {
    const withUsage = reportCard.models.flatMap((model) => modelUsage(model) ?? []);
    expect(withUsage.length).toBeGreaterThan(0);
    for (const found of withUsage) expect(found.cost).not.toBeNull();
  });

  it('use the cache-read rate, which keeps Sonnet 5 far below the old full-price estimate', () => {
    const sonnet = reportCard.models.find((model) => model.name === 'Claude Sonnet 5')!;
    const found = modelUsage(sonnet)!;
    expect(found.cost!).toBeLessThan(found.billedTokens * 2e-6);
  });
});
