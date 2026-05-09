-- Enable pgvector
create extension if not exists vector;

-- Ingestion jobs
create table ingestions (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  transcript_path text,
  status text not null default 'pending', -- pending | reviewing | committed | cancelled
  plan_json jsonb,
  created_at timestamptz default now()
);

-- Write leases prevent concurrent conflicts
create table write_leases (
  file_path text primary key,
  ingestion_id uuid references ingestions(id) on delete cascade,
  author text not null,
  acquired_at timestamptz default now(),
  expires_at timestamptz not null
);

-- Embeddings (voyage-3-large = 1024 dims)
create table embeddings (
  id uuid primary key default gen_random_uuid(),
  file_path text not null,
  chunk_id int not null,
  content text not null,
  embedding vector(1024),
  updated_at timestamptz default now(),
  unique (file_path, chunk_id)
);

create index on embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Human-managed feature taxonomy (AI never writes here)
create table features (
  slug text primary key,
  product text not null,
  display_name text,
  status text default 'live',
  created_by text,
  created_at timestamptz default now()
);

-- Clients registry
create table clients (
  slug text primary key,
  display_name text not null,
  notes text
);

-- Similarity search function
create or replace function match_embeddings(
  query_embedding vector(1024),
  match_count int default 12
)
returns table (
  file_path text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    file_path,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from embeddings
  where file_path not like '%history.md'   -- never search history files
  order by embedding <=> query_embedding
  limit match_count;
$$;
