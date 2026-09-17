/**
 * Stage 1 — Intent extraction, rule-based (no API key required).
 *
 * This mirrors exactly what an LLM-based version would do: turn free text
 * into tags from the SAME fixed vocabulary the rules engine expects. It's
 * intentionally kept in its own module so it's a one-file swap if you ever
 * want to plug in an actual LLM call later (see src/llmAgent.js.bak for
 * that version) — the rules engine and everything downstream doesn't care
 * which one produced the tags.
 *
 * This is pattern matching, not machine learning — it will miss phrasings
 * it wasn't written for. That's a fair trade for a zero-cost, zero-dependency
 * prototype; the README explains the tradeoff.
 */

const PATTERNS = [
  // Order matters: more specific / higher-stakes patterns are checked first
  // so a message matching several loosely doesn't miss the important one.
  { tag: 'legal_threat', re: /\b(legal action|lawyer|attorney|sue|suing|court)\b/i },
  { tag: 'formal_complaint', re: /\b(formal complaint|file a complaint|consumer forum|report this (company|airline))\b/i },
  { tag: 'refund_diff_payment_method', re: /\b(different (card|account|payment method)|another (card|account)|refund.*(other|different) (card|account))\b/i },
  { tag: 'cash_compensation', re: /\b(cash compensation|monetary compensation|pay me|compensate me|money for (my|the) trouble|cash refund plus|extra (cash|money))\b/i },
  { tag: 'free_upgrade', re: /\b(free upgrade|upgrade.*(free|no charge|for the trouble)|business class.*(free|for the trouble))\b/i },
  { tag: 'hotel_full_night', re: /\b(full night|entire night|overnight stay|full night'?s? stay|whole night)\b/i },
  { tag: 'hotel_delayed_hours', re: /\b(hotel|accommodation|place to stay|room for the (delay|wait))\b/i },
  { tag: 'fare_change', re: /\b(different flight|another flight|earlier flight|later flight|change (my|the) flight|move me to|instead of waiting)\b/i },
  { tag: 'rebook', re: /\b(rebook|re-book|next available flight|put me on (another|a different) flight)\b/i },
  { tag: 'refund', re: /\b(refund|money back|reimburse)\b/i },
  { tag: 'lounge_access', re: /\blounge\b/i },
  { tag: 'meal_voucher', re: /\b(meal voucher|food voucher|meal\b|voucher)\b/i },
  { tag: 'flight_status', re: /\b(status|what.?s (going on|happening)|update on my flight|is my flight|what happened to my flight)\b/i },
];

const GREETING_RE = /^(hi|hello|hey|good (morning|afternoon|evening))\b/i;
const THANKS_RE = /\b(thanks|thank you|appreciate it)\b/i;

// Extract a rupee amount if the customer states one directly (e.g. "₹2000", "Rs. 2,000", "2000 rupees")
function extractFareDifference(message) {
  const match = message.match(/(?:₹|rs\.?\s?|inr\s?)\s?([\d,]{3,})|([\d,]{3,})\s?rupees/i);
  if (!match) return null;
  const raw = (match[1] || match[2] || '').replace(/,/g, '');
  const num = parseInt(raw, 10);
  return Number.isFinite(num) ? num : null;
}

export function extractIntent({ message }) {
  const tags = [];
  for (const { tag, re } of PATTERNS) {
    if (re.test(message)) tags.push(tag);
  }

  if (tags.length === 0) {
    tags.push('general_inquiry');
  }

  return {
    tags,
    fareDifference: extractFareDifference(message),
    isGreeting: GREETING_RE.test(message.trim()),
    isThanks: THANKS_RE.test(message),
    soundsUpset: /\b(furious|frustrated|unacceptable|ridiculous|angry|fed up|terrible)\b/i.test(message),
  };
}
