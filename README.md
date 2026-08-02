# ARGUS

ARGUS is a hardware-and-software trekking safety prototype. A MAX30102 sends optical samples to an ESP32 wristband, which publishes heart rate, SpO2, sensor state, and physical SOS events over Bluetooth Low Energy. The signed-in Trekker Portal adds phone GPS and forwards validated data to the Next.js backend. Supabase stores the shared safety record, and the existing SOS workflow can notify configured contacts through Meta's official WhatsApp Cloud API.

ARGUS supports rescue prioritization. It is not a medical device, does not diagnose illness, and does not guarantee connectivity or rescue.

## Stack

- Next.js 16 App Router, TypeScript, React, and Tailwind CSS
- Supabase PostgreSQL through a server-only service-role client
- Zod request validation
- Meta WhatsApp Cloud API through native server-side `fetch`
- Arduino C++ for ESP32, SparkFun MAX3010x, and NimBLE
- Node's built-in test runner

## Frontend portals

- `/authority/login` opens the server-protected rescue portal.
- `/trekker/login` pairs a trekker to an assigned device and opens a trekker-scoped dashboard.
- Both portals use the same responsive design system and shared Leaflet map.
- Protected Next.js APIs keep privileged keys out of browser code.

## Backend architecture

```text
MAX30102 -> ESP32 -> BLE -> trekker browser + phone GPS
  -> Next.js route handler
  -> validation and source-specific authentication
  -> Supabase telemetry or SOS workflow
  -> emergency snapshot and severity score
  -> WhatsApp attempt audit
  -> rescue dashboard and Rescue Passport
```

Route handlers live in `src/app/api`. Business workflows live in `src/lib/sos-service.ts`; external Meta communication lives in `src/lib/whatsapp.ts`; protocol validation and webhook security live in `src/lib/whatsapp-protocol.ts`.

## Local setup

Requirements: Node.js 20 or newer, a Supabase project, and Arduino IDE for firmware work.

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Keep `DEMO_MODE=true` until the database and fixed-recipient WhatsApp smoke test work.

## Database setup

For a new Supabase project, run the numbered files in `supabase/migrations` in order:

1. `001_initial_schema.sql`
2. `002_production_hardening.sql`
3. `003_idempotency_and_integrity.sql`
4. `004_final_operations.sql`
5. `005_whatsapp_notifications.sql`
6. `006_sos_severity.sql`
7. `007_portal_devices.sql`
8. `008_optional_sensor_altitude.sql`
9. `009_nullable_sensor_temperature.sql`
10. `010_argus_hardware_integration.sql`
11. `011_reconcile_interrupted_notification_attempts.sql`
12. `012_single_active_sos_and_pending_attempts.sql`
13. `013_hardware_contract_reconciliation.sql`

After the migrations, run `npm run seed:demo` for the explicit local/hackathon dataset. Use `npm run seed:demo:active-sos` only when an active simulated SOS is wanted. Run `npm run seed:demo:reset` to remove those stable records. On an existing project, back up first and apply only missing migrations. Do not edit migrations that have already been applied.

Verify the hosted schema before starting the portals:

```bash
npm run db:check
```

The check prints only operation names and sanitized PostgREST errors. If
migration 010 or 013 is pending, existing Authority and Trekker records remain
readable in compatibility mode, but the migration is still required for
firmware metadata, unavailable sensor-state persistence, device-linked GPS,
hardware SOS metadata, device foreign keys, and the complete sensor-state contract.

The service-role key is used only by server code. RLS stays enabled, and direct `anon` and `authenticated` access to operational tables remains revoked.

## Environment variables

Copy `.env.example`. The main groups are:

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- server authentication: `DEVICE_API_KEY`, `ADMIN_API_KEY`
- portal authentication: `AUTHORITY_USERNAME`, `AUTHORITY_PASSWORD_HASH`, `SESSION_SECRET`, `SESSION_MAX_AGE_SECONDS`
- URLs and safety: `NEXT_PUBLIC_APP_URL`, `DEMO_MODE`
- WhatsApp: all `WHATSAPP_*` values plus `META_APP_SECRET`; `WHATSAPP_RECIPIENT_NUMBER` is the fixed prototype recipient for smoke tests and live SOS alerts
- reliability: freshness, SOS cooldown, notification retry cooldown, timeout, and body-size values

