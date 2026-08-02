#ifndef MPU6050_DRIVER_H
#define MPU6050_DRIVER_H

void initMPU6050();
void updateMPU6050();
void resetFallDetection();    // Clear fall flag + timer

#endif