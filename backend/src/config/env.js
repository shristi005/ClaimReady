require('dotenv').config();
const path = require('path');

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const tp = process.env.TRUST_PROXY;
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, '..', '..', 'data');

module.exports = {
  port: num(process.env.PORT, 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  dataDir,
  webDir: process.env.WEB_DIR ? path.resolve(process.env.WEB_DIR) : path.resolve(__dirname, '..', '..', '..', 'frontend', 'dist'),
  trustProxy: tp === undefined || tp === '' ? 0 : Number.isNaN(Number(tp)) ? tp : Number(tp),
  dbPath: process.env.DB_PATH || path.join(dataDir, 'claimready.db'),
  uploadsDir: path.join(dataDir, 'uploads'),
  sessionIdleMinutes: num(process.env.SESSION_IDLE_MINUTES, 30),
  sessionMaxHours: num(process.env.SESSION_MAX_HOURS, 12),
  maxUploadMb: num(process.env.MAX_UPLOAD_MB, 10),
  llmProvider: (process.env.LLM_PROVIDER || 'ollama').toLowerCase(),
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || '',
  ollamaNumCtx: num(process.env.OLLAMA_NUM_CTX, 4096),
  ollamaKeepAlive: process.env.OLLAMA_KEEP_ALIVE || '5m',
  llmTimeoutMs: num(process.env.LLM_TIMEOUT_MS, 180000),
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
};
