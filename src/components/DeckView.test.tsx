import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import reportCard from 'virtual:report-card';
import type { ModelEntry } from '../data/types';
import { EMPTY_FILTERS, filterModels } from '../lib/filterModels';
import { isAsrEntry } from '../lib/redesign';
import { DeckView } from './DeckView';

const { models } = reportCard;
const codingModels = models.filter((model) => !isAsrEntry(model));
const asrModels = models.filter((model) => isAsrEntry(model));

function flipButton(name: string) {
  return screen.getByRole('button', { name: `Flip ${name} card` });
}

function backFaceOf(cardName: string): HTMLElement {
  const card = flipButton(cardName).closest('.card');
  if (!card) throw new Error(`no card for ${cardName}`);
  const back = card.querySelector('.face--back');
  if (!back) throw new Error(`no back face for ${cardName}`);
  return back as HTMLElement;
}

/** A long word that appears in some note but in no model or provider name (old-test helper). */
const noteWord = (() => {
  const names = models.flatMap((model) => [model.name.toLowerCase(), model.provider.toLowerCase()]);
  const words = new Set(
    models
      .flatMap((model) => model.aspects.flatMap((entry) => [...entry.pros, ...entry.cons]))
      .flatMap((note) => note.toLowerCase().match(/[a-z]{6,}/g) ?? []),
  );
  return Array.from(words).find((word) => !names.some((name) => name.includes(word))) ?? null;
})();

/** The deck's own match rule, applied independently: filterModels plus verdict summaries. */
function expectedMatches(query: string): ModelEntry[] {
  const needle = query.trim().toLowerCase();
  const base = new Set(filterModels(models, { ...EMPTY_FILTERS, query }).map((model) => model.id));
  return models.filter(
    (model) => base.has(model.id) || (model.verdict?.summary ?? '').toLowerCase().includes(needle),
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DeckView', () => {
  it('shows a card for every non-ASR model and never for ASR models', () => {
    render(<DeckView onSelectModel={vi.fn()} />);

    expect(codingModels.length).toBeGreaterThan(0);
    for (const model of codingModels) expect(flipButton(model.name)).toBeInTheDocument();
    for (const model of asrModels) {
      expect(screen.queryByRole('button', { name: `Flip ${model.name} card` })).not.toBeInTheDocument();
    }
    // Shelves exclude the ASR provider but keep every other provider with matches.
    const shelfNames = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    for (const name of shelfNames) expect(name).not.toMatch(/ASR/);
  });

  it('narrows by search across names, notes and verdict summaries', async () => {
    const user = userEvent.setup();
    render(<DeckView onSelectModel={vi.fn()} />);

    expect(noteWord).not.toBeNull();
    await user.type(screen.getByRole('textbox', { name: 'Search models' }), noteWord!);

    const expected = expectedMatches(noteWord!);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(codingModels.length);
    for (const model of codingModels) {
      if (expected.some((entry) => entry.id === model.id)) {
        expect(flipButton(model.name)).toBeInTheDocument();
      } else {
        expect(screen.queryByRole('button', { name: `Flip ${model.name} card` })).not.toBeInTheDocument();
      }
    }
  });

  it('filters cards by verdict status', async () => {
    const user = userEvent.setup();
    render(<DeckView onSelectModel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Preferred' }));
    expect(screen.getByRole('button', { name: 'Preferred' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');

    const preferred = codingModels.filter((model) => model.verdict?.status === 'preferred');
    expect(preferred.length).toBeGreaterThan(0);
    for (const model of codingModels) {
      if (model.verdict?.status === 'preferred') expect(flipButton(model.name)).toBeInTheDocument();
      else expect(screen.queryByRole('button', { name: `Flip ${model.name} card` })).not.toBeInTheDocument();
    }
  });

  it('shows the empty state with a working reset', async () => {
    const user = userEvent.setup();
    render(<DeckView onSelectModel={vi.fn()} />);

    await user.type(screen.getByRole('textbox', { name: 'Search models' }), 'zzzqqqxyz');
    expect(screen.getByText('No cards match. Try another search ✏️')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: `Flip ${codingModels[0].name} card` }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(flipButton(codingModels[0].name)).toBeInTheDocument();
    expect(screen.queryByText('No cards match. Try another search ✏️')).not.toBeInTheDocument();
  });

  it('flips via aria-pressed and keeps the back face unreachable until flipped', async () => {
    const user = userEvent.setup();
    const onSelectModel = vi.fn();
    render(<DeckView onSelectModel={onSelectModel} />);

    const target = codingModels[0];
    const flip = flipButton(target.name);
    expect(flip).toHaveAttribute('aria-pressed', 'false');

    const back = backFaceOf(target.name);
    expect(back).toHaveAttribute('inert');
    expect(back).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button', { name: 'Open dossier →' })).not.toBeInTheDocument();

    await user.click(flip);
    expect(flip).toHaveAttribute('aria-pressed', 'true');
    expect(back).not.toHaveAttribute('inert');
    expect(back).toHaveAttribute('aria-hidden', 'false');

    const dossierButton = screen.getByRole('button', { name: 'Open dossier →' });
    await user.click(dossierButton);
    expect(onSelectModel).toHaveBeenCalledWith(target.id);

    // Flipping back hides the back face again.
    await user.click(flip);
    expect(flip).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Open dossier →' })).not.toBeInTheDocument();
  });

  it('deals a random card via the dealRef bridge, clearing filters', () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const dealRef: { current: (() => void) | null } = { current: null };
    render(<DeckView onSelectModel={vi.fn()} dealRef={dealRef} />);
    expect(dealRef.current).toBeTypeOf('function');

    // Math.random() = 0 picks the first non-ASR model.
    const target = codingModels[0];
    act(() => {
      dealRef.current?.();
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(flipButton(target.name)).toHaveAttribute('aria-pressed', 'true');
    randomSpy.mockRestore();
  });
});
