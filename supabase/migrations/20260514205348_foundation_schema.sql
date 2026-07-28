create extension if not exists "pgcrypto";

create table customers (
  id uuid primary key default gen_random_uuid(),
  customer_type text not null default 'private',
  customer_name text not null,
  email text,
  phone text,
  status text not null default 'active',
  created_at timestamptz default now()
);

create table customer_sites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  site_name text,
  address_line_1 text,
  city text,
  province text,
  created_at timestamptz default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  source text,
  status text not null default 'new',
  assigned_to uuid,
  created_at timestamptz default now()
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  lead_id uuid references leads(id),
  quote_number text unique,
  status text not null default 'draft',
  total numeric(12,2) default 0,
  created_at timestamptz default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  quote_id uuid references quotes(id),
  assigned_to uuid,
  status text not null default 'unassigned',
  scheduled_for timestamptz,
  created_at timestamptz default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  job_id uuid references jobs(id),
  invoice_number text unique,
  status text not null default 'draft',
  total numeric(12,2) default 0,
  created_at timestamptz default now()
);
