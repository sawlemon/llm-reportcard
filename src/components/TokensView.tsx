import { useMemo, useState } from 'react';
import reportCard from 'virtual:report-card';
import { cardColor } from '../lib/redesign';
import { formatTokens, sortUsageRows, usageRows, zcodeTotals, type UsageSort } from '../lib/tokenUsage';

interface TokensViewProps {
  /** Opens the dossier for a model id (App wires this to `setSelectedId`). */
  onSelectModel: (id: string) => void;
}

const SORTS: Array<{ value: UsageSort; label: string }> = [
  { value: 'tokens', label: 'By tokens' },
  { value: 'cost', label: 'By est. cost' },
];

/** The "small mono line" under the sticker headline: cache reads and/or the log window. */
function stickerDetail(cacheReads: number | null, window: string | null): string | null {
  const parts: string[] = [];
  if (cacheReads !== null) parts.push(`+${formatTokens(cacheReads)} cache reads`);
  if (window !== null) parts.push(window);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * The token-burn leaderboard: one row per model with a "Zcode 30-day usage log" note,
 * under a tilted sticker with the harness totals. Bars are scaled to the largest billed
 * volume; the toggle re-ranks by indicative dollar cost.
 */
export function TokensView({ onSelectModel }: TokensViewProps) {
  const [sort, setSort] = useState<UsageSort>('tokens');

  const rows = useMemo(() => usageRows(reportCard.models, reportCard.harnesses), []);
  const totals = useMemo(() => zcodeTotals(reportCard.harnesses), []);
  const sorted = useMemo(() => sortUsageRows(rows, sort), [rows, sort]);
  const maxBilled = Math.max(...rows.map((row) => row.usage.billedTokens), 1);
  const detail = totals ? stickerDetail(totals.cacheReads, totals.window) : null;

  return (
    <div className="view">
      <h1 className="hero-title">
        Token <mark>burn</mark>. <span className="scribble">last 30 days in Zcode</span>
      </h1>

      {totals ? (
        <p className="tokens-sticker">
          <b>{formatTokens(totals.billedTokens)}</b> tokens · {totals.calls.toLocaleString('en-US')} calls
          {detail ? <small>{detail}</small> : null}
        </p>
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
              return (
                <li key={row.model.id} className="tokens-row">
                  <span className="tokens-rank" aria-hidden="true">
                    {index + 1}
                  </span>
                  <button type="button" className="tokens-name" onClick={() => onSelectModel(row.model.id)}>
                    {row.model.name}
                  </button>
                  <span className="fuel" aria-hidden="true">
                    <span
                      className="fuel__fill"
                      style={{ '--c': cardColor(row.model), '--w': `${width}%` } as React.CSSProperties}
                    />
                  </span>
                  <span className="tokens-figures">
                    <b className="tokens-value">{formatTokens(row.usage.billedTokens)}</b>
                    <span className="tokens-calls">{row.usage.calls.toLocaleString('en-US')} calls</span>
                    {row.cost !== undefined ? (
                      <span className="tokens-cost">~${row.cost.toLocaleString('en-US')}</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="tokens-note">est. cost at list prices — subscriptions make it cheaper</p>
        </>
      )}
    </div>
  );
}
