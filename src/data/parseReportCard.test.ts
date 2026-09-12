import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseReportCard, splitNotes, slugify } from './parseReportCard';
import { CANONICAL_ASPECTS, HARNESS_ASPECTS, ReportCardParseError } from './types';
import { fixtureCard, fixtureModel } from './__fixtures__/fixtureCard';

const realSource = readFileSync(resolve(__dirname, '../../LLM_REPORT_CARD.md'), 'utf8');

/**
 * Grammar and behaviour are pinned against the fixture, which never changes underneath these
 * assertions, so they can be exact.
 */
describe('parseReportCard on the fixture document', () => {
  const card = fixtureCard;

  it('reads the document title', () => {
    expect(card.title).toBe('Fixture Report Card');
  });

  it('ignores the fenced authoring template', () => {
    expect(card.providers.map((provider) => provider.name)).not.toContain('Provider');
    expect(card.models.map((model) => model.name)).not.toContain('Model name (exact id if known)');
    const everyNote = card.models.flatMap((model) =>
      model.aspects.flatMap((entry) => [...entry.pros, ...entry.cons]),
    );
    expect(everyNote.join(' ')).not.toContain('must never be parsed');
  });

  it('extracts every provider in source order', () => {
    expect(card.providers.map((provider) => provider.name)).toEqual([
      'Acme Labs',
      'Globex (Speech-to-Text / ASR)',
    ]);
  });

  it('groups models under the provider heading above them', () => {
    expect(card.providers.map((provider) => provider.models.map((model) => model.name))).toEqual([
      ['Acme Prime 2', 'Acme Mini'],
      ['Globex Echo 0.6B'],
    ]);
  });

  it('flattens every model in source order and back-links it to its provider', () => {
    expect(card.models.map((model) => model.name)).toEqual(['Acme Prime 2', 'Acme Mini', 'Globex Echo 0.6B']);
    for (const model of card.models) {
      const provider = card.providers.find((entry) => entry.id === model.providerId);
      expect(provider?.name).toBe(model.provider);
      expect(provider?.models).toContain(model);
    }
  });

  it('generates unique, url-safe, provider-scoped model ids', () => {
    expect(card.models.map((model) => model.id)).toEqual([
      'acme-labs--acme-prime-2',
      'acme-labs--acme-mini',
      'globex-speech-to-text-asr--globex-echo-0-6b',
    ]);
  });

  it('collects the union of aspects used, in canonical order', () => {
    expect(card.aspects).toEqual([...CANONICAL_ASPECTS]);
  });

  it('keeps a model rows in source order, even when it lists only some aspects', () => {
    expect(fixtureModel('Globex Echo 0.6B').aspects.map((entry) => entry.aspect)).toEqual([
      'Context handling',
      'Speed / latency',
      'Formatting / output quality',
      'Other',
    ]);
  });

  it('splits a cell into separate notes on semicolons', () => {
    const reasoning = fixtureModel('Acme Prime 2').aspects.find((entry) => entry.aspect === 'Reasoning');
    expect(reasoning?.pros).toEqual(['plans multi-step tasks well', 'states its assumptions up front']);
    expect(reasoning?.cons).toEqual(['loses the thread past ten steps']);
  });

  it('keeps a semicolon nested in parentheses inside one note', () => {
    const tools = fixtureModel('Acme Prime 2').aspects.find((entry) => entry.aspect === 'Tool use / agentic');
    expect(tools?.pros).toEqual(['picks the right tool first try (even when two tools overlap; no retries)']);
  });

  it('unescapes pipes and preserves inline backticks verbatim', () => {
    const rows = fixtureModel('Acme Prime 2').aspects;
    expect(rows.find((entry) => entry.aspect === 'Formatting / output quality')?.pros).toEqual([
      'renders `a | b` inside a table cell correctly',
    ]);
    expect(rows.find((entry) => entry.aspect === 'Coding')?.pros).toEqual([
      'patches `parseReportCard.ts` without breaking callers',
    ]);
  });

  it('leaves empty cells as empty arrays', () => {
    const context = fixtureModel('Acme Prime 2').aspects.find((entry) => entry.aspect === 'Context handling');
    expect(context).toEqual({ aspect: 'Context handling', pros: [], cons: [] });
  });

  it('records covered aspects and pro/con tallies', () => {
    const model = fixtureModel('Acme Prime 2');
    expect(model.coveredAspects).toEqual([
      'Reasoning',
      'Coding',
      'Instruction-following',
      'Tool use / agentic',
      'Speed / latency',
      'Cost / efficiency',
      'Formatting / output quality',
      'Other',
    ]);
    expect(model.prosCount).toBe(7);
    expect(model.consCount).toBe(5);
  });

  it('keeps a model whose every cell is empty, with nothing covered', () => {
    const model = fixtureModel('Acme Mini');
    expect(model.aspects).toHaveLength(CANONICAL_ASPECTS.length);
    expect(model.coveredAspects).toEqual([]);
    expect(model.prosCount).toBe(0);
    expect(model.consCount).toBe(0);
  });

  it('collects harnesses separately from models, out of the provider list', () => {
    expect(card.harnesses.map((harness) => harness.name)).toEqual(['Fixture Harness']);
    expect(card.models.map((model) => model.name)).not.toContain('Fixture Harness');
    expect(card.providers.map((provider) => provider.name)).not.toContain('LLM Harness');
  });

  it('gives harnesses their own aspect vocabulary and provider-scoped ids', () => {
    const harness = card.harnesses[0];
    expect(harness.id).toBe('harness--fixture-harness');
    expect(harness.provider).toBe('LLM Harness');
    expect(harness.aspects.map((entry) => entry.aspect)).toEqual([...HARNESS_ASPECTS]);
    expect(card.harnessAspects).toEqual([...HARNESS_ASPECTS]);
    expect(harness.prosCount).toBe(6);
    expect(harness.consCount).toBe(2);
  });

  it('collects task verdict rows in source order', () => {
    expect(card.taskVerdicts).toEqual([
      {
        task: 'Refactoring',
        model: 'Acme Prime 2',
        status: 'preferred',
        date: '2026-09-01',
        summary: 'Patches code without breaking callers',
      },
      {
        task: 'Refactoring',
        model: 'Acme Mini',
        status: 'preferred',
        date: '2026-08-30',
        summary: 'Quick on small, well-specified refactors',
      },
      {
        task: 'Refactoring',
        model: 'Globex Echo 0.6B',
        status: 'care',
        date: '2026-09-02',
        summary: 'Handled one scripted refactor end to end, but slowly',
      },
      {
        task: 'Deep search',
        model: 'Acme Prime 2',
        status: 'care',
        date: '2026-09-03',
        summary: 'Loses the thread past ten steps',
      },
    ]);
  });

  it('collects recommendation rows, including tasks with no task verdicts', () => {
    expect(card.recommendations.map((recommendation) => recommendation.task)).toEqual([
      'Refactoring',
      'Deep search',
      'Documentation',
    ]);
    const verdictTasks = new Set(card.taskVerdicts.map((verdict) => verdict.task));
    expect(verdictTasks.has('Documentation')).toBe(false);
  });
});

