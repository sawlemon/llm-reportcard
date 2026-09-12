import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ReportCard } from '../data/types';
import { DecisionView } from './DecisionView';

/**
 * DecisionView reads the real document through `virtual:report-card`, where every task has
 * recorded rows. This file mocks the module with a card whose first task has none, so the
 * empty state and the no-fallback rule (never all coding or all ASR models) can be asserted
 * exactly, independently of the live document's daily churn.
 */
const fakeCard = vi.hoisted((): ReportCard => ({
  title: 'Mock Report Card',
  providers: [],
  models: [
    {
      id: 'acme-labs--acme-prime-2',
      name: 'Acme Prime 2',
      provider: 'Acme Labs',
      providerId: 'acme-labs',
      aspects: [],
      coveredAspects: [],
      prosCount: 2,
      consCount: 0,
      verdict: { status: 'preferred', date: '2026-09-01', summary: 'general coding verdict' },
    },
    {
      id: 'globex--globex-echo-0-6b',
      name: 'Globex Echo 0.6B',
      provider: 'Globex (Speech-to-Text / ASR)',
      providerId: 'globex-speech-to-text-asr',
      aspects: [],
      coveredAspects: [],
      prosCount: 1,
      consCount: 0,
      verdict: { status: 'care', date: '2026-08-10', summary: 'general asr verdict' },
    },
  ],
  aspects: [],
  harnesses: [],
  harnessAspects: [],
  recommendations: [
    {
      task: 'Debugging',
      model: 'Acme Prime 2',
      harness: 'Zcode',
      effort: 'medium',
      role: 'implementer',
      cautions: '',
    },
    {
      task: 'Research',
      model: 'Globex Echo 0.6B',
      harness: '',
      effort: '',
      role: '',
      cautions: '',
    },
  ],
  taskVerdicts: [
    {
      task: 'Research',
      model: 'Globex Echo 0.6B',
      status: 'care',
      date: '2026-09-02',
      summary: 'task-specific research verdict',
    },
  ],
}));

vi.mock('virtual:report-card', () => ({ default: fakeCard }));

describe('DecisionView with a task that has no verdict rows', () => {
  it('renders the empty state instead of falling back to domain-wide model lists', () => {
    render(<DecisionView onSelectModel={vi.fn()} />);

    const verdicts = within(screen.getByRole('region', { name: 'Current verdicts' }));
    expect(verdicts.getByText('No viable models recorded for Debugging yet.')).toBeInTheDocument();
    expect(verdicts.getByText('0 viable models for Debugging')).toBeInTheDocument();
    expect(verdicts.queryByRole('list')).not.toBeInTheDocument();
    expect(verdicts.queryAllByRole('button')).toHaveLength(0);
    // Neither the coding model nor the ASR model leaks in, despite both carrying verdicts.
    expect(verdicts.queryByText(/Acme Prime 2/)).not.toBeInTheDocument();
    expect(verdicts.queryByText(/Globex Echo 0.6B/)).not.toBeInTheDocument();
  });

  it('renders a single recorded row with singular count wording and a one-status legend', async () => {
    const user = userEvent.setup();
    render(<DecisionView onSelectModel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Research' }));

    const verdicts = within(screen.getByRole('region', { name: 'Current verdicts' }));
    expect(verdicts.getByText('1 viable model for Research')).toBeInTheDocument();
    const legend = verdicts.getByRole('list', { name: 'Verdict status legend' });
    expect(legend).toHaveTextContent('Use with care');
    expect(legend).not.toHaveTextContent('Preferred');
    const row = verdicts.getByRole('button', { name: /Globex Echo 0\.6B/ });
    expect(row).toHaveTextContent('task-specific research verdict');
    expect(row).not.toHaveTextContent('general asr verdict');
  });
});
