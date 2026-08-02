-- Persist the additional fields already emitted by the TrekProof ESP32 BLE
-- telemetry JSON. Existing rows and RLS policies are preserved.

alter table public.sensor_readings
  add column if not exists pressure numeric,
  add column if not exists start_altitude numeric,
  add column if not exists current_altitude numeric,
  add column if not exists average_speed numeric,
  add column if not exists distance numeric,
  add column if not exists ams_status text,
  add column if not exists fall_detected boolean,
  add column if not exists fall_type text,
  add column if not exists sos_countdown boolean,
  add column if not exists sos_active boolean;

alter table public.sensor_readings
  drop constraint if exists sensor_readings_pressure_check,
  drop constraint if exists sensor_readings_start_altitude_check,
  drop constraint if exists sensor_readings_current_altitude_check,
  drop constraint if exists sensor_readings_average_speed_check,
  drop constraint if exists sensor_readings_distance_check,
  drop constraint if exists sensor_readings_ams_status_length_check,
  drop constraint if exists sensor_readings_fall_type_length_check;

alter table public.sensor_readings
  add constraint sensor_readings_pressure_check
    check (pressure is null or pressure between 100 and 1200) not valid,
  add constraint sensor_readings_start_altitude_check
    check (start_altitude is null or start_altitude between -500 and 9000) not valid,
  add constraint sensor_readings_current_altitude_check
    check (current_altitude is null or current_altitude between -500 and 9000) not valid,
  add constraint sensor_readings_average_speed_check
    check (average_speed is null or average_speed between 0 and 100) not valid,
  add constraint sensor_readings_distance_check
    check (distance is null or distance between 0 and 10000000) not valid,
  add constraint sensor_readings_ams_status_length_check
    check (ams_status is null or char_length(ams_status) <= 80) not valid,
  add constraint sensor_readings_fall_type_length_check
    check (fall_type is null or char_length(fall_type) <= 80) not valid;

comment on column public.sensor_readings.pressure is
  'BMP280 pressure in hPa reported by the TrekProof ESP32.';
comment on column public.sensor_readings.temperature is
  'Environmental/device temperature only; never human body temperature.';
comment on column public.sensor_readings.sos_active is
  'Raw physical SOS state from the ESP32 telemetry packet.';

-- RLS remains enabled and existing privileges are unchanged.
