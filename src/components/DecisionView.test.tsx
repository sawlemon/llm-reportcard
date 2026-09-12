import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import reportCard from 'virtual:report-card';
import { recommendationModel, recommendationTasks, taskVerdictRows } from '../lib/decision';
import { DecisionView } from './DecisionView';

/**
 * DecisionView reads `virtual:report-card` directly, so expectations are derived from the
 * live data (the same pattern App.test.tsx uses) rather than hardcoded document content.
 */
const tasks = recommendationTasks(reportCard.recommendations);
/** The rows the view must render for a task, computed by the same pure helper. */
function rowsFor(task: string) {
  return taskVerdictRows(reportCard.models, reportCard.taskVerdicts, task);
}
/** The task whose recommendation resolves to a voice-to-text model, if the live data has one. */
const speechTask = tasks.find((task) => {
  const rec = reportCard.recommendations.find((entry) => entry.task === task);
  const model = rec ? recommendationModel(reportCard.models, rec) : undefined;
  return model !== undefined && model.provider.toLowerCase().includes('speech-to-text');
});

function renderView() {
  const onSelectModel = vi.fn();
  render(<DecisionView onSelectModel={onSelectModel} />);
  return { onSelectModel };
}

function section(name: 'Task recommender' | 'Current verdicts') {
  return within(screen.getByRole('region', { name }));
}

