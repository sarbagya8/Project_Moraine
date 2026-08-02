# ARGUS ESP32-C3 wristband firmware

The production sketch is `TrekProof_ARGUS/TrekProof_ARGUS.ino`. It integrates
the uploaded TrekProof firmware (OLED, BMP280, MPU6050, MAX30102 and scheduler)
with the ARGUS BLE contract. There is no second demo sketch.

## Confirmed hardware from the uploaded firmware

- board family: ESP32-C3 Super Mini
- I2C SDA: GPIO 8
- I2C SCL: GPIO 9
- SOS/page button: GPIO 3 to ground, `INPUT_PULLUP` (active-low)
- MAX30102 optical sensor at its standard I2C address
- BMP280, MPU6050 and SSD1306 OLED remain supported by the uploaded code

The button advances the OLED page on a short press. Holding it for 800 ms emits
exactly one logical physical SOS event for that press.

## Arduino libraries

Install the ESP32 board package by Espressif Systems, then install these through
Arduino IDE Library Manager:

- SparkFun MAX3010x Pulse and Proximity Sensor Library
- Adafruit BMP280 Library
- Adafruit MPU6050
- Adafruit SSD1306
- Adafruit GFX Library

Library Manager installs Adafruit BusIO and Adafruit Unified Sensor when needed.
BLE support is supplied by the Espressif ESP32 Arduino core. The sketch does not
need ArduinoJson or NimBLE-Arduino.

## Upload

1. Open `TrekProof_ARGUS/TrekProof_ARGUS.ino` in Arduino IDE.
2. Select `ESP32C3 Dev Module` (or the installed board entry named exactly for
   your ESP32-C3 Super Mini) and the wristband's serial port.
3. If the board menu exposes it, enable `USB CDC On Boot` for the Super Mini's
   native USB serial output.
4. Click Upload. If connection stalls, hold BOOT, tap RESET, start Upload, and
   release BOOT when writing begins.
5. Open Serial Monitor at 115200 baud. Copy the printed ID from
   `ARGUS ready: ARGUS-XXXXXXXX` exactly.
6. In `/authority/devices`, register that ID and assign it to the trekker. Give
   the one-time pairing code to that trekker for `/trekker/login`.

## Signal processing

The driver reads real red and infrared FIFO samples through the SparkFun
MAX3010x library and runs `maxim_heart_rate_and_oxygen_saturation` on a rolling
100-sample window. It does not derive values from random numbers, remainders or
fixed constants. A four-result rolling average is applied only after both MAXIM
validity flags and range checks pass. Invalid states immediately publish null
vitals.

The states are `valid`, `no_finger`, `weak_signal`, `invalid`,
`sensor_unavailable`, and `sensor_error`. `sensor_unavailable` means the
MAX30102 has not initialized; `sensor_error` means a previously initialized
sensor stopped responding. BMP280 temperature is labelled `ambient`; MAX30102
die temperature is never exposed as body temperature.

## BLE behavior

The wristband advertises as `ARGUS-XXXX`, includes service UUID
`4fafc201-1fb5-459e-8fcc-c5c9c331914b` in advertising, and restarts advertising
after disconnect. Its single characteristic
`beb5483e-36e1-4688-b7f5-ea07361b26a8` is `READ | NOTIFY`. Notifications carry
the confirmed TrekProof JSON fields (`hr`, `spo2`, environment/trek metrics,
fall state, and SOS state). Because a complete packet is around 240 bytes, the
firmware sends bounded UTF-8 chunks and the browser reassembles one complete
JSON object before validation. A physical SOS remains active across several
telemetry packets; the browser assigns and retains one idempotency key until
the firmware returns `sos` to false.

On every supported characteristic read the current firmware returns an `INFO`
packet with the eFuse-derived device ID and firmware version.
The web client remains compatible with older deployed builds that expose only
sensor/SOS packets: firmware version is optional and server-side ownership is
then checked against the authenticated Trekker's assigned active device.

The device ID is derived from the ESP32 eFuse MAC. No trekker identity, API key,
Wi-Fi password, URL, GPS coordinate, or cloud secret is stored in firmware.
