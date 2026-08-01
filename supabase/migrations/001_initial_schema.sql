create extension if not exists "pgcrypto";

create table if not exists public.trekkers (
  id text primary key,
  name text not null check (char_length(name) between 1 and 120),
  mobile_number text,
  emergency_contact text not null,
  guide_mobile text,
  route_name text,
  blood_group text check (blood_group is null or blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  medical_notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sensor_readings (
  id uuid primary key default gen_random_uuid(),
  trekker_id text not null references public.trekkers(id),
  heart_rate integer not null check (heart_rate between 20 and 240),
  spo2 numeric not null check (spo2 between 50 and 100),
  altitude numeric not null check (altitude between -500 and 9000),
  temperature numeric not null check (temperature between -50 and 80),
  device_id text not null,
  captured_at timestamptz not null,
  request_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  trekker_id text not null references public.trekkers(id),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters numeric check (accuracy_meters between 0 and 100000),
  altitude numeric check (altitude between -500 and 9000),
  source text not null check (source in ('browser','device','manual','demo')),
  captured_at timestamptz not null,
  request_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.symptom_reports (
  id uuid primary key default gen_random_uuid(),
  trekker_id text not null references public.trekkers(id),
  symptom text not null,
  severity text not null default 'unspecified'
    check (severity in ('mild','moderate','severe','unspecified')),
  notes text check (notes is null or char_length(notes) <= 500),
  request_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.sos_events (
  id uuid primary key default gen_random_uuid(),
  trekker_id text not null references public.trekkers(id),
  source text not null
    check (source in ('physical_button','web_button','manual','demo')),
  status text not null default 'active'
    check (status in ('active','acknowledged','resolved','cancelled')),
  sms_status text not null default 'pending'
    check (sms_status in ('pending','simulated','queued','sent','delivered','failed','not_configured')),
  latitude double precision,
  longitude double precision,
  location_accuracy numeric,
  location_captured_at timestamptz,
  location_is_stale boolean not null default false,
  heart_rate integer,
  spo2 numeric,
  altitude numeric,
  temperature numeric,
  reading_captured_at timestamptz,
  reading_is_stale boolean not null default false,
  symptom text,
  symptom_severity text,
  symptom_notes text,
  rescue_url text,
  map_url text,
  sms_message text,
  provider_reference text,
  provider_response jsonb,
  request_id text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  ),
  check (location_accuracy is null or location_accuracy >= 0),
  check (heart_rate is null or heart_rate between 20 and 240),
  check (spo2 is null or spo2 between 50 and 100),
  check (altitude is null or altitude between -500 and 9000),
  check (temperature is null or temperature between -50 and 80),
  check (
    symptom_severity is null
    or symptom_severity in ('mild','moderate','severe','unspecified')
  )
);

create table if not exists public.sms_attempts (
  id uuid primary key default gen_random_uuid(),
  sos_event_id uuid not null references public.sos_events(id) on delete cascade,
  phone_number text not null,
  provider text,
  status text not null
    check (status in ('simulated','queued','sent','delivered','failed','not_configured')),
  message text not null,
  provider_reference text,
  provider_response jsonb,
  error_message text,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists sensor_readings_trekker_captured_idx
  on public.sensor_readings(trekker_id, captured_at desc);
create index if not exists locations_trekker_captured_idx
  on public.locations(trekker_id, captured_at desc);
create index if not exists symptoms_trekker_created_idx
  on public.symptom_reports(trekker_id, created_at desc);
create index if not exists sos_events_trekker_created_idx
  on public.sos_events(trekker_id, created_at desc);
create index if not exists sos_events_status_created_idx
  on public.sos_events(status, created_at desc);
create index if not exists sms_attempts_event_idx
  on public.sms_attempts(sos_event_id, created_at desc);

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trekkers_updated_at on public.trekkers;
create trigger trekkers_updated_at
before update on public.trekkers
for each row execute procedure public.update_updated_at_column();

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

comment on table public.trekkers is 'Trusted trekker profile data; server writes only.';
comment on table public.sensor_readings is 'Prototype device readings, not medical-grade measurements.';
comment on table public.locations is 'Latitude and longitude are stored separately; Leaflet uses [latitude, longitude].';
comment on table public.sos_events is 'Emergency-support records; TrekProof does not replace rescue services.';

alter table public.trekkers enable row level security;
alter table public.sensor_readings enable row level security;
alter table public.locations enable row level security;
alter table public.symptom_reports enable row level security;
alter table public.sos_events enable row level security;
alter table public.sms_attempts enable row level security;

revoke all on table public.trekkers from anon, authenticated;
revoke all on table public.sensor_readings from anon, authenticated;
revoke all on table public.locations from anon, authenticated;
revoke all on table public.symptom_reports from anon, authenticated;
revoke all on table public.sos_events from anon, authenticated;
revoke all on table public.sms_attempts from anon, authenticated;

revoke all on function public.create_sos_event_if_allowed(text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.create_sos_event_if_allowed(text, text, integer, text)
  to service_role;
