import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import reportCard from 'virtual:report-card';
import type { ModelEntry } from '../data/types';
import {
  codingVerdictModels,
  isVoiceToTextModel,
  recommendationModel,
  recommendationTasks,
  voiceToTextModels,
} from '../lib/decision';
import { DecisionView } from './DecisionView';

/**
 * DecisionView reads `virtual:report-card` directly, so expectations are derived from the
 * live data (the same pattern App.test.tsx uses) rather than hardcoded document content.
 */
const tasks = recommendationTasks(reportCard.recommendations);
const verdicts = codingVerdictModels(reportCard.models);
const voiceModels = voiceToTextModels(reportCard.models);
/** The task whose recommendation resolves to a voice-to-text model, if the live data has one. */
const speechTask = tasks.find((task) => {
  const rec = reportCard.recommendations.find((entry) => entry.task === task);
  const model = rec ? recommendationModel(reportCard.models, rec) : undefined;
  return model !== undefined && isVoiceToTextModel(model);
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
function rowPattern(model: ModelEntry): RegExp {
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escape(model.name)}\\s+${escape(model.provider)}(\\s|$)`);
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

  it('orders the verdict list preferred, care, avoid with voice-to-text excluded', () => {
    renderView();

    const rows = section('Current verdicts').getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual(
      verdicts.map((model) => expect.stringContaining(model.name)),
    );

    const statuses = verdicts.map((model) => model.verdict!.status);
    const firstAvoid = statuses.indexOf('avoid');
    expect(firstAvoid).toBeGreaterThanOrEqual(0);
    expect(statuses.slice(0, firstAvoid)).not.toContain('avoid');
  });

  it('keeps Big Pickle in the main verdict list', () => {
    const bigPickle = reportCard.models.find((model) => model.name === 'Big Pickle');
    expect(bigPickle).toBeDefined();
    expect(verdicts.map((model) => model.id)).toContain(bigPickle!.id);
    renderView();

    expect(
      section('Current verdicts').getByRole('button', { name: rowPattern(bigPickle!) }),
    ).toBeInTheDocument();
  });

  it('shows coding verdicts, not ASR models, while a coding task is selected', () => {
    expect(speechTask).toBeDefined();
    expect(verdicts.length).toBeGreaterThan(0);
    expect(voiceModels.length).toBeGreaterThan(0);
    renderView();

    expect(section('Current verdicts').getByText(`${verdicts.length} coding models`)).toBeInTheDocument();
    for (const model of verdicts) {
      expect(
        section('Current verdicts').getByRole('button', { name: rowPattern(model) }),
      ).toBeInTheDocument();
    }
    for (const model of voiceModels) {
      expect(screen.queryByRole('button', { name: rowPattern(model) })).not.toBeInTheDocument();
    }
  });

  it('shows the ASR models, not coding verdicts, when the speech-to-text task is selected', async () => {
    expect(speechTask).toBeDefined();
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole('button', { name: speechTask! }));

    expect(
      section('Current verdicts').getByText(`${voiceModels.length} speech-to-text models`),
    ).toBeInTheDocument();
    for (const model of voiceModels) {
      expect(
        section('Current verdicts').getByRole('button', { name: rowPattern(model) }),
      ).toBeInTheDocument();
    }
    for (const model of verdicts) {
      expect(
        section('Current verdicts').queryByRole('button', { name: rowPattern(model) }),
      ).not.toBeInTheDocument();
    }
  });

  it('shows a legend built from the VERDICT_STATUSES labels', () => {
    renderView();

    const legend = section('Current verdicts').getByRole('list', { name: 'Verdict status legend' });
    expect(legend).toHaveTextContent('Preferred');
    expect(legend).toHaveTextContent('Use with care');
    expect(legend).toHaveTextContent('Avoid');
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

    const target = verdicts[0];
    await user.click(section('Current verdicts').getByRole('button', { name: rowPattern(target) }));
    expect(onSelectModel).toHaveBeenCalledWith(target.id);
  });
});
