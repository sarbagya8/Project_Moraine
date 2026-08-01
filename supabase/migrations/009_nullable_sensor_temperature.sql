alter table public.sensor_readings
  alter column temperature drop not null;

comment on column public.sensor_readings.temperature is
  'Optional non-body sensor temperature. NULL when the wearable has no supported temperature source.';
