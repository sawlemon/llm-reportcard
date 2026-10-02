import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import reportCard from 'virtual:report-card';
import {
  chipTier,
  formatCost,
  formatRate,
  formatTokens,
  perMillionRows,
  sortUsageRows,
  usageRows,
  usageTotals,
} from '../lib/tokenUsage';
import { TokensView } from './TokensView';

const rows = usageRows(reportCard.models);
const tokensOrder = sortUsageRows(rows, 'tokens');
const costOrder = sortUsageRows(rows, 'cost');
const fairRows = perMillionRows(reportCard.models);

function board(): HTMLElement {
  return document.querySelector('.tokens-board')!;
}

function fair(): HTMLElement {
  return document.querySelector('.fair')!;
}

function rowNames(): string[] {
  return within(board())
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.tokens-name')!.firstChild!.textContent!);
}

describe('TokensView', () => {
  it('lists one ranked row per logged model in billed-token order', () => {
    render(<TokensView onSelectModel={vi.fn()} />);

    expect(rows.length).toBeGreaterThan(0);
    expect(rowNames()).toEqual(tokensOrder.map((row) => row.name));
    const ranks = within(board())
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
    await user.click(within(board()).getByRole('button', { name: target.name }));
    expect(onSelectModel).toHaveBeenCalledWith(target.model!.id);
  });

  it('shows logged models missing from the report card as plain labels, not buttons', () => {
    render(<TokensView onSelectModel={vi.fn()} />);
    const buttons = within(board()).getAllByRole('button');
    expect(buttons).toHaveLength(rows.filter((row) => row.model).length);
    expect(board().querySelectorAll('.tokens-name--uncarded')).toHaveLength(
      rows.filter((row) => !row.model).length,
    );
  });

  it('renders tokens, a denomination-coloured cost chip and a max-scaled bar on the top row', () => {
    render(<TokensView onSelectModel={vi.fn()} />);

    const top = tokensOrder[0];
    const firstRow = within(board()).getAllByRole('listitem')[0];
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

describe('the fair board', () => {
  it('shows the section heading, one ranked row per priced model in perMillionRows order', () => {
    render(<TokensView onSelectModel={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 2, name: /1M in \+ 1M out/ })).toBeInTheDocument();
    const names = within(fair())
      .getAllByRole('listitem')
      .map((item) => item.querySelector('.tokens-name')!.firstChild!.textContent!);
    expect(names).toEqual(fairRows.map((row) => row.name));
    const ranks = within(fair())
      .getAllByText(/^\d+$/, { selector: '.tokens-rank' })
      .map((rank) => Number(rank.textContent));
    expect(ranks).toEqual(fairRows.map((_, index) => index + 1));
  });

  it('shows the first row’s pair as a precise chip value', () => {
    render(<TokensView onSelectModel={vi.fn()} />);

    const first = within(fair()).getAllByRole('listitem')[0];
    const chip = first.querySelector('.chip')!;
    expect(chip).toHaveTextContent(formatRate(fairRows[0].effectivePair ?? fairRows[0].listPair));
    expect(chip.querySelector('.chip__value')!.textContent).toBe(
      formatRate(fairRows[0].effectivePair ?? fairRows[0].listPair),
    );
  });

  it('marks used rows with their cache share and a struck-through list input price', () => {
    render(<TokensView onSelectModel={vi.fn()} />);

    const index = fairRows.findIndex((row) => row.effectiveInput !== null);
    expect(index).toBeGreaterThan(-1);
    const row = fairRows[index];
    const item = within(fair()).getAllByRole('listitem')[index];
    expect(item).toHaveTextContent(`${Math.round(row.cacheHitRate! * 100)}% from cache`);
    expect(item.querySelector('.fair-pill s')!.textContent).toBe(formatRate(row.listInput));
    expect(item).not.toHaveClass('fair-row--list');
  });

  it('shows unused carded models at list prices, dimmed', () => {
    render(<TokensView onSelectModel={vi.fn()} />);

    const index = fairRows.findIndex((row) => row.effectivePair === null && row.model);
    expect(index).toBeGreaterThan(-1);
    const item = within(fair()).getAllByRole('listitem')[index];
    expect(item).toHaveTextContent('not used yet');
    expect(item).toHaveClass('fair-row--list');
    expect(item.querySelector('.fair-pill s')).toBeNull();
  });

  it('opens the dossier when a carded name in the fair board is clicked', async () => {
    const user = userEvent.setup();
    const onSelectModel = vi.fn();
    render(<TokensView onSelectModel={onSelectModel} />);

    const target = fairRows.find((row) => row.model)!;
    await user.click(within(fair()).getByRole('button', { name: target.name }));
    expect(onSelectModel).toHaveBeenCalledWith(target.model!.id);
  });

  it('never shows call counts', () => {
    render(<TokensView onSelectModel={vi.fn()} />);
    expect(document.body).not.toHaveTextContent(/\bcalls\b/);
  });
});
