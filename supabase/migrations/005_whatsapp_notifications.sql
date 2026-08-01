-- Adds WhatsApp delivery lifecycle support without renaming deployed SMS audit tables.
alter table public.sms_attempts drop constraint if exists sms_attempts_status_check;
alter table public.sms_attempts add constraint sms_attempts_status_check
  check (status in ('simulated','not_configured','accepted','queued','sent','delivered','read','failed')) not valid;

alter table public.sos_events drop constraint if exists sos_events_sms_status_check;
alter table public.sos_events add constraint sos_events_sms_status_check
  check (sms_status in ('pending','simulated','not_configured','accepted','queued','sent','delivered','read','failed')) not valid;

alter table public.sms_attempts add column if not exists sent_at timestamptz;
alter table public.sms_attempts add column if not exists delivered_at timestamptz;
alter table public.sms_attempts add column if not exists read_at timestamptz;
alter table public.sms_attempts add column if not exists failed_at timestamptz;

create index if not exists sms_attempts_provider_reference_idx
  on public.sms_attempts(provider_reference)
  where provider_reference is not null;
