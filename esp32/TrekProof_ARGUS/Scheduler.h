#ifndef SCHEDULER_H
#define SCHEDULER_H

#include <Arduino.h>

class TaskScheduler {
public:
    TaskScheduler(unsigned long interval, void (*taskFunc)());
    void update();

private:
    unsigned long m_interval;
    unsigned long m_lastRun;
    void (*m_taskFunc)();
};

#endif