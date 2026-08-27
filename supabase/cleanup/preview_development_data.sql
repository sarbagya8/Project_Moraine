select 'notification_attempt' as record_type, a.id::text as record_id, a.created_at, a.status as detail
from public.sms_attempts a
join public.sos_events s on s.id = a.sos_event_id
where s.trekker_id in ('TRK-DEMO-001', 'TRK-REPRO-001')
  and s.created_at < timestamptz '2026-08-15 00:00:00+00'
order by a.created_at;

select 'case' as record_type, id::text as record_id, created_at, status as detail
from public.sos_events
where trekker_id in ('TRK-DEMO-001', 'TRK-REPRO-001')
  and created_at < timestamptz '2026-08-15 00:00:00+00'
order by created_at;

select 'symptom_report' as record_type, id::text as record_id, created_at, symptom as detail
from public.symptom_reports
where trekker_id in ('TRK-DEMO-001', 'TRK-REPRO-001')
  and created_at < timestamptz '2026-08-15 00:00:00+00'
order by created_at;

select 'location' as record_type, id::text as record_id, created_at, source as detail
from public.locations
where trekker_id in ('TRK-DEMO-001', 'TRK-REPRO-001')
  and captured_at < timestamptz '2026-08-15 00:00:00+00'
order by created_at;

select 'sensor_reading' as record_type, id::text as record_id, created_at, coalesce(sensor_state, 'unavailable') as detail
from public.sensor_readings
where trekker_id in ('TRK-DEMO-001', 'TRK-REPRO-001')
  and captured_at < timestamptz '2026-08-15 00:00:00+00'
order by created_at;

select 'development_device' as record_type, id as record_id, created_at, trekker_id as detail
from public.devices
where id = 'ARGUS-REPRO-01' and trekker_id = 'TRK-REPRO-001';

select 'development_user' as record_type, id as record_id, created_at, name as detail
from public.trekkers
where id = 'TRK-REPRO-001';

select 'device_last_seen_reset' as record_type, id as record_id, last_seen_at as created_at, trekker_id as detail
from public.devices
where id = 'ARGUS-ESP32-DEMO-01'
  and trekker_id = 'TRK-DEMO-001'
  and last_seen_at is not null;

select 'seeded_profile_fields_reset' as record_type, id as record_id, updated_at as created_at, route_name as detail
from public.trekkers
where id = 'TRK-DEMO-001'
  and (route_name = 'Mardi Himal Trek' or medical_notes = 'Demo record only. Sensor readings are not a medical diagnosis.');