Never prefix a secret with `NEXT_PUBLIC_`. `WHATSAPP_RECIPIENT_NUMBER` is the only destination used by the smoke-test endpoint and live SOS alerts; the browser and database cannot override it.

See `.env.example` and `WHATSAPP_SETUP.md`.

## Main API routes

- `POST /api/readings` — device key and idempotency key required
- `POST /api/location` — device key required when `source` is `device`
- `POST /api/symptoms` — validated symptom report
- `POST /api/sos` — authentication depends on source
- `GET /api/rescue` — administrative authentication required
- `GET /api/rescue/:id` — Rescue Passport data
- `PATCH /api/rescue/:id` — administrative authentication required
- `POST /api/rescue/:id/retry-notification` — administrative authentication, rate limit, and cooldown
- `POST /api/notifications/whatsapp/test` — administrative authentication and fixed recipient
- `GET|POST /api/webhooks/whatsapp` — Meta verification and signed status events

Portal APIs also include `POST /api/auth/authority/login`, `POST /api/auth/trekker/login`, `GET /api/authority/overview`, `GET /api/trekker/me`, and the authority-protected `/api/devices` routes.

All JSON APIs use `{ "success": true, "data": ... }` or a safe error envelope. Responses include `x-request-id` and `Cache-Control: no-store`.

## SOS behavior

The SOS workflow:

1. validates and authorizes the request;
2. stores optional inline device reading/location data;
3. loads the freshest telemetry and symptom;
4. calls the atomic `create_sos_event_if_allowed` PostgreSQL function;
5. returns an existing event without alerting again when duplicated;
6. calculates a deterministic `severityScore` from 0 to 100;
7. stores a complete emergency snapshot;
8. sends structured WhatsApp templates to deduplicated trusted contacts;
9. records each attempt in the legacy-compatible `sms_attempts` table;
10. updates lifecycle states from verified Meta webhooks.

The score supports rescue prioritization only and never blocks an SOS.

## WhatsApp

Only Meta's official Cloud API is active. Demo mode records simulated attempts and never contacts Meta. Initial API acceptance is stored as `accepted`; `sent`, `delivered`, `read`, and `failed` come from verified webhook events.

The setup smoke test uses Meta's `hello_world` template only. SOS alerts use the approved template named by `WHATSAPP_TEMPLATE_NAME`.

## ESP32

The integrated uploaded firmware is in `esp32/TrekProof_ARGUS/TrekProof_ARGUS.ino`. It keeps the uploaded ESP32-C3 Super Mini wiring (SDA 8, SCL 9, active-low button 3), runs real MAXIM heart-rate/SpO₂ processing, and uses BLE GATT only. The trekker phone adds browser geolocation and forwards data through session-protected bridge routes. The firmware contains no Wi-Fi, GPS module, API URL, API key, or server secret.

See `ARGUS_HARDWARE_INTEGRATION.md` for the final UUIDs, payloads, upload steps, device registration, and end-to-end hardware checklist.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run db:check
```

`npm run verify` runs the same checks in sequence.

Use `npm run seed:demo` only for a local or non-production demonstration.

## Limitations

- One configured authority account and signed cookie sessions are suitable for a hackathon MVP, not multi-user staff identity management.
- In-memory rate limiting is per application instance.
- Rescue Passport URLs depend on unguessable UUIDs rather than user login.
- Web Bluetooth requires a supported Chromium browser, HTTPS or localhost, and an active phone connection.
- Phone GPS and internet availability still depend on terrain, permission, battery, and network coverage.
- MAX30102 accuracy depends on sensor placement, motion, signal quality, and physical validation; readings are not a medical diagnosis.
- Public map tiles and third-party provider availability can fail.
- Meta credentials, recipient approval, template approval, and public webhook configuration remain manual.

Use `DEPLOYMENT_CHECKLIST.md` for the deployment and field-test checklist.
