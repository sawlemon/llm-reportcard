import type { ModelEntry, Recommendation, VerdictStatus } from '../data/types';
import { VERDICT_STATUSES } from '../data/types';

/**
 * Helpers behind the Decide view: which models are the voice-to-text group, how the
 * current verdicts are ordered, and how a recommendation row resolves to a model.
 *
 * These are pure functions over the parsed {@link ReportCard} data so the grouping and
 * ordering rules stay unit-testable independently of the document's daily churn.
 */

/**
 * Whether a provider is the voice-to-text group (its name mentions Speech-to-Text or ASR).
 *
 * Case-insensitive on purpose: the document spells the group "NVIDIA (Speech-to-Text / ASR)"
 * and future renames may vary the casing. Everything else — including the "Unknown Provider"
 * group that hosts Big Pickle — stays in the normal coding verdicts.
 */
export function isVoiceToTextProvider(providerName: string): boolean {
  const needle = providerName.toLowerCase();
  return needle.includes('speech-to-text') || needle.includes('asr');
}

/** Whether a model belongs to the voice-to-text provider group. */
export function isVoiceToTextModel(model: ModelEntry): boolean {
  return isVoiceToTextProvider(model.provider);
}

/** The display order of the Current Verdicts list: preferred, then care, then avoid. */
const VERDICT_ORDER: VerdictStatus[] = ['preferred', 'care', 'avoid'];

/**
 * Every model that carries a verdict, minus the voice-to-text group, ordered by status
 * (preferred → care → avoid) while preserving source order within each status.
 */
export function codingVerdictModels(models: ModelEntry[]): ModelEntry[] {
  const withVerdict = models.filter((model) => model.verdict && !isVoiceToTextModel(model));
  return VERDICT_ORDER.flatMap((status) => withVerdict.filter((model) => model.verdict?.status === status));
}

/** The voice-to-text group, in source order, regardless of whether a verdict exists. */
export function voiceToTextModels(models: ModelEntry[]): ModelEntry[] {
  return models.filter(isVoiceToTextModel);
}

/** Every distinct recommendation task, in source order. */
export function recommendationTasks(recommendations: Recommendation[]): string[] {
  return Array.from(new Set(recommendations.map((recommendation) => recommendation.task)));
}

/**
 * The model a recommendation points at, matched by exact {@link ModelEntry.name} (the same
 * contract the validator enforces on the document). `undefined` when the name has no match,
 * in which case the view renders the name as plain text.
 */
export function recommendationModel(
  models: ModelEntry[],
  recommendation: Recommendation,
): ModelEntry | undefined {
  return models.find((model) => model.name === recommendation.model);
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

/** The three statuses in display order, paired with their human-facing labels. */
export function statusLegend(): Array<{ status: VerdictStatus; label: string }> {
  return (Object.keys(VERDICT_STATUSES) as VerdictStatus[]).map((status) => ({
    status,
    label: VERDICT_STATUSES[status],
  }));
}
