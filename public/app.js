const messagesEl = document.getElementById('messages');
const reasoningLogEl = document.getElementById('reasoningLog');
const composer = document.getElementById('composer');
const messageInput = document.getElementById('messageInput');

let history = []; // [{role, content}] sent back to the API for context
let currentPNR = null; // set once the agent identifies the customer from their message

function showIdentification(customer) {
  const b = customer.booking;
  addSystemMessage(
    `Identified ${customer.name} (${customer.tier}) — ${b.flight}, ${b.route}, status: ${b.status}${b.delay_hours ? ` (${b.delay_hours}h delay)` : ''}.`
  );
}

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addSystemMessage(text) {
  addMessage('system', text);
}

function renderReasoning(tags, decisions) {
  const turn = document.createElement('div');
  turn.className = 'reasoning-turn';

  const tagsEl = document.createElement('div');
  tagsEl.className = 'tags';
  tagsEl.textContent = `tags: [${tags.join(', ')}]`;
  turn.appendChild(tagsEl);

  decisions.forEach((d) => {
    const row = document.createElement('div');
    row.className = 'decision-row';
    const badge = document.createElement('span');
    badge.className = `decision-badge ${d.decision}`;
    badge.textContent = d.decision;
    const text = document.createElement('span');
    text.className = 'decision-text';
    const detail = d.reason || (typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail));
    text.textContent = `${d.request} — ${detail}`;
    row.appendChild(badge);
    row.appendChild(text);
    turn.appendChild(row);
  });

  reasoningLogEl.appendChild(turn);
  reasoningLogEl.scrollTop = reasoningLogEl.scrollHeight;
}

composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;

  addMessage('customer', message);
  messageInput.value = '';
  messageInput.disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pnr: currentPNR, message, history }),
    });
    const data = await res.json();

    if (!res.ok) {
      addSystemMessage(`Error: ${data.error}`);
      return;
    }

    if (data.identifiedCustomer && !currentPNR) {
      currentPNR = data.identifiedCustomer.pnr;
      showIdentification(data.identifiedCustomer);
    }

    addMessage('agent', data.reply);
    renderReasoning(data.tags, data.decisions);

    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: data.reply });
  } catch (err) {
    addSystemMessage(`Network error: ${err.message}`);
  } finally {
    messageInput.disabled = false;
    messageInput.focus();
  }
});

addSystemMessage("Hi! I'm here to help with your booking. Could you tell me your name and what's going on?");
