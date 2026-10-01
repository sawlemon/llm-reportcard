import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import reportCard from 'virtual:report-card';
import type { ModelEntry, VerdictStatus } from '../data/types';
import { filterModels } from '../lib/filterModels';
import { confetti } from '../lib/confetti';
import { isAsrEntry, providerColor, REDUCED_MOTION } from '../lib/redesign';
import { TradingCard } from './TradingCard';

interface DeckViewProps {
  /** Opens the dossier for a model id (App wires this to `setSelectedId`). */
  onSelectModel: (id: string) => void;
  /** Attached to the search input so the "/" shortcut can focus it from anywhere. */
  searchRef?: React.RefObject<HTMLInputElement>;
  /** Registered with the deal-a-random-card handler so the "r" shortcut can trigger it. */
  dealRef?: { current: (() => void) | null };
}

type VerdictFilter = 'all' | VerdictStatus;

const FILTERS: Array<{ value: VerdictFilter; emoji: string; label: string }> = [
  { value: 'all', emoji: '', label: 'All' },
  { value: 'preferred', emoji: '✅', label: 'Preferred' },
  { value: 'care', emoji: '⚠️', label: 'Care' },
  { value: 'avoid', emoji: '🚫', label: 'Avoid' },
];

const SHUFFLE_FLIP_DELAY_MS = 500;

/**
 * The Deck: every non-ASR model as a collector card, shelved per provider, with search,
 * verdict filters, and a "Random card" deal. Search matches the model name, provider, and
 * notes (via filterModels) plus the verdict summary, which filterModels does not cover.
 */
export function DeckView({ onSelectModel, searchRef, dealRef }: DeckViewProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<VerdictFilter>('all');
  const [flippedIds, setFlippedIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingFlip, setPendingFlip] = useState<{ id: string; nonce: number } | null>(null);
  const deckRef = useRef<HTMLDivElement>(null);

  const queryMatch = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return {
      needle,
      matchedIds: new Set(
        filterModels(reportCard.models, { query, providerId: null, aspect: null }).map((model) => model.id),
      ),
    };
  }, [query]);

  const matches = useCallback(
    (model: ModelEntry) => {
      if (filter !== 'all' && model.verdict?.status !== filter) return false;
      if (!queryMatch) return true;
      return (
        queryMatch.matchedIds.has(model.id) ||
        (model.verdict?.summary ?? '').toLowerCase().includes(queryMatch.needle)
      );
    },
    [filter, queryMatch],
  );

  const toggleFlipped = (id: string) => {
    setFlippedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetFilters = () => {
    setQuery('');
    setFilter('all');
  };

  const randomCard = useCallback(() => {
    setQuery('');
    setFilter('all');
    const pool = reportCard.models.filter((model) => !isAsrEntry(model));
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setPendingFlip((previous) => ({ id: pick.id, nonce: (previous?.nonce ?? 0) + 1 }));
  }, []);

  // Expose the deal handler for the App-level "r" shortcut (invoked from a keydown
  // handler, never during render).
  useEffect(() => {
    if (!dealRef) return;
    dealRef.current = randomCard;
    return () => {
      dealRef.current = null;
    };
  }, [dealRef, randomCard]);

  // After the filters clear and the deck re-renders, scroll the dealt card into view and
  // flip it, with confetti (mockup shuffle()).
  useEffect(() => {
    if (!pendingFlip) return;
    const card = deckRef.current?.querySelector<HTMLElement>(`[data-card="${pendingFlip.id}"]`);
    if (!card) return;
    if (typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'center' });
    }
    const timer = setTimeout(
      () => {
        setFlippedIds((current) => new Set(current).add(pendingFlip.id));
        const rect = card.getBoundingClientRect();
        confetti(rect.left + rect.width / 2, rect.top + 40, 30);
      },
      REDUCED_MOTION ? 0 : SHUFFLE_FLIP_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [pendingFlip]);

  const shelves = reportCard.providers
    .filter((provider) => !provider.name.includes('ASR'))
    .map((provider) => ({ provider, models: provider.models.filter(matches) }))
    .filter((shelf) => shelf.models.length > 0);
  const staggerIndex = new Map(
    shelves.flatMap((shelf) => shelf.models).map((model, index) => [model.id, index]),
  );

  return (
    <div className="view" ref={deckRef}>
      <h1 className="hero-title">
        The <mark>Deck</mark>. <span className="scribble">collect 'em all</span>
      </h1>

      <div className="controls">
        <label className="search">
          <span aria-hidden="true">🔎</span>
          <span className="visually-hidden">Search models</span>
          <input
            ref={searchRef}
            value={query}
            placeholder="Search models, notes, quirks…"
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd aria-hidden="true">/</kbd>
        </label>
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="filter"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
          >
            {option.emoji ? <span aria-hidden="true">{option.emoji} </span> : null}
            {option.label}
          </button>
        ))}
        <button type="button" className="shuffle" onClick={randomCard}>
          <span aria-hidden="true">🎲 </span>
          Random card <kbd aria-hidden="true">R</kbd>
        </button>
      </div>

      {shelves.length === 0 ? (
        <>
          <p className="vs-empty">No cards match. Try another search ✏️</p>
          <button type="button" className="filter" onClick={resetFilters}>
            Reset
          </button>
        </>
      ) : (
        shelves.map(({ provider, models }) => (
          <section className="shelf" key={provider.id} aria-label={`${provider.name} shelf`}>
            <div className="shelf__head">
              <span
                className="shelf__swatch"
                style={{ '--c': providerColor(provider.name) } as React.CSSProperties}
              />
              <h2 className="shelf__name">{provider.name}</h2>
              <span className="shelf__count">
                {models.length} card{models.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="cards">
              {models.map((model) => (
                <TradingCard
                  key={model.id}
                  model={model}
                  aspects={reportCard.aspects}
                  index={staggerIndex.get(model.id) ?? 0}
                  onOpen={onSelectModel}
                  flipped={flippedIds.has(model.id)}
                  onToggleFlipped={() => toggleFlipped(model.id)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
