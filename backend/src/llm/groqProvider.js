// Optional cloud provider serving open-weight models. Never required.
const env = require('../config/env');

async function complete({ system, prompt, schema }) {
  if (!env.groqApiKey) throw new Error('GROQ_API_KEY is not set in backend/.env');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.llmTimeoutMs);
  let res;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.groqApiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.groqModel,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${system} Respond with a single JSON object matching this JSON schema: ${JSON.stringify(schema)}` },
          { role: 'user', content: prompt },
        ],
      }),
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Groq request timed out' : 'Cannot reach Groq');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    throw new Error('Model returned invalid JSON');
  }
}

async function health() {
  return { reachable: !!env.groqApiKey, modelInstalled: !!env.groqApiKey, model: env.groqModel };
}

module.exports = { complete, health, model: () => env.groqModel };
