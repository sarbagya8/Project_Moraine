-- DESTRUCTIVE: execute only after reviewing preview_demo_test_rows.sql and
-- taking a Supabase backup. This intentionally preserves the current physical
-- TRK-DEMO-001 / ARGUS-ESP32-DEMO-01 account and all non-seeded browser GPS.

begin;

delete from public.sms_attempts
where provider in ('demo', 'whatsapp_demo')
   or request_id like 'argus-demo-%'
   or (right(regexp_replace(phone_number, '\D', '', 'g'), 4) = '0000' and status = 'failed')
   or sos_event_id in (
     select id from public.sos_events
     where trekker_id = 'TRK-REPRO-001' or request_id like 'repro-%'
   );

delete from public.sos_events
where source = 'demo'
   or request_id like 'argus-demo-%'
   or trekker_id = 'TRK-REPRO-001'
   or request_id like 'repro-%';

delete from public.symptom_reports where request_id = 'argus-demo-symptom';
delete from public.locations
where source = 'demo' or request_id like 'argus-demo-location-%';
delete from public.sensor_readings where request_id like 'argus-demo-reading-%';

delete from public.devices where id = 'ARGUS-REPRO-01' and trekker_id = 'TRK-REPRO-001';
delete from public.trekkers where id = 'TRK-REPRO-001';

do $$
begin
  if not exists (
    select 1 from public.devices
    where id = 'ARGUS-ESP32-DEMO-01' and trekker_id = 'TRK-DEMO-001'
  ) then
    raise exception 'Safety check failed: current physical assignment is missing; rolling back';
  end if;
end $$;

commit;
