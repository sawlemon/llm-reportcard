import { ThumbsDown, ThumbsUp } from 'lucide-react';
import type { ModelEntry } from '../data/types';
import { renderNote } from '../lib/renderNote';

interface ModelCardProps {
  model: ModelEntry;
  highlightAspect: string | null;
  onSelect: (id: string) => void;
}

export function ModelCard({ model, highlightAspect, onSelect }: ModelCardProps) {
  const preferred = highlightAspect
    ? model.aspects.find((entry) => entry.aspect === highlightAspect)
    : model.aspects.find((entry) => entry.aspect === 'Other');
  const proSource = preferred?.pros.length ? preferred : model.aspects.find((entry) => entry.pros.length);
  const conSource = preferred?.cons.length ? preferred : model.aspects.find((entry) => entry.cons.length);
  const pro = proSource?.pros[0] ?? null;
  const con = conSource?.cons[0] ?? null;

  return (
    <button
      type="button"
      className="model-card"
      onClick={() => onSelect(model.id)}
      aria-label={`${model.name} by ${model.provider}, ${model.prosCount} strengths and ${model.consCount} weaknesses noted`}
    >
      <span className="model-card__provider">{model.provider}</span>
      <span className="model-card__name">{model.name}</span>
      <span className="model-card__highlights">
        <span className="model-card__highlight model-card__highlight--pro">
          <ThumbsUp aria-hidden="true" size={14} strokeWidth={2} />
          <span>
            <span className="model-card__note-aspect">{proSource?.aspect ?? 'Strength'}</span>
            <span className="model-card__note">{pro ? renderNote(pro) : 'No strength recorded yet.'}</span>
          </span>
        </span>
        <span className="model-card__highlight model-card__highlight--con">
          <ThumbsDown aria-hidden="true" size={14} strokeWidth={2} />
          <span>
            <span className="model-card__note-aspect">{conSource?.aspect ?? 'Weakness'}</span>
            <span className="model-card__note">{con ? renderNote(con) : 'No weakness recorded yet.'}</span>
          </span>
        </span>
      </span>
      <span className="model-card__tally">
        <span className="tally tally--pro">
          <ThumbsUp aria-hidden="true" size={14} strokeWidth={2} />
          {model.prosCount}
          <span className="visually-hidden"> strengths</span>
        </span>
        <span className="tally tally--con">
          <ThumbsDown aria-hidden="true" size={14} strokeWidth={2} />
          {model.consCount}
          <span className="visually-hidden"> weaknesses</span>
        </span>
      </span>
    </button>
  );
}
