import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import reportCard from 'virtual:report-card';
import type { Recommendation } from '../data/types';
import { recommendationModel, recommendationTasks, taskVerdictRows } from '../lib/decision';
import { confetti } from '../lib/confetti';
import { REDUCED_MOTION as reducedMotion, taskEmoji } from '../lib/redesign';
import { Stamp } from './Stamp';

interface SlotMachineProps {
  /** Opens the dossier for a model id (App wires this to `setSelectedId`). */
  onSelectModel: (id: string) => void;
}

/** Reel geometry: 14 random filler cells plus the final cell, each 112px tall. */
const FILLER_COUNT = 14;
const CELL_HEIGHT = 112;
/** The mockup's payout reveal delay: the slowest (4th) reel's transition duration. */
const SPIN_TOTAL_MS = 1100 + 3 * 350;
const LEVER_RESET_MS = 420;

interface ReelSpec {
  /** Reel id → BEM modifier (`reel--model`) and pool key. */
  id: 'model' | 'harness' | 'effort' | 'role';
  label: string;
  pool: string[];
  /** The {@link Recommendation} field this reel lands on. */
  field: keyof Pick<Recommendation, 'model' | 'harness' | 'effort' | 'role'>;
}

const codingModels = reportCard.models.filter((model) => !model.provider.includes('ASR'));
const REEL_SPECS: ReelSpec[] = [
  {
    id: 'model',
    label: 'Model',
    pool: codingModels.map((model) => model.name),
    field: 'model',
  },
  {
    id: 'harness',
    label: 'Harness',
    pool: [...reportCard.harnesses.map((harness) => harness.name), 'Antigravity'],
    field: 'harness',
  },
  { id: 'effort', label: 'Effort', pool: ['low', 'medium', 'high', 'max'], field: 'effort' },
  {
    id: 'role',
    label: 'Role',
    pool: ['planner', 'implementer', 'explorer', 'writer', 'reviewer'],
    field: 'role',
  },
];

type Timer = ReturnType<typeof setTimeout>;

function clearTimer(ref: { current: Timer | null }) {
  if (ref.current !== null) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

/** 14 random filler values from the reel's pool, then the recommendation's value (or "—"). */
function makeCells(task: string | null): string[][] {
  return REEL_SPECS.map((spec) => {
    const recommendation = reportCard.recommendations.find((entry) => entry.task === task);
    const cells: string[] = [];
    for (let i = 0; i < FILLER_COUNT; i++) {
      cells.push(spec.pool[Math.floor(Math.random() * spec.pool.length)]);
    }
    cells.push((recommendation && recommendation[spec.field]) || '—');
    return cells;
  });
}

interface ReelProps {
  spec: ReelSpec;
  /** Duration of the landing transition in ms (0 under reduced motion). */
  durationMs: number;
  cells: string[];
  finalCell: React.ReactNode;
  /** Ref target for the model reel (used to place the payout confetti). */
  reelRef?: React.Ref<HTMLDivElement>;
}

function Reel({ spec, durationMs, cells, finalCell, reelRef }: ReelProps) {
  const stripRef = useRef<HTMLDivElement>(null);

  // Same trick as the mockup's fillReel(): render the strip at translateY(0) with the
  // transition disabled, force a reflow so the reset is committed, then re-enable the
  // transition and set the landing transform so it animates from 0. useLayoutEffect keeps
  // this before paint — no requestAnimationFrame needed.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.style.transition = 'none';
    strip.style.transform = 'translateY(0)';
    void strip.offsetHeight;
    strip.style.transition = '';
    strip.style.transitionDuration = `${durationMs}ms`;
    strip.style.transform = `translateY(-${FILLER_COUNT * CELL_HEIGHT}px)`;
  }, [cells, durationMs]);

  return (
    <div className={`reel${spec.id === 'model' ? ' reel--model' : ''}`} ref={reelRef}>
      <span className="reel__label">{spec.label}</span>
      <div className="reel__strip" ref={stripRef}>
        {cells.map((cell, index) => (
          <div className="reel__cell" key={index} aria-hidden="true">
            {cell}
          </div>
        ))}
        <div className="reel__cell">{finalCell}</div>
      </div>
    </div>
  );
}

/**
 * The Decide view: task chips, the SETUP-O-MATIC slot machine whose reels land on the
 * selected task's recommendation, the fine-print payout box, a lever (and mobile chip) that
 * spin a random task, and the "Also good for this" bench of alternative models.
 */
