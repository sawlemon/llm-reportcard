import type { ModelEntry } from '../data/types';
import { VERDICT_STATUSES } from '../data/types';
import { statusTone } from '../lib/decision';

interface VerdictRowProps {
  /** The model to render; a missing verdict collapses the row to name + provider. */
  model: ModelEntry;
  /** Opens the shared model detail modal for a model id (App wires this to `setSelectedId`). */
  onSelectModel: (id: string) => void;
}

/**
 * One verdict row: status dot + label, model identity, summary, and the verdict date.
 * Used by the Current Verdicts list on Decide (coding and speech-to-text domains), where
 * models without a verdict render as just name + provider.
 */
export function VerdictRow({ model, onSelectModel }: VerdictRowProps) {
  const verdict = model.verdict;

  return (
    <li>
      <button type="button" className="decision-row" onClick={() => onSelectModel(model.id)}>
        {verdict ? (
          <span className={`decision-status decision-status--${statusTone(verdict.status)}`}>
            <span className="decision-status__dot" aria-hidden="true" />
            {VERDICT_STATUSES[verdict.status]}
          </span>
        ) : (
          <span className="decision-status" />
        )}
        <span className="decision-row__id">
          <span className="decision-row__name">{model.name}</span>
          <span className="decision-row__provider">{model.provider}</span>
        </span>
        {verdict ? <span className="decision-row__summary">{verdict.summary}</span> : null}
        {verdict ? <span className="decision-row__date">updated {verdict.date}</span> : null}
      </button>
    </li>
  );
}
