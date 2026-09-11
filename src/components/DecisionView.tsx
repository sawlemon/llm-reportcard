import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import reportCard from 'virtual:report-card';
import type { Recommendation } from '../data/types';
import {
  codingVerdictModels,
  isVoiceToTextModel,
  recommendationMetaParts,
  recommendationModel,
  recommendationTasks,
  statusLegend,
  statusTone,
  voiceToTextModels,
} from '../lib/decision';
import { VerdictRow } from './VerdictRow';

interface DecisionViewProps {
  /** Opens the shared model detail modal for a model id (App wires this to `setSelectedId`). */
  onSelectModel: (id: string) => void;
}

/**
 * The Decide view: a task-based recommender and the current verdicts, scoped to the selected
 * task's domain (speech-to-text when the recommendation points at an ASR model, coding otherwise).
 * Clicking any model opens the shared detail modal.
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
  // Domain of the selected task: speech-to-text when the recommendation resolves to an ASR
  // model, coding otherwise (including when the recommendation has no matching model entry).
  const speechDomain = recommendationMatches ? isVoiceToTextModel(recommendationMatches) : false;
  const verdicts = speechDomain
    ? voiceToTextModels(reportCard.models)
    : codingVerdictModels(reportCard.models);
  const verdictCount = `${verdicts.length} ${speechDomain ? 'speech-to-text models' : 'coding models'}`;

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
          <p className="decision-section__count">{verdictCount}</p>
        </header>
        <ul className="decision-legend" aria-label="Verdict status legend">
          {statusLegend().map(({ status, label }) => (
            <li key={status} className={`decision-status decision-status--${statusTone(status)}`}>
              <span className="decision-status__dot" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
        <ul className="decision-list">
          {verdicts.map((model) => (
            <VerdictRow key={model.id} model={model} onSelectModel={onSelectModel} />
          ))}
        </ul>
      </section>
    </div>
  );
}
