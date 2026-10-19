// Runs analyses ONE AT A TIME. A small laptop cannot run two local-model jobs at once.
const { runPipeline } = require('../services/pipeline');
const repo = require('../services/claimsRepository');

let chain = Promise.resolve();

function enqueueAnalysis(job) {
  chain = chain.then(() => run(job)).catch((e) => console.error('queue error:', e));
}

async function run({ claimId, orgId, userId, files }) {
  try {
    const result = await runPipeline(files, (stage, progress) => repo.setStage(claimId, stage, progress));
    await repo.saveResults(claimId, orgId, result);
    await repo.audit({ orgId, userId, claimId, action: 'analysis_completed', detail: { issues: result.issues.length, model: result.modelUsed } });
  } catch (e) {
    console.error(`analysis failed for ${claimId}:`, e.message);
    await repo.failClaim(claimId, e.message);
    await repo.audit({ orgId, userId, claimId, action: 'analysis_failed', detail: { error: e.message } });
  }
}

module.exports = { enqueueAnalysis };
