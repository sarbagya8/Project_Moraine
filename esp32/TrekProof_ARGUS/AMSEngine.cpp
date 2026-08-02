#include "AMSEngine.h"
#include "Config.h"
#include <cstring>

void initAMS() {
    strcpy(g_sensorData.ams, "LOW");
}

void updateAMS() {
    // ── Watchdog liveness ping ──
    g_sensorData.last_watchdog_ping = millis();

    int riskScore = 0;

    // Altitude scoring (cumulative — higher you go, more risk)
    if (g_sensorData.altitude > 2500.0f) riskScore += 1;
    if (g_sensorData.altitude > 3500.0f) riskScore += 2;

    // SpO2 — exclusive tiers (critical outweighs moderate)
    if (g_sensorData.spo2 > 0 && g_sensorData.spo2 < 80) {
        riskScore += 4;   // Critical hypoxia
    } else if (g_sensorData.spo2 > 0 && g_sensorData.spo2 < 90) {
        riskScore += 2;   // Moderate desaturation
    }

    // Heart rate (cumulative)
    if (g_sensorData.hr > 100) riskScore += 1;
    if (g_sensorData.hr > 120) riskScore += 1;

    // ── Evaluate risk ──
    if (g_sensorData.fall_detected) {
        strcpy(g_sensorData.ams, "CRITICAL: FALL");
        g_sensorData.current_state = STATE_EMERGENCY;
    } else if (riskScore <= 1) {
        strcpy(g_sensorData.ams, "LOW");
        g_sensorData.current_state = STATE_NORMAL;
    } else if (riskScore <= 3) {
        strcpy(g_sensorData.ams, "MODERATE");
        g_sensorData.current_state = STATE_AMS_WARNING;
    } else {
        strcpy(g_sensorData.ams, "HIGH");
        g_sensorData.current_state = STATE_EMERGENCY;
    }
}

// ── Watchdog: call this in loop(); returns false → reset needed ──
bool checkWatchdog() {
    unsigned long elapsed = millis() - g_sensorData.last_watchdog_ping;
    return (elapsed < WATCHDOG_TIMEOUT_MS);
}