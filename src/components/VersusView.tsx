import { useState } from 'react';
import reportCard from 'virtual:report-card';
import type { ModelEntry } from '../data/types';
import { renderNote } from '../lib/renderNote';
import { ASPECT_ICONS, cardColor, isAsrEntry } from '../lib/redesign';
import { Stamp } from './Stamp';

const codingModels = reportCard.models.filter((model) => !isAsrEntry(model));

/** Default matchup: the first two preferred models, falling back to the first two models. */
function defaultPair(): [string | undefined, string | undefined] {
  const preferred = codingModels.filter((model) => model.verdict?.status === 'preferred');
  if (preferred.length >= 2) return [preferred[0].id, preferred[1].id];
  return [codingModels[0]?.id, codingModels[1]?.id];
}

function hasNotes(model: ModelEntry | undefined, aspect: string): boolean {
  return (
    model?.aspects.some(
      (entry) => entry.aspect === aspect && (entry.pros.length > 0 || entry.cons.length > 0),
    ) ?? false
  );
}

/** One side of a versus row: ✓n/✗n pills plus (when the row is expanded) the first note. */
function side(model: ModelEntry, aspect: string, open: boolean): React.ReactNode {
  const entry = model.aspects.find((candidate) => candidate.aspect === aspect);
  if (!entry || (entry.pros.length === 0 && entry.cons.length === 0)) {
    return <span className="vs-empty">no notes</span>;
  }
  const note = entry.pros[0] ? ['✓ ', renderNote(entry.pros[0])] : ['✗ ', renderNote(entry.cons[0])];
  return (
    <>
      <span className="vs-pills">
        <b className="p">✓ {entry.pros.length}</b>
        <b className="c">✗ {entry.cons.length}</b>
      </span>
      {open ? <span className="vs-note">{note}</span> : null}
    </>
  );
}

interface AspectRowProps {
  aspect: string;
  left: ModelEntry;
  right: ModelEntry;
}

/** An expandable versus row; remounted (via a table key) whenever the matchup changes. */
function AspectRow({ aspect, left, right }: AspectRowProps) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" className="vs-row vs-row--tap" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className="vs-cell vs-cell--left">{side(left, aspect, open)}</span>
      <span className="vs-aspect">
        {ASPECT_ICONS[aspect] ?? ''} {aspect}
      </span>
      <span className="vs-cell">{side(right, aspect, open)}</span>
    </button>
  );
}

/**
 * Versus: pick two coding models and compare them aspect by aspect. Only aspects where at
 * least one side has notes are listed; each row expands to reveal that side's first note.
 */
export function VersusView() {
  const defaults = defaultPair();
  const [leftId, setLeftId] = useState<string | undefined>(defaults[0]);
  const [rightId, setRightId] = useState<string | undefined>(defaults[1]);

  const left = codingModels.find((model) => model.id === leftId);
  const right = codingModels.find((model) => model.id === rightId);

  return (
    <div className="view">
      <h1 className="hero-title">
        Pick your <mark>fighters</mark>. <span className="scribble">tap a row for notes</span>
      </h1>

      <div className="vs-pickers">
        <select
          className="vs-select"
          aria-label="Left model"
          value={leftId ?? ''}
          onChange={(event) => setLeftId(event.target.value)}
          style={{ '--c': left ? cardColor(left) : undefined } as React.CSSProperties}
        >
          {codingModels.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
        <div className="vs-badge" aria-hidden="true">
          VS
        </div>
        <select
          className="vs-select"
          aria-label="Right model"
          value={rightId ?? ''}
          onChange={(event) => setRightId(event.target.value)}
          style={{ '--c': right ? cardColor(right) : undefined } as React.CSSProperties}
        >
          {codingModels.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </div>

      {left && right ? (
        <div className="vs-table" key={`${leftId}|${rightId}`}>
          <div className="vs-row">
            <div className="vs-cell vs-cell--left">
              <Stamp status={left.verdict?.status} />
            </div>
            <div className="vs-aspect">🏷 Verdict</div>
            <div className="vs-cell">
              <Stamp status={right.verdict?.status} />
            </div>
          </div>
          {reportCard.aspects
            .filter((aspect) => hasNotes(left, aspect) || hasNotes(right, aspect))
            .map((aspect) => (
              <AspectRow key={aspect} aspect={aspect} left={left} right={right} />
            ))}
        </div>
      ) : null}
    </div>
  );
}
