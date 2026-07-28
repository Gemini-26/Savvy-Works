# PHASE 1 DATABASE PLAN

## Multi-tenancy rule (CRITICAL)
This is a multi-tenant app. Every business that signs up gets their own isolated
data. The mechanism is a `company_id` UUID column on every business-data table.
Supabase Row Level Security (RLS) enforces this at the database level — users
can only ever read/write rows that belong to their own company.

---

## Root tables (no company_id — they ARE the tenant)

### companies
- id (uuid, PK)
- name (text)
- slug (text, unique)         -- used in URLs / branding
- industry (text)             -- e.g. 'plumbing', 'electrical', 'civils'
- country (text, default 'ZA')
- created_at (timestamptz)

### company_members
- id (uuid, PK)
- company_id (uuid, FK → companies.id)
- user_id (uuid, FK → auth.users.id)
- role (text)                 -- 'owner' | 'admin' | 'technician' | 'viewer'
- created_at (timestamptz)

> RLS helper: all policies call get_my_company_id() which does:
>   SELECT company_id FROM company_members WHERE user_id = auth.uid() LIMIT 1

---

## Business-data tables (all carry company_id)

### customers
- id, company_id, name, customer_type, email, phone, address, active, created_at

### customer_contacts
- id, company_id, customer_id, name, email, phone, role, created_at

### customer_sites
- id, company_id, customer_id, name, address, lat, lng, created_at

### leads
- id, company_id, customer_id (nullable), title, status, source,
  assigned_to, created_at

### quotes
- id, company_id, lead_id (nullable), customer_id, quote_number,
  status, total_amount, valid_until, created_at

### jobs
- id, company_id, quote_id (nullable), customer_id, job_number,
  title, status, priority, scheduled_start, scheduled_end,
  assigned_to, created_at

### invoices
- id, company_id, job_id (nullable), customer_id, invoice_number,
  status, amount_due, due_date, paid_at, created_at

### suppliers
- id, company_id, name, contact_name, email, phone, active, created_at

### teams
- id, company_id, name, description, created_at

### attachments
- id, company_id, entity_type (text), entity_id (uuid),
  file_name, file_url, created_at

### activities
- id, company_id, entity_type (text), entity_id (uuid),
  user_id, action (text), notes (text), created_at

---

## Rules: every business-data table must support
- company_id          — tenant isolation (enforced by RLS)
- status tracking     — defined status column with constants in /shared/constants
- activity history    — log inserts/updates to activities table
- attachments         — linkable via attachments(entity_type, entity_id)
- ownership           — assigned_to or created_by user reference
- timestamps          — created_at, updated_at
- conversion lifecycle — e.g. lead → quote → job → invoice

---

## Supabase RLS — run this SQL in your Supabase SQL editor

```sql
-- 1. Helper function: returns the company_id for the current logged-in user
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT company_id
  FROM company_members
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- 2. Example RLS for the customers table (repeat this pattern for every table)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can select their company customers"
ON customers FOR SELECT
USING (company_id = get_my_company_id());

CREATE POLICY "members can insert into their company customers"
ON customers FOR INSERT
WITH CHECK (company_id = get_my_company_id());

CREATE POLICY "members can update their company customers"
ON customers FOR UPDATE
USING (company_id = get_my_company_id());

-- Repeat ALTER TABLE ... ENABLE ROW LEVEL SECURITY
-- and CREATE POLICY blocks for every table listed above.
```
