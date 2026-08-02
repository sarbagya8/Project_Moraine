# ARGUS deployment checklist

## Code and database

- [ ] Back up the Supabase project.
- [ ] Apply missing migrations `001` through `013` in order.
- [ ] Use `npm run seed:demo` only in a local or non-production hackathon environment.
- [ ] Confirm RLS is enabled and direct `anon`/`authenticated` access is revoked.
- [ ] Run `npm run verify`.

## Environment

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] exact HTTPS `NEXT_PUBLIC_APP_URL`
- [ ] long independent `DEVICE_API_KEY` and `ADMIN_API_KEY`
- [ ] `AUTHORITY_USERNAME` and a locally generated `AUTHORITY_PASSWORD_HASH`
- [ ] random `SESSION_SECRET` of at least 32 characters
- [ ] `SESSION_MAX_AGE_SECONDS` or the 8-hour default
- [ ] every required WhatsApp and Meta variable
- [ ] `DEMO_MODE=true` for initial deployment
- [ ] `DEMO_MODE=false` only after the fixed-recipient smoke test succeeds

## Functional checks

- [ ] deep health check reports the database reachable without exposing secrets
- [ ] reading and device-location requests require device and idempotency headers
- [ ] browser GPS and symptom reporting work over HTTPS
- [ ] one physical SOS creates one snapshot and Rescue Passport
- [ ] the same idempotency key returns the existing record
- [ ] rapid SOS repetition does not send another alert
- [ ] severity score and insufficient-data state display correctly
- [ ] WhatsApp attempts appear in rescue data
- [ ] signed webhook events update sent/delivered/read/failed state
- [ ] authority login, protected URLs, logout, and rescue status updates work
- [ ] trekker pairing prevents access to another trekker
- [ ] notification retry enforces both rate limit and cooldown

## BLE wristband checks

- [ ] install the Espressif ESP32 core, SparkFun MAX3010x, Adafruit BMP280,
      Adafruit MPU6050, Adafruit SSD1306, and Adafruit GFX libraries
- [ ] upload the production sketch and register its printed eFuse-derived device ID
- [ ] confirm real MAX30102 values and null unavailable states on the physical sensor
- [ ] use a supported Chromium browser over HTTPS or localhost
- [ ] verify BLE identity, phone GPS permission, readings, and an 800 ms physical SOS hold
- [ ] test BLE disconnect, denied GPS, internet loss, SOS queue retry, and phone battery use
- [ ] keep a manual emergency method

## Before real-world use

- [ ] replace the single authority account with staff identity and roles
- [ ] use a shared rate-limit store for multiple server instances
- [ ] perform security, privacy, retention, rescue, and medical wording reviews
- [ ] field-test power, enclosure, terrain, weather, GPS, and network coverage
- [ ] keep a manual emergency communication method available
