#include "OLEDDriver.h"
#include "Config.h"
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <cstdio>

#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64

static Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

static uint8_t       currentPage     = 0;
static unsigned long lastPageSwitch  = 0;
static unsigned long lastRedraw      = 0;
static bool          forceRedraw     = true;
static uint8_t       prevPage        = 255;     // Force first draw
static bool          wasEmergency    = false;
static bool          blinkState      = false;
static unsigned long lastBlinkToggle = 0;

// ── Helper: centered text ──
static void drawCentered(int y, const char* text, uint8_t size = 1) {
    int16_t x1, y1;
    uint16_t w, h;
    display.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
    int x = (SCREEN_WIDTH - w) / 2;
    display.setCursor(x, y);
    display.setTextSize(size);
    display.print(text);
}

// ── Helper: right-aligned value ──
static void drawRightAligned(int y, const char* label, const char* value) {
    display.setCursor(4, y);
    display.setTextSize(1);
    display.print(label);

    int16_t x1, y1;
    uint16_t w, h;
    display.getTextBounds(value, 0, 0, &x1, &y1, &w, &h);
    display.setCursor(SCREEN_WIDTH - w - 4, y);
    display.print(value);
}

// ── Draw a styled horizontal divider line ──
static void drawDivider(int y) {
    display.drawFastHLine(4, y, SCREEN_WIDTH - 8, SSD1306_WHITE);
}

// ── Draw header bar ──
static void drawHeader(const char* title) {
    // Top accent line
    display.drawFastHLine(0, 0, SCREEN_WIDTH, SSD1306_WHITE);
    display.drawFastHLine(0, 1, SCREEN_WIDTH, SSD1306_WHITE);
    // Title
    display.setTextSize(1);
    display.setCursor(4, 4);
    display.print(title);
    // Bottom divider
    display.drawFastHLine(0, 11, SCREEN_WIDTH, SSD1306_WHITE);
}

// ── Emergency overlay: full-screen alert ──
static void drawEmergencyOverlay() {
    unsigned long now = millis();
    if (now - lastBlinkToggle > 500) {
        lastBlinkToggle = now;
        blinkState = !blinkState;
    }

    if (blinkState) {
        // Inverted: white bg, black text
        display.fillScreen(SSD1306_WHITE);
        display.setTextColor(SSD1306_BLACK);
    } else {
        display.fillScreen(SSD1306_BLACK);
        display.setTextColor(SSD1306_WHITE);
    }

    display.setTextSize(2);
    drawCentered(10, "EMERGENCY");
    display.setTextSize(1);
    drawCentered(38, g_sensorData.ams);

    // Bottom bar
    display.drawFastHLine(0, 54, SCREEN_WIDTH,
        blinkState ? SSD1306_BLACK : SSD1306_WHITE);
    drawCentered(56, "HOLD BTN TO RESET");
}

