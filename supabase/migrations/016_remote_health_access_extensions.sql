alter table public.trekkers
  add column if not exists date_of_birth date,
  add column if not exists address text,
  add column if not exists allergies text,
  add column if not exists known_conditions text,
  add column if not exists current_medications text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists emergency_notes text;

alter table public.trekkers
  drop constraint if exists trekkers_blood_group_check;

alter table public.trekkers
  add constraint trekkers_blood_group_check
  check (blood_group is null or blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'));

alter table public.symptom_reports
  add column if not exists duration text;

alter table public.symptom_reports
  drop constraint if exists symptom_reports_duration_length_check;

alter table public.symptom_reports
  add constraint symptom_reports_duration_length_check
  check (duration is null or char_length(duration) <= 100) not valid;

alter table public.sos_events
  drop constraint if exists sos_events_status_check;

update public.sos_events set status = 'new' where status = 'active';

alter table public.sos_events
  add column if not exists acknowledged_at timestamptz,
  add column if not exists in_progress_at timestamptz,
  add column if not exists fall_detected boolean,
  add column if not exists fall_type text,
  add column if not exists pressure numeric;

alter table public.sos_events
  alter column status set default 'new';

alter table public.sos_events
  add constraint sos_events_status_check
  check (status in ('new','acknowledged','in_progress','resolved','cancelled')) not valid;

create table if not exists public.case_events (
  id uuid primary key default gen_random_uuid(),
  sos_event_id uuid not null references public.sos_events(id) on delete cascade,
  event_type text not null check (event_type in ('case_created','status_changed','responder_note')),
  status text check (status is null or status in ('new','acknowledged','in_progress','resolved','cancelled')),
  note text check (note is null or char_length(note) <= 1000),
  actor text,
  created_at timestamptz not null default now(),
  check (event_type = 'responder_note' or note is null)
);

create index if not exists case_events_sos_created_idx
  on public.case_events(sos_event_id, created_at);

alter table public.case_events enable row level security;
revoke all on table public.case_events from anon, authenticated;
grant all on table public.case_events to service_role;

create or replace function public.record_case_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.case_events (sos_event_id, event_type, status)
    values (new.id, 'case_created', new.status);
  elsif old.status is distinct from new.status then
    insert into public.case_events (sos_event_id, event_type, status)
    values (new.id, 'status_changed', new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists sos_events_case_lifecycle on public.sos_events;
create trigger sos_events_case_lifecycle
after insert or update of status on public.sos_events
for each row execute function public.record_case_lifecycle();

create or replace function public.create_sos_event_if_allowed(
  p_trekker_id text,
  p_source text,
  p_cooldown_seconds integer,
  p_request_id text default null
)
returns table(event_id uuid, is_duplicate boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_id uuid;
  created_id uuid;
begin
  if p_cooldown_seconds < 10 or p_cooldown_seconds > 3600 then
    raise exception 'Invalid SOS cooldown';
  end if;
  if p_source not in ('physical_button','web_button','manual','demo') then
    raise exception 'Invalid SOS source';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_trekker_id));
  if p_request_id is not null then
    select id into existing_id from public.sos_events
    where request_id = p_request_id limit 1;
    if existing_id is not null then
      return query select existing_id, true;
      return;
    end if;
  end if;
  select id into existing_id from public.sos_events
  where trekker_id = p_trekker_id
    and status in ('new','acknowledged','in_progress')
  order by created_at desc limit 1;
  if existing_id is not null then
    return query select existing_id, true;
    return;
  end if;
  insert into public.sos_events (trekker_id, source, request_id, status)
  values (p_trekker_id, p_source, p_request_id, 'new')
  returning id into created_id;
  return query select created_id, false;
end;
$$;

revoke all on function public.create_sos_event_if_allowed(text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.create_sos_event_if_allowed(text, text, integer, text)
  to service_role;
