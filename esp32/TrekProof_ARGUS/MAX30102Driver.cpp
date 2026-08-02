#include "MAX30102Driver.h"
#include "Config.h"
#include <MAX30105.h>
#include <Wire.h>
#include <cstring>
#include "spo2_algorithm.h"

namespace {
constexpr int SAMPLE_COUNT = 100;
constexpr int CALCULATE_EVERY_SAMPLES = 25;
constexpr uint32_t NO_FINGER_IR = 50000;
constexpr uint32_t WEAK_SIGNAL_IR = 75000;
constexpr uint32_t WEAK_AC_RANGE = 2500;
constexpr int SMOOTHING_COUNT = 4;

MAX30105 sensor;
uint32_t irRing[SAMPLE_COUNT] = {0};
uint32_t redRing[SAMPLE_COUNT] = {0};
uint32_t irWork[SAMPLE_COUNT] = {0};
uint32_t redWork[SAMPLE_COUNT] = {0};
int writeIndex = 0;
int collected = 0;
int sinceCalculation = 0;
int heartRateWindow[SMOOTHING_COUNT] = {0};
int spo2Window[SMOOTHING_COUNT] = {0};
int smoothingIndex = 0;
int smoothingSize = 0;
unsigned long lastSampleAt = 0;
unsigned long lastInitAttemptAt = 0;
bool initializedOnce = false;
bool initFailureReported = false;

void setUnavailable(const char* state) {
    g_sensorData.hr = -1;
    g_sensorData.spo2 = -1;
    strncpy(g_sensorData.sensor_state, state, sizeof(g_sensorData.sensor_state) - 1);
    g_sensorData.sensor_state[sizeof(g_sensorData.sensor_state) - 1] = '\0';
    g_sensorData.sensor_captured_at = millis();
    smoothingIndex = 0;
    smoothingSize = 0;
}

void configureSensor() {
    // 100 sps, red + IR, 411 us pulse width, 4096 nA ADC range.
    sensor.setup(60, 4, 2, 100, 411, 4096);
    sensor.setPulseAmplitudeRed(0x1F);
    sensor.setPulseAmplitudeIR(0x1F);
    sensor.setPulseAmplitudeGreen(0);
    collected = 0;
    sinceCalculation = 0;
    writeIndex = 0;
    lastSampleAt = millis();
}

bool tryInitialize() {
    lastInitAttemptAt = millis();
    if (!sensor.begin(Wire, I2C_SPEED_FAST)) {
        g_sensorData.max30102_ok = false;
        setUnavailable(initializedOnce ? "sensor_error" : "sensor_unavailable");
        if (!initFailureReported) {
            Serial.println(F("MAX30102: unavailable; retrying without blocking"));
            initFailureReported = true;
        }
        return false;
    }
    configureSensor();
    initializedOnce = true;
    initFailureReported = false;
    Serial.println(F("MAX30102: initialized"));
    g_sensorData.max30102_ok = true;
    setUnavailable("invalid");
    return true;
}

void smoothAndPublish(int heartRate, int spo2) {
    heartRateWindow[smoothingIndex] = heartRate;
    spo2Window[smoothingIndex] = spo2;
    smoothingIndex = (smoothingIndex + 1) % SMOOTHING_COUNT;
    if (smoothingSize < SMOOTHING_COUNT) smoothingSize++;

    long heartRateTotal = 0;
    long spo2Total = 0;
    for (int i = 0; i < smoothingSize; i++) {
        heartRateTotal += heartRateWindow[i];
        spo2Total += spo2Window[i];
    }
    g_sensorData.hr = heartRateTotal / smoothingSize;
    g_sensorData.spo2 = spo2Total / smoothingSize;
    strcpy(g_sensorData.sensor_state, "valid");
    g_sensorData.sensor_captured_at = millis();
}

void calculateVitals() {
    // writeIndex points to the oldest sample once the ring is full.
    uint64_t irTotal = 0;
    uint32_t minIr = UINT32_MAX;
    uint32_t maxIr = 0;
    for (int i = 0; i < SAMPLE_COUNT; i++) {
        int source = (writeIndex + i) % SAMPLE_COUNT;
        irWork[i] = irRing[source];
        redWork[i] = redRing[source];
        irTotal += irWork[i];
        if (irWork[i] < minIr) minIr = irWork[i];
        if (irWork[i] > maxIr) maxIr = irWork[i];
    }

    uint32_t meanIr = irTotal / SAMPLE_COUNT;
    if (meanIr < NO_FINGER_IR) {
        setUnavailable("no_finger");
        return;
    }
    if (meanIr < WEAK_SIGNAL_IR || maxIr - minIr < WEAK_AC_RANGE) {
        setUnavailable("weak_signal");
        return;
    }

    int32_t calculatedSpo2 = 0;
    int8_t spo2Valid = 0;
    int32_t calculatedHeartRate = 0;
    int8_t heartRateValid = 0;
    maxim_heart_rate_and_oxygen_saturation(
        irWork,
        SAMPLE_COUNT,
        redWork,
        &calculatedSpo2,
        &spo2Valid,
        &calculatedHeartRate,
        &heartRateValid
    );

    if (!heartRateValid || !spo2Valid || calculatedHeartRate < 20 ||
        calculatedHeartRate > 240 || calculatedSpo2 < 50 || calculatedSpo2 > 100) {
        setUnavailable("invalid");
        return;
    }
    smoothAndPublish(calculatedHeartRate, calculatedSpo2);
}
} // namespace

void initMAX30102() {
    tryInitialize();
}

void updateMAX30102() {
    unsigned long now = millis();
    if (!g_sensorData.max30102_ok) {
        if (now - lastInitAttemptAt >= 5000) tryInitialize();
        return;
    }

    sensor.check();
    while (sensor.available()) {
        redRing[writeIndex] = sensor.getRed();
        irRing[writeIndex] = sensor.getIR();
        sensor.nextSample();
        writeIndex = (writeIndex + 1) % SAMPLE_COUNT;
        if (collected < SAMPLE_COUNT) collected++;
        sinceCalculation++;
        lastSampleAt = now;
    }

    if (lastSampleAt != 0 && now - lastSampleAt > 3000) {
        g_sensorData.max30102_ok = false;
        setUnavailable("sensor_error");
        Serial.println(F("MAX30102: sample timeout; scheduling reinitialization"));
        return;
    }
    if (collected < SAMPLE_COUNT) {
        setUnavailable("invalid");
        return;
    }
    if (sinceCalculation >= CALCULATE_EVERY_SAMPLES) {
        sinceCalculation = 0;
        calculateVitals();
    }
}
