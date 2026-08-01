#include <ArduinoJson.h>
#include <MAX30105.h>
#include <NimBLEDevice.h>
#include <Wire.h>
#include <esp_system.h>
#include "spo2_algorithm.h"
#include "argus_ble_config.h"

const char* DEVICE_ID = "ARGUS-ESP32-DEMO-01";
const char* TREKKER_ID = "TRK-DEMO-001";
const char* FIRMWARE_VERSION = "2.0.0";
const int I2C_SDA_PIN = 21;
const int I2C_SCL_PIN = 22;
const int SOS_BUTTON_PIN = 27;
const unsigned long SOS_LONG_PRESS_MS = 2000;
const unsigned long NOTIFY_INTERVAL_MS = 5000;
const uint32_t NO_FINGER_IR = 50000;
const uint32_t WEAK_SIGNAL_IR = 75000;
const int BUFFER_LENGTH = 100;

MAX30105 particleSensor;
NimBLECharacteristic* liveSensorCharacteristic = nullptr;
NimBLECharacteristic* sosEventCharacteristic = nullptr;
uint32_t irBuffer[BUFFER_LENGTH];
uint32_t redBuffer[BUFFER_LENGTH];
int bufferCount = 0;
bool sensorReady = false;
bool clientConnected = false;
bool buttonWasDown = false;
bool sosSentForPress = false;
unsigned long buttonPressedAt = 0;
unsigned long lastNotifyAt = 0;
unsigned long lastSampleAt = 0;
String pendingSosPayload;
int32_t averagedHeartRate = 0;
int32_t averagedSpo2 = 0;
int validAverageCount = 0;

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*, NimBLEConnInfo&) override { clientConnected = true; }
  void onDisconnect(NimBLEServer*, NimBLEConnInfo&, int) override {
    clientConnected = false;
    NimBLEDevice::startAdvertising();
  }
};

String jsonPayload(JsonDocument& document) {
  String payload;
  serializeJson(document, payload);
  return payload;
}

void setUnavailable(JsonDocument& document, const char* state) {
  document["heartRate"] = nullptr;
  document["spo2"] = nullptr;
  document["temperature"] = nullptr;
  document["sensorState"] = state;
}

void notifySensor(const char* state, int32_t heartRate = 0, int32_t spo2 = 0) {
  if (!liveSensorCharacteristic) return;
  StaticJsonDocument<256> document;
  document["deviceId"] = DEVICE_ID;
  document["trekkerId"] = TREKKER_ID;
  document["capturedAt"] = millis();
  if (strcmp(state, "valid") == 0) {
    document["heartRate"] = heartRate;
    document["spo2"] = spo2;
    document["temperature"] = nullptr;
    document["sensorState"] = "valid";
  } else setUnavailable(document, state);
  String payload = jsonPayload(document);
  liveSensorCharacteristic->setValue(payload.c_str());
  if (clientConnected) liveSensorCharacteristic->notify();
}

void processSamples() {
  if (!sensorReady) { notifySensor("sensor_not_found"); return; }
  if (bufferCount < BUFFER_LENGTH) { notifySensor("initializing"); return; }
  uint64_t irTotal = 0;
  for (int i = 0; i < BUFFER_LENGTH; i++) irTotal += irBuffer[i];
  uint32_t meanIr = irTotal / BUFFER_LENGTH;
  if (meanIr < NO_FINGER_IR) { validAverageCount = 0; notifySensor("no_finger"); return; }
  if (meanIr < WEAK_SIGNAL_IR) { validAverageCount = 0; notifySensor("weak_signal"); return; }
  int32_t spo2 = 0;
  int8_t validSpo2 = 0;
  int32_t heartRate = 0;
  int8_t validHeartRate = 0;
  maxim_heart_rate_and_oxygen_saturation(irBuffer, BUFFER_LENGTH, redBuffer, &spo2, &validSpo2, &heartRate, &validHeartRate);
  if (!validHeartRate || !validSpo2 || heartRate < 20 || heartRate > 240 || spo2 < 50 || spo2 > 100) {
    validAverageCount = 0;
    notifySensor("invalid_reading");
    return;
  }
  if (validAverageCount == 0) {
    averagedHeartRate = heartRate;
    averagedSpo2 = spo2;
  } else {
    averagedHeartRate = (averagedHeartRate * 3 + heartRate) / 4;
    averagedSpo2 = (averagedSpo2 * 3 + spo2) / 4;
  }
  if (validAverageCount < 4) validAverageCount++;
  notifySensor("valid", averagedHeartRate, averagedSpo2);
}

