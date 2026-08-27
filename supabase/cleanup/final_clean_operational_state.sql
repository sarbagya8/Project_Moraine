begin;

do $$
begin
  if not exists (
    select 1 from public.trekkers
    where id = 'TRK-DEMO-001' and is_active = true
  ) then
    raise exception 'Current User account safety check failed';
  end if;

  if not exists (
    select 1 from public.devices
    where id = 'ARGUS-ESP32-DEMO-01'
      and trekker_id = 'TRK-DEMO-001'
      and is_active = true
      and pairing_code_hash is not null
      and pairing_code_hash <> ''
  ) then
    raise exception 'Current ESP32 assignment safety check failed';
  end if;
end $$;

create temp table cleanup_cases as
select id
from public.sos_events
where trekker_id in ('TRK-DEMO-001', 'TRK-REPRO-001')
  and created_at < timestamptz '2026-08-15 00:00:00+00';

create temp table cleanup_notifications as
select id
from public.sms_attempts
where sos_event_id in (select id from cleanup_cases);

create temp table cleanup_symptoms as
select id
from public.symptom_reports
where trekker_id in ('TRK-DEMO-001', 'TRK-REPRO-001')
  and created_at < timestamptz '2026-08-15 00:00:00+00';

create temp table cleanup_telemetry as
select id
from public.sensor_readings
where trekker_id in ('TRK-DEMO-001', 'TRK-REPRO-001')
  and captured_at < timestamptz '2026-08-15 00:00:00+00';

create temp table cleanup_locations as
select id
from public.locations
where trekker_id in ('TRK-DEMO-001', 'TRK-REPRO-001')
  and captured_at < timestamptz '2026-08-15 00:00:00+00';

do $$
begin
  if (select count(*) from cleanup_cases) <> 65
    or (select count(*) from cleanup_notifications) <> 56
    or (select count(*) from cleanup_symptoms) <> 7
    or (select count(*) from cleanup_telemetry) <> 160
    or (select count(*) from cleanup_locations) <> 94
  then
    raise exception 'Audited development row counts changed; cleanup aborted';
  end if;

  if not exists (
    select 1
    from public.sos_events
    where id = 'ff104c1c-416d-4a57-a206-bc0ef8fbd62f'
      and trekker_id = 'TRK-DEMO-001'
      and source = 'web_button'
      and status = 'active'
      and created_at >= timestamptz '2026-08-05 00:00:00+00'
      and created_at < timestamptz '2026-08-06 00:00:00+00'
  ) then
    raise exception 'Audited August 5 development case changed; cleanup aborted';
  end if;
end $$;

do $$
begin
  if to_regclass('public.case_events') is not null then
    execute 'delete from public.case_events where sos_event_id in (select id from cleanup_cases)';
  end if;
end $$;

delete from public.sms_attempts
where id in (select id from cleanup_notifications);

delete from public.sos_events
where id in (select id from cleanup_cases);

delete from public.symptom_reports
where id in (select id from cleanup_symptoms);

delete from public.locations
where id in (select id from cleanup_locations);

delete from public.sensor_readings
where id in (select id from cleanup_telemetry);

delete from public.devices
where id = 'ARGUS-REPRO-01' and trekker_id = 'TRK-REPRO-001';

delete from public.trekkers
where id = 'TRK-REPRO-001';

update public.devices
set last_seen_at = null
where id = 'ARGUS-ESP32-DEMO-01'
  and trekker_id = 'TRK-DEMO-001';

update public.trekkers
set route_name = case when route_name = 'Mardi Himal Trek' then null else route_name end,
    medical_notes = case when medical_notes = 'Demo record only. Sensor readings are not a medical diagnosis.' then null else medical_notes end
where id = 'TRK-DEMO-001'
  and (route_name = 'Mardi Himal Trek' or medical_notes = 'Demo record only. Sensor readings are not a medical diagnosis.');

do $$
begin
  if exists (select 1 from public.sos_events where id in (select id from cleanup_cases))
    or exists (select 1 from public.sms_attempts where id in (select id from cleanup_notifications))
    or exists (select 1 from public.symptom_reports where id in (select id from cleanup_symptoms))
    or exists (select 1 from public.sensor_readings where id in (select id from cleanup_telemetry))
    or exists (select 1 from public.locations where id in (select id from cleanup_locations))
  then
    raise exception 'Operational history cleanup verification failed';
  end if;

  if not exists (
    select 1 from public.devices
    where id = 'ARGUS-ESP32-DEMO-01'
      and trekker_id = 'TRK-DEMO-001'
      and is_active = true
      and pairing_code_hash is not null
      and pairing_code_hash <> ''
  ) then
    raise exception 'Current ESP32 assignment was not preserved';
  end if;
end $$;

commit;

select
  (select count(*) from cleanup_cases) as removed_cases,
  (select count(*) from cleanup_notifications) as removed_notifications,
  (select count(*) from cleanup_symptoms) as removed_symptoms,
  (select count(*) from cleanup_telemetry) as removed_telemetry,
  (select count(*) from cleanup_locations) as removed_locations,
  (select count(*) from public.trekkers where id = 'TRK-DEMO-001' and is_active = true) as preserved_users,
  (select count(*) from public.devices where id = 'ARGUS-ESP32-DEMO-01' and trekker_id = 'TRK-DEMO-001' and is_active = true) as preserved_devices;
