// One interface for every model provider. Switch with LLM_PROVIDER in .env.
const env = require('../config/env');

function provider() {
  return env.llmProvider === 'groq' ? require('./groqProvider') : require('./ollamaProvider');
}

const complete = (args) => provider().complete(args);
const describe = () => `${env.llmProvider}:${provider().model() || 'no-model-set'}`;
async function status() {
  return { provider: env.llmProvider, ...(await provider().health()) };
}

module.exports = { complete, describe, status };
