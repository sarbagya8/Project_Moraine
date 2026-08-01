-- Adds transparent rescue-prioritization fields without changing legacy SMS column names.
alter table public.sos_events
  add column if not exists severity_score integer;
alter table public.sos_events
  add column if not exists severity_label text;
alter table public.sos_events
  add column if not exists severity_data_status text;

alter table public.sos_events
  drop constraint if exists sos_events_severity_score_check;
alter table public.sos_events
  add constraint sos_events_severity_score_check
    check (severity_score is null or severity_score between 0 and 100) not valid;

alter table public.sos_events
  drop constraint if exists sos_events_severity_label_check;
alter table public.sos_events
  add constraint sos_events_severity_label_check
    check (
      severity_label is null
      or severity_label in ('low', 'moderate', 'high', 'critical')
    ) not valid;

alter table public.sos_events
  drop constraint if exists sos_events_severity_data_status_check;
alter table public.sos_events
  add constraint sos_events_severity_data_status_check
    check (
      severity_data_status is null
      or severity_data_status in ('sufficient', 'insufficient_data')
    ) not valid;

comment on column public.sos_events.severity_score is
  'Deterministic rescue-prioritization score from 0 to 100; not a medical diagnosis.';
