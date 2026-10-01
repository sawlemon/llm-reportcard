import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import reportCard from 'virtual:report-card';
import { formatTokens, sortUsageRows, usageRows, zcodeTotals } from '../lib/tokenUsage';
import { TokensView } from './TokensView';

const rows = usageRows(reportCard.models, reportCard.harnesses);
const tokensOrder = sortUsageRows(rows, 'tokens');
const costOrder = sortUsageRows(rows, 'cost');

function leaderboard(): HTMLElement {
  return screen.getByRole('list');
}

function leaderboardNames(): string[] {
  return within(leaderboard())
    .getAllByRole('button')
    .map((button) => button.textContent);
}

describe('TokensView', () => {
  it('lists one ranked row per logged model in billed-token order', () => {
    render(<TokensView onSelectModel={vi.fn()} />);

    expect(rows).toHaveLength(14);
    expect(leaderboardNames()).toEqual(tokensOrder.map((row) => row.model.name));
    expect(tokensOrder[0].model.name).toBe('Claude Sonnet 5');

    const ranks = within(leaderboard())
      .getAllByText(/^\d+$/, { selector: '.tokens-rank' })
      .map((rank) => Number(rank.textContent));
    expect(ranks).toEqual(tokensOrder.map((_, index) => index + 1));
  });

  it('shows the Zcode totals sticker with formatted numbers', () => {
    render(<TokensView onSelectModel={vi.fn()} />);
    const totals = zcodeTotals(reportCard.harnesses);
    expect(totals).not.toBeNull();

    expect(
      screen.getByText(formatTokens(totals!.billedTokens), { selector: '.tokens-sticker b' }),
    ).toBeInTheDocument();
    const sticker = screen.getByText(new RegExp(`${totals!.calls.toLocaleString('en-US')} calls`), {
      selector: '.tokens-sticker',
    });
    expect(sticker).toHaveTextContent(
      `+${formatTokens(totals!.cacheReads!)} cache reads · ${totals!.window}`,
    );
  });

  it('reorders by estimated cost when the toggle is pressed, and back', async () => {
    const user = userEvent.setup();
    render(<TokensView onSelectModel={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'By tokens' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'By est. cost' }));
    expect(screen.getByRole('button', { name: 'By est. cost' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'By tokens' })).toHaveAttribute('aria-pressed', 'false');

    expect(leaderboardNames()).toEqual(costOrder.map((row) => row.model.name));
    const highestCost = Math.max(...rows.filter((row) => row.cost !== undefined).map((row) => row.cost!));
    expect(costOrder[0].cost).toBe(highestCost);

    await user.click(screen.getByRole('button', { name: 'By tokens' }));
    expect(leaderboardNames()).toEqual(tokensOrder.map((row) => row.model.name));
  });

  it('opens the dossier when a model name is clicked', async () => {
    const user = userEvent.setup();
    const onSelectModel = vi.fn();
    render(<TokensView onSelectModel={onSelectModel} />);

    const target = tokensOrder[0];
    await user.click(within(leaderboard()).getByRole('button', { name: target.model.name }));
    expect(onSelectModel).toHaveBeenCalledWith(target.model.id);
  });

  it('renders figures, cost stamp and a max-scaled bar on the top row', () => {
    render(<TokensView onSelectModel={vi.fn()} />);

    const top = tokensOrder[0];
    const firstRow = screen.getAllByRole('listitem')[0];
    expect(firstRow).toHaveTextContent(formatTokens(top.usage.billedTokens));
    expect(firstRow).toHaveTextContent(`${top.usage.calls.toLocaleString('en-US')} calls`);
    if (top.cost !== undefined) {
      expect(firstRow).toHaveTextContent(`~$${top.cost.toLocaleString('en-US')}`);
    } else {
      expect(firstRow.querySelector('.tokens-cost')).toBeNull();
    }

    const fill = firstRow.querySelector('.fuel__fill') as HTMLElement | null;
    expect(fill).not.toBeNull();
    const maxBilled = Math.max(...rows.map((row) => row.usage.billedTokens), 1);
    const expectedWidth = Math.max((top.usage.billedTokens / maxBilled) * 100, 2);
    expect(fill!.style.getPropertyValue('--w')).toBe(`${expectedWidth}%`);
  });

  it('shows the handwriting footnote above the fold of the leaderboard', () => {
    render(<TokensView onSelectModel={vi.fn()} />);
    expect(screen.getByText('est. cost at list prices — subscriptions make it cheaper')).toBeInTheDocument();
  });
});
