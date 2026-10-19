const env = require('../config/env');

async function complete({ system, prompt, schema }) {
  if (!env.ollamaModel) throw new Error('OLLAMA_MODEL is not set in backend/.env');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.llmTimeoutMs);
  let res;
  try {
    res = await fetch(`${env.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.ollamaModel,
        stream: false,
        format: schema || 'json', // JSON schema forces valid, shaped JSON
        keep_alive: env.ollamaKeepAlive,
        options: { temperature: 0, num_ctx: env.ollamaNumCtx },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    });
  } catch (e) {
    throw new Error(
      e.name === 'AbortError'
        ? 'Local model timed out. Try a smaller model or close other apps.'
        : 'Cannot reach Ollama. Start it and check OLLAMA_URL.'
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  try {
    return JSON.parse(data.message.content);
  } catch {
    throw new Error('Model returned invalid JSON');
  }
}

async function health() {
  try {
    const r = await fetch(`${env.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return { reachable: false, model: env.ollamaModel };
    const j = await r.json();
    const names = (j.models || []).map((m) => m.name);
    const installed = !!env.ollamaModel && names.some((n) => n === env.ollamaModel || n === `${env.ollamaModel}:latest`);
    return { reachable: true, modelInstalled: installed, model: env.ollamaModel };
  } catch {
    return { reachable: false, model: env.ollamaModel };
  }
}

module.exports = { complete, health, model: () => env.ollamaModel };
