import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import reportCard from 'virtual:report-card';
import { fixtureModel } from '../data/__fixtures__/fixtureCard';
import { formatTokens, modelUsage } from '../lib/tokenUsage';
import { Dossier } from './Dossier';

const prime = fixtureModel('Acme Prime 2');
const mini = fixtureModel('Acme Mini');

describe('Dossier', () => {
  it('renders a modal dialog named for the model with its provider as subtitle', () => {
    render(<Dossier model={prime} onClose={() => {}} />);

    const dialog = screen.getByRole('dialog', { name: 'Acme Prime 2' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('heading', { name: 'Acme Prime 2' })).toBeInTheDocument();
    expect(within(dialog).getByText('Acme Labs')).toBeInTheDocument();
    expect(screen.getByText(/Model file #\d{2}/)).toBeInTheDocument();
  });

  it('renders one aspect row per noted aspect with pros, cons and “nothing noted” gaps', () => {
    render(<Dossier model={prime} onClose={() => {}} />);

    const dialog = screen.getByRole('dialog');
    const rows = within(dialog).getAllByText(/.*/, { selector: '.aspect-row h3' });
    const noted = prime.aspects.filter((entry) => entry.pros.length > 0 || entry.cons.length > 0);
    expect(rows.map((row) => row.textContent)).toEqual(
      noted.map((entry) => expect.stringContaining(entry.aspect)),
    );

    // The Coding aspect has pros but no cons → its cons list shows "nothing noted".
    const codingRow = rows.find((row) => row.textContent?.includes('Coding'))!.closest('.aspect-row')!;
    expect(within(codingRow as HTMLElement).getAllByText('nothing noted')).toHaveLength(1);
    const codingPro = within(codingRow as HTMLElement).getAllByRole('listitem')[0];
    expect(codingPro).toHaveTextContent('patches parseReportCard.ts without breaking callers');
    expect(codingPro.querySelector('code')).toHaveTextContent('parseReportCard.ts');
  });

  it('renders a backticked run inside a note as code', () => {
    render(<Dossier model={prime} onClose={() => {}} />);

    const item = screen.getByText(/renders.*inside a table cell correctly/);
    expect(item.querySelector('code')).toHaveTextContent('a | b');
  });

  it('replaces the body with a message when nothing is recorded at all', () => {
    render(<Dossier model={mini} onClose={() => {}} />);

    expect(screen.getByText('No observations recorded for this model yet.')).toBeInTheDocument();
    expect(screen.queryByText('nothing noted')).not.toBeInTheDocument();
  });

  it('stamps the verdict and shows the summary and date in the subtitle', () => {
    const verdicted = reportCard.models.find((model) => model.verdict)!;
    expect(verdicted).toBeDefined();
    render(<Dossier model={verdicted} onClose={() => {}} />);

    expect(screen.getByRole('dialog', { name: verdicted.name })).toBeInTheDocument();
    expect(
      screen.getByText(`${verdicted.verdict!.summary} — ${verdicted.verdict!.date}`),
    ).toBeInTheDocument();
    expect(screen.getByText(/Preferred|Use with care|Avoid/)).toBeInTheDocument();
  });

  it('labels a harness as a Harness file', () => {
    render(<Dossier model={reportCard.harnesses[0]} onClose={() => {}} />);

    expect(screen.getByText('Harness file')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: reportCard.harnesses[0].name })).toBeInTheDocument();
  });

  it('shows a mono token-usage line under the subtitle of logged models', () => {
    const logged = reportCard.models.find((model) => modelUsage(model) !== null);
    expect(logged).toBeDefined();
    render(<Dossier model={logged!} onClose={() => {}} />);

    const usage = modelUsage(logged!)!;
    const line = screen.getByText(/30 days in Zcode/, { selector: '.folder__usage' });
    expect(line).toHaveTextContent(`${formatTokens(usage.billedTokens)} tokens · 30 days in Zcode`);
    expect(line).not.toHaveTextContent(/calls/);
    expect(line.querySelector('.chip')).not.toBeNull();
  });

  it('shows no token-usage line for a harness or an unlogged model', () => {
    const unlogged = reportCard.models.find((model) => modelUsage(model) === null);
    expect(unlogged).toBeDefined();
    const { unmount } = render(<Dossier model={unlogged!} onClose={() => {}} />);
    expect(document.querySelector('.folder__usage')).toBeNull();
    unmount();

    render(<Dossier model={reportCard.harnesses[0]} onClose={() => {}} />);
    expect(document.querySelector('.folder__usage')).toBeNull();
  });

  it('focuses Close on open, traps Tab, closes on Escape and restores focus', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    const { rerender } = render(<Dossier model={prime} onClose={onClose} />);

    const close = screen.getByRole('button', { name: 'Close' });
    const copy = screen.getByRole('button', { name: 'Copy link to this model' });
    expect(close).toHaveFocus();

    await user.tab();
    expect(copy).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(copy).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    // Focus restores when the dossier actually leaves the tree (App clears the hash).
    rerender(<div />);
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('closes on backdrop mousedown', () => {
    const onClose = vi.fn();
    const { container } = render(<Dossier model={prime} onClose={onClose} />);

    fireEvent.mouseDown(container.querySelector('.dossier-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('copies a deep link to the clipboard and announces it', async () => {
    // userEvent installs its own clipboard stub during setup(); the mock must be applied
    // after that to win.
    const user = userEvent.setup();
    const writeText = vi.fn<(text: string) => Promise<void>>();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<Dossier model={prime} onClose={() => {}} />);

    const copy = screen.getByRole('button', { name: 'Copy link to this model' });
    await user.click(copy);

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}${window.location.pathname}#${encodeURIComponent(prime.id)}`,
    );
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument();
    expect(screen.getByText('Link copied to clipboard')).toBeInTheDocument();
  });
});
