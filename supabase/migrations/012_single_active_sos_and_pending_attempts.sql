-- One trekker can have only one unresolved SOS. The advisory lock keeps the
-- lookup and insert atomic across web, authority, retry, and physical BLE
-- requests while request_id continues to handle exact request replays.
create or replace function public.create_sos_event_if_allowed(
  p_trekker_id text,
  p_source text,
  p_cooldown_seconds integer,
  p_request_id text default null
)
returns table(event_id uuid, is_duplicate boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_id uuid;
  created_id uuid;
begin
  if p_cooldown_seconds < 10 or p_cooldown_seconds > 3600 then
    raise exception 'Invalid SOS cooldown';
  end if;

  if p_source not in ('physical_button','web_button','manual','demo') then
    raise exception 'Invalid SOS source';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_trekker_id));

  if p_request_id is not null then
    select id into existing_id
    from public.sos_events
    where request_id = p_request_id
    limit 1;

    if existing_id is not null then
      return query select existing_id, true;
      return;
    end if;
  end if;

  select id into existing_id
  from public.sos_events
  where trekker_id = p_trekker_id
    and status in ('active', 'acknowledged')
  order by created_at desc
  limit 1;

  if existing_id is not null then
    return query select existing_id, true;
    return;
  end if;

  insert into public.sos_events (trekker_id, source, request_id)
  values (p_trekker_id, p_source, p_request_id)
  returning id into created_id;

  return query select created_id, false;
end;
$$;

revoke all on function public.create_sos_event_if_allowed(text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.create_sos_event_if_allowed(text, text, integer, text)
  to service_role;

alter table public.sms_attempts
  drop constraint if exists sms_attempts_status_check;
alter table public.sms_attempts
  add constraint sms_attempts_status_check check (
    status in ('pending','simulated','not_configured','accepted','queued','sent','delivered','read','failed')
  ) not valid;
