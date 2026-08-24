import { Search, X } from 'lucide-react';

interface FilterBarProps {
  aspects: string[];
  query: string;
  aspect: string | null;
  resultCount: number;
  itemLabels: readonly [singular: string, plural: string];
  onQueryChange: (query: string) => void;
  onAspectChange: (aspect: string | null) => void;
  onReset: () => void;
}

export function FilterBar({
  aspects,
  query,
  aspect,
  resultCount,
  itemLabels,
  onQueryChange,
  onAspectChange,
  onReset,
}: FilterBarProps) {
  const isFiltered = Boolean(query || aspect);

  return (
    <div className="filter-bar">
      <div className="search">
        <Search aria-hidden="true" size={16} className="search__icon" />
        <input
          type="search"
          className="search__input"
          value={query}
          placeholder="Search models and observations"
          aria-label="Search models and observations"
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {query ? (
          <button
            type="button"
            className="search__clear"
            aria-label="Clear search"
            onClick={() => onQueryChange('')}
          >
            <X aria-hidden="true" size={14} />
          </button>
        ) : null}
      </div>

      <div className="filter-bar__row">
        <label className="select">
          <span className="visually-hidden">Filter by aspect</span>
          <select value={aspect ?? ''} onChange={(event) => onAspectChange(event.target.value || null)}>
            <option value="">All aspects</option>
            {aspects.map((aspect) => (
              <option key={aspect} value={aspect}>
                {aspect}
              </option>
            ))}
          </select>
        </label>

        <p className="filter-bar__count" role="status" aria-live="polite">
          {resultCount} {resultCount === 1 ? itemLabels[0] : itemLabels[1]}
        </p>

        {isFiltered ? (
          <button type="button" className="text-button" onClick={onReset}>
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}
