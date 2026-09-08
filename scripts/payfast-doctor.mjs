#!/usr/bin/env node
/**
 * PayFast signature doctor.
 *
 * "Generated signature does not match submitted signature" is PayFast's answer
 * to every signing problem, and it never says which input was wrong. This walks
 * the whole configuration matrix — sandbox vs live, passphrase vs no passphrase
 * — and asks PayFast itself which combination it accepts, so the answer comes
 * from the gateway rather than from guesswork.
 *
 * Nothing is charged. Each probe posts a throwaway payment and reads the page
 * PayFast renders back; no ITN fires and no payment is completed.
 *
 * Usage:
 *   node scripts/payfast-doctor.mjs
 *
 * Credentials are read from the environment, or from a .env.payfast file in the
 * project root (git-ignored), whichever is present:
 *
 *   PAYFAST_MERCHANT_ID=10000100
 *   PAYFAST_MERCHANT_KEY=46f0cd694581a
 *   PAYFAST_PASSPHRASE=your-passphrase
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// A local .env.payfast keeps these out of the shell history and out of .env,
// which is bundled into the frontend build by Vite.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(l => l.trim() && !l.trim().startsWith('#'))
      .map(l => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      })
      .filter(([k]) => k)
  )
}

const fileEnv = loadEnvFile(path.join(root, '.env.payfast'))
const pick = name => (process.env[name] ?? fileEnv[name] ?? '')

const rawId   = pick('PAYFAST_MERCHANT_ID')
const rawKey  = pick('PAYFAST_MERCHANT_KEY')
const rawPass = pick('PAYFAST_PASSPHRASE')

const merchantId  = rawId.trim()
const merchantKey = rawKey.trim()
const passphrase  = rawPass.trim()

if (!merchantId || !merchantKey) {
  console.error(`
Missing credentials.

Create ${path.join(root, '.env.payfast')} containing:

  PAYFAST_MERCHANT_ID=...
  PAYFAST_MERCHANT_KEY=...
  PAYFAST_PASSPHRASE=...        # leave blank if the account has none

Use the credentials from the PayFast dashboard you are actually pointing at.
Sandbox and live are separate accounts with entirely separate credentials.
`)
  process.exit(1)
}

const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex')

// Mirrors payfastEncode() in supabase/functions/create-payfast-payment — PHP's
// urlencode(), which differs from encodeURIComponent on !'()*~ and on spaces.
const payfastEncode = value =>
  encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/[!'()*~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())

function buildSignature(fields, pass) {
  let paramString = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${payfastEncode(String(v))}`)
    .join('&')
  if (pass) paramString += `&passphrase=${payfastEncode(pass)}`
  return paramString
}

const ENDPOINTS = {
  sandbox: 'https://sandbox.payfast.co.za/eng/process',
  live: 'https://www.payfast.co.za/eng/process',
}

// PayFast strips characters such as < and > from the values it receives before
// recomputing the signature, so a notify_url still holding a placeholder like
// https://<your-project-ref>.supabase.co can never produce a matching signature.
// Signing it here means the probe exercises the same field set the real function
// sends, instead of passing on a minimal payload that omits the broken one.
const refFile = path.join(root, 'supabase', '.temp', 'project-ref')
const projectRef = fs.existsSync(refFile) ? fs.readFileSync(refFile, 'utf8').trim() : ''
const itnUrl = projectRef ? `https://${projectRef}.supabase.co/functions/v1/payfast-itn` : ''

async function probe(processUrl, pass) {
  const fields = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    ...(itnUrl ? { notify_url: itnUrl } : {}),
    amount: '150.00',
    item_name: 'Signature self-test',
  }
  const signature = md5(buildSignature(fields, pass))
  try {
    const res = await fetch(processUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...fields, signature }).toString(),
    })
    const text = await res.text()
    const complaint = text.match(/is invalid:([\s\S]{0,300}?)</i)?.[1]
    return {
      ok: res.status === 200 && !/signature does not match/i.test(text),
      status: res.status,
      sigMismatch: /signature does not match/i.test(text),
      complaint: complaint ? complaint.replace(/\s+/g, ' ').trim() : null,
    }
  } catch (e) {
    return { ok: false, status: 0, sigMismatch: false, complaint: `request failed: ${e.message}` }
  }
}

// Flags the invisible causes: a trailing newline from a dashboard paste, or a
// smart quote picked up from a document. Values themselves are never printed.
function audit(label, raw, trimmed) {
  const notes = []
  if (raw.length !== trimmed.length) notes.push('HAS SURROUNDING WHITESPACE — this alone breaks the signature')
  if (/[^\x20-\x7E]/.test(trimmed)) notes.push('CONTAINS NON-ASCII (smart quotes? pasted from a document?)')
  return `  ${label.padEnd(22)} ${trimmed.length ? `${trimmed.length} chars` : '(empty)'}${notes.length ? '  ⚠ ' + notes.join('; ') : ''}`
}

console.log('\nPayFast signature doctor')
console.log('========================\n')
console.log('Credentials under test (values not shown):')
console.log(audit('PAYFAST_MERCHANT_ID', rawId, merchantId))
console.log(audit('PAYFAST_MERCHANT_KEY', rawKey, merchantKey))
console.log(audit('PAYFAST_PASSPHRASE', rawPass, passphrase))

const results = []
for (const [envName, url] of Object.entries(ENDPOINTS)) {
  for (const [passLabel, pass] of [['with configured passphrase', passphrase], ['with NO passphrase', '']]) {
    if (passLabel.includes('configured') && !passphrase) continue
    const r = await probe(url, pass)
    results.push({ envName, passLabel, pass, ...r })
  }
}

console.log('\nProbe results (asking PayFast directly):\n')
for (const r of results) {
  const mark = r.ok ? '✅ ACCEPTED' : '❌ rejected'
  console.log(`  ${mark}  ${r.envName.padEnd(8)} ${r.passLabel}`)
  console.log(`             http ${r.status}${r.sigMismatch ? '  · signature mismatch' : ''}${r.complaint && !r.sigMismatch ? '  · ' + r.complaint : ''}`)
}

const winner = results.find(r => r.ok)

console.log('\n' + '-'.repeat(70))
if (winner) {
  console.log(`\n✅ WORKING CONFIGURATION FOUND\n`)
  console.log(`   Environment : ${winner.envName}`)
  console.log(`   PAYFAST_PROCESS_URL  = ${ENDPOINTS[winner.envName]}`)
  console.log(`   PAYFAST_VALIDATE_URL = ${ENDPOINTS[winner.envName].replace('/eng/process', '/eng/query/validate')}`)
  console.log(`   PAYFAST_PASSPHRASE   = ${winner.pass ? 'the passphrase you supplied (keep it)' : 'MUST BE EMPTY — unset this secret'}`)
  console.log(`\n   Apply it to the deployed function with:\n`)
  console.log(`     npx supabase secrets set PAYFAST_PROCESS_URL="${ENDPOINTS[winner.envName]}"`)
  console.log(`     npx supabase secrets set PAYFAST_VALIDATE_URL="${ENDPOINTS[winner.envName].replace('/eng/process', '/eng/query/validate')}"`)
  if (winner.pass) {
    console.log(`     npx supabase secrets set PAYFAST_PASSPHRASE="<the passphrase you supplied>"`)
  } else {
    console.log(`     npx supabase secrets unset PAYFAST_PASSPHRASE`)
  }
  console.log()
} else {
  console.log(`
❌ NO COMBINATION WORKED

Every endpoint and passphrase combination was rejected, so the merchant ID and
key themselves do not belong to the account being addressed. The usual cause is
mixing the two environments: sandbox and live are separate accounts, and live
credentials are always rejected by sandbox (and vice versa).

Check, in the PayFast dashboard you are actually using:

  · Sandbox credentials come from https://sandbox.payfast.co.za
    The universal test account is merchant_id 10000100, merchant_key
    46f0cd694581a, passphrase jt7NOE43FZPn — that passphrase is required.

  · Live credentials come from Settings → Integration at
    https://my.payfast.co.za, and the passphrase there must match exactly.
    If the dashboard's passphrase field is blank, leave PAYFAST_PASSPHRASE unset.
`)
}
