import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import reportCard from 'virtual:report-card';
import type { ModelEntry } from '../data/types';
import { isAsrEntry } from '../lib/redesign';
import { formatTokens, modelUsage } from '../lib/tokenUsage';
import { VersusView } from './VersusView';

const codingModels = reportCard.models.filter((model) => !isAsrEntry(model));

/** The view's default pairing: first two preferred models, falling back to first two models. */
function defaultPair(): [ModelEntry, ModelEntry] {
  const preferred = codingModels.filter((model) => model.verdict?.status === 'preferred');
  if (preferred.length >= 2) return [preferred[0], preferred[1]];
  return [codingModels[0], codingModels[1]];
}

function hasNotes(model: ModelEntry, aspect: string): boolean {
  return model.aspects.some(
    (entry) => entry.aspect === aspect && (entry.pros.length > 0 || entry.cons.length > 0),
  );
}

function expectedAspects(left: ModelEntry, right: ModelEntry): string[] {
  return reportCard.aspects.filter((aspect) => hasNotes(left, aspect) || hasNotes(right, aspect));
}

function table() {
  return screen
    .getByRole('combobox', { name: 'Left model' })
    .closest('.view')!
    .querySelector('.vs-table') as HTMLElement;
}

/** Aspect headers render "icon aspect"; strip the leading icon token for comparison. */
function aspectHeaderNames(): string[] {
  return within(table())
    .getAllByText(/.*/, { selector: '.vs-aspect' })
    .map((element) => element.textContent!.trim().replace(/^\S+\s+/, ''));
}

function rowFor(aspect: string): HTMLElement {
  const escaped = aspect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return screen.getByRole('button', { name: new RegExp(escaped) });
}

/** The tokens row is the second static row, right after the Verdict row. */
function tokensRow(): HTMLElement {
  return table().querySelectorAll('.vs-row')[1] as HTMLElement;
}

/** The per-side text of the tokens row, computed independently from the lib. */
function usageCellText(model: ModelEntry): string {
  const usage = modelUsage(model);
  if (!usage) return 'no data';
  return `${formatTokens(usage.billedTokens)} · ${usage.calls.toLocaleString('en-US')} calls`;
}

describe('VersusView', () => {
  it('defaults to the first two preferred models', () => {
    render(<VersusView />);
    const [left, right] = defaultPair();

    expect(screen.getByRole('combobox', { name: 'Left model' })).toHaveValue(left.id);
    expect(screen.getByRole('combobox', { name: 'Right model' })).toHaveValue(right.id);
  });

  it('shows a verdict row plus exactly the aspects where either side has notes', () => {
    render(<VersusView />);
    const [left, right] = defaultPair();

    const headers = aspectHeaderNames();
    expect(headers[0]).toContain('Verdict');
    expect(headers[1]).toContain('Tokens (30d)');
    expect(headers.slice(2)).toEqual(expectedAspects(left, right));
    expect(headers.length).toBeGreaterThan(2);
  });

  it('shows a non-expandable tokens row with per-side usage or "no data"', () => {
    render(<VersusView />);
    const [left, right] = defaultPair();

    const row = tokensRow();
    expect(row).not.toHaveAttribute('aria-expanded');
    const cells = row.querySelectorAll('.vs-cell');
    expect(cells[0]).toHaveTextContent(usageCellText(left));
    expect(cells[1]).toHaveTextContent(usageCellText(right));
  });

  it('falls back to "no data" on a side without a usage log', async () => {
    const user = userEvent.setup();
    render(<VersusView />);

    const silent = codingModels.find((model) => modelUsage(model) === null);
    expect(silent).toBeDefined();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Left model' }), silent!.id);

    const cells = tokensRow().querySelectorAll('.vs-cell');
    expect(cells[0]).toHaveTextContent('no data');
  });

  it('updates the rows when a select changes', async () => {
    const user = userEvent.setup();
    render(<VersusView />);
    const [, right] = defaultPair();

    const replacement = codingModels.find(
      (model) => model.id !== right.id && model.verdict?.status === 'preferred',
    );
    expect(replacement).toBeDefined();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Left model' }), replacement!.id);

    expect(screen.getByRole('combobox', { name: 'Left model' })).toHaveValue(replacement!.id);
    expect(aspectHeaderNames().slice(2)).toEqual(expectedAspects(replacement!, right));
  });

  it('reveals the first note of a side when its row is expanded', async () => {
    const user = userEvent.setup();
    render(<VersusView />);
    const [left, right] = defaultPair();

    // An aspect the left side actually noted (rows list aspects noted on either side).
    const noted = left.aspects.find(
      (entry) =>
        (entry.pros.length > 0 || entry.cons.length > 0) &&
        expectedAspects(left, right).includes(entry.aspect),
    );
    expect(noted).toBeDefined();
    const firstNote = noted!.pros[0] ?? noted!.cons[0];
    expect(firstNote).toBeDefined();

    const row = rowFor(noted!.aspect);
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(row).not.toHaveTextContent(firstNote!);

    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(row).toHaveTextContent(firstNote!);
  });

  it('lists the ✓/✗ pill counts per side', () => {
    render(<VersusView />);
    const [left, right] = defaultPair();

    const noted = left.aspects.find(
      (entry) =>
        (entry.pros.length > 0 || entry.cons.length > 0) &&
        expectedAspects(left, right).includes(entry.aspect),
    );
    expect(noted).toBeDefined();
    const row = rowFor(noted!.aspect);
    expect(row).toHaveTextContent(`✓ ${noted!.pros.length}`);
    expect(row).toHaveTextContent(`✗ ${noted!.cons.length}`);
  });

  it('shows "no notes" for a side without observations', async () => {
    const user = userEvent.setup();
    render(<VersusView />);
    const [, right] = defaultPair();

    const replacement = codingModels.find((model) => model.id !== right.id);
    expect(replacement).toBeDefined();
    const silentAspect = expectedAspects(replacement!, right).find(
      (aspect) => !hasNotes(replacement!, aspect) && hasNotes(right, aspect),
    );
    expect(silentAspect).toBeDefined();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Left model' }), replacement!.id);
    const row = rowFor(silentAspect!);
    expect(within(row).getAllByText('no notes')).toHaveLength(1);
  });
});
