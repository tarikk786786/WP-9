-- WhatsApp auto-reply bot schema (Supabase / Postgres)
create extension if not exists vector;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  whatsapp_number text unique not null,
  name text,
  profile_name text,
  language text default 'hinglish',
  status text default 'active',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_seen_at timestamptz
);

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,
  role text default 'agent',
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  chat_id text unique not null,
  status text default 'bot',
  assigned_agent_id uuid references agents(id),
  current_intent text,
  ai_enabled boolean default true,
  last_message_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id),
  whatsapp_message_id text unique,
  direction text not null,
  message_type text,
  text text,
  media_reference text,
  ai_generated boolean default false,
  intent text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  keywords text[] default '{}',
  category text,
  priority int default 100,
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_type text not null,
  trigger_value text not null,
  response text not null,
  priority int default 100,
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists bot_settings (
  id int primary key default 1,
  enabled boolean default true,
  ai_enabled boolean default true,
  faq_enabled boolean default true,
  welcome_enabled boolean default true,
  default_language text default 'hinglish',
  welcome_message text,
  fallback_message text,
  human_handoff_message text,
  timezone text default 'Asia/Kolkata',
  business_hours jsonb
);

create table if not exists knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  source text,
  metadata jsonb default '{}'::jsonb,
  embedding vector(1536),
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists baileys_auth (
  filename text primary key,
  data text not null,
  updated_at timestamptz default now()
);

create table if not exists app_logs (
  id uuid primary key default gen_random_uuid(),
  level text,
  source text,
  message text,
  created_at timestamptz default now()
);
