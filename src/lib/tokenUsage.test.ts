import { describe, expect, it } from 'vitest';
import reportCard from 'virtual:report-card';
import type { ModelEntry } from '../data/types';
import {
  costFor,
  estimatedCosts,
  formatTokens,
  modelUsage,
  parseTokenAmount,
  sortUsageRows,
  usageRows,
  zcodeTotals,
} from './tokenUsage';

const { models, harnesses } = reportCard;

function byName(name: string): ModelEntry {
  const entry = models.find((model) => model.name === name);
  if (!entry) throw new Error(`report card has no model named "${name}"`);
  return entry;
}

/** A hand-built entry whose Cost / efficiency notes are exactly the given strings. */
function entryWithNotes(name: string, pros: string[], cons: string[]): ModelEntry {
  const aspects: ModelEntry['aspects'] = [{ aspect: 'Cost / efficiency', pros, cons }];
  return {
    id: `fixture--${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    provider: 'Fixture Labs',
    providerId: 'fixture-labs',
    aspects,
    coveredAspects: pros.length > 0 || cons.length > 0 ? ['Cost / efficiency'] : [],
    prosCount: pros.length,
    consCount: cons.length,
  };
}

describe('parseTokenAmount', () => {
  it('parses K, M and B suffixes', () => {
    expect(parseTokenAmount('13K')).toBe(13_000);
    expect(parseTokenAmount('1.8M')).toBe(1_800_000);
    expect(parseTokenAmount('564M')).toBe(564_000_000);
    expect(parseTokenAmount('2.17B')).toBe(2_170_000_000);
  });

  it('tolerates whitespace and lowercase suffixes, and rejects other text', () => {
    expect(parseTokenAmount(' 564M ')).toBe(564_000_000);
    expect(parseTokenAmount('13k')).toBe(13_000);
    expect(parseTokenAmount('564')).toBeNaN();
    expect(parseTokenAmount('about 564M')).toBeNaN();
    expect(parseTokenAmount('')).toBeNaN();
  });
});

describe('formatTokens', () => {
  it('picks the magnitude suffix and keeps 3 significant digits', () => {
    expect(formatTokens(2_170_000_000)).toBe('2.17B');
    expect(formatTokens(564_000_000)).toBe('564M');
    expect(formatTokens(1_800_000)).toBe('1.8M');
    expect(formatTokens(13_000)).toBe('13K');
    expect(formatTokens(1_234_567)).toBe('1.23M');
    expect(formatTokens(2_100_000_000)).toBe('2.1B');
  });

  it('strips trailing zeros and leaves sub-thousand counts alone', () => {
    expect(formatTokens(1_000_000)).toBe('1M');
    expect(formatTokens(1_000)).toBe('1K');
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(0)).toBe('0');
  });
});

describe('modelUsage against the real report card', () => {
  it('extracts Claude Sonnet 5 (pros note)', () => {
    expect(modelUsage(byName('Claude Sonnet 5'))).toEqual({
      calls: 3023,
      billedTokens: 564_000_000,
      cacheReads: 548_000_000,
      date: '2026-10-01',
    });
  });

  it('extracts GPT 5.6 Luna (most-called model)', () => {
    expect(modelUsage(byName('GPT 5.6 Luna'))).toEqual({
      calls: 3978,
      billedTokens: 410_000_000,
      cacheReads: 382_000_000,
      date: '2026-10-01',
    });
  });

  it('extracts Claude Opus 4.8 from its cons note', () => {
    expect(modelUsage(byName('Claude Opus 4.8'))).toEqual({
      calls: 353,
      billedTokens: 116_000_000,
      cacheReads: 110_000_000,
      date: '2026-10-01',
    });
  });

  it('extracts DeepSeek V4 Flash without cache reads', () => {
    expect(modelUsage(byName('DeepSeek V4 Flash'))).toEqual({
      calls: 39,
      billedTokens: 3_800_000,
      cacheReads: null,
      date: '2026-10-01',
    });
  });

  it('extracts GLM 5.3 Flash and ignores the separate "~$33" burn note', () => {
    expect(modelUsage(byName('GLM 5.3 Flash'))).toEqual({
      calls: 1443,
      billedTokens: 176_000_000,
      cacheReads: 161_000_000,
      date: '2026-10-01',
    });
  });

  it('finds usage on exactly 14 models', () => {
    expect(models.filter((model) => modelUsage(model) !== null)).toHaveLength(14);
  });

  it('finds no usage on the ASR models', () => {
    const asrModels = models.filter((model) => model.provider.includes('ASR'));
    expect(asrModels.length).toBeGreaterThan(0);
    for (const model of asrModels) expect(modelUsage(model)).toBeNull();
  });

  it('finds no per-model usage on harnesses (the harness total is a different note)', () => {
    expect(harnesses.length).toBeGreaterThan(0);
    for (const harness of harnesses) expect(modelUsage(harness)).toBeNull();
  });
});

describe('modelUsage against hand-built fixtures', () => {
  it('prefers the "model calls" wording and reads B-sized billed tokens', () => {
    const usage = modelUsage(
      entryWithNotes('Fixture A', ['Zcode 30-day usage log: 1,000 model calls and 2.5B billed tokens'], []),
    );
    expect(usage).toEqual({ calls: 1000, billedTokens: 2_500_000_000, cacheReads: null, date: null });
  });

  it('ignores a decoy burn note in pros and reads the usage note in cons', () => {
    const usage = modelUsage(
      entryWithNotes(
        'Fixture B',
        [
          '(2026-10-01) the right lens is price per million tokens — the month’s 176M-token burn works out to only ~$33, the cheapest in the Zcode log',
        ],
        ['(2026-10-01) Zcode 30-day usage log: 1,443 calls, 176M billed tokens plus 161M cache reads'],
      ),
    );
    expect(usage).toEqual({
      calls: 1443,
      billedTokens: 176_000_000,
      cacheReads: 161_000_000,
      date: '2026-10-01',
    });
  });

  it('returns null when the note lacks billed tokens or calls', () => {
    expect(
      modelUsage(entryWithNotes('Fixture C', ['Zcode 30-day usage log: 100 calls and lots of fun'], [])),
    ).toBeNull();
    expect(
      modelUsage(
        entryWithNotes('Fixture D', ['Zcode 30-day usage log: 9.9B billed tokens, no calls counted'], []),
      ),
    ).toBeNull();
  });

  it('returns null for a model without any usage note', () => {
    expect(modelUsage(entryWithNotes('Fixture E', ['mind-blowingly cheap'], ['burns quota']))).toBeNull();
    expect(modelUsage(entryWithNotes('Fixture F', [], []))).toBeNull();
  });
});

describe('zcodeTotals against the real report card', () => {
  it('reads the Zcode harness total note', () => {
    expect(zcodeTotals(harnesses)).toEqual({
      calls: 15371,
      billedTokens: 2_170_000_000,
      cacheReads: 2_050_000_000,
      window: 'Sep 2–Oct 1',
    });
  });

  it('returns null without a totals note', () => {
    expect(zcodeTotals([])).toBeNull();
    expect(zcodeTotals([entryWithNotes('Not A Harness', [], [])])).toBeNull();
  });
});

describe('zcodeTotals against hand-built fixtures', () => {
  const harness = entryWithNotes(
    'Fixture Zcode',
    [
      '(2026-10-01) 30-day usage log (Sep 2–Oct 1, read from the db): 500 model calls and 1.2B billed tokens, with 1B additional tokens served as cache reads',
      'priced at list rates the month’s burn ranks: Sonnet 5 ~$1,295, Opus 5 ~$193 (indicative only — plans differ)',
    ],
    [],
  );

  it('reads totals from a hand-built harness note, ignoring the date parentheses', () => {
    expect(zcodeTotals([harness])).toEqual({
      calls: 500,
      billedTokens: 1_200_000_000,
      cacheReads: 1_000_000_000,
      window: 'Sep 2–Oct 1',
    });
  });

  it('keeps thousands separators intact while splitting the burn ranks', () => {
    const costs = estimatedCosts([harness]);
    expect(costs.size).toBe(2);
    expect(costs.get('Sonnet 5')).toBe(1295);
    expect(costs.get('Opus 5')).toBe(193);
  });
});

describe('estimatedCosts / costFor against the real report card', () => {
  const costs = estimatedCosts(harnesses);

  it('parses the eight burn-rank short names', () => {
    expect(costs.size).toBe(8);
    expect(costs.get('Sonnet 5')).toBe(1295);
    expect(costs.get('GPT 5.6 Sol')).toBe(954);
    expect(costs.get('Opus 4.8')).toBe(684);
    expect(costs.get('Opus 4.6')).toBe(668);
    expect(costs.get('Opus 5')).toBe(193);
    expect(costs.get('GPT 5.6 Luna')).toBe(96);
    expect(costs.get('GLM 5.3 Flash')).toBe(33);
    expect(costs.get('GPT 5.6 Tera')).toBe(30);
  });

  it('matches short names onto full model names without suffix collisions', () => {
    expect(costFor(byName('Claude Sonnet 5'), costs)).toBe(1295);
    expect(costFor(byName('Claude Opus 5'), costs)).toBe(193);
    expect(costFor(byName('Claude Opus 5.5'), costs)).toBeUndefined();
    expect(costFor(byName('GLM 5.3 Flash'), costs)).toBe(33);
    expect(costFor(byName('GPT 6.1 Sol'), costs)).toBeUndefined();
    expect(costFor(byName('GPT 6 Luna'), costs)).toBeUndefined();
  });
});

describe('usageRows against the real report card', () => {
  const rows = usageRows(models, harnesses);

  it('has one row per logged model with costs attached where priced', () => {
    expect(rows).toHaveLength(14);
    for (const row of rows) expect(row.usage).toEqual(modelUsage(row.model));
    const sonnet = rows.find((row) => row.model.name === 'Claude Sonnet 5');
    expect(sonnet?.cost).toBe(1295);
    const opus55 = rows.find((row) => row.model.name === 'Claude Opus 5.5');
    expect(opus55).toBeDefined();
    expect(opus55?.cost).toBeUndefined();
  });

  it('sorts by billed tokens descending', () => {
    const tokensOrder = sortUsageRows(rows, 'tokens');
    const billed = tokensOrder.map((row) => row.usage.billedTokens);
    expect([...billed].sort((a, b) => b - a)).toEqual(billed);
    expect(tokensOrder[0].model.name).toBe('Claude Sonnet 5');
  });

  it('sorts priced models first by cost descending, then the rest by tokens', () => {
    const costOrder = sortUsageRows(rows, 'cost');
    const priced = costOrder.filter((row) => row.cost !== undefined);
    const unpriced = costOrder.filter((row) => row.cost === undefined);
    expect(costOrder).toEqual([...priced, ...unpriced]);
    expect(priced).toHaveLength(8);
    const costsInOrder = priced.map((row) => row.cost!);
    expect([...costsInOrder].sort((a, b) => b - a)).toEqual(costsInOrder);
    expect(costOrder[0].cost).toBe(1295);
    const unpricedBilled = unpriced.map((row) => row.usage.billedTokens);
    expect([...unpricedBilled].sort((a, b) => b - a)).toEqual(unpricedBilled);
  });
});
