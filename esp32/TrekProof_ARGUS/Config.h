#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// Confirmed ESP32-C3 Super Mini wiring from TrekProof_Fixed.zip.
#define I2C_SDA 8
#define I2C_SCL 9

// The button is wired to ground and uses the ESP32 internal pull-up.
#define BUTTON_PIN 3
#define SOS_HOLD_MS 800
#define DEBOUNCE_MS 40

#define MAX30102_INTERVAL 10
#define BMP280_INTERVAL 1000
#define MPU6050_INTERVAL 50
#define OLED_INTERVAL 1000
#define BLE_INTERVAL 2000
#define AMS_INTERVAL 1000

#define PAGE_SWITCH_INTERVAL 15000
#define PAGE_COUNT 4

#define FALL_RESET_TIMEOUT_MS 30000
#define FREE_FALL_THRESHOLD 0.4f
#define IMPACT_THRESHOLD 2.5f
#define IMPACT_WINDOW_MS 500

#define WATCHDOG_TIMEOUT_MS 8000
#define SEA_LEVEL_PRESSURE 1013.25f

#define BLE_JSON_BUF_SIZE 384
#define BLE_NOTIFICATION_CHUNK_SIZE 180

enum SystemState {
    STATE_NORMAL,
    STATE_AMS_WARNING,
    STATE_EMERGENCY
};

struct SensorData {
    // -1 means unavailable. Zero is never used as an unavailable health value.
    int hr = -1;
    int spo2 = -1;
    char sensor_state[20] = "invalid";
    unsigned long sensor_captured_at = 0;

    float altitude = 0.0f;
    float pressure = 0.0f;
    float temperature = 0.0f; // BMP280 ambient temperature, never body temperature.
    float start_altitude = 0.0f;
    float average_speed = 0.0f;
    float distance = 0.0f;
    char ams[20] = "LOW";

    bool bmp280_ok = false;
    bool max30102_ok = false;
    bool mpu6050_ok = false;
    bool ble_connected = false;
    bool ble_advertising = false;

    SystemState current_state = STATE_NORMAL;
    bool fall_detected = false;
    bool sos_countdown = false;
    bool sos_active = false;
    unsigned long last_watchdog_ping = 0;
};

extern SensorData g_sensorData;

#endif
