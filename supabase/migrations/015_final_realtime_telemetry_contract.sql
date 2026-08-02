-- Final, idempotent ARGUS telemetry convergence migration.
-- Safe to apply to an existing project: no rows are deleted or rewritten and
-- existing RLS policies/privileges remain unchanged.

alter table public.devices
  add column if not exists firmware_version text,
  add column if not exists last_verified_at timestamptz;

alter table public.sensor_readings
  alter column heart_rate drop not null,
  alter column spo2 drop not null,
  add column if not exists sensor_state text not null default 'valid',
  add column if not exists device_uptime_ms bigint,
  add column if not exists temperature_kind text,
  add column if not exists pressure numeric,
  add column if not exists start_altitude numeric,
  add column if not exists current_altitude numeric,
  add column if not exists average_speed numeric,
  add column if not exists distance numeric,
  add column if not exists ams_status text,
  add column if not exists fall_detected boolean not null default false,
  add column if not exists fall_type text,
  add column if not exists sos_countdown boolean not null default false,
  add column if not exists sos_active boolean not null default false;

alter table public.locations
  add column if not exists device_id text;

alter table public.sos_events
  add column if not exists device_id text,
  add column if not exists hardware_event_id text,
  add column if not exists device_pressed_at_ms bigint,
  add column if not exists sensor_state text,
  add column if not exists notification_started_at timestamptz;

alter table public.sensor_readings
  drop constraint if exists sensor_readings_sensor_state_check,
  drop constraint if exists sensor_readings_state_values_check,
  drop constraint if exists sensor_readings_temperature_kind_check,
  drop constraint if exists sensor_readings_pressure_check,
  drop constraint if exists sensor_readings_start_altitude_check,
  drop constraint if exists sensor_readings_current_altitude_check,
  drop constraint if exists sensor_readings_average_speed_check,
  drop constraint if exists sensor_readings_distance_check,
  drop constraint if exists sensor_readings_ams_status_length_check,
  drop constraint if exists sensor_readings_fall_type_length_check;

alter table public.sensor_readings
  add constraint sensor_readings_sensor_state_check check (
    sensor_state in ('valid','no_finger','weak_signal','invalid','sensor_unavailable','sensor_error')
  ) not valid,
  add constraint sensor_readings_state_values_check check (
    (sensor_state = 'valid' and heart_rate is not null and spo2 is not null)
    or (sensor_state <> 'valid' and heart_rate is null and spo2 is null)
  ) not valid,
  add constraint sensor_readings_temperature_kind_check check (
    (temperature is null and temperature_kind is null)
    or (temperature is not null and temperature_kind = 'ambient')
  ) not valid,
  add constraint sensor_readings_pressure_check check (pressure is null or pressure between 100 and 1200) not valid,
  add constraint sensor_readings_start_altitude_check check (start_altitude is null or start_altitude between -500 and 9000) not valid,
  add constraint sensor_readings_current_altitude_check check (current_altitude is null or current_altitude between -500 and 9000) not valid,
  add constraint sensor_readings_average_speed_check check (average_speed is null or average_speed between 0 and 100) not valid,
  add constraint sensor_readings_distance_check check (distance is null or distance between 0 and 10000000) not valid,
  add constraint sensor_readings_ams_status_length_check check (ams_status is null or char_length(ams_status) <= 80) not valid,
  add constraint sensor_readings_fall_type_length_check check (fall_type is null or char_length(fall_type) <= 80) not valid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sensor_readings_device_id_fkey'
      and conrelid = 'public.sensor_readings'::regclass
  ) then
    alter table public.sensor_readings add constraint sensor_readings_device_id_fkey
      foreign key (device_id) references public.devices(id)
      on update cascade on delete restrict not valid;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'locations_device_id_fkey'
      and conrelid = 'public.locations'::regclass
  ) then
    alter table public.locations add constraint locations_device_id_fkey
      foreign key (device_id) references public.devices(id)
      on update cascade on delete set null not valid;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'sos_events_device_id_fkey'
      and conrelid = 'public.sos_events'::regclass
  ) then
    alter table public.sos_events add constraint sos_events_device_id_fkey
      foreign key (device_id) references public.devices(id)
      on update cascade on delete set null not valid;
  end if;
end $$;

create unique index if not exists sos_events_hardware_event_id_uidx
  on public.sos_events(hardware_event_id) where hardware_event_id is not null;
create index if not exists sensor_readings_device_captured_idx
  on public.sensor_readings(device_id, captured_at desc);
create index if not exists locations_device_captured_idx
  on public.locations(device_id, captured_at desc) where device_id is not null;
create index if not exists sos_events_device_created_idx
  on public.sos_events(device_id, created_at desc) where device_id is not null;

comment on column public.sensor_readings.temperature is
  'Environmental/device temperature from BMP280; never human body temperature.';
comment on column public.sensor_readings.sensor_state is
  'MAX30102 state. Non-valid states retain NULL heart_rate and spo2 while other telemetry may persist.';
comment on column public.sensor_readings.sos_active is
  'Raw physical SOS boolean received from ESP32 telemetry.';

