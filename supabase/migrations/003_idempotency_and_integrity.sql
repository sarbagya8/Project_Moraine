-- Safe, idempotent reliability migration. Existing rows are preserved.
-- Apply after 001 for a fresh project, or after 002 for an upgraded project.

create unique index if not exists sensor_readings_request_id_uidx
  on public.sensor_readings(request_id)
  where request_id is not null;

create unique index if not exists locations_request_id_uidx
  on public.locations(request_id)
  where request_id is not null;

create unique index if not exists symptom_reports_request_id_uidx
  on public.symptom_reports(request_id)
  where request_id is not null;

create unique index if not exists sos_events_request_id_uidx
  on public.sos_events(request_id)
  where request_id is not null;

create index if not exists sms_attempts_status_created_idx
  on public.sms_attempts(status, created_at desc);

create index if not exists sos_events_trekker_status_created_idx
  on public.sos_events(trekker_id, status, created_at desc);

alter table public.sos_events
  drop constraint if exists sos_events_resolved_state_check;

alter table public.sos_events
  add constraint sos_events_resolved_state_check check (
    (status = 'resolved' and resolved_at is not null)
    or (status <> 'resolved')
  ) not valid;

comment on index public.sensor_readings_request_id_uidx is
  'Prevents a retried device upload with the same idempotency key from creating duplicate data.';


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
    select id into existing_id
    from public.sos_events
    where request_id = p_request_id
    limit 1;

    if existing_id is not null then
      return query select existing_id, true;
      return;
    end if;
  end if;

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
