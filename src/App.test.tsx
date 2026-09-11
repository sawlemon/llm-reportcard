import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import reportCard from 'virtual:report-card';
import App from './App';
import type { ModelEntry } from './data/types';
import { EMPTY_FILTERS, filterModels, type Filters } from './lib/filterModels';
import { codingVerdictModels } from './lib/decision';

const { models, providers, harnesses } = reportCard;

function cardLabel(model: ModelEntry): string {
  return `${model.name} by ${model.provider}, ${model.prosCount} strengths and ${model.consCount} weaknesses noted`;
}

function cardFor(model: ModelEntry) {
  return screen.getByRole('button', { name: cardLabel(model) });
}

function matching(entries: ModelEntry[], filters: Partial<Filters>): ModelEntry[] {
  return filterModels(entries, { ...EMPTY_FILTERS, ...filters });
}

function setHash(hash: string) {
  window.history.replaceState(null, '', hash ? `/#${hash}` : '/');
}

const narrowestProvider = providers.reduce((a, b) => (b.models.length < a.models.length ? b : a));
const noteWord = (() => {
  const names = models.flatMap((model) => [model.name.toLowerCase(), model.provider.toLowerCase()]);
  const words = new Set(
    models
      .flatMap((model) => model.aspects.flatMap((entry) => [...entry.pros, ...entry.cons]))
      .flatMap((note) => note.toLowerCase().match(/[a-z]{6,}/g) ?? []),
  );
  return Array.from(words).find((word) => !names.some((name) => name.includes(word))) ?? null;
})();
const modelAspect =
  reportCard.aspects.find((aspect) => {
    const covered = matching(models, { aspect });
    return covered.length > 0 && covered.length < models.length;
  }) ?? reportCard.aspects[0];
const harnessAspect =
  reportCard.harnessAspects.find((aspect) => {
    const covered = matching(harnesses, { aspect });
    return covered.length > 0 && covered.length < harnesses.length;
  }) ?? reportCard.harnessAspects[0];

beforeEach(() => {
  setHash('');
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => setHash(''));

describe('dashboard navigation', () => {
  it('starts on Decide and shows all provider reports once Models is selected', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('tab', { name: 'Decide' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Models' }));
    expect(screen.getByRole('tab', { name: 'Models' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'All models' })).toHaveAttribute('aria-pressed', 'true');
    for (const provider of providers) {
      expect(screen.getByRole('button', { name: provider.name })).toBeInTheDocument();
      for (const model of provider.models) expect(cardFor(model)).toBeInTheDocument();
    }
  });

  it('filters models from the provider index and restores the selection after tab switching', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('tab', { name: 'Models' }));
    await user.click(screen.getByRole('button', { name: narrowestProvider.name }));
    expect(
      screen.getByRole('heading', { name: new RegExp(narrowestProvider.name, 'i') }),
    ).toBeInTheDocument();
    for (const model of narrowestProvider.models) expect(cardFor(model)).toBeInTheDocument();
    for (const model of models) {
      if (model.providerId !== narrowestProvider.id)
        expect(screen.queryByRole('button', { name: cardLabel(model) })).not.toBeInTheDocument();
    }

    await user.click(screen.getByRole('tab', { name: 'Harnesses' }));
    await user.click(screen.getByRole('tab', { name: 'Models' }));
    expect(screen.getByRole('button', { name: narrowestProvider.name })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('switches to Harnesses and uses its separate aspect vocabulary', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('tab', { name: 'Harnesses' }));
    expect(screen.getByRole('tab', { name: 'Harnesses' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Harness reports' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveTextContent(harnessAspect);
    for (const harness of harnesses) expect(cardFor(harness)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox'), harnessAspect);
    const expected = matching(harnesses, { aspect: harnessAspect });
    expect(screen.getByRole('status')).toHaveTextContent(
      `${expected.length} ${expected.length === 1 ? 'harness' : 'harnesses'}`,
    );
  });

  it('keeps search and model aspect filtering', async () => {
    const user = userEvent.setup();
    expect(noteWord).not.toBeNull();
    render(<App />);

    await user.click(screen.getByRole('tab', { name: 'Models' }));
    await user.type(screen.getByRole('searchbox'), noteWord as string);
    const expectedSearch = matching(models, { query: noteWord as string });
    for (const model of expectedSearch) expect(cardFor(model)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    await user.selectOptions(screen.getByRole('combobox'), modelAspect);
    const expectedAspect = matching(models, { aspect: modelAspect });
    for (const model of expectedAspect) expect(cardFor(model)).toBeInTheDocument();
  });
});

describe('access and deep links', () => {
  it('opens and closes the provider drawer with focus restoration', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('tab', { name: 'Models' }));
    const trigger = screen.getByRole('button', { name: 'Open provider menu' });
    await user.click(trigger);
    const drawer = screen.getByRole('dialog', { name: 'Provider navigation' });
    expect(within(drawer).getByRole('button', { name: 'Close provider menu' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Provider navigation' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('opens a model dialog from a card and preserves its fragment', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('tab', { name: 'Models' }));
    await user.click(cardFor(models[0]));
    expect(window.location.hash).toBe(`#${encodeURIComponent(models[0].id)}`);
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { name: models[0].name }),
    ).toBeInTheDocument();
  });

  it('opens a harness fragment in the Harnesses view', () => {
    const target = harnesses[0];
    setHash(target.id);
    render(<App />);

    expect(screen.getByRole('tab', { name: 'Harnesses' })).toHaveAttribute('aria-selected', 'true');
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { name: target.name }),
    ).toBeInTheDocument();
  });

  it('toggles and persists the selected theme', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('llm-report-card-theme')).toBe('dark');
  });
});

describe('decide view', () => {
  it('is the default view and hides the models UI chrome', () => {
    render(<App />);

    expect(screen.getByRole('tab', { name: 'Decide' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Task recommender' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Current verdicts' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.queryByRole('tab', { name: 'Voice-to-text' })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All models' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open provider menu' })).not.toBeInTheDocument();
  });

  it('opens a model dialog from a verdict row and returns to Decide when it closes', async () => {
    const user = userEvent.setup();
    const target = codingVerdictModels(models)[0];
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rowName = new RegExp(`${escape(target.name)}\\s+${escape(target.provider)}`);
    render(<App />);

    await user.click(
      within(screen.getByRole('region', { name: 'Current verdicts' })).getByRole('button', {
        name: rowName,
      }),
    );
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { name: target.name }),
    ).toBeInTheDocument();

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Decide' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Current verdicts' })).toBeInTheDocument();
  });
});
