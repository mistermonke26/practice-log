create table if not exists public.users (
  id bigserial primary key,
  name text not null unique,
  qr_payload text not null unique,
  created_at timestamp without time zone not null default now()
);

create table if not exists public.instruments (
  id bigserial primary key,
  name text not null unique,
  created_at timestamp without time zone not null default now()
);

create table if not exists public.scan_events (
  id bigserial primary key,
  raw_payload text not null,
  user_id bigint references public.users(id),
  instrument_id bigint references public.instruments(id),
  scanned_at timestamp without time zone not null default now(),
  action text not null
);

create table if not exists public.active_sessions (
  id bigserial primary key,
  user_id bigint not null references public.users(id),
  instrument_id bigint not null references public.instruments(id),
  started_at timestamp without time zone not null default now()
);

create table if not exists public.practice_logs (
  id bigserial primary key,
  user_id bigint not null references public.users(id),
  instrument_id bigint not null references public.instruments(id),
  started_at timestamp without time zone not null,
  ended_at timestamp without time zone not null,
  duration_minutes double precision not null,
  status text not null default 'complete',
  source text not null default 'scan',
  notes text
);

alter table public.users enable row level security;
alter table public.instruments enable row level security;
alter table public.scan_events enable row level security;
alter table public.active_sessions enable row level security;
alter table public.practice_logs enable row level security;

drop policy if exists "anon full access users" on public.users;
drop policy if exists "anon full access instruments" on public.instruments;
drop policy if exists "anon full access scan_events" on public.scan_events;
drop policy if exists "anon full access active_sessions" on public.active_sessions;
drop policy if exists "anon full access practice_logs" on public.practice_logs;

create policy "anon full access users" on public.users for all to anon using (true) with check (true);
create policy "anon full access instruments" on public.instruments for all to anon using (true) with check (true);
create policy "anon full access scan_events" on public.scan_events for all to anon using (true) with check (true);
create policy "anon full access active_sessions" on public.active_sessions for all to anon using (true) with check (true);
create policy "anon full access practice_logs" on public.practice_logs for all to anon using (true) with check (true);
