import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { decide, listCustomers, getCustomer } from './src/rulesEngine.js';
import { extractIntent as extractIntentRuleBased } from './src/nlu.js';
import { generateReply as generateReplyTemplate } from './src/responder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Lazily import the optional LLM-backed stage — only touched if a key exists,
// so the project has zero external dependency by default.
let llmAgent = null;
async function getLlmAgent() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!llmAgent) {
    try {
      llmAgent = await import('./src/llmAgent.js.bak');
    } catch {
      return null;
    }
  }
  return llmAgent;
}

app.get('/api/customers', (req, res) => {
  res.json(listCustomers());
});

// Try to figure out who's messaging based on the name they typed, rather
// than exposing a customer picker in the UI. Checks full name first, then
// falls back to a first/last-name word match.
function identifyCustomerFromMessage(message) {
  const customers = listCustomers();
  const lower = message.toLowerCase();

  const fullNameMatch = customers.find((c) => lower.includes(c.name.toLowerCase()));
  if (fullNameMatch) return fullNameMatch;

  const partialMatch = customers.find((c) => {
    const parts = c.name.toLowerCase().split(' ');
    return parts.some((part) => new RegExp(`\\b${part}\\b`).test(lower));
  });
  return partialMatch || null;
}

app.get('/api/mode', async (req, res) => {
  const llm = await getLlmAgent();
  res.json({ mode: llm ? 'llm' : 'rule-based' });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    let { pnr } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required.' });

    let identifiedCustomer = null;
    if (!pnr) {
      const match = identifyCustomerFromMessage(message);
      if (!match) {
        return res.json({
          reply: "Hi! I'm here to help with your booking — could you tell me your name so I can pull it up?",
          tags: ['unidentified'],
          decisions: [],
          mode: 'identification',
        });
      }
      pnr = match.pnr;
      identifiedCustomer = match;
    }

    const customer = getCustomer(pnr);
    if (!customer) return res.status(404).json({ error: 'Unknown booking reference.' });
    const booking = customer.bookings[0];

    const llm = await getLlmAgent();

    if (llm) {
      // Optional upgrade path: only runs if ANTHROPIC_API_KEY is set.
      try {
        const { tags, fareDifference } = await llm.extractIntent({ message, history });
        const decisions = decide(pnr, tags, { fareDifference });
        const reply = await llm.generateReply({ customer, pnr, booking, message, history, decisions });
        return res.json({ reply, tags, decisions, mode: 'llm', identifiedCustomer });
      } catch (err) {
        console.warn('LLM stage failed, falling back to rule-based:', err.message);
        // fall through to rule-based below
      }
    }

    const extracted = extractIntentRuleBased({ message });
    const decisions = decide(pnr, extracted.tags, { fareDifference: extracted.fareDifference });
    const reply = generateReplyTemplate({ customer, decisions, ...extracted });

    res.json({ reply, tags: extracted.tags, decisions, mode: 'rule-based', identifiedCustomer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Resolution agent running at http://localhost:${PORT}`);
  console.log(process.env.ANTHROPIC_API_KEY ? 'Mode: LLM-upgraded (API key detected)' : 'Mode: rule-based (no API key needed)');
});
