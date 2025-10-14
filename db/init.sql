-- DB initialization script for local/dev
-- Run this in Supabase SQL editor or psql against your database

-- Enable pgcrypto for password hashing
create extension if not exists pgcrypto;

-- Users table for admin/partner logins
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role text not null,
  created_at timestamptz default now()
);

-- Key/value application settings (e.g., default partner contact number)
create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

create or replace function touch_app_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'app_settings_touch_updated_at'
  ) then
    create trigger app_settings_touch_updated_at
    before insert or update on app_settings
    for each row
    execute function touch_app_settings_updated_at();
  end if;
end;
$$;

-- Customers table
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  shop_name text,
  address text,
  contact text,
  whatsapp_number text,
  outstanding_balance numeric default 0,
  created_at timestamptz default now()
);

-- Backfill whatsapp_number column for existing deployments where the table
-- predates this field. Postgres 9.6+ supports IF NOT EXISTS on ALTER TABLE.
alter table customers
  add column if not exists whatsapp_number text;

-- Transactions table
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  amount numeric,
  quantity numeric,
  type text,
  paid_amount numeric,
  balance numeric,
  status text,
  due_date date,
  created_at timestamptz default now()
);

-- Ensure legacy databases also have the due_date column
alter table transactions
  add column if not exists due_date date;

-- Insert seed users (passwords hashed using crypt())
-- WARNING: This approach is for demo/dev only. For production, use proper password handling and secrets.

-- Partner user
insert into app_users (email, password_hash, role)
values (
  'skkabirali07@gmail.com',
  crypt('partner123', gen_salt('bf')),
  'partner'
)
on conflict (email) do nothing;

-- Admin user
insert into app_users (email, password_hash, role)
values (
  'mk1125709@gmail.com',
  crypt('admin123', gen_salt('bf')),
  'admin'
)
on conflict (email) do nothing;

-- Optional: insert sample customers and transactions
insert into customers (full_name, shop_name, address, contact, outstanding_balance)
values
  ('Rajesh Kumar', 'Kumar Tea Shop', 'MG Road, Bangalore', '+91 9876543210', 5000),
  ('Priya Sharma', 'Sharma General Store', 'Park Street, Kolkata', '+91 9876543211', 2500)
on conflict do nothing;

insert into transactions (customer_id, amount, quantity, type, paid_amount, balance, status)
select c.id, 4000, 50, 'sale', 2000, 2000, 'partial' from customers c where c.full_name = 'Rajesh Kumar'
on conflict do nothing;

-- Authentication helper: verifies password against stored password_hash using pgcrypto
create or replace function authenticate_user(p_email text, p_password text)
returns table(id uuid, email text, role text) as $$
begin
  return query
    select app_users.id, app_users.email, app_users.role
    from app_users
    where app_users.email = p_email
      and app_users.password_hash = crypt(p_password, app_users.password_hash);
end;
$$ language plpgsql stable security definer;

-- Server-side analytics view: aggregates useful admin metrics in one row
drop view if exists analytics_summary;
create or replace view analytics_summary as
with sales as (
  select
    coalesce(sum(amount), 0) as total_sales,
    count(*)                   as sales_count,
    coalesce(avg(amount), 0)   as avg_sale_value,
    max(created_at)            as last_sale_at
  from transactions
  where lower(coalesce(type, '')) <> 'payment'
),
payments as (
  select
    coalesce(sum(amount), 0) as total_collections,
    count(*)                 as payments_count,
    max(created_at)          as last_payment_at
  from transactions
  where lower(coalesce(type, '')) = 'payment'
),
balances as (
  select coalesce(sum(balance), 0) as outstanding_balance from transactions
),
pnl as (
  select coalesce(sum(
    t.amount - (t.quantity * coalesce(b.purchase_rate, 0))
  ), 0) as total_pnl
  from transactions t
  left join batches b on t.batch_id = b.id
  where lower(coalesce(t.type, '')) <> 'payment'
),
today_collections as (
  select coalesce(sum(coalesce(t.paid_amount, 0)), 0) as amount
  from transactions t
  where date_trunc('day', t.created_at) = date_trunc('day', now())
)
select
  sales.total_sales,
  payments.total_collections,
  greatest(balances.outstanding_balance, 0) as outstanding,
  sales.sales_count,
  payments.payments_count,
  sales.avg_sale_value,
  sales.last_sale_at,
  payments.last_payment_at,
  coalesce((select count(*) from customers), 0)    as total_customers,
  coalesce((select count(*) from transactions), 0) as transactions_count,
  pnl.total_pnl,
  today_collections.amount as today_collections
