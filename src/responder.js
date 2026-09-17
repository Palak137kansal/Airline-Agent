/**
 * Stage 3 — Reply phrasing, template-based (no API key required).
 *
 * Exactly like the LLM version this replaces: it receives the rules
 * engine's decisions as ground truth and can ONLY phrase what's in them —
 * there's no generative step that could add an unlisted promise, because
 * there's no generation at all, just template selection.
 */

const TEMPLATES = {
  ALLOW: {
    refund: () => `I can confirm a full refund will be processed to your original payment method within 7 business days.`,
    rebook: (d, tier) => `I've set up a free rebooking on the next available flight within 24 hours${tier === 'Gold' || tier === 'Platinum' ? ' — as a ' + tier + ' member you get priority access to the next seats' : ''}.`,
    meal_voucher: (d) => `You're covered under our delay policy: ${d}. I've applied this to your booking now.`,
    lounge_access: (d) => `You're covered under our delay policy: ${d}. I've applied this to your booking now.`,
    hotel_delayed_hours: () => `I've arranged hotel accommodation covering the hours you're delayed.`,
    fare_change: (d) => `I can move you to that flight — ${d}`,
    flight_status: (d) => {
      const b = d;
      let s = `Here's your current status: flight ${b.flight} (${b.route}) is ${b.status}`;
      if (b.status === 'delayed') s += `, now departing at ${b.new_departure} (${b.delay_hours}h delay)`;
      if (b.status === 'cancelled') s += ` (${b.status_reason})`;
      return s + '.';
    },
    general_inquiry: () => `Happy to help — let me know what you'd like to do about your booking.`,
  },
  DENY_WITH_POLICY: {
    rebook: (r) => r,
    refund: (r) => r,
    hotel_delayed_hours: (r) => `${r} I can still offer you a meal voucher and lounge access for the wait.`,
    hotel_full_night: (r) => `${r} What I can offer is coverage for the hours you're actually delayed.`,
    fare_change: (r) => r,
    meal_voucher: (r) => r,
    lounge_access: (r) => r,
  },
  ESCALATE: {
    legal_threat: () => `I'm escalating this to our specialist support team right now, and they'll reach out to you directly.`,
    formal_complaint: () => `I'm escalating this to our specialist support team right now, and they'll reach out to you directly.`,
    _default: () => `I want to make sure this gets the right attention — I'm escalating this to a supervisor, who will follow up with you directly.`,
  },
};

function sentenceFor(decision) {
  const { request, decision: kind, reason, detail } = decision;
  const group = TEMPLATES[kind];
  if (!group) return null;
  const fn = group[request] || group._default;
  if (!fn) return null;
  return fn(reason ?? detail, decision.tier);
}

export function generateReply({ customer, decisions, isGreeting, isThanks, soundsUpset }) {
  const parts = [];

  if (isThanks && decisions.every((d) => d.request === 'general_inquiry')) {
    return `You're very welcome, ${customer.name.split(' ')[0]} — is there anything else I can help with?`;
  }
  if (isGreeting && decisions.every((d) => d.request === 'general_inquiry')) {
    return `Hi ${customer.name.split(' ')[0]}, thanks for reaching out — how can I help with your booking today?`;
  }

  if (soundsUpset) {
    parts.push(`I completely understand the frustration, and I'm sorry for the disruption.`);
  }

  const seen = new Set();
  for (const decision of decisions) {
    // Attach loyalty tier for the rebook template's priority-rebooking note
    decision.tier = customer.loyalty_tier;
    const sentence = sentenceFor(decision);
    if (!sentence || seen.has(sentence)) continue;
    seen.add(sentence);
    parts.push(sentence);
  }

  if (parts.length === 0) {
    parts.push(`Happy to help — could you tell me a bit more about what you need?`);
  }

  return parts.join(' ');
}
