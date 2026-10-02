import { chipTier, formatCost, formatRate } from '../lib/tokenUsage';

interface CostChipProps {
  /** Indicative cost in USD; null renders a blank "no price" chip. */
  cost: number | null;
  size?: 'sm' | 'md' | 'lg';
  /** Per-1M precision (formatRate) instead of the usual rounded formatCost. */
  precise?: boolean;
}

/** An estimated cost as a casino poker chip, coloured by denomination (white → purple). */
export function CostChip({ cost, size = 'md', precise = false }: CostChipProps) {
  if (cost === null) {
    return (
      <span className={`chip chip--${size} chip--none`}>
        <span aria-hidden="true">?</span>
        <span className="visually-hidden">no price</span>
      </span>
    );
  }
  const value = precise ? formatRate(cost) : formatCost(cost);
  return (
    <span className={`chip chip--${size} chip--${chipTier(cost)}${value.length > 5 ? ' chip--long' : ''}`}>
      <span className="visually-hidden">estimated cost </span>
      <span className="chip__value">{value}</span>
    </span>
  );
}