/**
 * The real document is content, not code: the owner edits it almost daily. Only invariants that
 * hold for *any* valid card belong here — no counts, no names, no note text — so a content edit
 * can never fail the test suite. Schema violations are caught by the validator
 * (`npm run validate -w report-card`) and by the build, which both parse the real file.
 */
describe('the real report card', () => {
  it('parses and satisfies the invariants every valid card must hold', () => {
    expect(() => parseReportCard(realSource)).not.toThrow();
    const card = parseReportCard(realSource);

    expect(card.providers.length).toBeGreaterThan(0);
    expect(card.models.length).toBeGreaterThan(0);

    const ids = card.models.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);

    for (const model of card.models) {
      const provider = card.providers.find((entry) => entry.id === model.providerId);
      expect(provider?.name).toBe(model.provider);
      expect(provider?.models).toContain(model);
    }

    const grouped = card.providers.reduce((total, provider) => total + provider.models.length, 0);
    expect(card.models).toHaveLength(grouped);

    for (const aspect of card.aspects) expect(CANONICAL_ASPECTS).toContain(aspect);

    const modelNames = new Set(card.models.map((m) => m.name));
    for (const recommendation of card.recommendations) {
      expect(modelNames.has(recommendation.model)).toBe(true);
    }

    const tasks = new Set(card.recommendations.map((recommendation) => recommendation.task));
    for (const verdict of card.taskVerdicts) {
      expect(tasks.has(verdict.task)).toBe(true);
      expect(modelNames.has(verdict.model)).toBe(true);
    }
  });
});

