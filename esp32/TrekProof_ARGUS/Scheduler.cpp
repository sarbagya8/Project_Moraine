#include "Scheduler.h"

TaskScheduler::TaskScheduler(unsigned long interval, void (*taskFunc)())
    : m_interval(interval), m_lastRun(0), m_taskFunc(taskFunc) {}

void TaskScheduler::update() {
    unsigned long now = millis();
    // Compute elapsed first — handles unsigned wraparound correctly
    unsigned long elapsed = now - m_lastRun;
    if (elapsed >= m_interval) {
        m_lastRun = now;
        if (m_taskFunc) {
            m_taskFunc();
        }
    }
}