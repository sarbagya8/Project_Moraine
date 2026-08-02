-- ARGUS ESP32-C3 BLE integration. Apply after 009.
-- Existing telemetry and SOS rows are preserved.

alter table public.devices
  add column if not exists firmware_version text;
alter table public.devices
  add column if not exists last_verified_at timestamptz;

alter table public.sensor_readings
  alter column heart_rate drop not null;
alter table public.sensor_readings
  alter column spo2 drop not null;
alter table public.sensor_readings
  add column if not exists sensor_state text not null default 'valid';
alter table public.sensor_readings
  add column if not exists device_uptime_ms bigint;
alter table public.sensor_readings
  add column if not exists temperature_kind text;

alter table public.sensor_readings
  drop constraint if exists sensor_readings_sensor_state_check;
alter table public.sensor_readings
  add constraint sensor_readings_sensor_state_check check (
    sensor_state in ('valid', 'no_finger', 'weak_signal', 'invalid', 'sensor_error')
  ) not valid;

alter table public.sensor_readings
  drop constraint if exists sensor_readings_state_values_check;
alter table public.sensor_readings
  add constraint sensor_readings_state_values_check check (
    (sensor_state = 'valid' and heart_rate is not null and spo2 is not null)
    or
    (sensor_state <> 'valid' and heart_rate is null and spo2 is null)
  ) not valid;

alter table public.sensor_readings
  drop constraint if exists sensor_readings_temperature_kind_check;
alter table public.sensor_readings
  add constraint sensor_readings_temperature_kind_check check (
    (temperature is null and temperature_kind is null)
    or
    (temperature is not null and temperature_kind = 'ambient')
  ) not valid;

alter table public.locations
  add column if not exists device_id text;

alter table public.sos_events
  add column if not exists device_id text;
alter table public.sos_events
  add column if not exists hardware_event_id text;
alter table public.sos_events
  add column if not exists device_pressed_at_ms bigint;
alter table public.sos_events
  add column if not exists sensor_state text;
alter table public.sos_events
  add column if not exists notification_started_at timestamptz;

alter table public.sos_events
  drop constraint if exists sos_events_sensor_state_check;
alter table public.sos_events
  add constraint sos_events_sensor_state_check check (
    sensor_state is null
    or sensor_state in ('valid', 'no_finger', 'weak_signal', 'invalid', 'sensor_error')
  ) not valid;

create unique index if not exists sos_events_hardware_event_id_uidx
  on public.sos_events(hardware_event_id)
  where hardware_event_id is not null;

create index if not exists sensor_readings_device_captured_idx
  on public.sensor_readings(device_id, captured_at desc);
create index if not exists locations_device_captured_idx
  on public.locations(device_id, captured_at desc)
  where device_id is not null;
create index if not exists sos_events_device_created_idx
  on public.sos_events(device_id, created_at desc)
  where device_id is not null;

-- Initial sends reuse the hardware event/request ID. A concurrent replay cannot
-- create a second provider attempt for the same recipient. Authority-triggered
-- retries use a new request ID and remain possible.
create unique index if not exists sms_attempts_request_recipient_uidx
  on public.sms_attempts(request_id, phone_number)
  where request_id is not null;

comment on column public.sensor_readings.sensor_state is
  'Trust state reported by the MAX30102 processing pipeline; unavailable states store NULL vitals.';
comment on column public.sensor_readings.temperature_kind is
  'ARGUS currently stores BMP280 ambient temperature only; never MAX30102 die temperature as body temperature.';
comment on column public.sos_events.hardware_event_id is
  'Stable ESP32-generated idempotency key for a physical button press.';
comment on column public.sos_events.notification_started_at is
  'Server timestamp for the single initial WhatsApp attempt for this SOS.';

-- RLS remains enabled and direct client roles remain revoked from all tables.
