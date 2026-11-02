// Calls to the TaleBrush server (server.py).

export async function getHealth() {
  const r = await fetch("/api/health", { cache: "no-store" });
  if (!r.ok) throw new Error(`The TaleBrush server answered ${r.status}.`);
  return r.json();
}

async function errorOf(r, fallback) {
  const data = await r.json().catch(() => ({}));
  return new Error(data.error || `${fallback} (${r.status})`);
}

/**
 * characters: names, the protagonist first.
 * items: [{ context: [up to 3 previous sentences], sentence, rate: [indices of the characters to rate] }]
 * -> one row per item, one value per character: a fortune, "absent" (the sentence does not
 *    involve that character), or null (not rated).
 */
export async function recognize(characters, items) {
  const r = await fetch("/api/recognize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characters, items }),
  });
  if (!r.ok) throw await errorOf(r, "Fortune recognition failed");
  const data = await r.json();
  return data.fortunes || [];
}

/** Stream generation events (one JSON object per line) to onEvent until the server finishes. */
export async function generate(payload, onEvent, signal) {
  const r = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!r.ok) throw await errorOf(r, "Generation failed");
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onEvent(JSON.parse(line));
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer));
}