// ── Page 0: Vitals & AMS ──
static void drawPageVitals() {
    drawHeader("  VITALS");

    // HR card
    display.fillRect(2, 14, 60, 22, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setTextSize(2);
    display.setCursor(6, 16);
    if (g_sensorData.hr < 0) display.print("--");
    else display.print(g_sensorData.hr);
    display.setTextSize(1);
    display.setCursor(6, 32);
    display.print("bpm");
    display.setTextColor(SSD1306_WHITE);

    // SpO2 card
    display.fillRect(66, 14, 60, 22, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setTextSize(2);
    display.setCursor(70, 16);
    if (g_sensorData.spo2 < 0) display.print("--");
    else display.print(g_sensorData.spo2);
    display.setTextSize(1);
    display.setCursor(80, 32);
    display.print("%");
    display.setTextColor(SSD1306_WHITE);

    // AMS risk banner
    display.fillRect(2, 40, SCREEN_WIDTH - 4, 22, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setCursor(6, 43);
    display.print("AMS: ");
    display.print(g_sensorData.ams);
    display.setTextColor(SSD1306_WHITE);
}

// ── Page 1: Environment ──
static void drawPageEnv() {
    drawHeader("  ENVIRONMENT");

    char buf[20];
    snprintf(buf, sizeof(buf), "%.1f m", g_sensorData.altitude);
    drawRightAligned(14, "Altitude", buf);

    snprintf(buf, sizeof(buf), "%.1f hPa", g_sensorData.pressure);
    drawRightAligned(24, "Pressure", buf);

    snprintf(buf, sizeof(buf), "%.1f C", g_sensorData.temperature);
    drawRightAligned(34, "Temp", buf);

    drawDivider(44);

    // Altitude gauge bar
    int barWidth = map(constrain(g_sensorData.altitude, 0, 5000), 0, 5000, 4, SCREEN_WIDTH - 8);
    display.drawRect(2, 48, SCREEN_WIDTH - 4, 14, SSD1306_WHITE);
    display.fillRect(4, 50, barWidth - 4, 10, SSD1306_WHITE);
    snprintf(buf, sizeof(buf), "%.0fm", g_sensorData.altitude);
    drawCentered(51, buf);
}

// ── Page 2: Trek Metrics ──
static void drawPageTrek() {
    drawHeader("  TREK STATS");

    char buf[20];

    snprintf(buf, sizeof(buf), "%.1f m", g_sensorData.start_altitude);
    drawRightAligned(14, "Start Alt", buf);

    snprintf(buf, sizeof(buf), "%.1f m", g_sensorData.altitude);
    drawRightAligned(24, "Curr Alt", buf);

    // Gain
    float gain = g_sensorData.altitude - g_sensorData.start_altitude;
    snprintf(buf, sizeof(buf), "%+.1f m", gain);
    drawRightAligned(34, "Gain", buf);

    drawDivider(42);

    snprintf(buf, sizeof(buf), "%.2f m/s", g_sensorData.average_speed);
    drawRightAligned(46, "Speed", buf);

    snprintf(buf, sizeof(buf), "%.1f m", g_sensorData.distance);
    drawRightAligned(56, "Dist", buf);
}

// ── Page 3: System Status ──
static void drawPageStatus() {
    drawHeader("  SYSTEM");

    auto drawStatus = [](int y, const char* label, bool ok) {
        display.setCursor(4, y);
        display.print(label);
        display.setCursor(SCREEN_WIDTH - 46, y);
        if (ok) {
            display.print("[OK]");
        } else {
            display.print("[--]");
        }
    };

    drawStatus(14, "BLE",  g_sensorData.ble_connected);
    drawStatus(24, "BMP",  g_sensorData.bmp280_ok);
    drawStatus(34, "MAX",  g_sensorData.max30102_ok);
    drawStatus(44, "MPU",  g_sensorData.mpu6050_ok);

    // Connection status icon
    drawDivider(52);
    display.setCursor(4, 55);
    if (g_sensorData.ble_connected) {
        display.print("  Connected");
    } else if (g_sensorData.ble_advertising) {
        display.print("  Advertising...");
    } else {
        display.print("  BLE starting...");
    }
}

// ── INIT ──
void initOLED() {
    if (display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextWrap(false);
        // Splash screen
        display.setTextSize(2);
        drawCentered(12, "ARGUS");
        display.setTextSize(1);
        drawCentered(38, "v2.0  |  AMS Guard");
        display.drawFastHLine(16, 50, SCREEN_WIDTH - 32, SSD1306_WHITE);
        drawCentered(54, "Initializing...");
        display.display();
    }
}

// ── PUBLIC API ──
void setOLEDPage(uint8_t page) {
    if (page < PAGE_COUNT) {
        currentPage = page;
        forceRedraw = true;
    }
}

void nextOLEDPage() {
    currentPage = (currentPage + 1) % PAGE_COUNT;
    lastPageSwitch = millis();   // Reset auto-rotate timer
    forceRedraw = true;
}

void forceOLEDRedraw() {
    forceRedraw = true;
}

bool isOLEDInEmergency() {
    return (g_sensorData.current_state == STATE_EMERGENCY);
}

// ── UPDATE ──
void updateOLED() {
    unsigned long now = millis();

    // Auto-rotate pages (only when not in emergency)
    if (g_sensorData.current_state != STATE_EMERGENCY) {
        if (now - lastPageSwitch >= PAGE_SWITCH_INTERVAL) {
            lastPageSwitch = now;
            currentPage = (currentPage + 1) % PAGE_COUNT;
            forceRedraw = true;
        }
    }

    // Skip redraw if nothing changed and no force — EXCEPT during emergency,
    // where the overlay is animated (blinks) and must redraw every cycle
    // regardless of whether the "page" itself changed. This was a real bug:
    // the old guard treated emergency as just another static page, so the
    // blink froze on its first frame the moment current_state stopped
    // changing (which is exactly when you're IN an emergency).
    bool inEmergency = (g_sensorData.current_state == STATE_EMERGENCY);
    if (!inEmergency && !forceRedraw && currentPage == prevPage && wasEmergency == inEmergency) {
        return;   // No change — skip expensive redraw
    }

    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);

    if (inEmergency) {
        // ── Emergency takes over EVERYTHING ──
        drawEmergencyOverlay();
    } else {
        switch (currentPage) {
            case 0: drawPageVitals();  break;
            case 1: drawPageEnv();     break;
            case 2: drawPageTrek();    break;
            case 3: drawPageStatus();  break;
        }
    }

    display.display();

    prevPage     = currentPage;
    wasEmergency = inEmergency;
    forceRedraw  = false;
}
