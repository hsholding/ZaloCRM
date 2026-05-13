/**
 * contact-aggregate-display.ts — On-demand aggregation cho KH Cha.
 *
 * Cha không store displayStatus / displayLeadScore / displayHasZalo —
 * compute tại query time từ self + tất cả children.
 *   displayStatus    = status có order CAO NHẤT trong nhóm (cha + con)
 *   displayLeadScore = AVG(leadScore) của nhóm
 *   displayHasZalo   = ANY true → true; ALL false → false; còn lại null
 */

interface StatusLite {
  id: string;
  name: string;
  order: number;
  color: string | null;
  isTerminal: boolean;
}

interface ContactLite {
  id: string;
  leadScore: number;
  hasZalo: boolean | null;
  statusRef?: StatusLite | null;
}

interface ContactWithChildren extends ContactLite {
  children?: ContactLite[];
}

export interface AggregateDisplay {
  displayStatus: StatusLite | null;
  displayLeadScore: number;
  displayHasZalo: boolean | null;
  childrenCount: number;
}

export function computeAggregateDisplay<T extends ContactWithChildren>(contact: T): AggregateDisplay {
  const children = contact.children ?? [];
  // Tính trên self + children. Cha không có children = aggregate = self values.
  const all: ContactLite[] = [contact, ...children];

  // Status cao nhất theo order
  const statuses = all
    .map((c) => c.statusRef)
    .filter((s): s is StatusLite => s != null)
    .sort((a, b) => b.order - a.order);
  const displayStatus = statuses[0] ?? null;

  // LeadScore AVG (ignore null treated as 0)
  const scores = all.map((c) => c.leadScore ?? 0);
  const displayLeadScore = scores.length > 0
    ? Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10
    : 0;

  // hasZalo: ANY true → true; ALL false → false; else null
  const flags = all.map((c) => c.hasZalo);
  const displayHasZalo = flags.some((f) => f === true) ? true
                       : flags.every((f) => f === false) ? false
                       : null;

  return {
    displayStatus,
    displayLeadScore,
    displayHasZalo,
    childrenCount: children.length,
  };
}

/** Standard include shape cho Prisma query để feed computeAggregateDisplay. */
export const AGGREGATE_INCLUDE = {
  statusRef: { select: { id: true, name: true, order: true, color: true, isTerminal: true } },
  children: {
    where: { mergedInto: null },
    select: {
      id: true,
      leadScore: true,
      hasZalo: true,
      statusRef: { select: { id: true, name: true, order: true, color: true, isTerminal: true } },
    },
  },
} as const;
