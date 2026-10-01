import type { ModelEntry, VerdictStatus } from '../data/types';

/**
 * Display constants shared by the fun-redesign views, ported from the mockup's script
 * (`ASPECT_ICON`, `TASK_EMOJI`, `SHORT`, `COLORS`, `num()`, `color()`).
 *
 * The mockup keyed some of these off the exact provider name
 * "NVIDIA (Speech-to-Text / ASR)"; here the ASR provider is detected by `provider.name`
 * containing "ASR", per the redesign contract.
 */

/** Icon shown per aspect name on card faces, dossier aspect rows, and versus rows. */
export const ASPECT_ICONS: Record<string, string> = {
  Reasoning: '🧠',
  Coding: '💻',
  'Instruction-following': '📋',
  'Tool use / agentic': '🛠',
  'Context handling': '📚',
  'Speed / latency': '⚡',
  'Cost / efficiency': '💸',
  'Refusals / safety behavior': '🛡',
  'Formatting / output quality': '✨',
  Other: '•',
  'UI / UX': '🎨',
  'Ease of use': '👌',
  Customizability: '🎛',
  Flexibility: '🤸',
  'Speed / responsiveness': '⚡',
  'Resource consumption': '🔋',
  'Model support': '🔌',
};

/** Emoji shown on the Decide view's task chips. Unknown tasks fall back to '✦'. */
export const TASK_EMOJI: Record<string, string> = {
  Debugging: '🐛',
  'Implement from plan': '🏗',
  'Planning / architecture': '📐',
  'Exploratory research': '🔭',
  'Cheap implementation': '🪙',
  'Documentation / writing': '📝',
  'Speech to text': '🎙',
  'Content writing': '🎬',
};

export function taskEmoji(task: string): string {
  return TASK_EMOJI[task] ?? '✦';
}

/** Compact stamp labels (the mockup's `SHORT` map). */
export const SHORT_STATUS_LABELS: Record<VerdictStatus, string> = {
  preferred: 'Preferred',
  care: 'Care',
  avoid: 'Avoid',
};

/** Provider name → card color, from the mockup's `COLORS` map. */
const PROVIDER_COLORS: Record<string, string> = {
  Anthropic: '#ff9f6b',
  OpenAI: '#6ee7a8',
  Google: '#7cc6ff',
  DeepSeek: '#a5b4fc',
  'Zhipu AI': '#d8b4fe',
  xAI: '#cbd5e1',
  Xiaomi: '#ffb86b',
};

/** The card color for the speech-to-text provider (mockup `COLORS[ASR]`). */
const ASR_COLOR = '#c4f25b';

/** Fallback card color, shared by harnesses and unknown providers. */
const FALLBACK_COLOR = '#ffe14d';

/** Whether the user asked for reduced motion (mockup `reduced` flag, computed once). */
export const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Whether an entry belongs to the speech-to-text provider (detected by name, per contract). */
export function isAsrEntry(entry: ModelEntry): boolean {
  return entry.provider.includes('ASR');
}

/** The color swatch for a provider shelf / card band. */
export function providerColor(providerName: string): string {
  if (providerName.includes('ASR')) return ASR_COLOR;
  return PROVIDER_COLORS[providerName] ?? FALLBACK_COLOR;
}

/** The color swatch for a card: provider color, ASR green, or the harness/unknown yellow. */
export function cardColor(entry: ModelEntry): string {
  return providerColor(entry.provider);
}

/**
 * The card's `#NN` collector number: its 1-based position in
 * `[...reportCard.models, ...reportCard.harnesses]`, zero-padded to two digits.
 */
export function cardNumber(entry: ModelEntry, all: ModelEntry[]): string {
  const index = all.findIndex((candidate) => candidate.id === entry.id);
  return String(index + 1).padStart(2, '0');
}

/** The first note of a kind across all of an entry's aspects (mockup `firstNotes(m, key, 1)`). */
export function firstNote(entry: ModelEntry, kind: 'pros' | 'cons'): string | undefined {
  for (const aspect of entry.aspects) {
    const note = aspect[kind][0];
    if (note) return note;
  }
  return undefined;
}
