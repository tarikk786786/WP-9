-- Migration 0003: pgvector long-term memory & semantic RAG knowledge
create extension if not exists vector;

-- Long term memory items per user/chat
create table if not exists memory_items (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  user_id uuid references users(id) on delete cascade,
  category text not null default 'fact', -- fact, preference, profile, business, relationship
  fact text not null,
  importance int not null default 1, -- 1 (low) to 5 (critical)
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  last_accessed_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_memory_items_chat_id on memory_items(chat_id);
create index if not exists idx_memory_items_embedding on memory_items using hnsw (embedding vector_cosine_ops);

-- Knowledge documents for business, pricing, FAQs, and Tarik portfolio
create table if not exists knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category text not null default 'general',
  tags text[] default '{}',
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_knowledge_documents_category on knowledge_documents(category);
create index if not exists idx_knowledge_documents_embedding on knowledge_documents using hnsw (embedding vector_cosine_ops);

-- Periodic conversation summaries for multi-turn history compression
create table if not exists conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null unique,
  summary text not null,
  key_facts text[] default '{}',
  message_count int default 0,
  last_message_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RPC for semantic memory search
create or replace function match_memories (
  query_embedding vector(1536),
  match_threshold float default 0.65,
  match_count int default 5,
  filter_chat_id text default null
)
returns table (
  id uuid,
  chat_id text,
  category text,
  fact text,
  importance int,
  similarity float,
  metadata jsonb
)
language plpgsql
as $$
begin
  return query
  select
    memory_items.id,
    memory_items.chat_id,
    memory_items.category,
    memory_items.fact,
    memory_items.importance,
    1 - (memory_items.embedding <=> query_embedding) as similarity,
    memory_items.metadata
  from memory_items
  where (filter_chat_id is null or memory_items.chat_id = filter_chat_id)
    and memory_items.embedding is not null
    and 1 - (memory_items.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
end;
$$;

-- RPC for semantic knowledge document search
create or replace function match_knowledge (
  query_embedding vector(1536),
  match_threshold float default 0.60,
  match_count int default 4,
  filter_category text default null
)
returns table (
  id uuid,
  title text,
  content text,
  category text,
  similarity float,
  metadata jsonb
)
language plpgsql
as $$
begin
  return query
  select
    knowledge_documents.id,
    knowledge_documents.title,
    knowledge_documents.content,
    knowledge_documents.category,
    1 - (knowledge_documents.embedding <=> query_embedding) as similarity,
    knowledge_documents.metadata
  from knowledge_documents
  where (filter_category is null or knowledge_documents.category = filter_category)
    and knowledge_documents.embedding is not null
    and 1 - (knowledge_documents.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
end;
$$;