export function SlotMachine({ onSelectModel }: SlotMachineProps) {
  const tasks = recommendationTasks(reportCard.recommendations);
  const [selectedTask, setSelectedTask] = useState<string | null>(tasks[0] ?? null);
  const [cells, setCells] = useState<string[][]>(() => makeCells(tasks[0] ?? null));
  const [spinKey, setSpinKey] = useState(0);
  const [spinning, setSpinning] = useState(true);
  const [leverPulled, setLeverPulled] = useState(false);

  const modelReelRef = useRef<HTMLDivElement>(null);
  const payoutTimer = useRef<Timer | null>(null);
  const leverTimer = useRef<Timer | null>(null);

  const scheduleReveal = useCallback(() => {
    clearTimer(payoutTimer);
    payoutTimer.current = setTimeout(
      () => {
        payoutTimer.current = null;
        setSpinning(false);
        const rect = modelReelRef.current?.getBoundingClientRect();
        if (rect) confetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
      },
      reducedMotion ? 0 : SPIN_TOTAL_MS,
    );
  }, []);

  // Initial render shows the first task already mid-spin; reveal its payout like any spin.
  useEffect(() => {
    scheduleReveal();
    return () => clearTimer(payoutTimer);
  }, [scheduleReveal]);

  useEffect(() => () => clearTimer(leverTimer), []);

  const startSpin = (task: string) => {
    setSelectedTask(task);
    setCells(makeCells(task));
    setSpinKey((key) => key + 1);
    setSpinning(true);
    scheduleReveal();
  };

  const surprise = () => {
    setLeverPulled(true);
    clearTimer(leverTimer);
    leverTimer.current = setTimeout(() => setLeverPulled(false), LEVER_RESET_MS);
    const others = tasks.filter((task) => task !== selectedTask);
    const next = others.length > 0 ? others[Math.floor(Math.random() * others.length)] : selectedTask;
    if (next) startSpin(next);
  };

  const recommendation = selectedTask
    ? reportCard.recommendations.find((entry) => entry.task === selectedTask)
    : undefined;
  const recommendedModel = recommendation
    ? recommendationModel(reportCard.models, recommendation)
    : undefined;
  const payoutText = spinning
    ? 'spinning…'
    : (recommendation && recommendation.cautions) || 'No cautions recorded.';

  // Bench: the task's verdict rows minus the recommended model; the whole section hides
  // when nothing is left.
  const benchRows = selectedTask
    ? taskVerdictRows(reportCard.models, reportCard.taskVerdicts, selectedTask).filter(
        (row) => row.model.name !== recommendation?.model,
      )
    : [];

  const durations = REEL_SPECS.map((_, index) => (reducedMotion ? 0 : 1100 + index * 350));

  return (
    <div className="view">
      <h1 className="hero-title">
        What are we <mark>building</mark> today?
      </h1>

      <div className="task-row" role="group" aria-label="Tasks">
        {tasks.map((task) => (
          <button
            key={task}
            type="button"
            className="task"
            aria-pressed={task === selectedTask}
            onClick={() => startSpin(task)}
          >
            <span className="task__emoji" aria-hidden="true">
              {taskEmoji(task)}
            </span>
            {task}
          </button>
        ))}
        <button type="button" className="task task--surprise" onClick={surprise}>
          <span aria-hidden="true">🎲 </span>Surprise me
        </button>
      </div>

      <div className="machine-wrap">
        <div className="machine">
          <div className="machine__marquee">
            <span className="bulbs" aria-hidden="true">
              <i className="bulb" />
              <i className="bulb" />
              <i className="bulb" />
              <i className="bulb" />
            </span>
            <span>★ SETUP-O-MATIC ★</span>
            <span className="bulbs" aria-hidden="true">
              <i className="bulb" />
              <i className="bulb" />
              <i className="bulb" />
              <i className="bulb" />
            </span>
          </div>
          <div className="reels" key={spinKey}>
            {REEL_SPECS.map((spec, index) => {
              const finalValue = (recommendation && recommendation[spec.field]) || '—';
              const finalCell =
                spec.id === 'model' && recommendedModel ? (
                  <button type="button" onClick={() => onSelectModel(recommendedModel.id)}>
                    {finalValue}
                  </button>
                ) : (
                  finalValue
                );
              return (
                <Reel
                  key={spec.id}
                  spec={spec}
                  durationMs={durations[index]}
                  cells={cells[index]}
                  finalCell={finalCell}
                  reelRef={spec.id === 'model' ? modelReelRef : undefined}
                />
              );
            })}
          </div>
          <div className="payout" aria-live="polite">
            <span className="payout__icon" aria-hidden="true">
              ⚠️
            </span>
            <div className="payout__text">
              <small>Fine print</small>
              {payoutText}
            </div>
          </div>
        </div>

        <div className="lever-col">
          <span className="lever-note" aria-hidden="true">
            surprise me!
            <svg viewBox="0 0 60 60" width="58" height="58">
              <path
                d="M8 6 C 40 4, 52 22, 34 50"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M22 42 L34 52 L42 38"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <button
            type="button"
            className={`lever${leverPulled ? ' is-pulled' : ''}`}
            aria-label="Surprise me: spin a random task"
            onClick={surprise}
          >
            <span className="lever__ball" />
            <span className="lever__stick" />
            <span className="lever__base" />
          </button>
        </div>
      </div>

      {benchRows.length > 0 ? (
        <>
          <h2 className="section-title">
            Also good for this{' '}
            <span className="hand">
              {benchRows.length} option{benchRows.length === 1 ? '' : 's'}
            </span>
          </h2>
          <div className="bench">
            {benchRows.map((row, index) => (
              <button
                key={row.model.id}
                type="button"
                className={`sticky${row.verdict.status === 'care' ? ' sticky--care' : ''}`}
                style={
                  {
                    '--tilt': `${(index % 2 ? 1 : -1) * (0.6 + (index % 3) * 0.7)}deg`,
                  } as React.CSSProperties
                }
                onClick={() => onSelectModel(row.model.id)}
              >
                <Stamp status={row.verdict.status} short />
                <h4>{row.model.name}</h4>
                <p>{row.verdict.summary}</p>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
