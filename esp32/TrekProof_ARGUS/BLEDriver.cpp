#include "BLEDriver.h"
#include "Config.h"
#include "OLEDDriver.h"
#include "argus_ble_config.h"
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <esp_system.h>
#include <cstdio>
#include <cstring>

namespace {
BLECharacteristic* argusCharacteristic = nullptr;
char deviceId[32] = {0};
char deviceName[20] = {0};
char jsonBuffer[BLE_JSON_BUF_SIZE] = {0};
bool sosPending = false;
uint8_t sosNotifyAttempts = 0;

bool setDeviceInfoValue(BLECharacteristic* characteristic, bool logPayload) {
    if (!characteristic) return false;
    char identityPayload[128];
    int length = snprintf(
        identityPayload,
        sizeof(identityPayload),
        "INFO|%s|%s",
        deviceId,
        ARGUS_FIRMWARE_VERSION
    );
    if (length <= 0 || length >= static_cast<int>(sizeof(identityPayload))) return false;
    characteristic->setValue(
        reinterpret_cast<uint8_t*>(identityPayload),
        length
    );
    if (logPayload) {
        Serial.println(F("BLE: characteristic read"));
        Serial.print(F("BLE payload: "));
        Serial.println(identityPayload);
    }
    return true;
}

void notifyJsonChunks(const char* payload, size_t length) {
    char chunk[BLE_NOTIFICATION_CHUNK_SIZE + 1];
    for (size_t offset = 0; offset < length; offset += BLE_NOTIFICATION_CHUNK_SIZE) {
        size_t chunkLength = length - offset;
        if (chunkLength > BLE_NOTIFICATION_CHUNK_SIZE) {
            chunkLength = BLE_NOTIFICATION_CHUNK_SIZE;
        }
        memcpy(chunk, payload + offset, chunkLength);
        chunk[chunkLength] = '\0';
        argusCharacteristic->setValue(
            reinterpret_cast<uint8_t*>(chunk),
            chunkLength
        );
        argusCharacteristic->notify();
        Serial.print(F("BLE: telemetry chunk bytes="));
        Serial.println(chunkLength);
        Serial.print(F("BLE payload chunk: "));
        Serial.println(chunk);
        delay(8);
    }
}

class ServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer*) override {
        g_sensorData.ble_connected = true;
        g_sensorData.ble_advertising = false;
        forceOLEDRedraw();
        Serial.println(F("BLE: browser connected"));
    }

    void onDisconnect(BLEServer*) override {
        g_sensorData.ble_connected = false;
        g_sensorData.ble_advertising = true;
        setDeviceInfoValue(argusCharacteristic, false);
        BLEDevice::startAdvertising();
        forceOLEDRedraw();
        Serial.println(F("BLE: browser disconnected"));
        Serial.println(F("BLE: advertising restarted"));
    }
};

class ArgusCharacteristicCallbacks : public BLECharacteristicCallbacks {
    void onRead(BLECharacteristic* characteristic) override {
        setDeviceInfoValue(characteristic, true);
    }
};

void buildIdentity() {
    uint64_t chipId = ESP.getEfuseMac();
    uint32_t shortId = static_cast<uint32_t>(chipId & 0xFFFFFFFFULL);
    snprintf(deviceId, sizeof(deviceId), "ARGUS-%08lX", static_cast<unsigned long>(shortId));
    snprintf(
        deviceName,
        sizeof(deviceName),
        ARGUS_DEVICE_NAME_PREFIX "%04lX",
        static_cast<unsigned long>(shortId & 0xFFFF)
    );
}

} // namespace

const char* argusDeviceId() {
    return deviceId;
}

void initBLE() {
    buildIdentity();
    BLEDevice::init(deviceName);
    BLEDevice::setMTU(247);

    BLEServer* server = BLEDevice::createServer();
    server->setCallbacks(new ServerCallbacks());
    BLEService* service = server->createService(ARGUS_SERVICE_UUID);

    // INFO remains available on READ. Notifications preserve the confirmed
    // TrekProof JSON field names and are chunked below the negotiated MTU.
    argusCharacteristic = service->createCharacteristic(
        ARGUS_CHARACTERISTIC_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
    );
    argusCharacteristic->addDescriptor(new BLE2902());
    argusCharacteristic->setCallbacks(new ArgusCharacteristicCallbacks());
    // Seed deterministic identity before advertising. The onRead callback
    // restores this value for every browser identity request even after
    // sensor or SOS notifications have used the same characteristic.
    setDeviceInfoValue(argusCharacteristic, false);

    service->start();
    BLEAdvertising* advertising = BLEDevice::getAdvertising();
    advertising->addServiceUUID(ARGUS_SERVICE_UUID);
    advertising->setScanResponse(true);
    advertising->start();
    g_sensorData.ble_connected = false;
    g_sensorData.ble_advertising = true;
    forceOLEDRedraw();
    Serial.println(F("BLE: advertising started"));
    Serial.print(F("BLE: advertising as "));
    Serial.println(deviceName);
}

void updateBLE() {
    if (!argusCharacteristic) return;

    int length = snprintf(
        jsonBuffer,
        sizeof(jsonBuffer),
        "{\"hr\":%d,\"spo2\":%d,\"altitude\":%.1f,"
        "\"pressure\":%.1f,\"temperature\":%.1f,"
        "\"start_altitude\":%.1f,\"current_altitude\":%.1f,"
        "\"average_speed\":%.2f,\"distance\":%.1f,\"ams\":\"%s\","
        "\"fall\":%s,\"fall_type\":\"%s\","
        "\"sos_countdown\":%s,\"sos\":%s}",
        g_sensorData.hr,
        g_sensorData.spo2,
        g_sensorData.altitude,
        g_sensorData.pressure,
        g_sensorData.temperature,
        g_sensorData.start_altitude,
        g_sensorData.altitude,
        g_sensorData.average_speed,
        g_sensorData.distance,
        g_sensorData.ams,
        g_sensorData.fall_detected ? "true" : "false",
        g_sensorData.fall_detected ? "impact" : "none",
        g_sensorData.sos_countdown ? "true" : "false",
        g_sensorData.sos_active ? "true" : "false"
    );
    if (length <= 0 || length >= static_cast<int>(sizeof(jsonBuffer))) {
        Serial.println(F("BLE: telemetry JSON exceeded buffer"));
        return;
    }
    if (g_sensorData.ble_connected) {
        notifyJsonChunks(jsonBuffer, length);
        if (sosPending) {
            sosNotifyAttempts++;
            if (sosNotifyAttempts >= 5) {
                sosPending = false;
                g_sensorData.sos_active = false;
            }
        }
    }
}

void queuePhysicalSOS(unsigned long pressedAt) {
    if (!argusCharacteristic) return;
    (void)pressedAt; // Browser receipt time is used as the wall-clock timestamp.
    sosPending = true;
    g_sensorData.sos_active = true;
    g_sensorData.sos_countdown = false;
    sosNotifyAttempts = 0;
    updateBLE();
    Serial.println(F("SOS: telemetry state activated"));
}
