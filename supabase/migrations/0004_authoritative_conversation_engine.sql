-- Migration 0004: Authoritative Conversation Engine Schema
-- Tables for 5-layer hard deduplication, single-flight locking, response commits, and outbox.

-- Layer 1, 2, 3: Inbound Message & Event Deduplication
create table if not exists message_dedup (
  id uuid primary key default gen_random_uuid(),
  message_id text unique not null,
  event_id text unique not null,
  chat_id text not null,
  sender_id text not null,
  content_hash text not null,
  normalized_hash text not null,
  created_at timestamptz default now()
);

create index if not exists idx_message_dedup_chat on message_dedup(chat_id);
create index if not exists idx_message_dedup_created on message_dedup(created_at);

-- Layer 4: Conversation Turns
create table if not exists conversation_turns (
  id uuid primary key default gen_random_uuid(),
  turn_id text unique not null,
  chat_id text not null,
  message_ids text[] not null default '{}',
  combined_text text not null,
  status text not null default 'created',
  created_at timestamptz default now()
);

create index if not exists idx_conversation_turns_chat on conversation_turns(chat_id);

-- Layer 5: Response Commits (Atomic 1-to-1 Turn to Response Guarantee)
create table if not exists response_commits (
  id uuid primary key default gen_random_uuid(),
  response_id text unique not null,
  turn_id text unique not null,
  chat_id text not null,
  status text not null default 'COMMITTED',
  final_text text not null,
  intent text,
  model_id text,
  plan jsonb default '{}'::jsonb,
  attempt_count int default 0,
  last_error text,
  created_at timestamptz default now(),
  committed_at timestamptz default now(),
  sent_at timestamptz
);

create index if not exists idx_response_commits_chat on response_commits(chat_id);
create index if not exists idx_response_commits_status on response_commits(status);

-- Single-Flight Distributed Conversation Locks
create table if not exists conversation_locks (
  chat_id text primary key,
  turn_id text not null,
  owner_id text not null,
  acquired_at timestamptz default now(),
  expires_at timestamptz not null
);

-- Authoritative Outbox Queue
create table if not exists message_outbox (
  id uuid primary key default gen_random_uuid(),
  response_id text unique not null,
  turn_id text,
  chat_id text not null,
  text text not null,
  status text not null default 'pending',
  attempts int not null default 0,
  max_attempts int not null default 2,
  created_at timestamptz default now(),
  sent_at timestamptz,
  last_error text
);

create index if not exists idx_message_outbox_status on message_outbox(status);