void collectSamples() {
  if (!sensorReady) return;
  particleSensor.check();
  while (particleSensor.available()) {
    uint32_t ir = particleSensor.getIR();
    uint32_t red = particleSensor.getRed();
    particleSensor.nextSample();
    lastSampleAt = millis();
    if (bufferCount < BUFFER_LENGTH) {
      irBuffer[bufferCount] = ir;
      redBuffer[bufferCount] = red;
      bufferCount++;
    } else {
      memmove(irBuffer, irBuffer + 1, (BUFFER_LENGTH - 1) * sizeof(uint32_t));
      memmove(redBuffer, redBuffer + 1, (BUFFER_LENGTH - 1) * sizeof(uint32_t));
      irBuffer[BUFFER_LENGTH - 1] = ir;
      redBuffer[BUFFER_LENGTH - 1] = red;
    }
  }
}

String createSosEventId() {
  char randomPart[9];
  snprintf(randomPart, sizeof(randomPart), "%08lx", (unsigned long)esp_random());
  return String(DEVICE_ID) + "-sos-" + randomPart + "-" + String(millis());
}

void publishSos() {
  StaticJsonDocument<256> document;
  document["eventId"] = createSosEventId();
  document["deviceId"] = DEVICE_ID;
  document["trekkerId"] = TREKKER_ID;
  document["pressedAt"] = millis();
  document["source"] = "physical_button";
  pendingSosPayload = jsonPayload(document);
  if (clientConnected && sosEventCharacteristic) {
    sosEventCharacteristic->setValue(pendingSosPayload.c_str());
    sosEventCharacteristic->notify();
    pendingSosPayload = "";
  }
}

void setupBle() {
  NimBLEDevice::init("ARGUS Wristband");
  NimBLEDevice::setMTU(247);
  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  NimBLEService* service = server->createService(ARGUS_SERVICE_UUID);
  NimBLECharacteristic* info = service->createCharacteristic(ARGUS_DEVICE_INFO_UUID, NIMBLE_PROPERTY::READ);
  StaticJsonDocument<192> infoDocument;
  infoDocument["deviceId"] = DEVICE_ID;
  infoDocument["trekkerId"] = TREKKER_ID;
  infoDocument["firmwareVersion"] = FIRMWARE_VERSION;
  info->setValue(jsonPayload(infoDocument).c_str());
  liveSensorCharacteristic = service->createCharacteristic(ARGUS_LIVE_SENSOR_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  sosEventCharacteristic = service->createCharacteristic(ARGUS_SOS_EVENT_UUID, NIMBLE_PROPERTY::NOTIFY);
  service->start();
  NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
  advertising->addServiceUUID(ARGUS_SERVICE_UUID);
  advertising->enableScanResponse(true);
  advertising->start();
}

void setup() {
  Serial.begin(115200);
  pinMode(SOS_BUTTON_PIN, INPUT_PULLUP);
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  sensorReady = particleSensor.begin(Wire, I2C_SPEED_FAST);
  if (sensorReady) {
    particleSensor.setup(60, 4, 2, 100, 411, 4096);
    particleSensor.setPulseAmplitudeRed(0x1F);
    particleSensor.setPulseAmplitudeIR(0x1F);
    particleSensor.setPulseAmplitudeGreen(0);
  }
  setupBle();
  notifySensor(sensorReady ? "initializing" : "sensor_not_found");
}

void loop() {
  collectSamples();
  unsigned long now = millis();
  if (now - lastNotifyAt >= NOTIFY_INTERVAL_MS) {
    lastNotifyAt = now;
    if (sensorReady && lastSampleAt > 0 && now - lastSampleAt > 3000) notifySensor("sensor_error");
    else processSamples();
  }
  if (clientConnected && pendingSosPayload.length() > 0 && sosEventCharacteristic) {
    sosEventCharacteristic->setValue(pendingSosPayload.c_str());
    sosEventCharacteristic->notify();
    pendingSosPayload = "";
  }
  bool buttonDown = digitalRead(SOS_BUTTON_PIN) == LOW;
  if (buttonDown && !buttonWasDown) { buttonPressedAt = now; sosSentForPress = false; }
  if (buttonDown && !sosSentForPress && now - buttonPressedAt >= SOS_LONG_PRESS_MS) { sosSentForPress = true; publishSos(); }
  if (!buttonDown && buttonWasDown) sosSentForPress = false;
  buttonWasDown = buttonDown;
  delay(5);
}
