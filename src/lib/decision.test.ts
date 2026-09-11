import { describe, expect, it } from 'vitest';
import type { ModelEntry, Recommendation } from '../data/types';
import {
  codingVerdictModels,
  isVoiceToTextProvider,
  recommendationMetaParts,
  recommendationModel,
  recommendationTasks,
  statusLegend,
  statusTone,
  voiceToTextModels,
} from './decision';

/** Minimal ModelEntry for grouping tests; only identity, provider and verdict matter. */
function model(id: string, provider: string, verdict?: ModelEntry['verdict']): ModelEntry {
  return {
    id,
    name: id,
    provider,
    providerId: provider.toLowerCase().replace(/\s+/g, '-'),
    aspects: [],
    coveredAspects: [],
    prosCount: 0,
    consCount: 0,
    verdict,
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

describe('isVoiceToTextProvider', () => {
  it('matches Speech-to-Text and ASR case-insensitively', () => {
    expect(isVoiceToTextProvider('NVIDIA (Speech-to-Text / ASR)')).toBe(true);
    expect(isVoiceToTextProvider('nvidia speech-to-text')).toBe(true);
    expect(isVoiceToTextProvider('CANARY ASR')).toBe(true);
  });

  it('rejects providers outside the voice-to-text group', () => {
    expect(isVoiceToTextProvider('Anthropic')).toBe(false);
    expect(isVoiceToTextProvider('Unknown Provider')).toBe(false);
    expect(isVoiceToTextProvider('')).toBe(false);
  });
});

describe('codingVerdictModels and voiceToTextModels', () => {
  const entries = [
    model('a', 'Anthropic', { status: 'avoid', date: '2026-09-03', summary: 'a' }),
    model('b', 'NVIDIA (Speech-to-Text / ASR)', { status: 'preferred', date: '2026-08-10', summary: 'b' }),
    model('c', 'Unknown Provider', { status: 'care', date: '2026-08-10', summary: 'c' }),
    model('d', 'OpenAI', { status: 'preferred', date: '2026-09-10', summary: 'd' }),
    model('e', 'OpenAI'),
  ];

  it('orders verdict models preferred, care, avoid and keeps source order within a status', () => {
    expect(codingVerdictModels(entries).map((entry) => entry.id)).toEqual(['d', 'c', 'a']);
  });

  it('excludes voice-to-text models and models without a verdict from the verdict list', () => {
    expect(codingVerdictModels(entries).map((entry) => entry.id)).not.toContain('b');
    expect(codingVerdictModels(entries).map((entry) => entry.id)).not.toContain('e');
  });

  it('keeps voice-to-text models, including ones without verdicts, in their own group', () => {
    expect(voiceToTextModels(entries).map((entry) => entry.id)).toEqual(['b']);
    const asrWithoutVerdict = [...entries, model('f', 'NVIDIA (Speech-to-Text / ASR)')];
    expect(voiceToTextModels(asrWithoutVerdict).map((entry) => entry.id)).toEqual(['b', 'f']);
  });

  it('returns an empty verdict list when nothing qualifies', () => {
    expect(codingVerdictModels([model('b', 'NVIDIA (Speech-to-Text / ASR)')])).toEqual([]);
  });
});

describe('recommendation helpers', () => {
  const recs = [
    recommendation({ task: 'Debugging', model: 'Sonnet' }),
    recommendation({ task: 'Implement from plan', model: 'Sonnet' }),
    recommendation({ task: 'Debugging', model: 'Duplicate ignored' }),
  ];

  it('lists unique tasks in source order', () => {
    expect(recommendationTasks(recs)).toEqual(['Debugging', 'Implement from plan']);
  });

  it('resolves a recommendation to the model with the exact same name', () => {
    const sonnet = model('sonnet', 'Anthropic');
    sonnet.name = 'Sonnet';
    const models = [sonnet, model('sonnet-4-8', 'Anthropic')];
    models[1].name = 'Sonnet 4.8';

    expect(recommendationModel(models, recs[0])?.id).toBe('sonnet');
    expect(recommendationModel(models, recommendation({ model: 'Missing' }))).toBeUndefined();
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

  it('builds the legend from VERDICT_STATUSES labels', () => {
    expect(statusLegend()).toEqual([
      { status: 'preferred', label: 'Preferred' },
      { status: 'care', label: 'Use with care' },
      { status: 'avoid', label: 'Avoid' },
    ]);
  });
});
