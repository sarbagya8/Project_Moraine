#include <Wire.h>
#include "Config.h"
#include "Scheduler.h"
#include "MPU6050Driver.h"
#include "BMP280Driver.h"
#include "MAX30102Driver.h"
#include "AMSEngine.h"
#include "OLEDDriver.h"
#include "BLEDriver.h"

SensorData g_sensorData;

TaskScheduler taskMPU(MPU6050_INTERVAL, updateMPU6050);
TaskScheduler taskMAX(MAX30102_INTERVAL, updateMAX30102);
TaskScheduler taskBMP(BMP280_INTERVAL, updateBMP280);
TaskScheduler taskAMS(AMS_INTERVAL, updateAMS);
TaskScheduler taskOLED(OLED_INTERVAL, updateOLED);
TaskScheduler taskBLE(BLE_INTERVAL, updateBLE);

namespace {
bool lastRawPressed = false;
bool stablePressed = false;
bool sosSentForPress = false;
unsigned long rawChangedAt = 0;
unsigned long pressedAt = 0;

void handleButton() {
    unsigned long now = millis();
    bool rawPressed = digitalRead(BUTTON_PIN) == LOW;
    if (rawPressed != lastRawPressed) {
        lastRawPressed = rawPressed;
        rawChangedAt = now;
    }
    if (now - rawChangedAt < DEBOUNCE_MS || rawPressed == stablePressed) return;

    stablePressed = rawPressed;
    if (stablePressed) {
        pressedAt = now;
        sosSentForPress = false;
        g_sensorData.sos_countdown = true;
        return;
    }
    g_sensorData.sos_countdown = false;
    if (!sosSentForPress) nextOLEDPage();
}

void detectSosHold() {
    if (!stablePressed || sosSentForPress) return;
    if (millis() - pressedAt < SOS_HOLD_MS) return;
    sosSentForPress = true;
    g_sensorData.sos_countdown = false;
    queuePhysicalSOS(pressedAt);
    g_sensorData.current_state = STATE_EMERGENCY;
    forceOLEDRedraw();
}
} // namespace

void setup() {
    Serial.begin(115200);
    Wire.begin(I2C_SDA, I2C_SCL);
    pinMode(BUTTON_PIN, INPUT_PULLUP);

    initMPU6050();
    initBMP280();
    initMAX30102();
    initAMS();
    initOLED();
    initBLE();

    Serial.print(F("ARGUS ready: "));
    Serial.println(argusDeviceId());
}

void loop() {
    if (!checkWatchdog()) {
        Serial.println(F("WATCHDOG: Resetting..."));
        delay(100);
        ESP.restart();
    }

    handleButton();
    detectSosHold();
    taskMPU.update();
    taskMAX.update();
    taskBMP.update();
    taskAMS.update();
    taskOLED.update();
    taskBLE.update();
}
