import { useEffect, useRef, useState } from 'react';
import reportCard from 'virtual:report-card';
import type { ModelEntry } from '../data/types';
import { firstNote, cardColor, cardNumber, isAsrEntry, ASPECT_ICONS } from '../lib/redesign';
import { formatTokens, modelUsage } from '../lib/tokenUsage';
import { Stamp } from './Stamp';

interface TradingCardProps {
  model: ModelEntry;
  /** The aspect vocabulary this collection is judged on (model aspects or harness aspects). */
  aspects: string[];
  /** Stagger index for the deal-in animation (`--i`). */
  index: number;
  /** Opens the dossier for this entry (App wires this to `setSelectedId`). */
  onOpen: (id: string) => void;
  /**
   * Controlled flip state. When omitted (Harness/Voice shelves) the card manages its own
   * flip state; DeckView controls it so "Random card" can flip a card from outside.
   */
  flipped?: boolean;
  onToggleFlipped?: () => void;
}

/**
 * A collector card from the mockup's deck: color-banded front (provider, number, stamp,
 * pro/con meter, aspect icons) and a handwritten back with an "Open dossier" button.
 *
 * The flip is driven by a real button layered above the card. The back face is `inert` and
 * aria-hidden until flipped, which fixes the mockup bug where the hidden back-side buttons
 * stayed in the tab order.
 */
export function TradingCard({ model, aspects, index, onOpen, flipped, onToggleFlipped }: TradingCardProps) {
  const [internalFlipped, setInternalFlipped] = useState(false);
  const isControlled = onToggleFlipped !== undefined;
  const isFlipped = isControlled ? (flipped ?? false) : internalFlipped;
  const backRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const back = backRef.current;
    if (!back) return;
    // Browsers reflect the `inert` property onto the attribute; setting the attribute as
    // well keeps jsdom (which lacks inert support) testable.
    back.inert = !isFlipped;
    if (isFlipped) back.removeAttribute('inert');
    else back.setAttribute('inert', '');
  }, [isFlipped]);

  const toggle = () => {
    if (isControlled) onToggleFlipped();
    else setInternalFlipped((current) => !current);
  };

  const verdict = model.verdict;
  const status = verdict?.status;
  const total = model.prosCount + model.consCount || 1;
  const quote = verdict
    ? verdict.summary
    : (firstNote(model, 'pros') ?? firstNote(model, 'cons') ?? 'No verdict yet.');
  const number = cardNumber(model, [...reportCard.models, ...reportCard.harnesses]);
  const usage = modelUsage(model);

  return (
    <div
      className={`card${isFlipped ? ' is-flipped' : ''}`}
      style={{ '--c': cardColor(model), '--i': index } as React.CSSProperties}
      data-card={model.id}
    >
      <button
        type="button"
        className="card__flip"
        aria-pressed={isFlipped}
        aria-label={`Flip ${model.name} card`}
        onClick={toggle}
      />
      <div className="card__inner" onClick={toggle}>
        <div className="face">
          <div className="face__band">
            <span>{isAsrEntry(model) ? 'NVIDIA · ASR' : model.provider}</span>
            <span>#{number}</span>
          </div>
          <div className="face__body">
            <h3 className="face__name">{model.name}</h3>
            <div className="face__stamprow">
              <span className="face__stamp">
                <Stamp status={status} short />
              </span>
              {usage ? (
                <span className="face__usage">
                  <span aria-hidden="true">🔥 {formatTokens(usage.billedTokens)}</span>
                  <span className="visually-hidden">
                    {formatTokens(usage.billedTokens)} tokens in 30 days
                  </span>
                </span>
              ) : null}
            </div>
            <div className="meter">
              <span>✓{model.prosCount}</span>
              <span className="meter__bar">
                <span
                  className="meter__pro"
                  style={{ width: `${(model.prosCount / total) * 100}%` }}
                  aria-hidden="true"
                />
                <span
                  className="meter__con"
                  style={{ width: `${(model.consCount / total) * 100}%` }}
                  aria-hidden="true"
                />
              </span>
              <span>✗{model.consCount}</span>
            </div>
            <div className="aspects">
              {aspects.map((aspect) => {
                const icon = ASPECT_ICONS[aspect] ?? '•';
                if (!model.coveredAspects.includes(aspect)) {
                  return (
                    <span key={aspect} title={aspect} aria-hidden="true">
                      {icon}
                    </span>
                  );
                }
                return (
                  <span key={aspect} className="on" title={aspect}>
                    <span aria-hidden="true">{icon}</span>
                    <span className="visually-hidden">covers {aspect}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        <div className="face face--back" ref={backRef} aria-hidden={!isFlipped}>
          <p className="face__quote">“{quote}”</p>
          <button
            type="button"
            className="dossier-btn"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(model.id);
            }}
          >
            Open dossier →
          </button>
        </div>
      </div>
    </div>
  );
}
