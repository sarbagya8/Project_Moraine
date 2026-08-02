#ifndef BLE_DRIVER_H
#define BLE_DRIVER_H

void initBLE();
void updateBLE();
void queuePhysicalSOS(unsigned long pressedAt);
const char* argusDeviceId();

#endif