from sales
cross join payments
cross join balances
cross join pnl
cross join today_collections;

-- Batches table to track tea batches / inventory
create table if not exists batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  total_quantity numeric not null,
  remaining_quantity numeric not null,
  purchase_rate numeric not null,
  created_at timestamptz default now()
);

-- Ensure transactions table has batch_id and tea_name columns for inventory tracking
alter table transactions
  add column if not exists batch_id uuid references batches(id) on delete set null,
  add column if not exists tea_name text;

-- Record sale RPC: attempts to insert a transaction and decrement batch remaining quantity atomically
create or replace function record_sale(
  p_batch_id uuid,
  p_customer_id uuid,
  p_quantity numeric,
  p_price_per_kg numeric,
  p_paid_amount numeric,
  p_tx_type text,
  p_due_date date default null
) returns json as $$
declare
  v_batch record;
  v_total numeric;
  v_inserted record;
begin
  select *
    into v_batch
    from batches
   where id = p_batch_id
   for update;

  if not found then
    raise exception 'batch not found';
  end if;

  if coalesce(v_batch.remaining_quantity, 0) < p_quantity then
    raise exception 'insufficient stock';
  end if;

  v_total := p_quantity * p_price_per_kg;

  insert into transactions (
    customer_id,
    amount,
    quantity,
    type,
    paid_amount,
    balance,
    batch_id,
    tea_name,
    due_date,
    created_at
  )
  values (
    p_customer_id,
    v_total,
    p_quantity,
    coalesce(p_tx_type, 'sale'),
    p_paid_amount,
    v_total - coalesce(p_paid_amount, v_total),
    p_batch_id,
    v_batch.name,
    p_due_date,
    now()
  )
  returning * into v_inserted;

  update batches
     set remaining_quantity = remaining_quantity - p_quantity
   where id = p_batch_id;

  return json_build_object('transaction', row_to_json(v_inserted), 'batch_id', p_batch_id);
end;
$$ language plpgsql;

-- Simple view for tea analytics: total sold per tea name / batch
drop view if exists tea_analytics;
create or replace view tea_analytics as
select
  coalesce(t.tea_name, 'Unknown')      as tea_name,
  coalesce(sum(t.quantity), 0)         as total_sold_quantity,
  coalesce(sum(t.amount), 0)           as total_sales_amount,
  coalesce(sum(t.paid_amount), 0)      as total_paid_amount,
  coalesce(sum(t.balance), 0)          as outstanding_balance,
  coalesce(avg(t.amount / nullif(t.quantity, 0)), 0) as avg_selling_rate,
  count(*)                             as orders_count,
  min(t.created_at)                    as first_sale_at,
  max(t.created_at)                    as last_sale_at
from transactions t
where lower(coalesce(t.type, '')) <> 'payment'
group by coalesce(t.tea_name, 'Unknown')
order by total_sold_quantity desc;

-- Batch-level P&L view: sold quantity, revenue, purchase cost (using purchase_rate), and pnl
create or replace view batch_pnl as
select
  b.id as batch_id,
  b.name as batch_name,
  b.total_quantity,
  b.remaining_quantity,
  b.purchase_rate,
  coalesce(sum(t.quantity), 0) as sold_quantity,
  coalesce(sum(t.amount), 0) as sold_revenue,
  (coalesce(sum(t.quantity), 0) * b.purchase_rate) as purchase_cost_for_sold,
  (coalesce(sum(t.amount), 0) - (coalesce(sum(t.quantity), 0) * b.purchase_rate)) as pnl
from batches b
left join transactions t on t.batch_id = b.id
group by b.id, b.name, b.total_quantity, b.remaining_quantity, b.purchase_rate
order by pnl desc;
