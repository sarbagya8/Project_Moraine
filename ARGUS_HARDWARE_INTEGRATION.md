# MORAINE physical-device integration

## Runtime architecture

MORAINE uses the Next.js App Router. Signed HTTP-only sessions protect the
Trekker and Authority portals. Server route handlers validate data with Zod,
verify device assignment against Supabase with the server-only service-role
client, and pass SOS events to the existing `sos-service.ts` and Meta WhatsApp
Cloud API implementation. The Authority portal polls its authenticated overview
every five seconds.

```text
MAX30102 red/IR -> ESP32-C3 -> BLE GATT -> Trekker browser
  + browser phone GPS -> authenticated Next.js routes -> Supabase
  -> Authority portal + existing WhatsApp Cloud API
```

The ESP32 has no GPS and no cloud credentials. The authenticated session, not a
BLE-supplied trekker ID, determines ownership on every bridge request.

## Final BLE contract

All UUIDs are centralized in `src/lib/bluetooth/argus-ble-config.ts` and
`esp32/TrekProof_ARGUS/argus_ble_config.h`.

| GATT item | UUID | Properties |
|---|---|---|
| ARGUS service | `4fafc201-1fb5-459e-8fcc-c5c9c331914b` | primary service |
| Combined ARGUS data | `beb5483e-36e1-4688-b7f5-ea07361b26a8` | read, notify |

The firmware requests MTU 247. TrekProof telemetry is UTF-8 JSON and is sent in
bounded chunks because the complete payload is approximately 240 bytes.

The production firmware advertises the default name `ARGUS-XXXX`, where `XXXX`
is derived from the ESP32 eFuse MAC, but the browser does not depend on that
name. Normal discovery filters only on the ARGUS service UUID and requests the
same UUID as an optional service. If the filtered chooser cannot find the
wristband, the UI offers an explicit diagnostic all-device chooser; a selected
device must still expose the complete ARGUS GATT contract and pass backend
ownership verification.

Valid live sensor reading:

```json
{"hr":82,"spo2":97,"altitude":2864.2,"pressure":712.4,"temperature":18.6,"start_altitude":2800.0,"current_altitude":2864.2,"average_speed":1.25,"distance":450.0,"ams":"LOW","fall":false,"fall_type":"none","sos_countdown":false,"sos":false}
```

Unavailable live reading:

The deployed firmware represents unavailable optical readings with non-positive
`hr` and `spo2`; the browser converts those values to null and derives
`no_finger` rather than displaying zero.

Supported states are `valid`, `no_finger`, `weak_signal`, `invalid`,
`sensor_unavailable`, and `sensor_error`. Unavailable states always carry null
heart rate and SpO2 values.

Physical SOS:

Physical SOS is the false-to-true transition of the JSON `sos` field. The
browser keeps one locally persisted event ID until `sos` becomes false.

Every current-firmware characteristic read returns
`INFO|ARGUS-12AB34CD|2.0.0`.
Notifications are reassembled and validated as TrekProof JSON. After identity and backend ownership are
verified, the browser attaches that stable device ID to sensor and SOS packets.

Firmware identity is an optional BLE capability for compatibility with already
flashed prototypes. If READ is unsupported, malformed, or currently contains a
sensor-only packet, the browser continues only after confirming the exact ARGUS
service and characteristic, then asks the authenticated backend to verify the
signed-in Trekker's assigned active device. In that fallback, firmware displays
as `Unavailable`; the advertised Bluetooth name remains display-only and is
never treated as the database device ID. Flashing the current firmware restores
the stronger eFuse-derived `INFO` handshake.

The OLED system page uses `BLE [OK]` only for an active browser GATT
connection. `BLE [--]` with `Advertising...` means the device is disconnected
and discoverable. Connection and disconnection callbacks force an OLED redraw,
and disconnection restarts advertising automatically.

Temporary Serial Monitor diagnostics report advertising, browser connection,
characteristic reads, notification type, and the exact non-secret text payload.

Compact packets omit timestamps. The browser assigns the receipt timestamp and
the backend stores its authoritative server creation time.

## Database

Apply the migrations in numeric order. Migration
`010_argus_hardware_integration.sql` adds:

- device firmware and verification timestamps;
- nullable vitals plus validated sensor state and device uptime;
- explicit ambient-temperature metadata;
- device association for browser locations and SOS snapshots;
- unique hardware event IDs;
- a unique initial WhatsApp-attempt key per event and recipient;
- indexes for recent device telemetry, locations, and SOS events.

Migration `013_hardware_contract_reconciliation.sql` adds the
`sensor_unavailable` state, bounded firmware/device-uptime metadata, and
non-destructive foreign keys from telemetry, locations, and SOS events to the
registered device table.

Migration `014_esp32_telemetry_payload.sql` adds nullable persistence columns
for pressure, trek metrics, AMS, fall, and raw SOS state from the confirmed
TrekProof JSON. Existing rows and RLS are preserved.

