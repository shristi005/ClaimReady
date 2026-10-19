const os = require('os');
const env = require('./config/env');
const app = require('./app');
const { getDb } = require('./db');
const repo = require('./services/claimsRepository');
const llm = require('./llm/llmClient');

async function main() {
  getDb(); // creates the database file and tables on first run
  await repo.failStuckClaims();
  app.listen(env.port, () => {
    console.log(`ClaimReady ${app.locals.serveWeb ? 'app + API' : 'API only (build the frontend to serve it here)'} on http://localhost:${env.port}`);
    if (app.locals.serveWeb) {
      const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${env.port}`);
      if (lan.length) console.log(`Others on the same Wi-Fi can open: ${lan.join('  or  ')}`);
    }
    console.log(`Data folder: ${env.dataDir}`);
    console.log(`AI: ${llm.describe()}`);
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