describe('parseReportCard validation', () => {
  const table = ['| Aspect | Pros | Cons |', '|---|---|---|', '| Reasoning | fast | |'].join('\n');

  it('accepts a minimal well-formed document', () => {
    const card = parseReportCard(`# Card\n\n## Acme\n\n### Model X\n\n${table}\n`);
    expect(card.models[0]).toMatchObject({
      name: 'Model X',
      provider: 'Acme',
      prosCount: 1,
      consCount: 0,
    });
  });

  it('rejects a model heading without a provider', () => {
    expect(() => parseReportCard(`# Card\n\n### Model X\n\n${table}\n`)).toThrow(
      /LLM_REPORT_CARD\.md:3:.*before any provider heading/,
    );
  });

  it('rejects a model without a table', () => {
    expect(() => parseReportCard('# Card\n\n## Acme\n\n### Model X\n\nsome prose\n')).toThrow(
      /model "Model X" has no aspect table/,
    );
  });

  it('rejects unexpected table columns', () => {
    const wrong = ['| Aspect | Notes |', '|---|---|', '| Reasoning | fast |'].join('\n');
    expect(() => parseReportCard(`# Card\n\n## Acme\n\n### Model X\n\n${wrong}\n`)).toThrow(
      /expected \[Aspect, Pros, Cons\]/,
    );
  });

  it('rejects a row with the wrong number of columns', () => {
    const ragged = ['| Aspect | Pros | Cons |', '|---|---|---|', '| Reasoning | fast |'].join('\n');
    expect(() => parseReportCard(`# Card\n\n## Acme\n\n### Model X\n\n${ragged}\n`)).toThrow(
      /has a row with 2 column\(s\)/,
    );
  });

  it('rejects a row with an empty aspect', () => {
    const blank = ['| Aspect | Pros | Cons |', '|---|---|---|', '|  | fast | |'].join('\n');
    expect(() => parseReportCard(`# Card\n\n## Acme\n\n### Model X\n\n${blank}\n`)).toThrow(/empty Aspect/);
  });

  it('rejects an aspect that is not canonical, suggesting the near miss', () => {
    const typo = ['| Aspect | Pros | Cons |', '|---|---|---|', '| Tool use/agentic | fast | |'].join('\n');
    try {
      parseReportCard(`# Card\n\n## Acme\n\n### Model X\n\n${typo}\n`);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ReportCardParseError);
      const parseError = error as ReportCardParseError;
      expect(parseError.message).toContain('unknown aspect "Tool use/agentic"');
      expect(parseError.message).toContain('did you mean "Tool use / agentic"?');
      // The offending row, not the model heading two lines above it.
      expect(parseError.line).toBe(9);
      expect(parseError.message).toContain('LLM_REPORT_CARD.md:9:');
    }
  });

  it('rejects an aspect resembling nothing canonical, listing the allowed names', () => {
    const invented = ['| Aspect | Pros | Cons |', '|---|---|---|', '| Vibes | good | |'].join('\n');
    expect(() => parseReportCard(`# Card\n\n## Acme\n\n### Model X\n\n${invented}\n`)).toThrow(
      `model "Model X" has unknown aspect "Vibes"; expected one of [${CANONICAL_ASPECTS.join(', ')}]`,
    );
  });

  it('accepts a harness table using the harness aspect vocabulary', () => {
    const harnessTable = ['| Aspect | Pros | Cons |', '|---|---|---|', '| UI / UX | clean | |'].join('\n');
    const card = parseReportCard(
      `# Card\n\n## Acme\n\n### Model X\n\n${table}\n\n## LLM Harness\n\n### Tool Y\n\n${harnessTable}\n`,
    );
    expect(card.harnesses.map((h) => h.name)).toEqual(['Tool Y']);
    expect(card.harnesses[0].aspects[0].aspect).toBe('UI / UX');
  });

  it('rejects a model aspect inside a harness table', () => {
    const harnessTable = ['| Aspect | Pros | Cons |', '|---|---|---|', '| Reasoning | good | |'].join('\n');
    expect(() =>
      parseReportCard(
        `# Card\n\n## Acme\n\n### Model X\n\n${table}\n\n## LLM Harness\n\n### Tool Y\n\n${harnessTable}\n`,
      ),
    ).toThrow(new RegExp(`unknown aspect "Reasoning"; expected one of \\[${HARNESS_ASPECTS.join(', ')}\\]`));
  });

  it('rejects a harness aspect inside a model table', () => {
    const wrong = ['| Aspect | Pros | Cons |', '|---|---|---|', '| UI / UX | clean | |'].join('\n');
    expect(() => parseReportCard(`# Card\n\n## Acme\n\n### Model X\n\n${wrong}\n`)).toThrow(
      /unknown aspect "UI \/ UX"/,
    );
  });

  it('rejects duplicate harnesses', () => {
    const harnessTable = ['| Aspect | Pros | Cons |', '|---|---|---|', '| UI / UX | clean | |'].join('\n');
    const doc = `# Card\n\n## Acme\n\n### Model X\n\n${table}\n\n## LLM Harness\n\n### Tool Y\n\n${harnessTable}\n\n### Tool Y\n\n${harnessTable}\n`;
    expect(() => parseReportCard(doc)).toThrow(/duplicate harness "Tool Y"/);
  });

  it('returns card aspects in canonical order while model rows keep source order', () => {
    const scrambled = [
      '| Aspect | Pros | Cons |',
      '|---|---|---|',
      '| Other | last in canon | |',
      '| Coding | middle in canon | |',
      '| Reasoning | first in canon | |',
    ].join('\n');
    const card = parseReportCard(`# Card\n\n## Acme\n\n### Model X\n\n${scrambled}\n`);

    expect(card.aspects).toEqual(['Reasoning', 'Coding', 'Other']);
    expect(card.models[0].aspects.map((entry) => entry.aspect)).toEqual(['Other', 'Coding', 'Reasoning']);
  });

  it('rejects a table before any model heading', () => {
    expect(() => parseReportCard(`# Card\n\n## Acme\n\n${table}\n`)).toThrow(/outside of a model section/);
  });

  it('rejects duplicate models under one provider', () => {
    const doc = `# Card\n\n## Acme\n\n### Model X\n\n${table}\n\n### Model X\n\n${table}\n`;
    expect(() => parseReportCard(doc)).toThrow(/duplicate model "Model X"/);
  });

  it('rejects a document with no models', () => {
    expect(() => parseReportCard('# Card\n\nJust prose.\n')).toThrow(/no models found/);
  });

  it('reports errors as ReportCardParseError with a line number', () => {
    try {
      parseReportCard(`# Card\n\n### Model X\n\n${table}\n`);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ReportCardParseError);
      expect((error as ReportCardParseError).line).toBe(3);
    }
  });
});

