// Run with: node test-scenarios.js
// Exercises the FULL pipeline (rule-based NLU -> rules engine -> templated reply)
// against the assignment's 3 scenarios. No API key, no cost, no network.

import { decide, getCustomer } from './src/rulesEngine.js';
import { extractIntent } from './src/nlu.js';
import { generateReply } from './src/responder.js';

function runTurn(title, pnr, message) {
  console.log(`\n=== ${title} ===`);
  console.log(`Customer says: "${message}"`);

  const customer = getCustomer(pnr);
  const extracted = extractIntent({ message });
  console.log('tags:', extracted.tags, extracted.fareDifference ? `fareDifference: ${extracted.fareDifference}` : '');

  const decisions = decide(pnr, extracted.tags, { fareDifference: extracted.fareDifference });
  decisions.forEach((d) => console.log(`  [${d.decision}] ${d.request} — ${d.reason || JSON.stringify(d.detail)}`));

  const reply = generateReply({ customer, decisions, ...extracted });
  console.log(`Agent replies: "${reply}"`);
}

runTurn(
  'Scenario 1 — Priya Nair (cancelled flight)',
  'SK4821X',
  'My flight got cancelled, I want a full refund'
);
runTurn(
  'Scenario 1 (cont.) — Priya escalates the ask',
  'SK4821X',
  "I'm furious, I also want a free upgrade to business class for the trouble"
);

runTurn(
  'Scenario 2 — Arvind Kulkarni (4h delay)',
  'TR1190B',
  "My flight is delayed, can I get a hotel since it's been such a long delay?"
);

runTurn(
  'Scenario 3 — Meher Kaur (6h delay, full night + fare change)',
  'WL7742',
  "I want a full night's hotel stay, not just the delayed hours, and please move me to a different flight instead of waiting"
);

console.log('\nAll scenarios executed with the free, zero-dependency pipeline.\n');
