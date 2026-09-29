create table if not exists public.calendar_state (
  id text primary key check (id = 'shared'),
  payload jsonb not null default '{"version":2,"months":{}}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.calendar_state enable row level security;

revoke all on table public.calendar_state from anon, authenticated;
grant select, insert, update on table public.calendar_state to anon, authenticated;
grant all on table public.calendar_state to service_role;

drop policy if exists "Anyone can read shared calendar" on public.calendar_state;
create policy "Anyone can read shared calendar"
on public.calendar_state for select
to anon, authenticated
using (id = 'shared');

drop policy if exists "Anyone can create shared calendar" on public.calendar_state;
create policy "Anyone can create shared calendar"
on public.calendar_state for insert
to anon, authenticated
with check (id = 'shared');

drop policy if exists "Anyone can update shared calendar" on public.calendar_state;
create policy "Anyone can update shared calendar"
on public.calendar_state for update
to anon, authenticated
using (id = 'shared')
with check (id = 'shared');

create or replace function public.set_calendar_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists calendar_state_set_updated_at on public.calendar_state;
create trigger calendar_state_set_updated_at
before update on public.calendar_state
for each row execute function public.set_calendar_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'calendar_state'
  ) then
    alter publication supabase_realtime add table public.calendar_state;
  end if;
end
$$;
