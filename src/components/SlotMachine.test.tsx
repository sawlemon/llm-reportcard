import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import reportCard from 'virtual:report-card';
import { recommendationTasks, taskVerdictRows } from '../lib/decision';
import { SlotMachine } from './SlotMachine';

/** DecisionView-style tests: expectations derive from the live document, never hardcoded. */
const tasks = recommendationTasks(reportCard.recommendations);

function recommendationFor(task: string) {
  const recommendation = reportCard.recommendations.find((entry) => entry.task === task);
  expect(recommendation).toBeDefined();
  return recommendation!;
}

function benchRowsFor(task: string) {
  const recommended = recommendationFor(task).model;
  return taskVerdictRows(reportCard.models, reportCard.taskVerdicts, task).filter(
    (row) => row.model.name !== recommended,
  );
}

/** The text of the final (landing) cell of the reel whose mono label is `label`. */
function finalCellOf(label: string): string {
  const labelElement = screen.getByText(label, { selector: '.reel__label', exact: true });
  const reel = labelElement.closest('.reel');
  if (!reel) throw new Error(`no reel labelled ${label}`);
  const cells = reel.querySelectorAll('.reel__cell');
  const last = cells[cells.length - 1];
  return last?.textContent ?? '';
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SlotMachine', () => {
  it('renders one chip per recommendation task with the first selected', () => {
    render(<SlotMachine onSelectModel={vi.fn()} />);

    for (const task of tasks) {
      expect(screen.getByRole('button', { name: task })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: tasks[0] })).toHaveAttribute('aria-pressed', 'true');
    for (const task of tasks.slice(1)) {
      expect(screen.getByRole('button', { name: task })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('lands the reels on the selected task’s recommendation and reveals its cautions', () => {
    // Fake timers + userEvent hang in this environment, so the click is fired directly and
    // the reveal timeout is advanced inside act().
    vi.useFakeTimers();
    const onSelectModel = vi.fn();
    render(<SlotMachine onSelectModel={onSelectModel} />);

    const task = tasks[1];
    const recommendation = recommendationFor(task);
    fireEvent.click(screen.getByRole('button', { name: task }));
    expect(screen.getByRole('button', { name: task })).toHaveAttribute('aria-pressed', 'true');

    // Final cells show the recommendation immediately (they are in the DOM during the spin).
    expect(finalCellOf('Model')).toBe(recommendation.model);
    expect(finalCellOf('Harness')).toBe(recommendation.harness || '—');
    expect(finalCellOf('Effort')).toBe(recommendation.effort || '—');
    expect(finalCellOf('Role')).toBe(recommendation.role || '—');
    expect(screen.getByText('spinning…')).toBeInTheDocument();

    // The recommended model's name in the model reel opens its dossier.
    const resolved = reportCard.models.find((model) => model.name === recommendation.model);
    expect(resolved).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: recommendation.model }));
    expect(onSelectModel).toHaveBeenCalledWith(resolved!.id);

    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(screen.getByText(recommendation.cautions || 'No cautions recorded.')).toBeInTheDocument();
    expect(screen.queryByText('spinning…')).not.toBeInTheDocument();
  });

  it('shows “—” on reels whose recommendation fields are blank', () => {
    vi.useFakeTimers();
    render(<SlotMachine onSelectModel={vi.fn()} />);

    const blank = reportCard.recommendations.find(
      (entry) => !entry.harness.trim() && !entry.effort.trim() && !entry.role.trim(),
    );
    expect(blank).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: blank!.task }));

    expect(finalCellOf('Model')).toBe(blank!.model);
    expect(finalCellOf('Harness')).toBe('—');
    expect(finalCellOf('Effort')).toBe('—');
    expect(finalCellOf('Role')).toBe('—');
  });

  it('lists exactly taskVerdictRows minus the recommended model as sticky notes', () => {
    const { container } = render(<SlotMachine onSelectModel={vi.fn()} />);

    const expected = benchRowsFor(tasks[0]);
    expect(expected.length).toBeGreaterThan(0);
    const stickies = Array.from(container.querySelectorAll('button.sticky'));
    expect(stickies).toHaveLength(expected.length);
    expect(stickies.map((sticky) => sticky.querySelector('h4')?.textContent)).toEqual(
      expected.map((row) => row.model.name),
    );
    for (const [index, row] of expected.entries()) {
      expect(stickies[index]).toHaveTextContent(row.verdict.summary);
    }
    expect(
      screen.getByText(`${expected.length} option${expected.length === 1 ? '' : 's'}`),
    ).toBeInTheDocument();
  });

  it('opens the dossier for a sticky note’s model', async () => {
    const user = userEvent.setup();
    const onSelectModel = vi.fn();
    const { container } = render(<SlotMachine onSelectModel={onSelectModel} />);

    const target = benchRowsFor(tasks[0])[0].model;
    const sticky = Array.from(container.querySelectorAll('button.sticky')).find(
      (element) => element.querySelector('h4')?.textContent === target.name,
    );
    expect(sticky).toBeDefined();
    await user.click(sticky!);
    expect(onSelectModel).toHaveBeenCalledWith(target.id);
  });

  it('hides the whole bench section when a task has no alternatives', async () => {
    const user = userEvent.setup();
    render(<SlotMachine onSelectModel={vi.fn()} />);

    const emptyTask = tasks.find((task) => benchRowsFor(task).length === 0);
    expect(emptyTask).toBeDefined();
    await user.click(screen.getByRole('button', { name: emptyTask! }));
    expect(screen.queryByText('Also good for this')).not.toBeInTheDocument();
  });

  it('shows the recommended model’s bench alternative', () => {
    render(<SlotMachine onSelectModel={vi.fn()} />);

    const expected = benchRowsFor(tasks[0]);
    expect(screen.getByText('Also good for this')).toBeInTheDocument();
    for (const row of expected) {
      expect(screen.getByText(row.verdict.summary)).toBeInTheDocument();
    }
  });

  it('picks a different task than the current one when the lever is pulled', async () => {
    const user = userEvent.setup();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<SlotMachine onSelectModel={vi.fn()} />);

    expect(screen.getByRole('button', { name: tasks[0] })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Surprise me: spin a random task' }));

    const others = tasks.filter((task) => task !== tasks[0]);
    const expected = others[Math.floor(0 * others.length)];
    expect(screen.getByRole('button', { name: expected })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: tasks[0] })).toHaveAttribute('aria-pressed', 'false');
    randomSpy.mockRestore();
  });

  it('uses the same handler for the mobile Surprise chip', async () => {
    const user = userEvent.setup();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<SlotMachine onSelectModel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Surprise me' }));
    const others = tasks.filter((task) => task !== tasks[0]);
    expect(screen.getByRole('button', { name: others[0] })).toHaveAttribute('aria-pressed', 'true');
    randomSpy.mockRestore();
  });
});
