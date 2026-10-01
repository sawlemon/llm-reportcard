import type { ModelEntry } from '../data/types';
import { TradingCard } from './TradingCard';

interface ShelfViewProps {
  /** The view heading, with its <mark> highlight (e.g. "The <mark>Deck</mark>."). */
  title: React.ReactNode;
  /** The handwritten scribble after the title. */
  scribble: string;
  entries: ModelEntry[];
  /** The aspect vocabulary this collection is judged on. */
  aspects: string[];
  /** Opens the dossier for an entry id (App wires this to `setSelectedId`). */
  onSelectModel: (id: string) => void;
}

/**
 * A plain grid of trading cards under a hero title — used for the Harness shelf
 * ("where models live") and the Voice shelf ("not coding models!").
 */
export function ShelfView({ title, scribble, entries, aspects, onSelectModel }: ShelfViewProps) {
  return (
    <div className="view">
      <h1 className="hero-title">
        {title} <span className="scribble">{scribble}</span>
      </h1>
      <div className="cards">
        {entries.map((entry, index) => (
          <TradingCard key={entry.id} model={entry} aspects={aspects} index={index} onOpen={onSelectModel} />
        ))}
      </div>
    </div>
  );
}
