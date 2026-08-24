import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fixtureModel } from '../data/__fixtures__/fixtureCard';
import { ModelCard } from './ModelCard';

describe('ModelCard', () => {
  const prime = fixtureModel('Acme Prime 2');
  const mini = fixtureModel('Acme Mini');

  it('announces the model, its provider and its tallies', () => {
    render(<ModelCard model={prime} highlightAspect={null} onSelect={() => {}} />);

    expect(
      screen.getByRole('button', {
        name: 'Acme Prime 2 by Acme Labs, 7 strengths and 5 weaknesses noted',
      }),
    ).toBeInTheDocument();
  });

  it('shows independent pro and con highlights from Other by default', () => {
    render(<ModelCard model={prime} highlightAspect={null} onSelect={() => {}} />);

    const card = screen.getByRole('button');
    expect(screen.getAllByText('Other')).toHaveLength(2);
    expect(card).toHaveTextContent('favourite for refactors');
    expect(card).toHaveTextContent('early impression only');
  });

  it('uses the filtered aspect and renders inline code', () => {
    render(<ModelCard model={prime} highlightAspect="Coding" onSelect={() => {}} />);

    const card = screen.getByRole('button');
    expect(screen.getAllByText('Coding')).toHaveLength(1);
    expect(card).toHaveTextContent('patches parseReportCard.ts without breaking callers');
    expect(card.querySelector('code')).toHaveTextContent('parseReportCard.ts');
  });

  it('falls back independently when the filtered aspect only has a con', () => {
    render(<ModelCard model={prime} highlightAspect="Cost / efficiency" onSelect={() => {}} />);

    const card = screen.getByRole('button');
    expect(card).toHaveTextContent('token-hungry on long agent runs');
    expect(card).toHaveTextContent('plans multi-step tasks well');
  });

  it('shows one-sided empty states when no matching observations exist', () => {
    render(<ModelCard model={mini} highlightAspect={null} onSelect={() => {}} />);

    expect(screen.getByText('No strength recorded yet.')).toBeInTheDocument();
    expect(screen.getByText('No weakness recorded yet.')).toBeInTheDocument();
  });

  it('reports its model id when activated', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ModelCard model={prime} highlightAspect={null} onSelect={onSelect} />);

    await user.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('acme-labs--acme-prime-2');
  });
});
