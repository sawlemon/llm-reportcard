import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import reportCard from 'virtual:report-card';
import { chipTier, formatCost, formatTokens, sortUsageRows, usageRows, usageTotals } from '../lib/tokenUsage';
import { TokensView } from './TokensView';

const rows = usageRows(reportCard.models);
const tokensOrder = sortUsageRows(rows, 'tokens');
const costOrder = sortUsageRows(rows, 'cost');

function rowNames(): string[] {
  return within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.tokens-name')!.firstChild!.textContent!);
}

describe('TokensView', () => {
  it('lists one ranked row per logged model in billed-token order', () => {
    render(<TokensView onSelectModel={vi.fn()} />);

    expect(rows.length).toBeGreaterThan(0);
    expect(rowNames()).toEqual(tokensOrder.map((row) => row.name));
    const ranks = within(screen.getByRole('list'))
      .getAllByText(/^\d+$/, { selector: '.tokens-rank' })
      .map((rank) => Number(rank.textContent));
    expect(ranks).toEqual(tokensOrder.map((_, index) => index + 1));
  });

  it('shows the token total, the pot chip with the total cost, and no call counts', () => {
    render(<TokensView onSelectModel={vi.fn()} />);
    const totals = usageTotals(rows);

    expect(
      screen.getByText(formatTokens(totals.billedTokens), { selector: '.tokens-sticker b' }),
    ).toBeInTheDocument();
    expect(document.querySelector('.tokens-pot .chip--lg')).toHaveTextContent(formatCost(totals.cost));
    expect(document.querySelector('.view')).not.toHaveTextContent(/\bcalls\b/);
  });

  it('reorders by estimated cost when the toggle is pressed, and back', async () => {
    const user = userEvent.setup();
    render(<TokensView onSelectModel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'By est. cost' }));
    expect(screen.getByRole('button', { name: 'By est. cost' })).toHaveAttribute('aria-pressed', 'true');
    expect(rowNames()).toEqual(costOrder.map((row) => row.name));
    const costs = rows.flatMap((row) => (row.usage.cost === null ? [] : [row.usage.cost]));
    expect(costOrder[0].usage.cost).toBe(Math.max(...costs));

    await user.click(screen.getByRole('button', { name: 'By tokens' }));
    expect(rowNames()).toEqual(tokensOrder.map((row) => row.name));
  });

  it('opens the dossier for a model on the report card', async () => {
    const user = userEvent.setup();
    const onSelectModel = vi.fn();
    render(<TokensView onSelectModel={onSelectModel} />);

    const target = tokensOrder.find((row) => row.model)!;
    await user.click(within(screen.getByRole('list')).getByRole('button', { name: target.name }));
    expect(onSelectModel).toHaveBeenCalledWith(target.model!.id);
  });

  it('shows logged models missing from the report card as plain labels, not buttons', () => {
    render(<TokensView onSelectModel={vi.fn()} />);
    const buttons = within(screen.getByRole('list')).getAllByRole('button');
    expect(buttons).toHaveLength(rows.filter((row) => row.model).length);
    expect(document.querySelectorAll('.tokens-name--uncarded')).toHaveLength(
      rows.filter((row) => !row.model).length,
    );
  });

  it('renders tokens, a denomination-coloured cost chip and a max-scaled bar on the top row', () => {
    render(<TokensView onSelectModel={vi.fn()} />);

    const top = tokensOrder[0];
    const firstRow = screen.getAllByRole('listitem')[0];
    expect(firstRow).toHaveTextContent(formatTokens(top.usage.billedTokens));
    const chip = firstRow.querySelector('.chip')!;
    if (top.usage.cost === null) {
      expect(chip).toHaveTextContent('no price');
    } else {
      expect(chip).toHaveTextContent(formatCost(top.usage.cost));
      expect(chip).toHaveClass(`chip--${chipTier(top.usage.cost)}`);
    }
    const fill = firstRow.querySelector('.fuel__fill') as HTMLElement;
    expect(fill.style.getPropertyValue('--w')).toBe('100%');
  });
});
