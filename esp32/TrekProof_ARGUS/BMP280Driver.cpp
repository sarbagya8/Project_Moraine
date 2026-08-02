#include "BMP280Driver.h"
#include "Config.h"
#include <Adafruit_BMP280.h>

static Adafruit_BMP280 bmp;
static float filteredAltitude  = 0.0f;
static bool  altitudeInitialized = false; // FIXED: was `filteredAltitude == 0.0f`,
                                            // a fragile float-equality sentinel —
                                            // a real bool is unambiguous.
static const float EMA_ALPHA   = 0.15f;

void initBMP280() {
    // Try both addresses explicitly (not short-circuit OR)
    bool ok = bmp.begin(0x76);
    if (!ok) ok = bmp.begin(0x77);
    g_sensorData.bmp280_ok = ok;
}

void resetStartAltitude() {
    if (!g_sensorData.bmp280_ok) return;
    float raw = bmp.readAltitude(SEA_LEVEL_PRESSURE);
    filteredAltitude = raw;
    altitudeInitialized = true;
    g_sensorData.start_altitude = raw;
    // FIXED: `altitude` and `current_altitude` were two separate fields
    // always set to the identical value everywhere in this file — pure
    // duplication that risked silently drifting apart later. Consolidated
    // to just `altitude`; current_altitude is no longer written here.
    // See Config.h — current_altitude field can be removed from SensorData
    // entirely once anything still reading it (OLEDDriver's Trek page) is
    // updated to read `altitude` instead (already done below in this pass).
    g_sensorData.altitude = raw;
}

void updateBMP280() {
    if (!g_sensorData.bmp280_ok) return;

    g_sensorData.temperature = bmp.readTemperature();
    g_sensorData.pressure    = bmp.readPressure() / 100.0f;

    float rawAlt = bmp.readAltitude(SEA_LEVEL_PRESSURE);

    // Exponential Moving Average
    if (!altitudeInitialized) {
        filteredAltitude = rawAlt;
        altitudeInitialized = true;
        g_sensorData.start_altitude = rawAlt;
    } else {
        filteredAltitude = (EMA_ALPHA * rawAlt)
                         + ((1.0f - EMA_ALPHA) * filteredAltitude);
    }

    g_sensorData.altitude = filteredAltitude;
}