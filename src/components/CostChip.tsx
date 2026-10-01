import { chipTier, formatCost } from '../lib/tokenUsage';

interface CostChipProps {
  /** Indicative cost in USD; null renders a blank "no price" chip. */
  cost: number | null;
  size?: 'sm' | 'md' | 'lg';
}

/** An estimated cost as a casino poker chip, coloured by denomination (white → purple). */
export function CostChip({ cost, size = 'md' }: CostChipProps) {
  if (cost === null) {
    return (
      <span className={`chip chip--${size} chip--none`}>
        <span aria-hidden="true">?</span>
        <span className="visually-hidden">no price</span>
      </span>
    );
  }
  return (
    <span className={`chip chip--${size} chip--${chipTier(cost)}`}>
      <span className="visually-hidden">estimated cost </span>
      <span className="chip__value">{formatCost(cost)}</span>
    </span>
  );
}
