-- READ ONLY. Review these result sets before running cleanup_demo_test_rows.sql.
-- The real physical assignment TRK-DEMO-001 / ARGUS-ESP32-DEMO-01 is excluded.

select id, trekker_id, device_id, captured_at, request_id
from public.sensor_readings
where request_id like 'argus-demo-reading-%'
order by captured_at;

select id, trekker_id, source, captured_at, request_id
from public.locations
where source = 'demo' or request_id like 'argus-demo-location-%'
order by captured_at;

select id, trekker_id, symptom, severity, created_at, request_id
from public.symptom_reports
where request_id = 'argus-demo-symptom';

select id, trekker_id, source, status, sms_status, created_at, request_id
from public.sos_events
where source = 'demo' or request_id like 'argus-demo-%';

select id, sos_event_id, right(regexp_replace(phone_number, '\D', '', 'g'), 4) as recipient_suffix,
       provider, status, created_at, request_id
from public.sms_attempts
where provider in ('demo', 'whatsapp_demo')
   or request_id like 'argus-demo-%'
   or (right(regexp_replace(phone_number, '\D', '', 'g'), 4) = '0000' and status = 'failed')
order by created_at;

select id, name, is_active, created_at
from public.trekkers where id = 'TRK-REPRO-001';
select id, trekker_id, is_active, last_seen_at, created_at
from public.devices where id = 'ARGUS-REPRO-01';
select id, trekker_id, source, status, created_at, request_id
from public.sos_events
where trekker_id = 'TRK-REPRO-001' or request_id like 'repro-%';

-- Verify the current physical assignment remains present.
select t.id as trekker_id, d.id as device_id, d.is_active, d.last_seen_at
from public.trekkers t
join public.devices d on d.trekker_id = t.id
where t.id = 'TRK-DEMO-001' and d.id = 'ARGUS-ESP32-DEMO-01';

