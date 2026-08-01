# ARGUS ESP32 BLE wristband

`argus_device.ino` implements the BLE-only wristband path. It contains no Wi-Fi,
HTTP, cloud URL, GPS module, or secret.

## Detected hardware configuration

- ESP32 Arduino target; the repository does not identify the exact board variant
- I2C SDA: GPIO 21
- I2C SCL: GPIO 22
- physical SOS button: GPIO 27 to ground with `INPUT_PULLUP`
- MAX30102 optical sensor

Select the exact connected ESP32 board in Arduino IDE or Arduino CLI before
compiling. The source repository cannot safely determine that hardware detail.

## Required Arduino libraries

- ArduinoJson
- NimBLE-Arduino
- SparkFun MAX3010x Sensor Library

The SparkFun library supplies `MAX30105.h` for MAX3010x-family devices and the
MAXIM heart-rate/oxygen-saturation algorithm in `spo2_algorithm.h`.

## BLE GATT contract

- service: `7c9e0001-9b6a-4b4f-9e8a-45d2c480a001`
- device information, read: `7c9e0002-9b6a-4b4f-9e8a-45d2c480a001`
- live sensor data, read and notify: `7c9e0003-9b6a-4b4f-9e8a-45d2c480a001`
- SOS event, notify: `7c9e0004-9b6a-4b4f-9e8a-45d2c480a001`

Sensor states are `initializing`, `valid`, `no_finger`, `weak_signal`,
`invalid_reading`, `sensor_not_found`, and `sensor_error`. Heart rate and SpO2
are JSON `null` unless the state is `valid`. Temperature remains `null` because
the MAX30102 die temperature is not presented as body temperature.

The firmware retains one stable event ID for a physical press until it can notify
a connected phone. The phone adds its own GPS and receipt timestamp before the
authenticated backend stores the event.

## Browser bridge

Web Bluetooth requires Chrome or Edge on HTTPS or localhost. The signed-in
Trekker Portal verifies the BLE identity against the server-side device assignment
before subscribing to sensor or SOS notifications. The browser adds phone GPS and
prioritizes offline SOS retries.
