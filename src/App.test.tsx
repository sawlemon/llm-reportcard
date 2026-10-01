import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import reportCard from 'virtual:report-card';
import App from './App';
import { isAsrEntry } from './lib/redesign';

const { models, harnesses } = reportCard;

function setHash(hash: string) {
  window.history.replaceState(null, '', hash ? `/#${hash}` : '/');
}

function flipButton(name: string) {
  return screen.getByRole('button', { name: `Flip ${name} card` });
}

beforeEach(() => {
  setHash('');
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => setHash(''));

describe('tabs and navigation', () => {
  it('renders five tabs with Decide selected initially and exact accessible names', () => {
    render(<App />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
      '🎰 Decide',
      '🃏 The Deck',
      '🥊 Versus',
      '🧰 Harness',
      '🎙️ Voice',
    ]);
    for (const name of ['Decide', 'The Deck', 'Versus', 'Harness', 'Voice']) {
      expect(screen.getByRole('tab', { name })).toHaveAccessibleName(name);
    }
    expect(screen.getByRole('tab', { name: 'Decide' })).toHaveAttribute('aria-selected', 'true');
    for (const name of ['The Deck', 'Versus', 'Harness', 'Voice']) {
      expect(screen.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'false');
    }
  });

  it('switches the panel when a tab is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('tab', { name: 'Versus' }));
    expect(screen.getByRole('tab', { name: 'Versus' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('combobox', { name: 'Left model' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'The Deck' }));
    expect(screen.getByRole('textbox', { name: 'Search models' })).toBeInTheDocument();
  });

  it('roves focus and selection with the arrow keys, Home and End', async () => {
    const user = userEvent.setup();
    render(<App />);

    screen.getByRole('tab', { name: 'Decide' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'The Deck' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'The Deck' })).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Voice' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Voice' })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Decide' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Decide' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Voice' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the slot machine on Decide and hides the deck chrome there', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /What are we building today/ })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.queryByRole('textbox', { name: 'Search models' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Surprise me: spin a random task' })).toBeInTheDocument();
  });
});

describe('harness and voice shelves', () => {
  it('lists exactly the harnesses on the Harness view', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('tab', { name: 'Harness' }));
    expect(screen.getByRole('heading', { name: /Harness\s*\.\s*where models live/ })).toBeInTheDocument();
    for (const harness of harnesses) expect(flipButton(harness.name)).toBeInTheDocument();
    for (const model of models)
      expect(screen.queryByRole('button', { name: `Flip ${model.name} card` })).not.toBeInTheDocument();
  });

  it('lists exactly the ASR models on the Voice view', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('tab', { name: 'Voice' }));
    const asrModels = models.filter((model) => isAsrEntry(model));
    const codingModels = models.filter((model) => !isAsrEntry(model));
    expect(asrModels.length).toBeGreaterThan(0);
    for (const model of asrModels) expect(flipButton(model.name)).toBeInTheDocument();
    for (const model of codingModels) {
      expect(screen.queryByRole('button', { name: `Flip ${model.name} card` })).not.toBeInTheDocument();
    }
  });
});

describe('deep links and the dossier', () => {
  it('opens a harness fragment in the Harness view with a Harness file dossier', () => {
    const target = harnesses[0];
    setHash(target.id);
    render(<App />);

    expect(screen.getByRole('tab', { name: 'Harness' })).toHaveAttribute('aria-selected', 'true');
    const dialog = screen.getByRole('dialog', { name: target.name });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Harness file')).toBeInTheDocument();
  });

  it('opens a model fragment in the Deck view with its dossier', () => {
    const target = models.find((model) => !isAsrEntry(model))!;
    setHash(target.id);
    render(<App />);

    expect(screen.getByRole('tab', { name: 'The Deck' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('dialog', { name: target.name })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Model file #\\d{2}`))).toBeInTheDocument();
  });

  it('opens an ASR model fragment in the Voice view with its dossier', () => {
    const target = models.find((model) => isAsrEntry(model))!;
    expect(target).toBeDefined();
    setHash(target.id);
    render(<App />);

    expect(screen.getByRole('tab', { name: 'Voice' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('dialog', { name: target.name })).toBeInTheDocument();
  });

  it('closes the dossier with Escape, clearing the hash', async () => {
    const user = userEvent.setup();
    setHash(models[0].id);
    render(<App />);

    expect(window.location.hash).toBe(`#${encodeURIComponent(models[0].id)}`);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });

  it('opens the dossier from the deck and keeps the fragment while open', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('tab', { name: 'The Deck' }));
    const target = models.find((model) => !isAsrEntry(model))!;
    await user.click(flipButton(target.name));
    const dossierButton = screen.getByRole('button', { name: 'Open dossier →' });
    await user.click(dossierButton);

    expect(screen.getByRole('dialog', { name: target.name })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#${encodeURIComponent(target.id)}`);

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(screen.getByRole('tab', { name: 'The Deck' })).toHaveAttribute('aria-selected', 'true');
  });

  it('clears an unknown hash id', () => {
    setHash('no-such-entry');
    render(<App />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });
});

describe('theme toggle', () => {
  it('flips data-theme and its label, persisting the choice', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(document.documentElement.dataset.theme).toBe('light');
    const toggle = screen.getByRole('button', { name: 'Switch to dark theme' });
    expect(toggle).toHaveTextContent('Chalkboard');

    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toHaveTextContent('Paper');
    expect(window.localStorage.getItem('llm-report-card-theme')).toBe('dark');
  });
});

describe('keyboard shortcuts', () => {
  it('switches views with 1–5', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.keyboard('3');
    expect(screen.getByRole('tab', { name: 'Versus' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('1');
    expect(screen.getByRole('tab', { name: 'Decide' })).toHaveAttribute('aria-selected', 'true');
  });

  it('jumps to the Deck and focuses search with /', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.keyboard('/');
    expect(screen.getByRole('tab', { name: 'The Deck' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'Search models' })).toHaveFocus();
  });

  it('deals the Deck with r and ignores shortcuts while typing or with modifiers', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.keyboard('r');
    expect(screen.getByRole('tab', { name: 'The Deck' })).toHaveAttribute('aria-selected', 'true');

    const search = screen.getByRole('textbox', { name: 'Search models' });
    await user.click(search);
    await user.keyboard('r');
    expect(search).toHaveValue('r');

    await user.keyboard('{Control>}2{/Control}');
    expect(screen.getByRole('tab', { name: 'The Deck' })).toHaveAttribute('aria-selected', 'true');
  });
});
