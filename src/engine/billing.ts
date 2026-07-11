/**
 * Cost model for the "you pay for the whole history, every turn" lesson.
 * Shared by the mechanic UI and the data tests so the authored "cheapest
 * valid strategy" answer can never drift from the arithmetic.
 */

export interface BillTurn {
  inputTokens: number;
  outputTokens: number;
}

export interface TurnCost {
  /** Input tokens sent for the first time this turn. */
  freshTokens: number;
  /** Re-sent tokens (the growing prefix: everything from earlier turns). */
  prefixTokens: number;
  /** Credits charged for this turn's input. */
  cost: number;
}

export interface BillSummary {
  turns: TurnCost[];
  totalCost: number;
  /** Window occupancy after the final turn — identical with or without caching. */
  finalContextTokens: number;
}

/**
 * Turn i sends: initial blocks + every earlier user/assistant message +
 * this turn's user message. With caching on, the previously-sent prefix is
 * billed at `cachedReadFactor`; fresh tokens always cost full price.
 */
export function computeBill(
  initialTokens: number,
  turns: readonly BillTurn[],
  pricePerMTokIn: number,
  options: { caching: boolean; cachedReadFactor: number },
): BillSummary {
  const unit = pricePerMTokIn / 1_000_000;
  const factor = options.caching ? options.cachedReadFactor : 1;

  let prefix = 0;
  const turnCosts: TurnCost[] = [];
  let total = 0;

  turns.forEach((turn, i) => {
    const fresh = (i === 0 ? initialTokens : 0) + turn.inputTokens;
    const cost = (prefix * factor + fresh) * unit;
    turnCosts.push({ freshTokens: fresh, prefixTokens: prefix, cost });
    total += cost;
    prefix += fresh + turn.outputTokens;
  });

  return { turns: turnCosts, totalCost: total, finalContextTokens: prefix };
}
