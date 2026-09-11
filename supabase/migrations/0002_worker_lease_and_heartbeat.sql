-- Migration 0002: Worker leases and heartbeats
create table if not exists worker_leases (
  id text primary key,
  instance_id text not null,
  acquired_at timestamptz default now(),
  renewed_at timestamptz default now(),
  expires_at timestamptz not null
);

create table if not exists worker_heartbeats (
  instance_id text primary key,
  phase text not null,
  connected boolean default false,
  phone text,
  pairing_code text,
  qr_data_url text,
  metadata jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);
