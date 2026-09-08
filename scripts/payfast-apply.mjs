#!/usr/bin/env node
/**
 * Applies the PayFast configuration that scripts/payfast-doctor.mjs proved the
 * gateway accepts, then redeploys the edge function so it picks the new values
 * up. Kept as a script rather than a list of commands to copy because the
 * credentials never have to pass through a terminal — and therefore never land
 * in shell history, where a live merchant key really should not be.
 *
 * Usage:
 *   node scripts/payfast-apply.mjs --live       # point at the live gateway
 *   node scripts/payfast-apply.mjs --sandbox    # point at the sandbox gateway
 *   node scripts/payfast-apply.mjs --live --dry-run
 *
 * Reads credentials from .env.payfast (git-ignored). Run the doctor first —
 * this deliberately refuses to apply a combination PayFast has not accepted.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const wantLive = args.includes('--live')
const wantSandbox = args.includes('--sandbox')

if (wantLive === wantSandbox) {
  console.error('\nSpecify exactly one of --live or --sandbox.\n')
  process.exit(1)
}

const envFile = path.join(root, '.env.payfast')
if (!fs.existsSync(envFile)) {
  console.error(`\nMissing ${envFile}. See scripts/payfast-doctor.mjs for the format.\n`)
  process.exit(1)
}

const creds = Object.fromEntries(
  fs.readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter(l => l.trim() && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const merchantId = (creds.PAYFAST_MERCHANT_ID || '').trim()
const merchantKey = (creds.PAYFAST_MERCHANT_KEY || '').trim()
const passphrase = (creds.PAYFAST_PASSPHRASE || '').trim()

if (!merchantId || !merchantKey) {
  console.error('\n.env.payfast is missing PAYFAST_MERCHANT_ID or PAYFAST_MERCHANT_KEY.\n')
  process.exit(1)
}

const base = wantLive ? 'https://www.payfast.co.za' : 'https://sandbox.payfast.co.za'
const processUrl = `${base}/eng/process`
const validateUrl = `${base}/eng/query/validate`

// Derived from the linked project rather than typed by hand. A hand-entered
// value is how PAYFAST_ITN_URL ended up as the literal string
// "https://<your-project-ref>.supabase.co/functions/v1/payfast-itn", and PayFast
// strips < and > before recomputing the signature — so the payment was rejected
// as a signature mismatch, with nothing pointing at the URL that caused it.
const refFile = path.join(root, 'supabase', '.temp', 'project-ref')
if (!fs.existsSync(refFile)) {
  console.error(`\nCannot find ${refFile} — run "npx supabase link" first.\n`)
  process.exit(1)
}
const projectRef = fs.readFileSync(refFile, 'utf8').trim()
if (!/^[a-z]{20}$/.test(projectRef)) {
  console.error(`\nProject ref "${projectRef}" does not look valid.\n`)
  process.exit(1)
}
const itnUrl = `https://${projectRef}.supabase.co/functions/v1/payfast-itn`

// --- Re-verify before touching anything ---------------------------------
// Pushing a configuration the gateway rejects would just recreate the original
// bug with fresh values, so confirm acceptance first and bail if it fails.
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex')
const payfastEncode = v =>
  encodeURIComponent(v)
    .replace(/%20/g, '+')
    .replace(/[!'()*~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())

// notify_url is included deliberately. A minimal probe would sign only the
// credentials and pass, hiding exactly the failure that made this script
// necessary — the gateway only objects once the offending field is present.
const probeFields = {
  merchant_id: merchantId,
  merchant_key: merchantKey,
  notify_url: itnUrl,
  amount: '150.00',
  item_name: 'Signature self-test',
}
let paramString = Object.entries(probeFields).map(([k, v]) => `${k}=${payfastEncode(v)}`).join('&')
if (passphrase) paramString += `&passphrase=${payfastEncode(passphrase)}`

console.log(`\nVerifying these credentials against ${base} …`)
const res = await fetch(processUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ ...probeFields, signature: md5(paramString) }).toString(),
})
const text = await res.text()
if (res.status !== 200 || /signature does not match/i.test(text)) {
  console.error(`\n❌ PayFast rejected this combination (http ${res.status}). Nothing was changed.`)
  console.error(`   Run: node scripts/payfast-doctor.mjs\n`)
  process.exit(1)
}
console.log(`✅ PayFast accepted them (http 200).\n`)

if (wantLive) {
  console.log('⚠️  LIVE MODE — after this, payment links take real money from real cards.\n')
}

const secrets = {
  PAYFAST_MERCHANT_ID: merchantId,
  PAYFAST_MERCHANT_KEY: merchantKey,
  PAYFAST_PROCESS_URL: processUrl,
  PAYFAST_VALIDATE_URL: validateUrl,
  PAYFAST_ITN_URL: itnUrl,
}
if (passphrase) secrets.PAYFAST_PASSPHRASE = passphrase

const run = (cmdArgs, label) => {
  if (dryRun) {
    console.log(`  [dry-run] ${label}`)
    return true
  }
  // npx resolves to npx.cmd on Windows, which Node refuses to spawn without a
  // shell, so shell mode is unavoidable here. That makes it essential that no
  // secret ever appears in argv — hence --env-file below. These arguments are
  // all static, so there is nothing for the shell to mangle.
  const r = spawnSync('npx', cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (r.status !== 0) {
    console.error(`\n❌ Failed: ${label}\n`)
    process.exit(1)
  }
  return true
}

// Secrets go via --env-file rather than NAME=VALUE arguments. Arguments are
// visible to any other process on the machine through the process list, and on
// Windows they would additionally be concatenated into a shell command, where a
// passphrase containing &, |, ^ or a quote would be corrupted or executed.
const tmpEnv = path.join(root, `.payfast-secrets.${process.pid}.tmp`)
try {
  console.log('Setting Supabase secrets (values not printed):')
  for (const name of Object.keys(secrets)) console.log(`  ${name}`)

  if (!dryRun) {
    fs.writeFileSync(
      tmpEnv,
      Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n') + '\n',
      { mode: 0o600 }
    )
  }
  run(['supabase', 'secrets', 'set', '--env-file', tmpEnv], 'set PayFast secrets')

  if (!passphrase) {
    console.log('\nNo passphrase configured — clearing any previously set one:')
    run(['supabase', 'secrets', 'unset', 'PAYFAST_PASSPHRASE'], 'unset PAYFAST_PASSPHRASE')
  }
} finally {
  // Always remove it, including on a failed or interrupted run — this file holds
  // the live merchant key in the clear.
  if (fs.existsSync(tmpEnv)) fs.rmSync(tmpEnv, { force: true })
}

console.log('\nRedeploying the edge functions so they pick up the new values:')
run(['supabase', 'functions', 'deploy', 'create-payfast-payment'], 'deploy create-payfast-payment')
run(['supabase', 'functions', 'deploy', 'payfast-itn'], 'deploy payfast-itn')

console.log(`
✅ Done — ${wantLive ? 'LIVE' : 'SANDBOX'} configuration applied and functions redeployed.

   merchant_id  ${merchantId}
   process_url  ${processUrl}
   notify_url   ${itnUrl}
   passphrase   ${passphrase ? 'set' : 'none'}

Now reload the app and click "Preview Payment Page".${wantLive ? `

⚠️  This is the live gateway. The checkout that opens is real — close it rather
    than completing it, unless you intend to make an actual payment.` : ''}
`)
