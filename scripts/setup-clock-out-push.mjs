#!/usr/bin/env node
/**
 * Lets the database ask the send-push function to deliver alerts.
 *
 * The automatic 17:00 clock-out (migration 20261112090000) runs inside the
 * database, with nobody signed in, so it can't use a person's login to call
 * send-push. Instead the two share a secret:
 *
 *   • the function reads it from its CRON_SECRET environment secret
 *   • the database reads it from Supabase Vault (send_push_secret), together
 *     with the function's address (send_push_url)
 *
 * This script makes up a fresh random secret, stores it in both places, and
 * redeploys send-push so it picks it up. Safe to run again at any time — it
 * replaces both halves together (do that if you ever think the secret leaked).
 *
 * Usage:   node scripts/setup-clock-out-push.mjs
 * Needs:   the Supabase CLI logged in and linked (npx supabase link).
 *
 * The secret never appears on a command line or on screen: it travels through
 * two short-lived temp files (git-ignored, deleted afterwards).
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const refFile = path.join(root, 'supabase', '.temp', 'project-ref')
if (!fs.existsSync(refFile)) {
  console.error(`\nCannot find ${refFile} — run "npx supabase link" first.\n`)
  process.exit(1)
}
const projectRef = fs.readFileSync(refFile, 'utf8').trim()
const functionUrl = `https://${projectRef}.supabase.co/functions/v1/send-push`
const secret = crypto.randomBytes(32).toString('hex')

const run = (cmdArgs, label) => {
  // npx resolves to npx.cmd on Windows, which Node refuses to spawn without a
  // shell. Nothing secret is ever in these arguments (files carry it), so
  // there is nothing for the shell to mangle.
  const r = spawnSync('npx', cmdArgs, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  // Throws rather than exiting, so the temp files below are always cleaned up
  // (process.exit() would skip the "finally" that deletes them).
  if (r.status !== 0) throw new Error(label)
}

// send-push reads notifications.urgent, which arrives with the migrations. The
// new function deployed ahead of them would fail every alert, so check first.
const probeSql = "select count(*) as n from information_schema.columns where table_name = 'notifications' and column_name = 'urgent'"
const probe = spawnSync(
  'npx',
  ['supabase', 'db', 'query', '--linked', '-o', 'json', process.platform === 'win32' ? `"${probeSql}"` : probeSql],
  { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' },
)
if (!/"n":\s*"?1"?/.test(probe.stdout || '')) {
  console.error('\n❌ The database does not have the new migrations yet. Run this first:\n\n   npx supabase db push --linked\n')
  process.exit(1)
}

// Names start with ".env." so .gitignore already covers them. They are passed
// to the CLI by bare file name (it runs in the project folder): a full path
// breaks the moment a folder name has a space in it, like "19 May 2026".
const tmpEnvName = `.env.clockout-secret.${process.pid}.tmp`
const tmpSqlName = `.env.clockout-vault.${process.pid}.tmp`
const tmpEnv = path.join(root, tmpEnvName)
const tmpSql = path.join(root, tmpSqlName)
let failure = null
try {
  console.log('1/3  Giving send-push the secret (value not printed)')
  fs.writeFileSync(tmpEnv, `CRON_SECRET=${secret}\n`, { mode: 0o600 })
  run(['supabase', 'secrets', 'set', '--env-file', tmpEnvName], 'set CRON_SECRET')

  console.log('\n2/3  Giving the database the same secret and the function address (Vault)')
  // One DO block = one statement, which is all `db query --linked` accepts.
  fs.writeFileSync(tmpSql, `
do $$
begin
  delete from vault.secrets where name in ('send_push_url', 'send_push_secret');
  perform vault.create_secret('${functionUrl}', 'send_push_url', 'Where the database calls the send-push function');
  perform vault.create_secret('${secret}', 'send_push_secret', 'Shared with send-push as CRON_SECRET');
end $$;
`, { mode: 0o600 })
  run(['supabase', 'db', 'query', '--linked', '-f', tmpSqlName], 'store the secret in the vault')
} catch (err) {
  failure = err.message
} finally {
  // Always remove them, including on a failed or interrupted run.
  for (const f of [tmpEnv, tmpSql]) if (fs.existsSync(f)) fs.rmSync(f, { force: true })
}
if (failure) {
  console.error(`\n❌ Failed: ${failure}\n`)
  process.exit(1)
}

console.log('\n3/3  Redeploying send-push so it picks the secret up')
try {
  run(['supabase', 'functions', 'deploy', 'send-push'], 'deploy send-push')
} catch (err) {
  console.error(`\n❌ Failed: ${err.message}\n`)
  process.exit(1)
}

console.log(`
✅ Done. The database can now ask send-push to deliver alerts to phones and
   browsers that have the app closed (used by the automatic 17:00 clock-out).
`)