describe('parseReportCard verdict and recommendations', () => {
  const table = ['| Aspect | Pros | Cons |', '|---|---|---|', '| Reasoning | fast | |'].join('\n');

  it('parses a well-formed Verdict line into the model', () => {
    const doc = `# Card\n\n## Acme\n\n### Model X\n\n**Verdict:** preferred · 2026-09-03 · does great work\n\n${table}\n`;
    const card = parseReportCard(doc);
    expect(card.models[0].verdict).toEqual({
      status: 'preferred',
      date: '2026-09-03',
      summary: 'does great work',
    });
  });

  it('leaves verdict undefined when no Verdict line is present', () => {
    const card = parseReportCard(`# Card\n\n## Acme\n\n### Model X\n\n${table}\n`);
    expect(card.models[0].verdict).toBeUndefined();
  });

  it('rejects a verdict status outside the enum', () => {
    const doc = `# Card\n\n## Acme\n\n### Model X\n\n**Verdict:** great · 2026-09-03 · does great work\n\n${table}\n`;
    expect(() => parseReportCard(doc)).toThrow(
      /verdict status "great"; expected one of \[preferred, care, avoid\]/,
    );
  });

  it('rejects a verdict date that is not a valid calendar date', () => {
    const doc = `# Card\n\n## Acme\n\n### Model X\n\n**Verdict:** preferred · 2026-13-40 · does great work\n\n${table}\n`;
    expect(() => parseReportCard(doc)).toThrow(/verdict date "2026-13-40"/);
  });

  it('rejects a Verdict line missing a field separator', () => {
    const doc = `# Card\n\n## Acme\n\n### Model X\n\n**Verdict:** preferred 2026-09-03 does great work\n\n${table}\n`;
    expect(() => parseReportCard(doc)).toThrow(/malformed Verdict line/);
  });

  it('parses the reserved Recommendations table at the end of the document', () => {
    const recTable = [
      '| Task | Model | Harness | Effort | Role | Cautions |',
      '|---|---|---|---|---|---|',
      '| Debugging | Model X | Zcode | medium | implementer | be careful |',
    ].join('\n');
    const doc = `# Card\n\n## Acme\n\n### Model X\n\n${table}\n\n---\n\n## Recommendations\n\n${recTable}\n`;
    const card = parseReportCard(doc);
    expect(card.recommendations).toEqual([
      {
        task: 'Debugging',
        model: 'Model X',
        harness: 'Zcode',
        effort: 'medium',
        role: 'implementer',
        cautions: 'be careful',
      },
    ]);
    expect(card.providers.map((p) => p.name)).not.toContain('Recommendations');
  });

  it('rejects a recommendation that references a model not in the card', () => {
    const recTable = [
      '| Task | Model | Harness | Effort | Role | Cautions |',
      '|---|---|---|---|---|---|',
      '| Debugging | Nonexistent Model | Zcode | medium | implementer | |',
    ].join('\n');
    const doc = `# Card\n\n## Acme\n\n### Model X\n\n${table}\n\n---\n\n## Recommendations\n\n${recTable}\n`;
    expect(() => parseReportCard(doc)).toThrow(/recommendation references unknown model: Nonexistent Model/);
  });

  it('rejects a Recommendations table with the wrong columns', () => {
    const wrong = ['| Task | Model |', '|---|---|', '| Debugging | Model X |'].join('\n');
    const doc = `# Card\n\n## Acme\n\n### Model X\n\n${table}\n\n---\n\n## Recommendations\n\n${wrong}\n`;
    expect(() => parseReportCard(doc)).toThrow(/expected \[Task, Model, Harness, Effort, Role, Cautions\]/);
  });
});

