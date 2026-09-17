# SkyResolve — Customer-Facing Resolution Agent (Airline Disruption)

A prototype support agent for airline disruption scenarios (Assignment 3), built to be **grounded and rules-gated** rather than a free-form chatbot: nothing ever decides what a customer is entitled to except a deterministic rules engine — everything else just translates language in and phrases policy out.

**Runs completely free, no API key, no signup, no cost.** The NLU and reply-generation stages are rule-based (pattern matching + templates) rather than calling an LLM, so there's nothing to pay for and nothing that can go down.

## 1. Quick start (one command)

```bash
npm install && npm start
```

Then open **http://localhost:3000**. That's it — no `.env`, no API key required.

Optional — run the same pipeline from the terminal, scripted through all 3 assignment scenarios:

```bash
npm run test:scenarios
```

## 2. Architecture & process flow

The core design decision: **separate "understanding the customer" from "deciding what they're owed" from "saying it out loud."** Three stages — only the outer two are language-specific, and the middle one is pure code with zero discretion:

```
Customer message
      │
      ▼
┌─────────────────────────┐
│ STAGE 1 — Intent NLU     │   Rule-based pattern matching against a
│ (src/nlu.js)             │   FIXED output vocabulary (rebook, refund,
│                          │   hotel_full_night, legal_threat, fare_change…)
└──────────┬───────────────┘
           │  {tags: [...], fareDifference}
           ▼
┌─────────────────────────┐
│ STAGE 2 — Rules Engine   │   Pure code. No LLM, no discretion. Looks up
│ (src/rulesEngine.js      │   the customer's real booking status in the
│  decide)                 │   knowledge base and returns ALLOW /
│                          │   DENY_WITH_POLICY / ESCALATE for each tag,
│                          │   with the exact policy reason.
└──────────┬───────────────┘
           │  decisions[]
           ▼
┌─────────────────────────┐
│ STAGE 3 — Reply Phrasing │   Template selection bound to each decision.
│ (src/responder.js)       │   Can only say what's in the decisions object —
│                          │   there's no generative step, so there's no
│                          │   way for it to invent an unlisted promise.
└──────────┬───────────────┘
           │
           ▼
   Natural-language reply + visible reasoning trace (UI)
```

**Why three stages instead of one big prompt (or one big if/else)?** Splitting "understand" from "decide" from "phrase" means the one component with the actual authority to grant a refund, waive a fee, or escalate to a human is small, pure, synchronous code you can read top to bottom — not something whose behavior depends on how a sentence happened to be worded. Whatever weaknesses stage 1's pattern matching has (see limitations below), the worst it can do is mis-tag or miss a request; it can never itself grant something outside policy, because it has no path to do that — only stage 2 can, and stage 2 has no free text to be swayed by.

**Three-way decision, not two:** the rules engine returns `DENY_WITH_POLICY` for a "no" the agent is trusted to explain itself (e.g. Arvind's 4-hour delay not qualifying for a hotel), versus `ESCALATE` for a "no" that specifically appears on the Prohibited list or crosses a stated numeric threshold (e.g. Meher's ₹2,000 fare difference exceeding the ₹1,500 waiver limit) — that distinction is what section 4 of the data pack is actually asking for.

**Fail-safe default:** any intent tag the rules engine doesn't recognize is escalated by default (see the `default` case in `rulesEngine.js`) — the system defaults to "get a human," never to "say yes."

## 3. Optional: upgrading to a real LLM

The project is structured so stage 1 and stage 3 are swappable without touching the rules engine at all. `src/llmAgent.js.bak` contains a working Claude-API-backed version of both stages (same input/output shape as `nlu.js` / `responder.js`) — rename it to `.js`, add `ANTHROPIC_API_KEY` to a `.env` file (see `.env.example`), and `server.js` will detect the key and automatically route through the LLM version instead, falling back to the free pipeline if the API call ever fails. This isn't needed for this submission, but it's there to show the design decouples "how we understand/phrase language" from "what we're allowed to promise" — you could point stage 1/3 at any NLU or generation approach and the guarantees in stage 2 hold regardless.

