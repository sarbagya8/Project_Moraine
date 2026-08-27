# ARGUS WhatsApp Cloud API setup

ARGUS uses Meta's official WhatsApp Cloud API through server-side `fetch`. It does not use WhatsApp Web automation, QR sessions, browser drivers, or unofficial WhatsApp libraries.

## Meta setup

1. Create a Meta Developer app and add the WhatsApp product.
2. Copy the Phone Number ID and WhatsApp Business Account ID.
3. Create a system-user access token for deployment. A temporary token is sufficient only for a short development test.
4. Add and verify the phone number used as `WHATSAPP_RECIPIENT_NUMBER`.
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
WHATSAPP_RECIPIENT_NUMBER=97798XXXXXXXX
WHATSAPP_TEMPLATE_NAME=argus_sos_alert
WHATSAPP_TEMPLATE_LANGUAGE=en_US
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
META_APP_SECRET=
WHATSAPP_TIMEOUT_MS=10000
```

All are server-only. Never expose tokens or `META_APP_SECRET` to client code.
`WHATSAPP_RECIPIENT_NUMBER` is the fixed prototype destination for the explicit
smoke test and every live SOS. Database emergency-contact fields do not override
it, so one initial provider request is made per SOS event.

## Smoke test

`POST /api/notifications/whatsapp/test` requires `x-admin-api-key`. The request has no recipient body field. The server sends Meta's built-in `hello_world` template only to `WHATSAPP_RECIPIENT_NUMBER`.

- `simulated`: demo mode is on; Meta was not contacted.
- `accepted`: Meta accepted the request; this is not delivery confirmation.
- `not_configured`: live provider settings are incomplete.
- `failed`: Meta rejected, timed out, or could not receive the request.

The full SOS payload is never sent with `hello_world`.

## Production SOS template

Create and approve the template named by `WHATSAPP_TEMPLATE_NAME`. The live approved `argus_sos_alert` template uses a fixed header and button and accepts exactly five body parameters in this order:

1. trekker name
2. public trekker ID
3. emergency status
4. map URL
5. Rescue Passport URL

The fixed template text should start with `ARGUS SOS ALERT` and end with: `This information supports rescue coordination and is not a medical diagnosis.`

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
- Confirm the approved template has exactly 16 body parameters in the documented order.
- Confirm the webhook uses public HTTPS and the verify token matches exactly.
- Treat `accepted` as provider acceptance only; wait for signed webhook events.