describe('parseReportCard task verdicts', () => {
  const table = ['| Aspect | Pros | Cons |', '|---|---|---|', '| Reasoning | fast | |'].join('\n');
  const recTable = [
    '| Task | Model | Harness | Effort | Role | Cautions |',
    '|---|---|---|---|---|---|',
    '| Debugging | Model X | Zcode | medium | implementer | |',
    '| Research | Model X | | | | |',
  ].join('\n');

  const docWith = (verdictRows: string) =>
    `# Card\n\n## Acme\n\n### Model X\n\n${table}\n\n---\n\n## Task Verdicts\n\n${verdictRows}\n\n---\n\n## Recommendations\n\n${recTable}\n`;
  const validRows = [
    '| Task | Model | Status | Date | Summary |',
    '|---|---|---|---|---|',
    '| Debugging | Model X | preferred | 2026-09-03 | quick and reliable |',
    '| Research | Model X | care | 2026-09-04 | slow but usable |',
  ].join('\n');

  it('parses the reserved Task Verdicts table, keeping rows in source order', () => {
    const card = parseReportCard(docWith(validRows));
    expect(card.taskVerdicts).toEqual([
      {
        task: 'Debugging',
        model: 'Model X',
        status: 'preferred',
        date: '2026-09-03',
        summary: 'quick and reliable',
      },
      { task: 'Research', model: 'Model X', status: 'care', date: '2026-09-04', summary: 'slow but usable' },
    ]);
    expect(card.providers.map((p) => p.name)).not.toContain('Task Verdicts');
  });

  it('accepts a Task Verdicts section with a header but no rows', () => {
    const headerOnly = ['| Task | Model | Status | Date | Summary |', '|---|---|---|---|---|'].join('\n');
    const card = parseReportCard(docWith(headerOnly));
    expect(card.taskVerdicts).toEqual([]);
  });

  it('rejects a table with the wrong columns', () => {
    const wrong = ['| Task | Model |', '|---|---|', '| Debugging | Model X |'].join('\n');
    expect(() => parseReportCard(docWith(wrong))).toThrow(/expected \[Task, Model, Status, Date, Summary\]/);
  });

  it('rejects a row with the wrong number of columns', () => {
    const ragged = [
      '| Task | Model | Status | Date | Summary |',
      '|---|---|---|---|---|',
      '| Debugging | Model X | preferred | 2026-09-03 |',
    ].join('\n');
    expect(() => parseReportCard(docWith(ragged))).toThrow(/has a row with 4 column\(s\); expected 5/);
  });

  it('rejects a task that is not in the Recommendations table', () => {
    const rows = validRows.replace('| Research | Model X |', '| Refactoring | Model X |');
    expect(() => parseReportCard(docWith(rows))).toThrow(/task verdict references unknown task: Refactoring/);
  });

  it('rejects a model that is not in the card', () => {
    const rows = validRows.replace('| Research | Model X |', '| Research | Missing Model |');
    expect(() => parseReportCard(docWith(rows))).toThrow(
      /task verdict references unknown model: Missing Model/,
    );
  });

  it('rejects a status outside the viable vocabulary, including avoid', () => {
    const avoid = validRows.replace('| Research | Model X | care |', '| Research | Model X | avoid |');
    expect(() => parseReportCard(docWith(avoid))).toThrow(
      /status "avoid"; expected one of \[preferred, care\]/,
    );
    const invented = validRows.replace('| Research | Model X | care |', '| Research | Model X | great |');
    expect(() => parseReportCard(docWith(invented))).toThrow(/status "great"/);
  });

  it('rejects a date that is not a valid calendar date', () => {
    const bad = validRows.replace('2026-09-04', '2026-13-40');
    expect(() => parseReportCard(docWith(bad))).toThrow(/date "2026-13-40"/);
  });

  it('rejects an empty summary', () => {
    const blank = validRows.replace('| slow but usable |', '| |');
    expect(() => parseReportCard(docWith(blank))).toThrow(/empty Summary/);
  });

  it('rejects a duplicate task and model pair at the offending row', () => {
    const duplicated = [
      '| Task | Model | Status | Date | Summary |',
      '|---|---|---|---|---|',
      '| Debugging | Model X | preferred | 2026-09-03 | quick and reliable |',
      '| Debugging | Model X | care | 2026-09-04 | same pair again |',
    ].join('\n');
    try {
      parseReportCard(docWith(duplicated));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ReportCardParseError);
      const parseError = error as ReportCardParseError;
      expect(parseError.message).toContain('duplicate verdict for task "Debugging" and model "Model X"');
      // The offending row, not the section heading five lines above it.
      expect(parseError.line).toBe(18);
    }
  });
});

