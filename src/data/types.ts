/**
 * The only aspect names a model table may use, in the order the site presents them.
 *
 * The parser rejects anything else, so a typo cannot silently mint a new aspect (and a new
 * filter facet). Adding a genuinely new aspect means adding it here first, in its intended
 * display position.
 */
export const CANONICAL_ASPECTS = [
  'Reasoning',
  'Coding',
  'Instruction-following',
  'Tool use / agentic',
  'Context handling',
  'Speed / latency',
  'Cost / efficiency',
  'Refusals / safety behavior',
  'Formatting / output quality',
  'Other',
] as const;

/** One of the {@link CANONICAL_ASPECTS} names. */
export type CanonicalAspect = (typeof CANONICAL_ASPECTS)[number];

/**
 * The aspect names an LLM harness table may use, in display order.
 *
 * Harnesses (Claude Code, ChatGPT desktop, Cherry Studio, ...) are the tools models run inside,
 * so they are judged on different things than the models themselves. They live under the reserved
 * `## LLM Harness` heading and use this set instead of {@link CANONICAL_ASPECTS}.
 */
export const HARNESS_ASPECTS = [
  'UI / UX',
  'Ease of use',
  'Customizability',
  'Flexibility',
  'Speed / responsiveness',
  'Resource consumption',
  'Model support',
  'Other',
] as const;

/** One of the {@link HARNESS_ASPECTS} names. */
export type HarnessAspect = (typeof HARNESS_ASPECTS)[number];

/** The exact top-level heading that switches a section from models to harnesses. */
export const HARNESS_SECTION_NAME = 'LLM Harness';

/**
 * The only verdict statuses a model's `**Verdict:**` line may use, mapped to their display label.
 *
 * This is the single source for the enum: the parser validates the status key against it (via
 * `Object.hasOwn`), and any UI copy renders the corresponding label rather than the raw key.
 * `preferred` / `care` / `avoid` are written lowercase in the document; the labels are the
 * capitalised, human-facing text ("Preferred" / "Use with care" / "Avoid").
 */
export const VERDICT_STATUSES = {
  preferred: 'Preferred',
  care: 'Use with care',
  avoid: 'Avoid',
} as const;

/** One of the {@link VERDICT_STATUSES} keys. */
export type VerdictStatus = keyof typeof VERDICT_STATUSES;

/**
 * The only statuses a `## Task Verdicts` row may use. A task's list shows viable models only:
 * a model with no positive or qualified-positive evidence for that task is omitted from it
 * entirely rather than recorded as `avoid`.
 */
export const TASK_VERDICT_STATUSES = ['preferred', 'care'] as const satisfies readonly VerdictStatus[];

/** One of the {@link TASK_VERDICT_STATUSES} keys. */
export type TaskVerdictStatus = (typeof TASK_VERDICT_STATUSES)[number];

/** The exact top-level heading for the reserved, end-of-file recommendations table. */
export const RECOMMENDATIONS_SECTION_NAME = 'Recommendations';

/** The exact top-level heading for the reserved, per-task verdict table. */
export const TASK_VERDICTS_SECTION_NAME = 'Task Verdicts';

/**
 * A model's current-state call, parsed from the optional `**Verdict:** <status> · <date> ·
 * <summary>` line directly under its `### Model name` heading.
 */
export interface Verdict {
  /** One of {@link VERDICT_STATUSES}' keys. */
  status: VerdictStatus;
  /** ISO date (`YYYY-MM-DD`) the verdict was recorded. */
  date: string;
  /** Free-text rationale; never contains the ` · ` field separator. */
  summary: string;
}

/** One row of the reserved `## Recommendations` table at the end of the document. */
export interface Recommendation {
  /** Free-text task label, e.g. "Debugging". */
  task: string;
  /** Must exactly match a {@link ModelEntry.name} parsed elsewhere in the card. */
  model: string;
  /** Free-text harness/tool name, e.g. "Zcode". */
  harness: string;
  /** Free-text effort level, e.g. "medium". */
  effort: string;
  /** Free-text role, e.g. "implementer". */
  role: string;
  /** Free-text cautions; may be empty. */
  cautions: string;
}

/**
 * One row of the reserved `## Task Verdicts` table: a task-specific call on one model, which is
 * what decides the lower list of the Decide view for that task.
 */
export interface TaskVerdict {
  /** Must exactly match a task in the `## Recommendations` table. */
  task: string;
  /** Must exactly match a {@link ModelEntry.name} parsed elsewhere in the card. */
  model: string;
  /** One of {@link TASK_VERDICT_STATUSES}; `avoid` is not allowed here. */
  status: TaskVerdictStatus;
  /** ISO date (`YYYY-MM-DD`) this task-specific verdict was recorded or last updated. */
  date: string;
  /** Why this model is viable for this task specifically; never the model's general verdict. */
  summary: string;
}

export interface AspectEntry {
  /** Aspect name, always one of {@link CANONICAL_ASPECTS}, e.g. "Tool use / agentic". */
  aspect: string;
  /** Individual strengths noted for this aspect. Empty when nothing was recorded. */
  pros: string[];
  /** Individual weaknesses noted for this aspect. Empty when nothing was recorded. */
  cons: string[];
}

export interface ModelEntry {
  /** URL-safe identifier, unique across the report card. */
  id: string;
  /** Model heading text, e.g. "Claude Opus 5". */
  name: string;
  /** Provider heading text, e.g. "Anthropic". */
  provider: string;
  /** URL-safe provider identifier. */
  providerId: string;
  /** Every aspect row of the model's table, in source order. */
  aspects: AspectEntry[];
  /** Aspect names that recorded at least one pro or con. */
  coveredAspects: string[];
  prosCount: number;
  consCount: number;
  /** Parsed from the optional `**Verdict:**` line directly under the model heading, if present. */
  verdict?: Verdict;
}

export interface ProviderEntry {
  id: string;
  name: string;
  models: ModelEntry[];
}

export interface ReportCard {
  /** Report card document title (the level-1 heading). */
  title: string;
  providers: ProviderEntry[];
  /** All models, flattened in source order. */
  models: ModelEntry[];
  /** Every distinct aspect name seen across models, in {@link CANONICAL_ASPECTS} order. */
  aspects: string[];
  /** Harness tools listed under the reserved "## LLM Harness" heading, in source order. */
  harnesses: ModelEntry[];
  /** Every distinct aspect name seen across harnesses, in {@link HARNESS_ASPECTS} order. */
  harnessAspects: string[];
  /** Rows of the reserved "## Recommendations" table, in source order. */
  recommendations: Recommendation[];
  /** Rows of the reserved "## Task Verdicts" table, in source order. */
  taskVerdicts: TaskVerdict[];
}

export class ReportCardParseError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(`LLM_REPORT_CARD.md:${line}: ${message}`);
    this.name = 'ReportCardParseError';
    this.line = line;
  }
}
