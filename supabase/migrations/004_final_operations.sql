-- TrekProof final operations migration
-- Safe to run after 001, 002, and 003. Back up the database first.

create index if not exists sensor_readings_request_id_lookup_idx
  on public.sensor_readings(request_id)
  where request_id is not null;

create index if not exists locations_request_id_lookup_idx
  on public.locations(request_id)
  where request_id is not null;

create index if not exists symptom_reports_request_id_lookup_idx
  on public.symptom_reports(request_id)
  where request_id is not null;

create index if not exists sos_events_sms_status_created_idx
  on public.sos_events(sms_status, created_at desc);

create index if not exists sms_attempts_request_id_created_idx
  on public.sms_attempts(request_id, created_at desc)
  where request_id is not null;

create or replace function public.purge_trekproof_telemetry(
  p_before timestamptz
)
returns table(
  sensor_readings_deleted bigint,
  locations_deleted bigint,
  symptom_reports_deleted bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_before is null then
    raise exception 'p_before is required';
  end if;

  -- Prevent accidental deletion of recent operational data.
  if p_before > now() - interval '7 days' then
    raise exception 'Retention cutoff must be at least 7 days old';
  end if;

  delete from public.sensor_readings where captured_at < p_before;
  get diagnostics sensor_readings_deleted = row_count;

  delete from public.locations where captured_at < p_before;
  get diagnostics locations_deleted = row_count;

  delete from public.symptom_reports where created_at < p_before;
  get diagnostics symptom_reports_deleted = row_count;

  return next;
end;
$$;

comment on function public.purge_trekproof_telemetry(timestamptz) is
  'Optional service-role-only retention helper. SOS snapshots and SMS audit rows are preserved.';

revoke all on function public.purge_trekproof_telemetry(timestamptz)
  from public, anon, authenticated;
grant execute on function public.purge_trekproof_telemetry(timestamptz)
  to service_role;