**Limitation of the rule-based version, worth stating honestly:** keyword/pattern matching only catches phrasings it was written for — a customer who phrases a request in an unanticipated way may fall through to `general_inquiry` rather than the intended tag. This is an accepted tradeoff for a free, zero-dependency prototype; production would likely use the LLM-backed stage 1 for better recall, with the rules engine unchanged.

## 4. Inputs, sources & assumptions

**Source of truth:** everything the agent can say is derived from `data/knowledge_base.json`, a direct structuring of the assignment's Data Pack — customer profiles, booking/transaction table, service rules, and the allowed/prohibited action lists (sections 1–4 of the brief). No policy or fact outside that file is used.

Assumptions made where the brief was open-ended:
- The sample conversations (section 5 of the data pack) were explicitly *not* usable as a source of policy — they were used only to calibrate tone in `responder.js` (warm, direct, no over-apologizing), never copied into the agent's outputs.
- Meher's requested alternate flight's ₹2,000 fare difference (mentioned only in the scenario narrative, not the booking table) was added to the knowledge base as `alternate_flight_offered.fare_difference`, since it's part of the given exercise data, not an invented fact.
- "DENY_WITH_POLICY" vs. "ESCALATE" is a judgment call not spelled out explicitly in the brief: escalation is reserved for items on the literal Prohibited list (section 4) or crossing a stated numeric threshold; everything else the agent is trusted to explain from policy directly.
- Only one live/disrupted booking per customer is modeled (per the data pack); return/unaffected legs are stored but not part of the disruption flow.

## 5. AI tools used

- **Claude (Anthropic)** was used as a design and pair-programming partner throughout — to work through the architecture (why a 3-stage, rules-gated design rather than a single-prompt chatbot), write and iterate on the rules engine, NLU patterns, and templates, and structure this project and README.
- **No AI model runs at inference time by default** — the shipped prototype is fully rule-based so it's free to run and demo. An optional LLM-backed version of stages 1 and 3 is included (`src/llmAgent.js.bak`, using the Anthropic API / Claude Sonnet 5) as a documented upgrade path, disabled unless an API key is supplied — see section 3.

## 6. Project structure

```
airline-resolution-agent/
├── data/knowledge_base.json   # structured facts from the data pack
├── src/rulesEngine.js         # deterministic ALLOW/DENY/ESCALATE logic
├── src/nlu.js                  # rule-based intent extraction (stage 1, default)
├── src/responder.js            # templated reply generation (stage 3, default)
├── src/llmAgent.js.bak         # optional LLM-backed stage 1+3 (rename to enable)
├── server.js                   # Express API wiring it together, with fallback
├── public/                     # chat UI + visible reasoning trace
└── test-scenarios.js           # scripted run of all 3 assignment scenarios
```

## 7. Testing against the assignment's 3 scenarios

There's no customer picker in the UI — the agent identifies who it's talking to from their name in the message itself (matched against the 3 profiles in the knowledge base), so no dropdown is exposed for privacy reasons. Open the chat and try:

| Scenario | Try saying | Expected behavior |
|---|---|---|
| Priya Nair (Gold, SK4821X) | "Hi, I'm Priya Nair, my flight got cancelled, I want a full refund" → then "I'm furious, I also want a free upgrade to business class for the trouble" | Agent identifies Priya from her name. Refund → confirmed. Free upgrade → escalated, not granted. |
| Arvind Kulkarni (Silver, TR1190B) | "This is Arvind, my flight is delayed, can I get a hotel since it's been such a long delay?" | Agent identifies Arvind. Hotel → declined with the 5h policy threshold explained; meal voucher + lounge offered instead. |
| Meher Kaur (Platinum, WL7742) | "Hi, Meher Kaur here — I want a full night's hotel stay, not just the delayed hours" then "Also move me to a different flight instead of waiting" | Agent identifies Meher. Full-night stay → declined per policy (delayed-hours coverage offered instead). Fare change → escalated (₹2,000 exceeds the ₹1,500 waiver limit).

A full name isn't required — a first name alone (e.g. just "Priya") is enough for the agent to match the right customer. If no name is recognized in the message, the agent asks the customer to identify themselves before proceeding.

The right-hand "Agent reasoning" panel shows the exact tags and decisions behind every reply — useful to screenshot or narrate in your demo video. `npm run test:scenarios` prints the same trace to the terminal for all three scenarios at once, no browser needed.
