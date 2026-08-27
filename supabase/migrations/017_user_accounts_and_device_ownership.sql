alter table public.trekkers
  add column if not exists auth_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists email text,
  add column if not exists role text not null default 'user',
  add column if not exists preferred_language text,
  add column if not exists secondary_emergency_contact_name text,
  add column if not exists secondary_emergency_contact_phone text,
  add column if not exists emergency_contact_relationship text;

alter table public.trekkers
  alter column emergency_contact drop not null,
  drop constraint if exists trekkers_role_check;

alter table public.trekkers
  add constraint trekkers_role_check check (role in ('user','responder','admin')) not valid;

create unique index if not exists trekkers_auth_user_id_uidx
  on public.trekkers(auth_user_id) where auth_user_id is not null;

create unique index if not exists trekkers_email_uidx
  on public.trekkers(lower(email)) where email is not null;

alter table public.devices
  add column if not exists display_name text;

alter table public.trekkers
  drop constraint if exists trekkers_email_length_check,
  drop constraint if exists trekkers_preferred_language_length_check,
  drop constraint if exists trekkers_secondary_contact_name_length_check,
  drop constraint if exists trekkers_secondary_contact_phone_length_check,
  drop constraint if exists trekkers_emergency_relationship_length_check;

alter table public.trekkers
  add constraint trekkers_email_length_check check (email is null or char_length(email) <= 254) not valid,
  add constraint trekkers_preferred_language_length_check check (preferred_language is null or char_length(preferred_language) <= 80) not valid,
  add constraint trekkers_secondary_contact_name_length_check check (secondary_emergency_contact_name is null or char_length(secondary_emergency_contact_name) <= 120) not valid,
  add constraint trekkers_secondary_contact_phone_length_check check (secondary_emergency_contact_phone is null or char_length(secondary_emergency_contact_phone) <= 40) not valid,
  add constraint trekkers_emergency_relationship_length_check check (emergency_contact_relationship is null or char_length(emergency_contact_relationship) <= 80) not valid;

alter table public.devices
  drop constraint if exists devices_display_name_length_check;

alter table public.devices
  add constraint devices_display_name_length_check check (display_name is null or char_length(display_name) between 1 and 120) not valid;

revoke all on table public.trekkers, public.devices, public.sensor_readings,
  public.locations, public.symptom_reports, public.sos_events, public.sms_attempts
  from anon, authenticated;

grant all on table public.trekkers, public.devices, public.sensor_readings,
  public.locations, public.symptom_reports, public.sos_events, public.sms_attempts
  to service_role;
