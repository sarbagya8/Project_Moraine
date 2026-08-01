alter table public.sensor_readings
  alter column altitude drop not null;

comment on column public.sensor_readings.altitude is
  'Optional barometric altitude in meters. Phone GPS remains the location source.';
