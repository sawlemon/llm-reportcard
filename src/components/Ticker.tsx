import reportCard from 'virtual:report-card';
import type { ModelEntry, Verdict, VerdictStatus } from '../data/types';
import { SHORT_STATUS_LABELS } from '../lib/redesign';

/** Dot color per verdict status (mockup ticker map). */
const DOT_COLORS: Record<VerdictStatus, string> = {
  preferred: 'var(--good)',
  care: 'var(--care)',
  avoid: 'var(--bad)',
};

interface TickerItem {
  name: string;
  status: VerdictStatus;
}

/** The latest 8 verdicted models, newest first (mockup ticker selection). */
function latestVerdicts(): TickerItem[] {
  const dated = reportCard.models.filter((model): model is ModelEntry & { verdict: Verdict } => {
    return model.verdict !== undefined;
  });
  return dated
    .sort((a, b) => b.verdict.date.localeCompare(a.verdict.date))
    .slice(0, 8)
    .map((model) => ({ name: model.name, status: model.verdict.status }));
}

function TickerEntry({ item }: { item: TickerItem }) {
  return (
    <span className="ticker__item">
      <span className="ticker__dot" style={{ background: DOT_COLORS[item.status] }} aria-hidden="true" />
      <b>{item.name}</b> {SHORT_STATUS_LABELS[item.status].toLowerCase()}
    </span>
  );
}

/**
 * The news-ticker strip under the header: the latest 8 verdicts, newest first, as
 * "● Name status" items. The item list is rendered twice so the CSS loop
 * (`translateX(-50%)`) is seamless; the duplicate copy is wrapped in an aria-hidden
 * `display: contents` span so it scrolls identically but is invisible to assistive tech.
 * Hovering pauses the scroll (CSS).
 */
export function Ticker() {
  const items = latestVerdicts();

  return (
    <div className="ticker" aria-label="Latest verdicts">
      <div className="ticker__track">
        {items.map((item) => (
          <TickerEntry key={item.name} item={item} />
        ))}
        <span aria-hidden="true" style={{ display: 'contents' }}>
          {items.map((item) => (
            <TickerEntry key={`echo-${item.name}`} item={item} />
          ))}
        </span>
      </div>
    </div>
  );
}
