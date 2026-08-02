-- Complete the ARGUS ESP32 hardware contract after migration 010.
-- Existing rows are preserved. New foreign keys and checks are enforced for
-- future writes without validating or rewriting legacy data in this migration.

alter table public.sensor_readings
  drop constraint if exists sensor_readings_sensor_state_check;
alter table public.sensor_readings
  add constraint sensor_readings_sensor_state_check check (
    sensor_state in (
      'valid',
      'no_finger',
      'weak_signal',
      'invalid',
      'sensor_unavailable',
      'sensor_error'
    )
  ) not valid;

alter table public.sos_events
  drop constraint if exists sos_events_sensor_state_check;
alter table public.sos_events
  add constraint sos_events_sensor_state_check check (
    sensor_state is null
    or sensor_state in (
      'valid',
      'no_finger',
      'weak_signal',
      'invalid',
      'sensor_unavailable',
      'sensor_error'
    )
  ) not valid;

alter table public.devices
  drop constraint if exists devices_firmware_version_length_check;
alter table public.devices
  add constraint devices_firmware_version_length_check check (
    firmware_version is null or char_length(firmware_version) between 1 and 40
  ) not valid;

alter table public.sensor_readings
  drop constraint if exists sensor_readings_device_uptime_check;
alter table public.sensor_readings
  add constraint sensor_readings_device_uptime_check check (
    device_uptime_ms is null or device_uptime_ms between 0 and 4294967295
  ) not valid;

alter table public.sos_events
  drop constraint if exists sos_events_device_pressed_at_check;
alter table public.sos_events
  add constraint sos_events_device_pressed_at_check check (
    device_pressed_at_ms is null or device_pressed_at_ms between 0 and 4294967295
  ) not valid;

alter table public.sos_events
  drop constraint if exists sos_events_hardware_event_id_length_check;
alter table public.sos_events
  add constraint sos_events_hardware_event_id_length_check check (
    hardware_event_id is null or char_length(hardware_event_id) between 8 and 100
  ) not valid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sensor_readings_device_id_fkey'
      and conrelid = 'public.sensor_readings'::regclass
  ) then
    alter table public.sensor_readings
      add constraint sensor_readings_device_id_fkey
      foreign key (device_id) references public.devices(id)
      on update cascade on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'locations_device_id_fkey'
      and conrelid = 'public.locations'::regclass
  ) then
    alter table public.locations
      add constraint locations_device_id_fkey
      foreign key (device_id) references public.devices(id)
      on update cascade on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sos_events_device_id_fkey'
      and conrelid = 'public.sos_events'::regclass
  ) then
    alter table public.sos_events
      add constraint sos_events_device_id_fkey
      foreign key (device_id) references public.devices(id)
      on update cascade on delete set null not valid;
  end if;
end
$$;

create index if not exists sensor_readings_device_captured_idx
  on public.sensor_readings(device_id, captured_at desc);
create index if not exists locations_device_captured_idx
  on public.locations(device_id, captured_at desc)
  where device_id is not null;
create index if not exists sos_events_device_created_idx
  on public.sos_events(device_id, created_at desc)
  where device_id is not null;

comment on column public.devices.firmware_version is
  'Firmware version reported by a verified ARGUS BLE wristband.';
comment on column public.sensor_readings.device_uptime_ms is
  'ESP32 millis() value retained for diagnostics; captured_at remains the browser receipt time.';
comment on column public.sos_events.device_pressed_at_ms is
  'ESP32 millis() value for the physical button press; created_at remains server-authoritative.';

-- RLS and all existing table privileges remain unchanged.
