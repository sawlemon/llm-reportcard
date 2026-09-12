import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import reportCard from 'virtual:report-card';
import type { Recommendation } from '../data/types';
import {
  recommendationMetaParts,
  recommendationModel,
  recommendationTasks,
  statusTone,
  taskVerdictLegend,
  taskVerdictRows,
} from '../lib/decision';
import { VerdictRow } from './VerdictRow';

interface DecisionViewProps {
  /** Opens the shared model detail modal for a model id (App wires this to `setSelectedId`). */
  onSelectModel: (id: string) => void;
}

/**
 * The Decide view: a task-based recommender plus the selected task's verdict list. The lower
 * list renders only the models with an explicitly recorded viable Task Verdict for the selected
 * task — never a domain-wide fallback — and clicking any row opens the shared detail modal.
 */
export function DecisionView({ onSelectModel }: DecisionViewProps) {
  const tasks = recommendationTasks(reportCard.recommendations);
  const [selectedTask, setSelectedTask] = useState<string | null>(tasks[0] ?? null);

  const recommendation: Recommendation | undefined = reportCard.recommendations.find(
    (entry) => entry.task === selectedTask,
  );
  const metaParts = recommendation ? recommendationMetaParts(recommendation) : [];
  const recommendationMatches =
    recommendation && selectedTask ? recommendationModel(reportCard.models, recommendation) : undefined;
  const rows = selectedTask ? taskVerdictRows(reportCard.models, reportCard.taskVerdicts, selectedTask) : [];
  const legend = taskVerdictLegend(rows);
  const count = selectedTask
    ? `${rows.length} viable ${rows.length === 1 ? 'model' : 'models'} for ${selectedTask}`
    : null;

  return (
    <div className="decision-view">
      <section className="decision-section" aria-labelledby="decision-tasks-heading">
        <h2 className="decision-section__heading" id="decision-tasks-heading">
          Task recommender
        </h2>
        <div className="decision-chips" role="group" aria-label="Tasks">
          {tasks.map((task) => (
            <button
              key={task}
              type="button"
              className="decision-chip"
              aria-pressed={task === selectedTask}
              onClick={() => setSelectedTask(task)}
            >
              {task}
            </button>
          ))}
        </div>

        {recommendation ? (
          <article className="decision-setup" aria-label={`Recommended setup for ${recommendation.task}`}>
            <p className="decision-setup__eyebrow">Recommended setup</p>
            {recommendationMatches ? (
              <button
                type="button"
                className="decision-setup__name"
                onClick={() => onSelectModel(recommendationMatches.id)}
              >
                {recommendationMatches.name}
              </button>
            ) : (
              <span className="decision-setup__name decision-setup__name--plain">{recommendation.model}</span>
            )}
            {metaParts.length > 0 ? <p className="decision-setup__meta">{metaParts.join(' · ')}</p> : null}
            {recommendation.cautions ? (
              <p className="decision-caution">
                <TriangleAlert aria-hidden="true" size={14} />
                {recommendation.cautions}
              </p>
            ) : null}
          </article>
        ) : (
          <p className="decision-setup__empty">No recommendation recorded yet.</p>
        )}
      </section>

      <section className="decision-section" aria-labelledby="decision-verdicts-heading">
        <header className="decision-section__header">
          <h2 className="decision-section__heading" id="decision-verdicts-heading">
            Current verdicts
          </h2>
          {count ? <p className="decision-section__count">{count}</p> : null}
        </header>
        {legend.length > 0 ? (
          <ul className="decision-legend" aria-label="Verdict status legend">
            {legend.map(({ status, label }) => (
              <li key={status} className={`decision-status decision-status--${statusTone(status)}`}>
                <span className="decision-status__dot" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        ) : null}
        {rows.length > 0 ? (
          <ul className="decision-list" key={selectedTask}>
            {rows.map((row, index) => (
              <VerdictRow
                key={row.model.id}
                row={row}
                onSelectModel={onSelectModel}
                style={{ '--stagger-index': index } as React.CSSProperties}
              />
            ))}
          </ul>
        ) : (
          <p className="decision-list__empty">
            {selectedTask
              ? `No viable models recorded for ${selectedTask} yet.`
              : 'No task verdicts recorded yet.'}
          </p>
        )}
      </section>
    </div>
  );
}
