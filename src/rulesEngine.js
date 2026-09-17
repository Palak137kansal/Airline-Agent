import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kb = JSON.parse(readFileSync(path.join(__dirname, '../data/knowledge_base.json'), 'utf-8'));

/**
 * Fixed intent vocabulary. The LLM (see src/agent.js) is only ever allowed
 * to emit tags from this list — it never gets to invent a new kind of
 * request, and it never gets to decide the outcome itself.
 *
 * decide() is pure, synchronous, and has zero access to the LLM. That's
 * deliberate: the thing that decides "can we actually do this" must be
 * auditable and can never hallucinate.
 */
export function decide(pnr, requestTags = [], extra = {}) {
  const customer = kb.customers[pnr];
  if (!customer) {
    return [{ request: 'lookup', decision: 'ESCALATE', reason: 'Unknown booking reference — identity/booking could not be verified.' }];
  }

  const booking = customer.bookings[0]; // primary disrupted booking for this exercise
  const decisions = [];

  for (const tag of requestTags) {
    switch (tag) {
      case 'general_inquiry':
        decisions.push({ request: tag, decision: 'ALLOW', detail: 'No specific action needed — respond conversationally.' });
        break;

      case 'legal_threat':
      case 'formal_complaint':
        decisions.push({ request: tag, decision: 'ESCALATE', reason: 'Legal threats / formal complaints must be escalated immediately (policy §4).' });
        break;

      case 'flight_status':
        decisions.push({ request: tag, decision: 'ALLOW', detail: booking });
        break;

      case 'rebook':
        if (booking.status === 'cancelled') {
          decisions.push({ request: tag, decision: 'ALLOW', detail: 'Free rebooking on next available flight within 24h (customer choice vs. refund). Gold/Platinum get priority rebooking.' });
        } else {
          decisions.push({ request: tag, decision: 'DENY_WITH_POLICY', reason: 'No airline-caused cancellation on this booking — free rebooking only applies to cancellations, not delays.' });
        }
        break;

      case 'refund':
        if (booking.status === 'cancelled') {
          decisions.push({ request: tag, decision: 'ALLOW', detail: 'Full refund to original payment method, processed within 7 business days.' });
        } else {
          decisions.push({ request: tag, decision: 'DENY_WITH_POLICY', reason: 'Refunds apply to airline-caused cancellations, not delays.' });
        }
        break;

      case 'refund_diff_payment_method':
        decisions.push({ request: tag, decision: 'ESCALATE', reason: 'Refunds to a different payment method than the original must be escalated (policy §4).' });
        break;

      case 'meal_voucher':
      case 'lounge_access': {
        const h = booking.delay_hours || 0;
        if (booking.status === 'delayed' && h > 3) {
          decisions.push({ request: tag, decision: 'ALLOW', detail: 'Meal voucher + lounge access (delay over 3h).' });
        } else if (booking.status === 'delayed') {
          decisions.push({ request: tag, decision: 'ALLOW', detail: '₹500 meal voucher (delay under 3h).' });
        } else {
          decisions.push({ request: tag, decision: 'DENY_WITH_POLICY', reason: 'No qualifying delay on this booking.' });
        }
        break;
      }

      case 'hotel_delayed_hours': {
        const h = booking.delay_hours || 0;
        if (h > 5) {
          decisions.push({ request: tag, decision: 'ALLOW', detail: 'Hotel accommodation, covering only the delayed-hours portion.' });
        } else {
          decisions.push({ request: tag, decision: 'DENY_WITH_POLICY', reason: `Delay is ${h}h — hotel accommodation only applies beyond 5h.` });
        }
        break;
      }

      case 'hotel_full_night':
        decisions.push({ request: tag, decision: 'DENY_WITH_POLICY', reason: "Policy explicitly covers only the delayed-hours portion, never a full night's stay." });
        break;

      case 'cash_compensation':
      case 'free_upgrade':
        decisions.push({ request: tag, decision: 'ESCALATE', reason: 'Compensation beyond the stated policy amounts requires supervisor approval (policy §4).' });
        break;

      case 'fare_change': {
        const diff = extra.fareDifference ?? booking.alternate_flight_offered?.fare_difference ?? null;
        if (diff === null) {
          decisions.push({ request: tag, decision: 'DENY_WITH_POLICY', reason: 'Fare difference for the requested alternate flight is not available — cannot quote or approve without that figure.' });
        } else if (diff <= 1500) {
          decisions.push({ request: tag, decision: 'ALLOW', detail: `Customer pays the fare difference of ₹${diff}; within the agent's authority.` });
        } else {
          decisions.push({ request: tag, decision: 'ESCALATE', reason: `Fare difference of ₹${diff} exceeds ₹1,500 — agent cannot waive/approve without supervisor sign-off.` });
        }
        break;
      }

      default:
        // Fail-safe, not fail-open: anything outside our known vocabulary
        // is escalated rather than guessed at.
        decisions.push({ request: tag, decision: 'ESCALATE', reason: 'Unrecognized request type — outside agent scope by default.' });
    }
  }

  return decisions;
}

export function getCustomer(pnr) {
  return kb.customers[pnr] || null;
}

export function listCustomers() {
  return Object.entries(kb.customers).map(([pnr, c]) => ({
    pnr,
    name: c.name,
    tier: c.loyalty_tier,
    booking: c.bookings[0],
  }));
}

export { kb };
