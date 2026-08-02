-- A legacy sender could create an SOS, set its aggregate status to pending,
-- then fail before recording the provider attempt. These rows cannot safely be
-- resent because Meta may have accepted the original request. Resolve only
-- clearly stale orphaned records as failed so they remain auditable and never
-- masquerade as an in-flight notification.
update public.sos_events as event
set
  sms_status = 'failed',
  provider_response = coalesce(event.provider_response, '{}'::jsonb) || jsonb_build_object(
    'notificationRecovery', 'No notification audit record was created; provider outcome is unknown and the alert was not automatically resent.'
  )
where event.sms_status = 'pending'
  and event.created_at < now() - interval '5 minutes'
  and not exists (
    select 1
    from public.sms_attempts as attempt
    where attempt.sos_event_id = event.id
  );
