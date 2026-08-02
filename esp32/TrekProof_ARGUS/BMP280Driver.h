#ifndef BMP280_DRIVER_H
#define BMP280_DRIVER_H

void initBMP280();
void updateBMP280();
void resetStartAltitude();   // Recalibrate base altitude

#endif