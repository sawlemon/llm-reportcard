import {
  CANONICAL_ASPECTS,
  HARNESS_ASPECTS,
  HARNESS_SECTION_NAME,
  RECOMMENDATIONS_SECTION_NAME,
  ReportCardParseError,
  TASK_VERDICTS_SECTION_NAME,
  TASK_VERDICT_STATUSES,
  VERDICT_STATUSES,
  type AspectEntry,
  type ModelEntry,
  type ProviderEntry,
  type Recommendation,
  type ReportCard,
  type TaskVerdict,
  type TaskVerdictStatus,
  type Verdict,
} from './types';

const EXPECTED_COLUMNS = ['aspect', 'pros', 'cons'];

/** Column order the reserved "## Recommendations" table must use, verbatim in its header row. */
const EXPECTED_RECOMMENDATION_COLUMNS = ['task', 'model', 'harness', 'effort', 'role', 'cautions'];

/** Column order the reserved "## Task Verdicts" table must use, verbatim in its header row. */
const EXPECTED_TASK_VERDICT_COLUMNS = ['task', 'model', 'status', 'date', 'summary'];

/** The literal separator between fields on a `**Verdict:**` line: space, middle dot, space. */
const VERDICT_FIELD_SEPARATOR = ' · ';

/** Matches a `**Verdict:**` line, capturing everything after the label. */
const VERDICT_LINE_PATTERN = /^\*\*Verdict:\*\*\s*(.*)$/;

/**
 * The two vocabularies a table may use, chosen by the enclosing section: model sections use
 * {@link CANONICAL_ASPECTS}, and the reserved {@link HARNESS_SECTION_NAME} section uses
 * {@link HARNESS_ASPECTS}. Each entry carries the set (for membership) and a loose-key map
 * (for near-miss suggestions), plus the ordered list for the "expected one of ..." message.
 */
const ASPECT_VOCABULARIES = {
  model: buildVocabulary(CANONICAL_ASPECTS),
  harness: buildVocabulary(HARNESS_ASPECTS),
} as const;

type SectionKind = keyof typeof ASPECT_VOCABULARIES;

function buildVocabulary(aspects: readonly string[]) {
  return {
    ordered: aspects,
    set: new Set(aspects) as ReadonlySet<string>,
    byLooseKey: new Map(aspects.map((aspect) => [looseAspectKey(aspect), aspect])) as ReadonlyMap<
      string,
      string
    >,
  };
}

/** Folds case and drops all whitespace, so "Tool use/agentic" keys the same as "Tool use / agentic". */
function looseAspectKey(aspect: string): string {
  return aspect.toLowerCase().replace(/\s+/g, '');
}

interface SourceLine {
  text: string;
  /** 1-based line number in the original document. */
  number: number;
}

