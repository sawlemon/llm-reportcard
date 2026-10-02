import { useMemo, useState } from 'react';
import reportCard from 'virtual:report-card';
import { cardColor } from '../lib/redesign';
import { CostChip } from './CostChip';
import {
  formatRate,
  formatTokens,
  perMillionRows,
  shortDate,
  sortUsageRows,
  usageRows,
  usageTotals,
  type UsageSort,
} from '../lib/tokenUsage';

interface TokensViewProps {
  /** Opens the dossier for a model id (App wires this to `setSelectedId`). */
  onSelectModel: (id: string) => void;
}

const SORTS: Array<{ value: UsageSort; label: string }> = [
  { value: 'tokens', label: 'By tokens' },
  { value: 'cost', label: 'By est. cost' },
];

const UNCARDED_COLOR = '#ffe14d';

/**
 * The token-burn leaderboard: one row per model in the Zcode usage export, priced from
 * `model-prices.json`, under a tilted sticker with the totals. Bars are scaled to the largest
 * billed volume; the toggle re-ranks by indicative dollar cost.
 */
export function TokensView({ onSelectModel }: TokensViewProps) {
  const [sort, setSort] = useState<UsageSort>('tokens');

  const rows = useMemo(() => usageRows(reportCard.models), []);
  const totals = useMemo(() => usageTotals(rows), [rows]);
  const sorted = useMemo(() => sortUsageRows(rows, sort), [rows, sort]);
  const fairRows = useMemo(() => perMillionRows(reportCard.models), []);
  const maxBilled = Math.max(...rows.map((row) => row.usage.billedTokens), 1);

  return (
    <div className="view">
      <h1 className="hero-title">
        Token <mark>burn</mark>. <span className="scribble">last 30 days in Zcode</span>
      </h1>

      {rows.length > 0 ? (
        <div className="tokens-pot">
          <p className="tokens-sticker">
            <b>{formatTokens(totals.billedTokens)}</b> tokens
            <small>
              {shortDate(totals.from)} – {shortDate(totals.to)}
            </small>
          </p>
          <div className="tokens-pot__chip">
            <CostChip cost={totals.cost} size="lg" />
            <span className="tokens-pot__label">the pot, at list prices</span>
          </div>
        </div>
      ) : null}

      <div className="tokens-sort" role="group" aria-label="Sort the leaderboard">
        {SORTS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="filter"
            aria-pressed={sort === option.value}
            onClick={() => setSort(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <p className="tokens-empty">No token logs yet.</p>
      ) : (
        <>
          <ol className="tokens-board">
            {sorted.map((row, index) => {
              const width = Math.max((row.usage.billedTokens / maxBilled) * 100, 2);
              const color = row.model ? cardColor(row.model) : UNCARDED_COLOR;
              return (
                <li key={row.key} className="tokens-row">
                  <span className="tokens-rank" aria-hidden="true">
                    {index + 1}
                  </span>
                  {row.model ? (
                    <button
                      type="button"
                      className="tokens-name"
                      onClick={() => onSelectModel(row.model!.id)}
                    >
                      {row.name}
                    </button>
                  ) : (
                    <span className="tokens-name tokens-name--uncarded">
                      {row.name}
                      <small>not on the report card yet</small>
                    </span>
                  )}
                  <span className="fuel" aria-hidden="true">
                    <span
                      className="fuel__fill"
                      style={{ '--c': color, '--w': `${width}%` } as React.CSSProperties}
                    />
                  </span>
                  <span className="tokens-figures">
                    <b className="tokens-value">{formatTokens(row.usage.billedTokens)}</b>
                    <CostChip cost={row.usage.cost} />
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="tokens-note">
            est. cost at list prices, cached tokens at cache rates — subscriptions make it cheaper
          </p>

          <section className="fair" aria-labelledby="fair-title">
            <h2 id="fair-title" className="section-title">
              1M in + 1M out <span className="hand">a level playing field</span>
            </h2>
            <ol className="fair-board">
              {fairRows.map((row, index) => (
                <li
                  key={row.key}
                  className={`fair-row${row.effectivePair === null ? ' fair-row--list' : ''}`}
                >
                  <span className="tokens-rank" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="fair-id">
                    {row.model ? (
                      <button
                        type="button"
                        className="tokens-name"
                        onClick={() => onSelectModel(row.model!.id)}
                      >
                        {row.name}
                      </button>
                    ) : (
                      <span className="tokens-name tokens-name--uncarded">{row.name}</span>
                    )}
                    <small className="fair-sub">
                      {row.cacheHitRate !== null
                        ? `${Math.round(row.cacheHitRate * 100)}% from cache`
                        : 'list price · not used yet'}
                    </small>
                  </span>
                  <span className="fair-rates">
                    <span className="fair-pill">
                      in {formatRate(row.effectiveInput ?? row.listInput)}
                      {row.effectiveInput !== null && (
                        <span className="fair-list">
                          <span className="visually-hidden">list price </span>
                          <s>{formatRate(row.listInput)}</s>
                        </span>
                      )}
                    </span>
                    <span className="fair-pill">out {formatRate(row.listOutput)}</span>
                  </span>
                  <CostChip cost={row.effectivePair ?? row.listPair} precise />
                </li>
              ))}
            </ol>
            <p className="tokens-note">
              in = what your input really cost after caching · out is never cached
            </p>
          </section>
        </>
      )}
    </div>
  );
}