describe('parseReportCard model name ambiguity', () => {
  const table = ['| Aspect | Pros | Cons |', '|---|---|---|', '| Reasoning | fast | |'].join('\n');

  // Two providers may both carry a model heading of the same name: naming is provider-local
  // and only the provider-scoped ids must be unique.
  const ambiguousDoc = (reserved: string) =>
    `# Card\n\n## Acme\n\n### Model X\n\n${table}\n\n## Globex\n\n### Model X\n\n${table}\n\n---\n\n${reserved}\n`;

  it('accepts the same model name under two providers while it is unreferenced', () => {
    const card = parseReportCard(ambiguousDoc('Just prose, no reserved tables.\n'));
    expect(card.models.map((model) => `${model.provider}/${model.name}`)).toEqual([
      'Acme/Model X',
      'Globex/Model X',
    ]);
    expect(card.models.map((model) => model.id)).toEqual(['acme--model-x', 'globex--model-x']);
  });

  it('rejects a recommendation referencing a name that exists under multiple providers', () => {
    const recTable = [
      '| Task | Model | Harness | Effort | Role | Cautions |',
      '|---|---|---|---|---|---|',
      '| Debugging | Model X | Zcode | medium | implementer | |',
    ].join('\n');
    expect(() => parseReportCard(ambiguousDoc(`## Recommendations\n\n${recTable}\n`))).toThrow(
      /recommendation references model "Model X", a name that exists under multiple providers \(Acme, Globex\) and cannot be referenced unambiguously/,
    );
  });

  it('rejects a task verdict referencing a name that exists under multiple providers', () => {
    // The recommendation points at a uniquely named model so the task verdict row is what fails.
    const recTable = [
      '| Task | Model | Harness | Effort | Role | Cautions |',
      '|---|---|---|---|---|---|',
      '| Debugging | Acme Prime | Zcode | medium | implementer | |',
    ].join('\n');
    const verdictRows = [
      '| Task | Model | Status | Date | Summary |',
      '|---|---|---|---|---|',
      '| Debugging | Model X | preferred | 2026-09-03 | quick and reliable |',
    ].join('\n');
    const doc =
      `# Card\n\n## Acme\n\n### Model X\n\n${table}\n\n### Acme Prime\n\n${table}\n\n## Globex\n\n### Model X\n\n${table}\n\n---\n\n` +
      `## Task Verdicts\n\n${verdictRows}\n\n---\n\n## Recommendations\n\n${recTable}\n`;
    expect(() => parseReportCard(doc)).toThrow(
      /task verdict references model "Model X", a name that exists under multiple providers \(Acme, Globex\)/,
    );
  });

  it('reports the ambiguity at the referencing row', () => {
    const recTable = [
      '| Task | Model | Harness | Effort | Role | Cautions |',
      '|---|---|---|---|---|---|',
      '| Debugging | Model X | Zcode | medium | implementer | |',
    ].join('\n');
    try {
      parseReportCard(ambiguousDoc(`## Recommendations\n\n${recTable}\n`));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ReportCardParseError);
      // Two provider/model/table blocks (lines 1-17), the separator and section heading
      // (19-21), then the table header, delimiter and referencing row.
      expect((error as ReportCardParseError).line).toBe(25);
    }
  });
});

