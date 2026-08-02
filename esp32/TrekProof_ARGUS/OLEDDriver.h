#ifndef OLED_DRIVER_H
#define OLED_DRIVER_H

#include <cstdint>

void initOLED();
void updateOLED();
void setOLEDPage(uint8_t page);      // Manual page select
void nextOLEDPage();                 // Advance to next page
void forceOLEDRedraw();              // Force full refresh
bool isOLEDInEmergency();            // True if showing emergency overlay

#endif