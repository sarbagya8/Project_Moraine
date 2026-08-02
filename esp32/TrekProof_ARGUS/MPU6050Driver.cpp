#include "MPU6050Driver.h"
#include "Config.h"
#include <Adafruit_MPU6050.h>

static Adafruit_MPU6050 mpu;
static unsigned long freeFallStart     = 0;
static unsigned long fallDetectedTime  = 0;
static unsigned long lastCalc          = 0;

void initMPU6050() {
    if (mpu.begin()) {
        g_sensorData.mpu6050_ok = true;
        mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
        mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    }
}

void resetFallDetection() {
    g_sensorData.fall_detected = false;
    fallDetectedTime = 0;
    freeFallStart    = 0;
    // Don't reset state here — AMS engine will demote naturally
}

void updateMPU6050() {
    if (!g_sensorData.mpu6050_ok) return;

    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    // ── 1. Squared magnitude (avoid sqrt) ──
    float ax = a.acceleration.x;
    float ay = a.acceleration.y;
    float az = a.acceleration.z;
    float magSq = (ax * ax) + (ay * ay) + (az * az);

    // Convert to g²: (9.81² ≈ 96.24)
    float oneG_sq = 9.81f * 9.81f;
    float accelG_sq = magSq / oneG_sq;

    // ── 2. Free-fall detection (< 0.4g → accelG_sq < 0.16) ──
    if (accelG_sq < 0.16f) {     // 0.4² = 0.16
        freeFallStart = millis();
    }

    // ── 3. Impact detection (> 2.5g → accelG_sq > 6.25) ──
    if (accelG_sq > 6.25f                           // 2.5² = 6.25
        && freeFallStart != 0
        && (millis() - freeFallStart < IMPACT_WINDOW_MS))
    {
        g_sensorData.fall_detected = true;
        g_sensorData.current_state = STATE_EMERGENCY;
        fallDetectedTime = millis();
        freeFallStart    = 0;
    }

    // ── 4. Auto-reset fall after timeout ──
    // FIXED: the old guard checked `current_state != STATE_EMERGENCY`, but
    // updateAMS() unconditionally re-sets current_state = STATE_EMERGENCY
    // every second for as long as fall_detected is true — so that guard
    // could never actually be satisfied, and this timeout never fired.
    // This now checks elapsed time directly, which is what the constant
    // name (FALL_RESET_TIMEOUT_MS) and comment always claimed it did.
    //
    // SAFETY NOTE: auto-clearing a detected fall without human confirmation
    // is a real product-safety trade-off for a device like this — if the
    // wearer is genuinely incapacitated, silently clearing the alert after
    // 30s could delay a rescue. Consider whether you actually want
    // auto-clear at all, vs. requiring the long-press every time. Left as
    // a working (fixed) auto-clear here since that was the documented
    // intent, but flagging this explicitly so it's a deliberate choice,
    // not an accident of the original bug.
    if (g_sensorData.fall_detected
        && (millis() - fallDetectedTime > FALL_RESET_TIMEOUT_MS))
    {
        resetFallDetection();
    }

    // ── 5. Trekking speed & distance ──
    unsigned long now = millis();
    float dt = (now - lastCalc) / 1000.0f;
    if (lastCalc == 0) dt = 0;
    lastCalc = now;

    // Active motion: magnitude deviates from 1g (squared: <0.72 or >1.32)
    if (accelG_sq > 1.32f || accelG_sq < 0.72f) {
        g_sensorData.average_speed = 1.25f;
        g_sensorData.distance += g_sensorData.average_speed * dt;
    } else {
        // FIXED: previously there was no else branch, so average_speed
        // latched at 1.25 forever after the first-ever motion event and
        // never reflected that the wearer had actually stopped moving.
        // Distance accumulation itself was already correct (only inside
        // the if-branch above), this only fixes the displayed/reported
        // speed value.
        g_sensorData.average_speed = 0.0f;
    }
}