import { useEffect, useRef, useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import reportCard from 'virtual:report-card';
import type { ModelEntry } from '../data/types';
import { renderNote } from '../lib/renderNote';
import { ASPECT_ICONS, cardNumber } from '../lib/redesign';
import { Stamp } from './Stamp';

const FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

interface DossierProps {
  /** The model or harness whose file is open. */
  model: ModelEntry;
  onClose: () => void;
}

/**
 * The manila-folder modal replacing the old ModelDetail sheet. It keeps every behaviour of
 * the previous dialog (role/aria-modal, focus close on open, Tab trap, Escape closes,
 * backdrop mousedown closes, focus restore, body scroll lock, copy-link with live region)
 * in the mockup's dossier look: folder tab outside the scroll area, big stamp, handwritten
 * subtitle, and one aspect row per noted aspect.
 */
export function Dossier({ model, onClose }: DossierProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Tracked per entry rather than as a bare boolean so that switching entries in an
  // already-open dossier resets the confirmation without a state-syncing effect.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copied = copiedId === model.id;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${encodeURIComponent(model.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(model.id);
    } catch {
      setCopiedId(null);
    }
  };

  const isHarness = reportCard.harnesses.some((harness) => harness.id === model.id);
  const number = cardNumber(model, [...reportCard.models, ...reportCard.harnesses]);
  const hasNotes = model.prosCount + model.consCount > 0;
  const notedAspects = model.aspects.filter((entry) => entry.pros.length > 0 || entry.cons.length > 0);

  return (
    <div
      className="dossier-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        className="dossier"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dossier-title"
        onKeyDown={onKeyDown}
      >
        <span className="folder__tab">{isHarness ? 'Harness file' : `Model file #${number}`}</span>
        <div className="folder">
          <div className="folder__head">
            <div>
              <h2 id="dossier-title">{model.name}</h2>
              <p>{model.verdict ? `${model.verdict.summary} — ${model.verdict.date}` : model.provider}</p>
            </div>
            <div className="folder__actions">
              <span className="folder__stamp">
                <Stamp status={model.verdict?.status} />
              </span>
              <button
                type="button"
                className={`folder__copy${copied ? ' folder__copy--copied' : ''}`}
                onClick={copyLink}
                aria-label={copied ? 'Link copied' : 'Copy link to this model'}
              >
                {copied ? <Check aria-hidden="true" size={18} /> : <Link2 aria-hidden="true" size={18} />}
              </button>
              <button
                ref={closeRef}
                type="button"
                className="folder__close"
                onClick={onClose}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          <span className="visually-hidden" role="status" aria-live="polite">
            {copied ? 'Link copied to clipboard' : ''}
          </span>

          <div className="folder__body">
            {hasNotes ? (
              notedAspects.map((entry) => (
                <div className="aspect-row" key={entry.aspect}>
                  <h3>
                    {ASPECT_ICONS[entry.aspect] ?? '•'} {entry.aspect}
                  </h3>
                  <ul className="pros">
                    {entry.pros.length > 0 ? (
                      entry.pros.map((note, index) => <li key={index}>{renderNote(note)}</li>)
                    ) : (
                      <li className="none">nothing noted</li>
                    )}
                  </ul>
                  <ul className="cons">
                    {entry.cons.length > 0 ? (
                      entry.cons.map((note, index) => <li key={index}>{renderNote(note)}</li>)
                    ) : (
                      <li className="none">nothing noted</li>
                    )}
                  </ul>
                </div>
              ))
            ) : (
              <p>No observations recorded for this model yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
