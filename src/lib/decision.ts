import type {
  ModelEntry,
  Recommendation,
  TaskVerdict,
  TaskVerdictStatus,
  VerdictStatus,
} from '../data/types';
import { TASK_VERDICT_STATUSES, VERDICT_STATUSES } from '../data/types';

/**
 * Helpers behind the Decide view: how a recommendation row resolves to a model, and how a
 * task's Task Verdicts rows are selected, ordered, and paired with their models.
 *
 * These are pure functions over the parsed {@link ReportCard} data so the selection and
 * ordering rules stay unit-testable independently of the document's daily churn.
 */

/**
 * The model a name points at, matched by exact {@link ModelEntry.name}. `undefined` unless
 * exactly one model has that name: model headings are provider-local, so a name shared across
 * providers cannot be referenced unambiguously, and this helper never silently picks the first.
 * The parser rejects ambiguous references, so this only guards stale or hand-built callers.
 */
export function modelByName(models: ModelEntry[], name: string): ModelEntry | undefined {
  const matches = models.filter((model) => model.name === name);
  return matches.length === 1 ? matches[0] : undefined;
}

/** The model a recommendation points at, matched by exact name. */
export function recommendationModel(
  models: ModelEntry[],
  recommendation: Recommendation,
): ModelEntry | undefined {
  return modelByName(models, recommendation.model);
}

/** Every distinct recommendation task, in source order. */
export function recommendationTasks(recommendations: Recommendation[]): string[] {
  return Array.from(new Set(recommendations.map((recommendation) => recommendation.task)));
}

/**
 * The "Label: value" meta parts for a recommendation, in display order, skipping blank
 * fields (the document leaves Harness/Effort/Role empty for non-coding tasks such as
 * speech to text). Empty when all three are blank, which tells the view to render no
 * meta line at all.
 */
export function recommendationMetaParts(recommendation: Recommendation): string[] {
  const fields: Array<[label: string, value: string]> = [
    ['Harness', recommendation.harness],
    ['Effort', recommendation.effort],
    ['Role', recommendation.role],
  ];
  return fields.filter(([, value]) => value.trim().length > 0).map(([label, value]) => `${label}: ${value}`);
}

/** One render-ready Decide-list entry: a task verdict paired with the model it judges. */
export interface TaskVerdictRow {
  verdict: TaskVerdict;
  model: ModelEntry;
}

/**
 * The task verdict rows for one task, ordered preferred before care while preserving Task
 * Verdicts source order within each status, each resolved to its model.
 *
 * This list is the entire lower Decide list for the task: a task with no recorded rows returns
 * an empty list — there is deliberately no fallback to all coding models, all ASR models, or
 * any other task's rows. Rows whose model name resolves to nothing cannot be rendered and are
 * dropped; the parser rejects those, so this only guards stale or hand-built callers.
 */
export function taskVerdictRows(
  models: ModelEntry[],
  taskVerdicts: TaskVerdict[],
  task: string,
): TaskVerdictRow[] {
  const scoped = taskVerdicts.filter((verdict) => verdict.task === task);
  return TASK_VERDICT_STATUSES.flatMap((status) =>
    scoped.filter((verdict) => verdict.status === status),
  ).flatMap((verdict) => {
    const model = modelByName(models, verdict.model);
    return model ? [{ verdict, model }] : [];
  });
}

/** Which CSS color family a verdict status renders with (pro green, warn amber, con red). */
export type StatusTone = 'pro' | 'warn' | 'con';

/** Maps a verdict status to its status-dot color tone: preferred=pro, care=warn, avoid=con. */
export function statusTone(status: VerdictStatus): StatusTone {
  const tones: Record<VerdictStatus, StatusTone> = {
    preferred: 'pro',
    care: 'warn',
    avoid: 'con',
  };
  return tones[status];
}

/**
 * The legend for a task verdict list: only statuses actually present in the rows, in display
 * order, paired with their human-facing labels.
 */
export function taskVerdictLegend(
  rows: TaskVerdictRow[],
): Array<{ status: TaskVerdictStatus; label: string }> {
  return TASK_VERDICT_STATUSES.filter((status) => rows.some((row) => row.verdict.status === status)).map(
    (status) => ({ status, label: VERDICT_STATUSES[status] }),
  );
}
