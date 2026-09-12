import { VERDICT_STATUSES } from '../data/types';
import { statusTone, type TaskVerdictRow } from '../lib/decision';

interface VerdictRowProps {
  /** The task verdict to render, already paired with the model it judges. */
  row: TaskVerdictRow;
  /** Opens the shared model detail modal for a model id (App wires this to `setSelectedId`). */
  onSelectModel: (id: string) => void;
}

/**
 * One row of the Decide list: the task-specific status dot + label, the model identity, the
 * task-specific summary, and the date that verdict was recorded. Rows only exist for models
 * with an explicitly recorded viable verdict for the selected task, and clicking one opens the
 * same shared model detail as everywhere else on the site.
 */
export function VerdictRow({ row, onSelectModel }: VerdictRowProps) {
  const { verdict, model } = row;

  return (
    <li>
      <button type="button" className="decision-row" onClick={() => onSelectModel(model.id)}>
        <span className={`decision-status decision-status--${statusTone(verdict.status)}`}>
          <span className="decision-status__dot" aria-hidden="true" />
          {VERDICT_STATUSES[verdict.status]}
        </span>
        <span className="decision-row__id">
          <span className="decision-row__name">{model.name}</span>
          <span className="decision-row__provider">{model.provider}</span>
        </span>
        <span className="decision-row__summary">{verdict.summary}</span>
        <span className="decision-row__date">updated {verdict.date}</span>
      </button>
    </li>
  );
}
