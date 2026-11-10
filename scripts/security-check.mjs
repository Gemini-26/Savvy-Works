// Automatic security check for Savvy Works. Run: node scripts/security-check.mjs
//
// Asks the live system the same questions the 2026-11-09 audit asked and prints
// PASS / FAIL for each. It only reads: no data is changed and no row contents
// are fetched (the anonymous test counts rows, nothing more).
//
// Needs: the Supabase CLI logged in and linked (for the database checks), and
// the public VITE_ keys in .env. Anything it cannot check shows as SKIP.

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const SITE = 'https://savvy-works.vercel.app'
const REPO = 'Gemini-26/Savvy-Works'

const env = {}
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '').trim()
  }
} catch { /* .env missing: the web checks will SKIP */ }

const results = []
const add = (id, label, status, detail = '') => results.push({ id, label, status, detail })
const pass = ok => (ok ? 'PASS' : 'FAIL')

function sql(query) {
  const out = execSync(`npx supabase db query --linked -o json "${query}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 90000 })
  return JSON.parse(out.slice(out.indexOf('{'))).rows
}

async function run() {
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY

  // 1. Can somebody with no login read customer data?
  if (url && key) {
    const counts = {}
    for (const t of ['customers', 'jobs', 'leads', 'customer_contacts', 'customer_activity_log']) {
      try {
        const r = await fetch(`${url}/rest/v1/${t}?select=id`, {
          headers: { apikey: key, Authorization: `Bearer ${key}`, Range: '0-0', Prefer: 'count=exact' },
        })
        const total = (r.headers.get('content-range') || '').split('/')[1]
        counts[t] = total === '*' || total === undefined ? 0 : Number(total)
      } catch (e) { counts[t] = `error: ${e.message}` }
    }
    const leaked = Object.entries(counts).filter(([, n]) => n !== 0)
    add('anon-read', 'Nobody without a login can read customers, jobs or leads', pass(leaked.length === 0),
      leaked.length ? leaked.map(([t, n]) => `${t}=${n}`).join(', ') : 'all return 0 rows')

    // 2. Is public sign-up still open?
    try {
      const s = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })).json()
      add('signup-off', 'Public sign-up is switched off', pass(s.disable_signup === true), `disable_signup=${s.disable_signup}`)
    } catch (e) { add('signup-off', 'Public sign-up is switched off', 'SKIP', e.message) }

    // 3. Can a stranger burn document numbers?
    try {
      const r = await fetch(`${url}/rest/v1/rpc/next_document_number`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_company_id: '00000000-0000-0000-0000-000000000000', p_doc_type: 'zz' }),
      })
      add('anon-numbers', 'Strangers cannot use the document-number counter', pass(r.status === 401 || r.status === 403), `HTTP ${r.status}`)
    } catch (e) { add('anon-numbers', 'Strangers cannot use the document-number counter', 'SKIP', e.message) }
  } else {
    add('anon-read', 'Nobody without a login can read customers, jobs or leads', 'SKIP', 'no .env keys')
  }

  // 4. Is the source code still public?
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}`, { headers: { 'User-Agent': 'savvy-works-security-check' } })
    add('repo-private', 'The GitHub repository is private', pass(r.status === 404), r.status === 200 ? 'still PUBLIC' : `HTTP ${r.status}`)
  } catch (e) { add('repo-private', 'The GitHub repository is private', 'SKIP', e.message) }

  // 5. Security headers on the live website
  try {
    const h = (await fetch(SITE, { method: 'HEAD' })).headers
    const csp = h.get('content-security-policy')
    add('hdr-csp', 'Website sends a Content-Security-Policy', pass(!!csp), csp ? 'present' : 'missing')
    add('hdr-frame', 'Website cannot be framed by other sites', pass(!!h.get('x-frame-options') || /frame-ancestors/i.test(csp || '')), h.get('x-frame-options') || 'missing')
    add('hdr-nosniff', 'Website sends X-Content-Type-Options: nosniff', pass((h.get('x-content-type-options') || '').toLowerCase() === 'nosniff'), h.get('x-content-type-options') || 'missing')
    add('hdr-referrer', 'Website sends a Referrer-Policy', pass(!!h.get('referrer-policy')), h.get('referrer-policy') || 'missing')
  } catch (e) { add('hdr-csp', 'Website security headers', 'SKIP', e.message) }

  // 6. Database checks (through the linked Supabase project)
  const db = [
    ['open-policies', 'No "let everyone through" database rules remain',
      "select count(*)::int as n from pg_policies where schemaname='public' and (trim(both '()' from coalesce(qual,'')) in ('true','auth.role() = ''authenticated''::text') or trim(both '()' from coalesce(with_check,'')) in ('true','auth.role() = ''authenticated''::text')) and policyname not like 'storage%'",
      r => [r[0].n === 0, `${r[0].n} open rule(s)`]],
    ['profile-guard', 'Only admins can change a role, company or active status',
      "select (select count(*) from pg_trigger where tgrelid='public.profiles'::regclass and tgname='profiles_guard_privileged')::int as g, (select count(*) from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_company_isolation')::int as old",
      r => [r[0].g === 1 && r[0].old === 0, `guard trigger=${r[0].g}, old open rule=${r[0].old}`]],
    ['mfa-admins', 'Every active admin has two-factor sign-in',
      "select (select count(*) from profiles where role='admin' and is_active)::int as admins, (select count(distinct f.user_id) from auth.mfa_factors f join profiles p on p.auth_user_id=f.user_id where f.status='verified' and p.role='admin' and p.is_active)::int as with_mfa",
      r => [r[0].admins > 0 && r[0].with_mfa >= r[0].admins, `${r[0].with_mfa} of ${r[0].admins} admins`]],
    ['role-rules', 'Money and payroll tables only let admins change them',
      "select count(*)::int as n from pg_policies where schemaname='public' and tablename in ('invoices','invoice_items','quotes','quote_items','purchase_orders','purchase_order_items','items','suppliers','companies','team_members','team_member_shifts') and cmd in ('ALL','INSERT','UPDATE','DELETE') and coalesce(qual,'')||coalesce(with_check,'') not like '%get_my_role%'",
      r => [r[0].n === 0, `${r[0].n} write rule(s) still allow any staff member`]],
  ]
  for (const [id, label, query, judge] of db) {
    try {
      const [ok, detail] = judge(sql(query))
      add(id, label, pass(ok), detail)
    } catch (e) { add(id, label, 'SKIP', 'Supabase CLI not available or not linked') }
  }

  // 7. Known-vulnerable packages that ship to users
  try {
    let raw
    try { raw = execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 90000 }) }
    catch (e) { raw = e.stdout }
    const v = JSON.parse(raw).metadata.vulnerabilities
    add('npm-audit', 'No high or critical vulnerabilities in packages that ship to users', pass(v.high + v.critical === 0), `high=${v.high}, critical=${v.critical}, moderate=${v.moderate}`)
  } catch { add('npm-audit', 'No high or critical vulnerabilities in packages that ship to users', 'SKIP', 'npm audit unavailable') }
}

await run()

const width = Math.max(...results.map(r => r.label.length))
console.log(`\nSavvy Works security check, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC\n`)
for (const r of results) console.log(`${r.status.padEnd(5)} ${r.label.padEnd(width)}  ${r.detail}`)
const failed = results.filter(r => r.status === 'FAIL').length
const skipped = results.filter(r => r.status === 'SKIP').length
console.log(`\n${results.length - failed - skipped} passing, ${failed} failing, ${skipped} skipped`)
console.log('JSON ' + JSON.stringify(Object.fromEntries(results.map(r => [r.id, r.status]))))
process.exitCode = failed ? 1 : 0