The migration does not disable RLS or grant direct browser access. Existing
tables remain server-only for `anon` and `authenticated` roles.

## Environment variables

Copy `.env.example` to `.env.local` and set values for:

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- signed portal sessions: `SESSION_SECRET`, `SESSION_MAX_AGE_SECONDS`
- Authority login: `AUTHORITY_USERNAME`, `AUTHORITY_PASSWORD_HASH`
- application URL: `NEXT_PUBLIC_APP_URL`
- Meta WhatsApp: `WHATSAPP_NOTIFICATIONS_ENABLED`,
  `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_API_VERSION`,
  `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE`,
  `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`
- reliability: `LOCATION_STALE_SECONDS`, `READING_STALE_SECONDS`,
  `SOS_COOLDOWN_SECONDS`, `NOTIFICATION_RETRY_COOLDOWN_SECONDS`,
  `WHATSAPP_TIMEOUT_MS`, `MAX_JSON_BODY_BYTES`

`WHATSAPP_RECIPIENT_NUMBER` is the fixed prototype recipient for the Authority
smoke-test endpoint and live SOS notifications. Database phone fields do not
override it. All provider requests are server-side.

## Application setup

```powershell
npm install
Copy-Item .env.example .env.local
npm run auth:hash-password
npm run dev
```

Apply every pending migration through 013 before connecting hardware. Open
`http://localhost:3000` in Chrome or Edge. Production must use HTTPS.

For a linked Supabase CLI project:

```powershell
npx supabase db push --include-all
npm run db:check
```

Confirm the hosted project is ready before uploading firmware:

```powershell
npm run db:check
```

## Firmware upload

1. Install the Espressif Systems ESP32 board package in Arduino IDE.
2. Install SparkFun MAX3010x, Adafruit BMP280, Adafruit MPU6050, Adafruit
   SSD1306, and Adafruit GFX libraries.
3. Open `esp32/TrekProof_ARGUS/TrekProof_ARGUS.ino`.
4. Select `ESP32C3 Dev Module` or the exact installed ESP32-C3 Super Mini board
   entry, select its serial port, and enable USB CDC on boot when that option is
   available.
5. Upload and open Serial Monitor at 115200 baud.
6. Copy the printed `ARGUS-XXXXXXXX` device ID.
7. Sign in to the Authority portal, create that exact device ID, assign the
   trekker, and securely copy the one-time pairing code.
8. Sign in at `/trekker/login` with the assigned trekker ID and pairing code.

## Manual physical verification

1. Apply migrations through 014 and confirm `npm run db:check` passes.
2. Upload the production firmware to the ESP32-C3 Super Mini.
3. Open Serial Monitor at 115200 baud.
4. Confirm `MAX30102: initialized` appears, or diagnose the explicit
   non-blocking unavailable message.
5. Confirm `BLE: advertising as ARGUS-XXXX` appears.
6. Register the printed `ARGUS-XXXXXXXX` device ID and assign it to the Trekker.
7. Start MORAINE and open it in Chrome or Edge on localhost or HTTPS.
8. Sign in with the assigned Trekker ID and pairing code.
9. Click **Connect MORAINE device** once.
10. Select the physical wristband under its actual advertised name. The current
    production firmware defaults to `ARGUS-XXXX`, but the website does not
    require that name.
11. Confirm the panel shows the selected name, verified device ID, and firmware
    `2.0.0`.
12. Confirm another Trekker cannot verify or persist data from this device.
13. Allow browser location permission and confirm coordinates, accuracy, and a
    fresh captured timestamp.
14. Place a finger steadily on the MAX30102 until the rolling window reports
    `valid` with real heart rate and SpO₂.
15. Remove the finger and confirm heart rate and SpO₂ become unavailable rather
    than zero while state changes to `no_finger`, `weak_signal`, or `invalid`.
16. Confirm selected readings and state changes appear in Supabase without a
    raw-packet flood.
17. Confirm the Authority portal shows the same device, sensor state, latest
    valid reading, phone GPS, and freshness.
18. Hold the active-low GPIO 3 button for at least 800 ms once.
19. Confirm the Trekker panel shows one hardware event ID and one tracking ID.
20. Confirm one `sos_events` row and one initial `sms_attempts` row exist.
21. Confirm the Authority portal shows source `physical_button`, device ID,
    event time, latest telemetry, GPS, notification state, and Rescue Passport.
22. Confirm Meta is called once and the stored status advances from `sent` to
    `delivered` and `read` through the public webhook.
23. Replay the readable SOS value or retry the same browser queue item and
    confirm the existing SOS is returned without another notification attempt.
24. Disconnect and reconnect BLE, then confirm notifications resume with no
    duplicate listeners and no page restart. Repeat an authorized SOS test only
    after resolving the prior active SOS.

The MAX30102 algorithm, BLE radio behavior, GPIO wiring, GPS permission flow,
Meta template approval, and actual WhatsApp delivery require physical/manual
verification; automated tests validate parsing, authorization structure,
freshness, null handling, and idempotency protections.
