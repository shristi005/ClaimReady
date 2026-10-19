// The whole database is one SQLite file. No server, no account, works offline.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const env = require('./config/env');

const TS = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"; // ISO timestamps in UTC

const SCHEMA = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ${TS}
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT ${TS}
);
CREATE TABLE IF NOT EXISTS memberships (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin','reviewer','viewer')),
  full_name TEXT,
  created_at TEXT NOT NULL DEFAULT ${TS}
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','reviewer','viewer')),
  code TEXT NOT NULL UNIQUE,
  created_by TEXT,
  expires_at TEXT NOT NULL,
  used_by TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${TS}
);
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by TEXT,
  claim_reference TEXT,
  patient_reference TEXT,
  insurer_name TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  stage TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  issue_count INTEGER NOT NULL DEFAULT 0,
  model_used TEXT,
  created_at TEXT NOT NULL DEFAULT ${TS}
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  storage_path TEXT,
  original_name TEXT,
  mime_type TEXT,
  extraction_method TEXT,
  extraction_confidence REAL,
  extracted_json TEXT
);
CREATE TABLE IF NOT EXISTS claim_issues (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  issue_type TEXT,
  severity TEXT,
  field TEXT,
  expected TEXT,
  found TEXT,
  message TEXT,
  action TEXT,
  source_documents TEXT,
  evidence TEXT,
  grounded INTEGER NOT NULL DEFAULT 1,
  review_status TEXT NOT NULL DEFAULT 'open',
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${TS}
);
CREATE TABLE IF NOT EXISTS insurer_queries (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  deadline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','waiting_documents','ready_review','responded')),
  response_draft TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT ${TS},
  updated_at TEXT NOT NULL DEFAULT ${TS}
);
CREATE TABLE IF NOT EXISTS claim_payments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL UNIQUE REFERENCES claims(id) ON DELETE CASCADE,
  claimed_amount REAL NOT NULL DEFAULT 0 CHECK (claimed_amount >= 0),
  approved_amount REAL CHECK (approved_amount IS NULL OR approved_amount >= 0),
  received_amount REAL NOT NULL DEFAULT 0 CHECK (received_amount >= 0),
  payment_date TEXT,
  note TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT ${TS},
  updated_at TEXT NOT NULL DEFAULT ${TS}
);
CREATE TABLE IF NOT EXISTS payment_adjustments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL REFERENCES claim_payments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('deduction','other')),
  amount REAL NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT ${TS}
);
CREATE TABLE IF NOT EXISTS packet_checklist_items (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'document' CHECK (kind IN ('document','signature','other')),
  required INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'missing' CHECK (status IN ('missing','present','needs_review')),
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ${TS},
  UNIQUE (claim_id, label)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  user_id TEXT,
  claim_id TEXT,
  action TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT ${TS}
);
CREATE INDEX IF NOT EXISTS idx_claims_org ON claims (org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_issues_claim ON claim_issues (claim_id);
CREATE INDEX IF NOT EXISTS idx_docs_claim ON documents (claim_id);
CREATE INDEX IF NOT EXISTS idx_queries_org ON insurer_queries (org_id, deadline);
CREATE INDEX IF NOT EXISTS idx_payments_org ON claim_payments (org_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_adjustments_payment ON payment_adjustments (payment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_packet_claim ON packet_checklist_items (org_id, claim_id);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log (org_id, created_at);
`;

let db;
function getDb() {
  if (!db) {
    if (env.dbPath !== ':memory:') fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });
    db = new Database(env.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);
  }
  return db;
}

module.exports = { getDb };