describe('parseReportCard reserved section integrity', () => {
  const table = ['| Aspect | Pros | Cons |', '|---|---|---|', '| Reasoning | fast | |'].join('\n');
  const modelDoc = `# Card\n\n## Acme\n\n### Model X\n\n${table}\n`;
  const recTable = [
    '| Task | Model | Harness | Effort | Role | Cautions |',
    '|---|---|---|---|---|---|',
    '| Debugging | Model X | Zcode | medium | implementer | |',
  ].join('\n');
  const tvTable = [
    '| Task | Model | Status | Date | Summary |',
    '|---|---|---|---|---|',
    '| Debugging | Model X | preferred | 2026-09-03 | quick and reliable |',
  ].join('\n');

  it('accepts Recommendations without Task Verdicts', () => {
    const card = parseReportCard(`${modelDoc}\n---\n\n## Recommendations\n\n${recTable}\n`);
    expect(card.recommendations).toHaveLength(1);
    expect(card.taskVerdicts).toEqual([]);
  });

  it('accepts a header-only Task Verdicts section without Recommendations', () => {
    const headerOnly = ['| Task | Model | Status | Date | Summary |', '|---|---|---|---|---|'].join('\n');
    const card = parseReportCard(`${modelDoc}\n---\n\n## Task Verdicts\n\n${headerOnly}\n`);
    expect(card.taskVerdicts).toEqual([]);
  });

  it('rejects a repeated Recommendations section', () => {
    const doc = `${modelDoc}\n---\n\n## Recommendations\n\n${recTable}\n\n---\n\n## Recommendations\n\n${recTable}\n`;
    expect(() => parseReportCard(doc)).toThrow(/duplicate "Recommendations" section/);
  });

  it('rejects a repeated Task Verdicts section', () => {
    const doc = `${modelDoc}\n---\n\n## Task Verdicts\n\n${tvTable}\n\n---\n\n## Task Verdicts\n\n${tvTable}\n`;
    expect(() => parseReportCard(doc)).toThrow(/duplicate "Task Verdicts" section/);
  });

  it('rejects Task Verdicts authored after Recommendations', () => {
    const doc = `${modelDoc}\n---\n\n## Recommendations\n\n${recTable}\n\n---\n\n## Task Verdicts\n\n${tvTable}\n`;
    expect(() => parseReportCard(doc)).toThrow(
      /"Task Verdicts" section appears after "Recommendations"; it must come before it/,
    );
  });
});

describe('splitNotes', () => {
  it('splits on top-level semicolons', () => {
    expect(splitNotes('one; two;three')).toEqual(['one', 'two', 'three']);
  });

  it('keeps semicolons inside parentheses together', () => {
    expect(splitNotes('a (x; y); b')).toEqual(['a (x; y)', 'b']);
  });

  it('returns an empty list for a blank cell', () => {
    expect(splitNotes('   ')).toEqual([]);
  });
});

describe('slugify', () => {
  it('produces url-safe ids', () => {
    expect(slugify('NVIDIA (Speech-to-Text / ASR)')).toBe('nvidia-speech-to-text-asr');
    expect(slugify('!!!')).toBe('section');
  });
});
