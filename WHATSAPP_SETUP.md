# ARGUS WhatsApp Cloud API setup

ARGUS uses Meta's official WhatsApp Cloud API through server-side `fetch`. It does not use WhatsApp Web automation, QR sessions, browser drivers, or unofficial WhatsApp libraries.

## Meta setup

1. Create a Meta Developer app and add the WhatsApp product.
2. Copy the Phone Number ID and WhatsApp Business Account ID.
3. Create a system-user access token for deployment. A temporary token is sufficient only for a short development test.
4. Add and verify the phone number used as `WHATSAPP_TEST_RECIPIENT`.
5. Create a long random webhook verify token.
6. Copy the Meta app secret.
7. Keep `DEMO_MODE=true` until the smoke test and database flow are verified.

## Server variables

```env
WHATSAPP_NOTIFICATIONS_ENABLED=true
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_API_VERSION=v23.0
WHATSAPP_TEST_RECIPIENT=97798XXXXXXXX
WHATSAPP_TEMPLATE_NAME=argus_sos_alert
WHATSAPP_TEMPLATE_LANGUAGE=en_US
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
META_APP_SECRET=
WHATSAPP_TIMEOUT_MS=10000
```

All are server-only. Never expose tokens or `META_APP_SECRET` to client code.

## Smoke test

`POST /api/notifications/whatsapp/test` requires `x-admin-api-key`. The request has no recipient body field. The server sends Meta's built-in `hello_world` template only to `WHATSAPP_TEST_RECIPIENT`.

- `simulated`: demo mode is on; Meta was not contacted.
- `accepted`: Meta accepted the request; this is not delivery confirmation.
- `not_configured`: live provider settings are incomplete.
- `failed`: Meta rejected, timed out, or could not receive the request.

The full SOS payload is never sent with `hello_world`.

## Production SOS template

Create and approve the template named by `WHATSAPP_TEMPLATE_NAME`. Its body variables must use this exact order:

1. trekker name
2. public trekker ID
3. severity label
4. severity score
5. route
6. emergency time
7. heart rate
8. SpO2
9. temperature
10. altitude
11. symptom
12. location status
13. SOS tracking ID
14. map URL
15. Rescue Passport URL

The fixed template text should start with `ARGUS SOS ALERT` and end with: `Readings are informational and are not a medical diagnosis.`

## Webhook

Deploy to public HTTPS, then configure:

```text
https://YOUR_DOMAIN/api/webhooks/whatsapp
```

Use `WHATSAPP_WEBHOOK_VERIFY_TOKEN` during subscription and subscribe to the `messages` field. POST requests must include Meta's valid `X-Hub-Signature-256`; ARGUS verifies it with HMAC SHA-256 and `META_APP_SECRET`.

Verified status events update the audit row matched by Meta message ID. Duplicate events are safe, and delivered/read states are not downgraded.

## Troubleshooting

- Confirm `DEMO_MODE=false` for live calls.
- Confirm the recipient is verified during Meta development mode.
- Confirm the access token, Phone Number ID, WABA ID, API version, template name, and language.
- Confirm the approved template has exactly 15 body parameters in the documented order.
- Confirm the webhook uses public HTTPS and the verify token matches exactly.
- Treat `accepted` as provider acceptance only; wait for signed webhook events.