/** Row accessible names contain extra text, so match on an escaped name + provider pair. */
function rowPattern(name: string, provider: string): RegExp {
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escape(name)}\\s+${escape(provider)}(\\s|$)`);
}

describe('DecisionView', () => {
  it('shows one chip per recommendation task with the first selected', () => {
    renderView();

    for (const task of tasks) {
      expect(screen.getByRole('button', { name: task })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: tasks[0] })).toHaveAttribute('aria-pressed', 'true');
    for (const task of tasks.slice(1)) {
      expect(screen.getByRole('button', { name: task })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('changes the recommended setup when a task chip is selected', async () => {
    const user = userEvent.setup();
    expect(tasks.length).toBeGreaterThan(1);
    renderView();

    const first = reportCard.recommendations[0];
    expect(screen.getByRole('article', { name: `Recommended setup for ${tasks[0]}` })).toHaveTextContent(
      first.model,
    );

    await user.click(screen.getByRole('button', { name: tasks[1] }));
    expect(screen.getByRole('button', { name: tasks[1] })).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.queryByRole('article', { name: `Recommended setup for ${tasks[0]}` }),
    ).not.toBeInTheDocument();
    const second = reportCard.recommendations.find((entry) => entry.task === tasks[1]);
    expect(second).toBeDefined();
    expect(screen.getByRole('article', { name: `Recommended setup for ${tasks[1]}` })).toHaveTextContent(
      second!.model,
    );
  });

  it('renders the harness, effort, role and cautions of the selected recommendation', () => {
    renderView();

    const first = reportCard.recommendations[0];
    const setup = screen.getByRole('article', { name: `Recommended setup for ${tasks[0]}` });
    expect(setup).toHaveTextContent(`Harness: ${first.harness}`);
    expect(setup).toHaveTextContent(`Effort: ${first.effort}`);
    expect(setup).toHaveTextContent(`Role: ${first.role}`);
    if (first.cautions) expect(setup).toHaveTextContent(first.cautions);
  });

  it('omits blank meta fields, rendering no meta line when all three are blank', async () => {
    const user = userEvent.setup();
    const blank = reportCard.recommendations.find(
      (entry) => !entry.harness.trim() && !entry.effort.trim() && !entry.role.trim(),
    );
    expect(blank).toBeDefined();
    renderView();

    await user.click(screen.getByRole('button', { name: blank!.task }));
    const setup = screen.getByRole('article', { name: `Recommended setup for ${blank!.task}` });
    expect(setup).toHaveTextContent(blank!.model);
    if (blank!.cautions) expect(setup).toHaveTextContent(blank!.cautions);
    expect(setup).not.toHaveTextContent('Harness:');
    expect(setup).not.toHaveTextContent('Effort:');
    expect(setup).not.toHaveTextContent('Role:');
    expect(setup.querySelector('.decision-setup__meta')).toBeNull();
  });

  it(
    'renders only the non-blank meta fields for partially blank recommendations',
    {
      skip: !reportCard.recommendations.some(
        (entry) => !entry.harness.trim() && Boolean(entry.effort.trim()) && Boolean(entry.role.trim()),
      ),
    },
    async () => {
      const user = userEvent.setup();
      const partial = reportCard.recommendations.find(
        (entry) => !entry.harness.trim() && Boolean(entry.effort.trim()) && Boolean(entry.role.trim()),
      );
      renderView();

      await user.click(screen.getByRole('button', { name: partial!.task }));
      const setup = screen.getByRole('article', { name: `Recommended setup for ${partial!.task}` });
      expect(setup).not.toHaveTextContent('Harness:');
      expect(setup).toHaveTextContent(`Effort: ${partial!.effort}`);
      expect(setup).toHaveTextContent(`Role: ${partial!.role}`);
    },
  );

  it('renders exactly the selected task’s viable rows, preferred before care, with task-specific copy', () => {
    renderView();

    const expected = rowsFor(tasks[0]);
    expect(expected.length).toBeGreaterThan(0);
    const verdicts = section('Current verdicts');
    const rowButtons = verdicts.getAllByRole('button');
    expect(rowButtons).toHaveLength(expected.length);
    expect(rowButtons.map((row) => row.textContent)).toEqual(
      expected.map((row) => expect.stringContaining(row.model.name)),
    );

    const statuses = expected.map((row) => row.verdict.status);
    expect(statuses).toContain('preferred');
    const firstCare = statuses.indexOf('care');
    if (firstCare !== -1) expect(statuses.slice(firstCare)).not.toContain('preferred');

    // Row copy comes from the task verdict, not the model's general verdict.
    for (const row of expected) {
      expect(
        verdicts.getByRole('button', { name: rowPattern(row.model.name, row.model.provider) }),
      ).toHaveTextContent(row.verdict.summary);
      expect(
        verdicts.getByRole('button', { name: rowPattern(row.model.name, row.model.provider) }),
      ).toHaveTextContent(`updated ${row.verdict.date}`);
    }
  });

  it('shows a task-specific count', () => {
    renderView();

    const expected = rowsFor(tasks[0]);
    expect(expected.length).toBeGreaterThan(1);
    expect(
      section('Current verdicts').getByText(`${expected.length} viable models for ${tasks[0]}`),
    ).toBeInTheDocument();
  });

  it('swaps the verdict list when another task is selected, dropping models without evidence', async () => {
    const user = userEvent.setup();
    renderView();

    const first = rowsFor(tasks[0]);
    const second = rowsFor(tasks[1]);
    expect(second.length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: tasks[1] }));
    const verdicts = section('Current verdicts');

    const secondRows = verdicts.getAllByRole('button');
    expect(secondRows).toHaveLength(second.length);
    for (const row of second) {
      expect(
        verdicts.getByRole('button', { name: rowPattern(row.model.name, row.model.provider) }),
      ).toHaveTextContent(row.verdict.summary);
    }
    for (const row of first) {
      if (!second.some((entry) => entry.model.id === row.model.id)) {
        expect(
          verdicts.queryByRole('button', { name: rowPattern(row.model.name, row.model.provider) }),
        ).not.toBeInTheDocument();
      }
    }
  });

  it('shows only the recorded speech-to-text rows for the speech task, never a coding fallback', async () => {
    expect(speechTask).toBeDefined();
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole('button', { name: speechTask! }));
    const verdicts = section('Current verdicts');

    const expected = rowsFor(speechTask!);
    expect(expected.length).toBeGreaterThan(0);
    expect(verdicts.getAllByRole('button')).toHaveLength(expected.length);
    for (const row of expected) {
      expect(
        verdicts.getByRole('button', { name: rowPattern(row.model.name, row.model.provider) }),
      ).toBeInTheDocument();
    }
    for (const model of reportCard.models) {
      if (!expected.some((row) => row.model.id === model.id)) {
        expect(
          verdicts.queryByRole('button', { name: rowPattern(model.name, model.provider) }),
        ).not.toBeInTheDocument();
      }
    }
  });

  it('shows a legend limited to the statuses the task list actually uses', () => {
    renderView();

    const showsCare = rowsFor(tasks[0]).some((row) => row.verdict.status === 'care');
    const legend = section('Current verdicts').getByRole('list', { name: 'Verdict status legend' });
    expect(legend).toHaveTextContent('Preferred');
    if (showsCare) expect(legend).toHaveTextContent('Use with care');
    expect(legend).not.toHaveTextContent('Avoid');
  });

  it('opens the recommended model when its name is clicked', async () => {
    const user = userEvent.setup();
    const { onSelectModel } = renderView();

    const first = reportCard.recommendations[0];
    const expected = reportCard.models.find((model) => model.name === first.model);
    expect(expected).toBeDefined();

    await user.click(screen.getByRole('button', { name: expected!.name }));
    expect(onSelectModel).toHaveBeenCalledWith(expected!.id);
  });

  it('opens the model detail when a verdict row is clicked', async () => {
    const user = userEvent.setup();
    const { onSelectModel } = renderView();

    const target = rowsFor(tasks[0])[0].model;
    await user.click(
      section('Current verdicts').getByRole('button', { name: rowPattern(target.name, target.provider) }),
    );
    expect(onSelectModel).toHaveBeenCalledWith(target.id);
  });
});
