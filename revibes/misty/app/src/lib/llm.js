// All model calls go through the workshop's LLM bridge (OpenAI format).
export const BRIDGE_URL = import.meta.env?.VITE_BRIDGE_URL || 'http://localhost:8787';

export async function bridgeHealth() {
  const response = await fetch(`${BRIDGE_URL}/health`);
  if (!response.ok) throw new Error(`Bridge answered ${response.status}`);
  return response.json();
}

export async function callModel(prompt, image, { signal, extraImages = [] } = {}) {
  const content = [{ type: 'text', text: prompt }];
  if (image) content.push({ type: 'image_url', image_url: { url: image } });
  for (const annotation of extraImages.filter(Boolean)) content.push({ type: 'image_url', image_url: { url: annotation } });

  let response;
  try {
    response = await fetch(`${BRIDGE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        messages: [{ role: 'user', content }],
        response_format: { type: 'json_object' },
      }),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Blend cancelled or timed out. Your saved input is kept.');
    throw new Error(`Cannot reach the LLM bridge at ${BRIDGE_URL}. Is it running?`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Bridge error ${response.status}: ${detail.slice(0, 200)}`);
  }
  const body = await response.json();
  return parseModelJson(body.choices?.[0]?.message?.content ?? '');
}

export function parseModelJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('The model did not return JSON.');
  const slice = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    // The paper's format used a template literal for updatedCode: accept it too.
    const literal = slice.match(/"?updatedCode"?\s*:\s*`([\s\S]*?)`\s*,?\s*(?=\n?\s*"?\w+"?\s*:|\})/);
    if (literal) {
      const rest = slice.replace(literal[0], '');
      try {
        return { ...JSON.parse(rest), updatedCode: literal[1] };
      } catch {
        return { updatedCode: literal[1], categorizedChanges: [] };
      }
    }
    throw new Error('The model returned malformed JSON. Try Regenerate.');
  }
}

// "Color: Changed light to dark theme" -> { label: "Color", description: "Changed..." }
export function normalizeCategories(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
    const title = String(entry?.category ?? 'Change');
    const colon = title.indexOf(':');
    return {
      id: `c${index}`,
      label: colon > 0 ? title.slice(0, colon).trim() : 'Change',
      description: colon > 0 ? title.slice(colon + 1).trim() : title,
      enabled: true,
      changes: (Array.isArray(entry?.changes) ? entry.changes : []).map((c) => ({
        type: String(c?.type ?? ''),
        before: String(c?.before ?? ''),
        after: String(c?.after ?? ''),
      })),
    };
  });
}
