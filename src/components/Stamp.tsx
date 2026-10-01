import { VERDICT_STATUSES, type VerdictStatus } from '../data/types';
import { SHORT_STATUS_LABELS } from '../lib/redesign';

interface StampProps {
  /** The verdict status to stamp; omit for "Ungraded". */
  status?: VerdictStatus;
  /** Use the compact label set (Preferred / Care / Avoid) instead of the full one. */
  short?: boolean;
}

/**
 * A rubber-stamp span: `stamp stamp--{status|none}` with the human-facing verdict label.
 * Without a status it renders the grey "Ungraded" stamp.
 */
export function Stamp({ status, short = false }: StampProps) {
  const label = status ? (short ? SHORT_STATUS_LABELS[status] : VERDICT_STATUSES[status]) : 'Ungraded';
  return <span className={`stamp stamp--${status ?? 'none'}`}>{label}</span>;
}
