import { describe, expect, it } from 'vitest';
import type { ModelEntry, Recommendation, TaskVerdict } from '../data/types';
import {
  modelByName,
  recommendationMetaParts,
  recommendationModel,
  recommendationTasks,
  statusTone,
  taskVerdictLegend,
  taskVerdictRows,
} from './decision';

/** Minimal ModelEntry for resolution tests; only identity and provider matter. */
function model(id: string, provider: string, name = id): ModelEntry {
  return {
    id,
    name,
    provider,
    providerId: provider.toLowerCase().replace(/\s+/g, '-'),
    aspects: [],
    coveredAspects: [],
    prosCount: 0,
    consCount: 0,
  };
}

function recommendation(overrides: Partial<Recommendation>): Recommendation {
  return {
    task: 'Task',
    model: 'A',
    harness: 'Zcode',
    effort: 'medium',
    role: 'implementer',
    cautions: '',
    ...overrides,
  };
}

function verdict(overrides: Partial<TaskVerdict>): TaskVerdict {
  return {
    task: 'Debugging',
    model: 'A',
    status: 'preferred',
    date: '2026-09-03',
    summary: 'summary',
    ...overrides,
  };
}

describe('model resolution', () => {
  const entries = [
    model('sonnet', 'Anthropic', 'Sonnet'),
    model('mini', 'Anthropic', 'Mini'),
    model('echo', 'Globex', 'Sonnet'),
  ];

  it('resolves a name to the model with the exact same name', () => {
    expect(modelByName(entries, 'Mini')?.id).toBe('mini');
    expect(modelByName(entries, 'Missing')).toBeUndefined();
  });

  it('resolves nothing when the name exists under multiple providers, picking neither', () => {
    // 'Sonnet' names both models; the helper must not silently choose the first.
    expect(modelByName(entries, 'Sonnet')).toBeUndefined();
    expect(recommendationModel(entries, recommendation({ model: 'Sonnet' }))).toBeUndefined();
  });

  it('resolves a recommendation through its model name', () => {
    expect(recommendationModel(entries, recommendation({ model: 'Mini' }))?.id).toBe('mini');
    expect(recommendationModel(entries, recommendation({ model: 'Missing' }))).toBeUndefined();
  });
});

describe('recommendationTasks', () => {
  it('lists unique tasks in source order', () => {
    const recs = [
      recommendation({ task: 'Debugging' }),
      recommendation({ task: 'Implement from plan' }),
      recommendation({ task: 'Debugging' }),
    ];
    expect(recommendationTasks(recs)).toEqual(['Debugging', 'Implement from plan']);
  });
});

describe('taskVerdictRows', () => {
  const entries = [model('a', 'Anthropic', 'Acme'), model('b', 'OpenAI', 'Bolt'), model('c', 'Zeta', 'Calm')];
  const verdicts = [
    verdict({ task: 'Debugging', model: 'Bolt', status: 'care' }),
    verdict({ task: 'Debugging', model: 'Acme', status: 'preferred' }),
    verdict({ task: 'Debugging', model: 'Calm', status: 'preferred' }),
    verdict({ task: 'Planning', model: 'Acme', status: 'care' }),
  ];

  it('returns only the rows of the selected task, resolved to their models', () => {
    const rows = taskVerdictRows(entries, verdicts, 'Debugging');
    expect(rows.map((row) => row.model.id)).toEqual(['a', 'c', 'b']);
    expect(rows.map((row) => row.verdict.summary)).toEqual(['summary', 'summary', 'summary']);
    for (const row of rows) expect(row.verdict.task).toBe('Debugging');
  });

  it('orders preferred before care, preserving source order within a status', () => {
    // Source order has the care row first; the list must still lead with the preferred rows.
    expect(taskVerdictRows(entries, verdicts, 'Debugging').map((row) => row.model.id)).toEqual([
      'a',
      'c',
      'b',
    ]);
    const allCare = [
      verdict({ task: 'Debugging', model: 'Calm', status: 'care' }),
      verdict({ task: 'Debugging', model: 'Bolt', status: 'care' }),
    ];
    expect(taskVerdictRows(entries, allCare, 'Debugging').map((row) => row.model.id)).toEqual(['c', 'b']);
  });

  it('returns an empty list for a task with no recorded rows — never a fallback', () => {
    expect(taskVerdictRows(entries, verdicts, 'Research')).toEqual([]);
    expect(taskVerdictRows(entries, [], 'Debugging')).toEqual([]);
  });

  it('drops rows whose model name resolves to no entry', () => {
    const stale = [...verdicts, verdict({ task: 'Debugging', model: 'Ghost', status: 'care' })];
    expect(taskVerdictRows(entries, stale, 'Debugging')).toHaveLength(3);
  });

  it('drops rows whose model name is ambiguous across providers instead of picking one', () => {
    const twins = [model('a1', 'Acme', 'Bolt'), model('a2', 'Globex', 'Bolt'), model('c', 'Zeta', 'Calm')];
    // 'Bolt' names both twins; only the unambiguous row survives.
    expect(taskVerdictRows(twins, verdicts, 'Debugging').map((row) => row.model.id)).toEqual(['c']);
  });
});

describe('taskVerdictLegend', () => {
  const entries = [model('a', 'Anthropic')];

  it('shows only the statuses present, in display order', () => {
    const rows = taskVerdictRows(
      entries,
      [verdict({ model: 'a', status: 'care' }), verdict({ model: 'a', status: 'preferred' })],
      'Debugging',
    );
    expect(taskVerdictLegend(rows)).toEqual([
      { status: 'preferred', label: 'Preferred' },
      { status: 'care', label: 'Use with care' },
    ]);
  });

  it('shows a single status when only one is present, and nothing for an empty list', () => {
    const preferredOnly = taskVerdictRows(
      entries,
      [verdict({ model: 'a', status: 'preferred' })],
      'Debugging',
    );
    expect(taskVerdictLegend(preferredOnly)).toEqual([{ status: 'preferred', label: 'Preferred' }]);
    expect(taskVerdictLegend([])).toEqual([]);
  });
});

describe('recommendationMetaParts', () => {
  it('keeps every non-blank field as a "Label: value" part in display order', () => {
    expect(recommendationMetaParts(recommendation({}))).toEqual([
      'Harness: Zcode',
      'Effort: medium',
      'Role: implementer',
    ]);
  });

  it('skips empty and whitespace-only fields', () => {
    expect(recommendationMetaParts(recommendation({ harness: '', effort: '  ', role: 'author' }))).toEqual([
      'Role: author',
    ]);
  });

  it('returns no parts when harness, effort and role are all blank', () => {
    expect(recommendationMetaParts(recommendation({ harness: '', effort: '', role: '' }))).toEqual([]);
  });
});

describe('status presentation', () => {
  it('maps each verdict status to its color tone', () => {
    expect(statusTone('preferred')).toBe('pro');
    expect(statusTone('care')).toBe('warn');
    expect(statusTone('avoid')).toBe('con');
  });
});