/** Removes fenced code blocks (the authoring template) while preserving line numbers. */
function stripFencedBlocks(markdown: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let fence: string | null = null;

  markdown.split(/\r?\n/).forEach((text, index) => {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(text);
    if (fence === null && fenceMatch) {
      fence = fenceMatch[1][0];
      return;
    }
    if (fence !== null) {
      if (fenceMatch && fenceMatch[1][0] === fence) fence = null;
      return;
    }
    lines.push({ text, number: index + 1 });
  });

  return lines;
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

/** Splits a table row into its cells, honouring escaped pipes. */
function splitRow(row: string): string[] {
  const cells: string[] = [];
  let current = '';

  for (let i = 0; i < row.length; i += 1) {
    const char = row[i];
    if (char === '\\' && row[i + 1] === '|') {
      current += '|';
      i += 1;
    } else if (char === '|') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);

  // A leading and trailing pipe produce empty edge cells; drop them.
  if (cells.length && cells[0].trim() === '') cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();

  return cells.map((cell) => cell.trim());
}

function isDelimiterRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

/** Splits a note cell into separate bullets on top-level semicolons. */
export function splitNotes(cell: string): string[] {
  const notes: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of cell) {
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);

    if (char === ';' && depth === 0) {
      notes.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  notes.push(current);

  return notes.map((note) => note.trim()).filter((note) => note.length > 0);
}

/** True for a calendar-valid `YYYY-MM-DD` string (rejects e.g. `2026-13-40`). */
function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Parses the content of a `**Verdict:**` line (everything after the label) into a {@link Verdict},
 * validating the status against {@link VERDICT_STATUSES} and the date as a calendar-valid ISO date.
 *
 * Splits on only the first two ` · ` separators, so a summary that (against the authoring rule)
 * contains a stray ` · ` is kept whole rather than truncated.
 */
function parseVerdictLine(content: string, modelName: string, line: number): Verdict {
  const firstSeparator = content.indexOf(VERDICT_FIELD_SEPARATOR);
  const secondSeparator =
    firstSeparator === -1
      ? -1
      : content.indexOf(VERDICT_FIELD_SEPARATOR, firstSeparator + VERDICT_FIELD_SEPARATOR.length);

  if (firstSeparator === -1 || secondSeparator === -1) {
    throw new ReportCardParseError(
      `model "${modelName}" has a malformed Verdict line; expected "**Verdict:** <status> · <YYYY-MM-DD> · <summary>"`,
      line,
    );
  }

  const status = content.slice(0, firstSeparator).trim();
  const date = content.slice(firstSeparator + VERDICT_FIELD_SEPARATOR.length, secondSeparator).trim();
  const summary = content.slice(secondSeparator + VERDICT_FIELD_SEPARATOR.length).trim();

  if (!Object.hasOwn(VERDICT_STATUSES, status)) {
    throw new ReportCardParseError(
      `model "${modelName}" has verdict status "${status}"; expected one of [${Object.keys(VERDICT_STATUSES).join(', ')}]`,
      line,
    );
  }
  if (!isValidIsoDate(date)) {
    throw new ReportCardParseError(
      `model "${modelName}" has verdict date "${date}"; expected an ISO date (YYYY-MM-DD)`,
      line,
    );
  }
  if (!summary) {
    throw new ReportCardParseError(`model "${modelName}" has a Verdict line with an empty summary`, line);
  }

  return { status: status as Verdict['status'], date, summary };
}

/**
 * Builds the error for an aspect name that is not in `CANONICAL_ASPECTS`, pointing at the
 * closest canonical name when the difference is only case or whitespace.
 */
function unknownAspectError(
  aspect: string,
  modelName: string,
  line: number,
  vocabulary: (typeof ASPECT_VOCABULARIES)[SectionKind],
): ReportCardParseError {
  const suggestion = vocabulary.byLooseKey.get(looseAspectKey(aspect));
  const fix = suggestion
    ? `did you mean "${suggestion}"?`
    : `expected one of [${vocabulary.ordered.join(', ')}]`;
  return new ReportCardParseError(`model "${modelName}" has unknown aspect "${aspect}"; ${fix}`, line);
}

/**
 * Validates a reserved-table model reference, which is by exact name only: the model heading
 * stays provider-local, so a name that exists under several providers cannot say which one the
 * row means. Zero matches is the unknown-model error; more than one is an ambiguity error. Both
 * point at the referencing row.
 */
function validateModelReference(section: string, name: string, models: ModelEntry[], line: number): void {
  const matches = models.filter((entry) => entry.name === name);
  if (matches.length === 0) {
    throw new ReportCardParseError(`${section} references unknown model: ${name}`, line);
  }
  if (matches.length > 1) {
    const providers = matches.map((entry) => entry.provider).join(', ');
    throw new ReportCardParseError(
      `${section} references model "${name}", a name that exists under multiple providers (${providers}) and cannot be referenced unambiguously`,
      line,
    );
  }
}

export function parseReportCard(markdown: string): ReportCard {
  const lines = stripFencedBlocks(markdown);

  let title = 'LLM Report Card';
  const providers: ProviderEntry[] = [];
  const models: ModelEntry[] = [];
  const harnesses: ModelEntry[] = [];
  const seenAspects = new Set<string>();
  const seenHarnessAspects = new Set<string>();
  const seenModelIds = new Set<string>();
  // Cross-referenced against `models` and the Recommendation tasks only after the whole document
  // is parsed, since the reserved sections are authored at the end, after every model and task
  // they can reference.
  const recommendationRows: Array<{ recommendation: Recommendation; line: number }> = [];
  const collectedTaskVerdicts: Array<{ verdict: TaskVerdict; line: number }> = [];

  let provider: ProviderEntry | null = null;
  // 'model' while under a "## Provider" heading, 'harness' under the reserved "## LLM Harness".
  let sectionKind: SectionKind = 'model';
  // True while under a reserved end-of-document heading ("## Recommendations" or
  // "## Task Verdicts"). Neither is a provider, and each parses its table independently of
  // `sectionKind` (neither needs a model in scope).
  let inRecommendations = false;
  let inTaskVerdicts = false;
  // Reserved headings are single-use and ordered — at most one of each, with Task Verdicts
  // authored above Recommendations. Unlike `in*`, these stay true once the heading is seen.
  let seenRecommendations = false;
  let seenTaskVerdicts = false;
  // One verdict per Task + Model pair, enforced while the rows are parsed.
  const seenTaskVerdictPairs = new Set<string>();
  let model: ModelEntry | null = null;
  let modelLine = 0;
  let inTable = false;
  // True for the single line immediately following a "### Model name" heading, the only place a
  // "**Verdict:**" line may appear. Cleared on the first non-blank line, matched or not.
  let expectVerdict = false;

  const finishModel = () => {
    if (model && model.aspects.length === 0) {
      throw new ReportCardParseError(
        `model "${model.name}" has no aspect table; expected a "| Aspect | Pros | Cons |" table`,
        modelLine,
      );
    }
    model = null;
    inTable = false;
    expectVerdict = false;
  };

  for (const { text, number } of lines) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(text);

    if (heading) {
      const level = heading[1].length;
      const name = heading[2].trim();

      if (!name) throw new ReportCardParseError('heading has no text', number);

      if (level === 1) {
        finishModel();
        provider = null;
        sectionKind = 'model';
        inRecommendations = false;
        inTaskVerdicts = false;
        title = name;
      } else if (level === 2) {
        finishModel();
        if (name === RECOMMENDATIONS_SECTION_NAME) {
          if (seenRecommendations) {
            throw new ReportCardParseError(`duplicate "${RECOMMENDATIONS_SECTION_NAME}" section`, number);
          }
          // Reserved: a single table of cross-references into models parsed above it, not a
          // provider grouping models of its own.
          seenRecommendations = true;
          inRecommendations = true;
          inTaskVerdicts = false;
          provider = null;
        } else if (name === TASK_VERDICTS_SECTION_NAME) {
          if (seenTaskVerdicts) {
            throw new ReportCardParseError(`duplicate "${TASK_VERDICTS_SECTION_NAME}" section`, number);
          }
          if (seenRecommendations) {
            throw new ReportCardParseError(
              `"${TASK_VERDICTS_SECTION_NAME}" section appears after "${RECOMMENDATIONS_SECTION_NAME}"; it must come before it`,
              number,
            );
          }
          // Reserved: one task-specific verdict per row, cross-referenced into models and
          // Recommendation tasks, not a provider grouping models of its own.
          seenTaskVerdicts = true;
          inTaskVerdicts = true;
          inRecommendations = false;
          provider = null;
        } else if (name === HARNESS_SECTION_NAME) {
          // A flat section of harness tools, not a provider grouping models.
          inRecommendations = false;
          inTaskVerdicts = false;
          sectionKind = 'harness';
          provider = null;
        } else {
          inRecommendations = false;
          inTaskVerdicts = false;
          sectionKind = 'model';
          provider = { id: slugify(name), name, models: [] };
        }
      } else if (level === 3) {
        finishModel();
        if (sectionKind === 'harness') {
          const id = `harness--${slugify(name)}`;
          if (seenModelIds.has(id)) {
            throw new ReportCardParseError(`duplicate harness "${name}"`, number);
          }
          seenModelIds.add(id);
          model = {
            id,
            name,
            provider: HARNESS_SECTION_NAME,
            providerId: 'harness',
            aspects: [],
            coveredAspects: [],
            prosCount: 0,
            consCount: 0,
          };
          modelLine = number;
          harnesses.push(model);
        } else {
          if (!provider) {
            throw new ReportCardParseError(
              `model "${name}" appears before any provider heading; add a "## Provider" heading above it`,
              number,
            );
          }
          const id = `${provider.id}--${slugify(name)}`;
          if (seenModelIds.has(id)) {
            throw new ReportCardParseError(
              `duplicate model "${name}" under provider "${provider.name}"`,
              number,
            );
          }
          seenModelIds.add(id);
          model = {
            id,
            name,
            provider: provider.name,
            providerId: provider.id,
            aspects: [],
            coveredAspects: [],
            prosCount: 0,
            consCount: 0,
          };
          modelLine = number;
          if (!providers.includes(provider)) providers.push(provider);
          provider.models.push(model);
          models.push(model);
          // Only a "### Model name" under a provider may carry a Verdict line, per the schema.
          expectVerdict = true;
        }
      }
      continue;
    }

    if (expectVerdict) {
      const trimmed = text.trim();
      if (trimmed === '') continue; // Blank line before content; still awaiting the one slot.
      expectVerdict = false;
      const verdictMatch = VERDICT_LINE_PATTERN.exec(trimmed);
      if (verdictMatch && model) {
        model.verdict = parseVerdictLine(verdictMatch[1], model.name, number);
        continue;
      }
      // Not a Verdict line: fall through and let the normal table/prose handling below see it.
    }

    if (!text.trim().startsWith('|')) {
      inTable = false;
      continue;
    }

    const cells = splitRow(text.trim());

    if (inRecommendations) {
      if (!inTable) {
        const header = cells.map((cell) => cell.toLowerCase());
        if (header.join('|') !== EXPECTED_RECOMMENDATION_COLUMNS.join('|')) {
          throw new ReportCardParseError(
            `"${RECOMMENDATIONS_SECTION_NAME}" table has columns [${cells.join(', ')}]; expected [Task, Model, Harness, Effort, Role, Cautions]`,
            number,
          );
        }
        inTable = true;
        continue;
      }

      if (isDelimiterRow(cells)) continue;

      if (cells.length !== EXPECTED_RECOMMENDATION_COLUMNS.length) {
        throw new ReportCardParseError(
          `"${RECOMMENDATIONS_SECTION_NAME}" table has a row with ${cells.length} column(s); expected 6 (Task | Model | Harness | Effort | Role | Cautions)`,
          number,
        );
      }

      const [task, recommendedModel, recHarness, effort, role, cautions] = cells;
      if (!recommendedModel) {
        throw new ReportCardParseError(
          `"${RECOMMENDATIONS_SECTION_NAME}" table has a row with an empty Model`,
          number,
        );
      }

      recommendationRows.push({
        recommendation: { task, model: recommendedModel, harness: recHarness, effort, role, cautions },
        line: number,
      });
      continue;
    }

    if (inTaskVerdicts) {
      if (!inTable) {
        const header = cells.map((cell) => cell.toLowerCase());
        if (header.join('|') !== EXPECTED_TASK_VERDICT_COLUMNS.join('|')) {
          throw new ReportCardParseError(
            `"${TASK_VERDICTS_SECTION_NAME}" table has columns [${cells.join(', ')}]; expected [Task, Model, Status, Date, Summary]`,
            number,
          );
        }
        inTable = true;
        continue;
      }

      if (isDelimiterRow(cells)) continue;

      if (cells.length !== EXPECTED_TASK_VERDICT_COLUMNS.length) {
        throw new ReportCardParseError(
          `"${TASK_VERDICTS_SECTION_NAME}" table has a row with ${cells.length} column(s); expected 5 (Task | Model | Status | Date | Summary)`,
          number,
        );
      }

      const [task, verdictModel, status, date, summary] = cells;
      if (!task) {
        throw new ReportCardParseError(
          `"${TASK_VERDICTS_SECTION_NAME}" table has a row with an empty Task`,
          number,
        );
      }
      if (!verdictModel) {
        throw new ReportCardParseError(
          `"${TASK_VERDICTS_SECTION_NAME}" table has a row with an empty Model`,
          number,
        );
      }
      // Viable statuses only: a model without positive evidence for the task is left out of the
      // section entirely, so `avoid` rows are a schema violation rather than data.
      if (!TASK_VERDICT_STATUSES.includes(status as TaskVerdictStatus)) {
        throw new ReportCardParseError(
          `"${TASK_VERDICTS_SECTION_NAME}" table has status "${status}"; expected one of [${TASK_VERDICT_STATUSES.join(', ')}]`,
          number,
        );
      }
      if (!isValidIsoDate(date)) {
        throw new ReportCardParseError(
          `"${TASK_VERDICTS_SECTION_NAME}" table has date "${date}"; expected an ISO date (YYYY-MM-DD)`,
          number,
        );
      }
      if (!summary) {
        throw new ReportCardParseError(
          `"${TASK_VERDICTS_SECTION_NAME}" table has a row with an empty Summary`,
          number,
        );
      }

      const pair = JSON.stringify([task, verdictModel]);
      if (seenTaskVerdictPairs.has(pair)) {
        throw new ReportCardParseError(
          `"${TASK_VERDICTS_SECTION_NAME}" table has a duplicate verdict for task "${task}" and model "${verdictModel}"`,
          number,
        );
      }
      seenTaskVerdictPairs.add(pair);

      collectedTaskVerdicts.push({
        verdict: { task, model: verdictModel, status: status as TaskVerdictStatus, date, summary },
        line: number,
      });
      continue;
    }

    if (!model) {
      throw new ReportCardParseError(
        'table row found outside of a model section; add a "### Model name" heading above it',
        number,
      );
    }

    if (!inTable) {
      const header = cells.map((cell) => cell.toLowerCase());
      if (header.join('|') !== EXPECTED_COLUMNS.join('|')) {
        throw new ReportCardParseError(
          `model "${model.name}" has table columns [${cells.join(', ')}]; expected [Aspect, Pros, Cons]`,
          number,
        );
      }
      inTable = true;
      continue;
    }

    if (isDelimiterRow(cells)) continue;

    if (cells.length !== EXPECTED_COLUMNS.length) {
      throw new ReportCardParseError(
        `model "${model.name}" has a row with ${cells.length} column(s); expected 3 (Aspect | Pros | Cons)`,
        number,
      );
    }

    const [aspect, prosCell, consCell] = cells;
    if (!aspect) {
      throw new ReportCardParseError(`model "${model.name}" has a row with an empty Aspect`, number);
    }
    const vocabulary = ASPECT_VOCABULARIES[sectionKind];
    if (!vocabulary.set.has(aspect)) {
      throw unknownAspectError(aspect, model.name, number, vocabulary);
    }

    const entry: AspectEntry = {
      aspect,
      pros: splitNotes(prosCell),
      cons: splitNotes(consCell),
    };

    model.aspects.push(entry);
    model.prosCount += entry.pros.length;
    model.consCount += entry.cons.length;
    if (entry.pros.length || entry.cons.length) model.coveredAspects.push(aspect);
    (sectionKind === 'harness' ? seenHarnessAspects : seenAspects).add(aspect);
  }

  finishModel();

  if (models.length === 0) {
    throw new ReportCardParseError(
      'no models found; expected at least one "## Provider" / "### Model name" pair',
      1,
    );
  }

  const recommendations: Recommendation[] = [];
  for (const { recommendation, line } of recommendationRows) {
    validateModelReference('recommendation', recommendation.model, models, line);
    recommendations.push(recommendation);
  }

  // Task verdicts cross-reference both the models and the Recommendation tasks, so they are
  // validated only once `recommendations` above has settled.
  const tasks = new Set(recommendations.map((recommendation) => recommendation.task));
  const taskVerdicts: TaskVerdict[] = [];
  for (const { verdict, line } of collectedTaskVerdicts) {
    if (!tasks.has(verdict.task)) {
      throw new ReportCardParseError(`task verdict references unknown task: ${verdict.task}`, line);
    }
    validateModelReference('task verdict', verdict.model, models, line);
    taskVerdicts.push(verdict);
  }

  // Present aspects in canonical order regardless of authoring order, keeping only those used.
  const aspects = CANONICAL_ASPECTS.filter((aspect) => seenAspects.has(aspect));
  const harnessAspects = HARNESS_ASPECTS.filter((aspect) => seenHarnessAspects.has(aspect));

  return { title, providers, models, aspects, harnesses, harnessAspects, recommendations, taskVerdicts };
}
