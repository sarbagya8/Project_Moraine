-- Safe, idempotent hardening migration for databases created with the earlier MVP schema.
-- This migration preserves existing rows.

alter table public.sensor_readings add column if not exists request_id text;
alter table public.locations add column if not exists request_id text;
alter table public.symptom_reports add column if not exists request_id text;
alter table public.sos_events add column if not exists request_id text;
alter table public.sos_events add column if not exists reading_captured_at timestamptz;
alter table public.sos_events add column if not exists reading_is_stale boolean not null default false;
alter table public.sos_events add column if not exists symptom_severity text;
alter table public.sos_events add column if not exists symptom_notes text;
alter table public.sms_attempts add column if not exists request_id text;

create index if not exists sos_events_status_created_idx
  on public.sos_events(status, created_at desc);

comment on table public.locations is 'Latitude and longitude are stored separately; Leaflet uses [latitude, longitude].';

alter table public.trekkers enable row level security;
alter table public.sensor_readings enable row level security;
alter table public.locations enable row level security;
alter table public.symptom_reports enable row level security;
alter table public.sos_events enable row level security;
alter table public.sms_attempts enable row level security;

drop policy if exists "development service access" on public.trekkers;
drop policy if exists "development service access" on public.sensor_readings;
drop policy if exists "development service access" on public.locations;
drop policy if exists "development service access" on public.symptom_reports;
drop policy if exists "development service access" on public.sos_events;
drop policy if exists "development service access" on public.sms_attempts;

revoke all on table public.trekkers from anon, authenticated;
revoke all on table public.sensor_readings from anon, authenticated;
revoke all on table public.locations from anon, authenticated;
revoke all on table public.symptom_reports from anon, authenticated;
revoke all on table public.sos_events from anon, authenticated;
revoke all on table public.sms_attempts from anon, authenticated;

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

  select id into existing_id
  from public.sos_events
  where trekker_id = p_trekker_id
    and status in ('active', 'acknowledged')
    and created_at >= now() - make_interval(secs => p_cooldown_seconds)
  order by created_at desc
  limit 1;

  if existing_id is not null then
    return query select existing_id, true;
    return;
  end if;

  insert into public.sos_events (trekker_id, source, request_id)
  values (p_trekker_id, p_source, p_request_id)
  returning id into created_id;

  return query select created_id, false;
end;
$$;

revoke all on function public.create_sos_event_if_allowed(text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.create_sos_event_if_allowed(text, text, integer, text)
  to service_role;
