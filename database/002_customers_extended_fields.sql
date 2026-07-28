-- Extend the customers table with all fields used by the New/Edit Customer form.
-- Run this once in your Supabase SQL editor.

alter table customers
  add column if not exists contact_name           text,
  add column if not exists job_title              text,
  add column if not exists telephone              text,
  add column if not exists mobile                 text,
  add column if not exists fax                    text,
  add column if not exists website                text,
  add column if not exists region                 text,
  add column if not exists address                text,
  add column if not exists city                   text,
  add column if not exists county                 text,
  add column if not exists postcode               text,
  add column if not exists country                text,
  add column if not exists site_notes             text,
  add column if not exists currency               text default 'South African Rand - RAND',
  add column if not exists credit_limit           numeric(12,2) default 0,
  add column if not exists discount               numeric(8,4)  default 0,
  add column if not exists discount_type          text default 'Percentage',
  add column if not exists sage_ref               text,
  add column if not exists company_reg            text,
  add column if not exists vat_no                 text,
  add column if not exists payment_terms          text default '30 days',
  add column if not exists assigned_products_only boolean default false,
  add column if not exists notes                  text;
