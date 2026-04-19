import { neon } from '@neondatabase/serverless';

function getSQL() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return neon(process.env.DATABASE_URL);
}

/**
 * Initialize the database — creates the transfers table if it doesn't exist.
 */
export async function initDB() {
  const sql = getSQL();
  await sql`
    CREATE TABLE IF NOT EXISTS transfers (
      id SERIAL PRIMARY KEY,
      share_key VARCHAR(6) UNIQUE NOT NULL,
      files JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_transfers_expires ON transfers(expires_at)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_transfers_key ON transfers(share_key)
  `;
}

/**
 * Store a file transfer record.
 * @param {string} key — 6-digit share key
 * @param {Array} files — [{name, size, type, data(base64)}]
 * @param {number} expireSeconds — seconds until expiry (default 600 = 10 min)
 */
export async function storeTransfer(key, files, expireSeconds = 600) {
  const sql = getSQL();
  const filesJson = JSON.stringify(files);
  await sql`
    INSERT INTO transfers (share_key, files, expires_at)
    VALUES (${key}, ${filesJson}::jsonb, NOW() + ${expireSeconds + ' seconds'}::interval)
    ON CONFLICT (share_key) DO UPDATE
    SET files = ${filesJson}::jsonb,
        expires_at = NOW() + ${expireSeconds + ' seconds'}::interval,
        created_at = NOW()
  `;
}

/**
 * Get a transfer by key (only if not expired).
 * @param {string} key — 6-digit share key
 * @returns {Object|null} — {share_key, files, created_at, expires_at} or null
 */
export async function getTransfer(key) {
  const sql = getSQL();
  const rows = await sql`
    SELECT share_key, files, created_at, expires_at
    FROM transfers
    WHERE share_key = ${key} AND expires_at > NOW()
  `;
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Check if a transfer key exists and is not expired.
 * @param {string} key — 6-digit share key
 * @returns {boolean}
 */
export async function checkTransfer(key) {
  const sql = getSQL();
  const rows = await sql`
    SELECT 1 FROM transfers
    WHERE share_key = ${key} AND expires_at > NOW()
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Delete a transfer by key.
 * @param {string} key — 6-digit share key
 */
export async function deleteTransfer(key) {
  const sql = getSQL();
  await sql`DELETE FROM transfers WHERE share_key = ${key}`;
}

/**
 * Clean up expired transfers.
 */
export async function cleanExpired() {
  const sql = getSQL();
  await sql`DELETE FROM transfers WHERE expires_at <= NOW()`;
}
