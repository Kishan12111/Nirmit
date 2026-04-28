#include <WiFi.h>
#include <DHT.h>
#include <WebServer.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <SPI.h>
#include <math.h>

// -------- CONFIG --------
#define DHTPIN 4
#define DHTTYPE DHT11
#define MQ2_PIN 34

#define BUZZER_PIN 25
#define LED_PIN 26
#define BUTTON_PIN 27

// TFT
#define TFT_CS   5
#define TFT_DC   2
#define TFT_RST  21

// WiFi
const char* ssid = "Pradhan Mantri Free Wifi Yojna";
const char* password = "modimodimodimodi";
const char* serverIP = "192.168.1.100";

// -------- OBJECTS --------
DHT dht(DHTPIN, DHTTYPE);
WebServer server(80);
WiFiClient client;
Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_DC, TFT_RST);

// -------- PHONE DATA --------
float phoneLat = 12.9716;
float phoneLon = 77.5946;
float gyroX = 0;
float gyroY = 0;

// UI STATE
bool forceFullRedraw = true;
int activePage = 0;

// -------- PHONE HANDLER --------
void handlePhoneData() {
  String body = server.arg("plain");
  sscanf(body.c_str(), "lat:%f,lon:%f,gx:%f,gy:%f",
         &phoneLat, &phoneLon, &gyroX, &gyroY);
  server.send(200, "text/plain", "OK");
}

// -------- ALERT BLINK --------
void alertBlink() {
  static unsigned long lastBlink = 0;
  static bool state = false;

  if (millis() - lastBlink > 300) {
    state = !state;
    digitalWrite(BUZZER_PIN, state);
    digitalWrite(LED_PIN, state);
    lastBlink = millis();
  }
}

// -------- GAUGE --------
void drawDialGauge(int x, int y, int radius, float value, float maxVal, uint16_t color, String label) {

  tft.fillRect(x - radius, y - radius, radius * 2, radius + 15, ST77XX_BLACK);

  for (int i = 0; i <= 10; i++) {
    float a = PI - (i * PI / 10);
    int px = x + cos(a) * radius;
    int py = y - sin(a) * radius;
    tft.drawPixel(px, py, ST77XX_WHITE);
  }

  float clampedVal = constrain(value, 0, maxVal);
  float angle = PI - (clampedVal / maxVal) * PI;

  int nx = x + cos(angle) * (radius - 4);
  int ny = y - sin(angle) * (radius - 4);

  tft.drawLine(x, y, nx, ny, color);
  tft.fillCircle(x, y, 2, ST77XX_WHITE);

  tft.setCursor(x - 20, y + 5);
  tft.setTextColor(color);
  tft.setTextSize(1);
  tft.print(label + ":" + String((int)value));
}

// -------- RADAR --------
void drawRadar(int x, int y, int r) {
  tft.fillRect(x - r, y - r, r * 2, r * 2, ST77XX_BLACK);

  tft.drawCircle(x, y, r, ST77XX_CYAN);
  tft.drawCircle(x, y, r / 2, ST77XX_CYAN);

  tft.drawLine(x - r, y, x + r, y, ST77XX_CYAN);
  tft.drawLine(x, y - r, x, y + r, ST77XX_CYAN);

  if ((millis() / 500) % 2 == 0) {
    tft.fillCircle(x + 5, y - 5, 2, ST77XX_GREEN);
  }
}

// -------- NORMAL SCREEN --------
void drawNormalScreen(float temp, float hum, int gas) {

  static unsigned long lastSwitch = 0;
  if (millis() - lastSwitch > 4000) {
    activePage = (activePage + 1) % 2;
    forceFullRedraw = true;
    lastSwitch = millis();
  }

  if (forceFullRedraw) {
    tft.fillScreen(ST77XX_BLACK);
    tft.setTextColor(ST77XX_CYAN);
    tft.setCursor(20, 5);
    tft.print(activePage == 0 ? "ENV" : "NAV");
    forceFullRedraw = false;
  }

  if (activePage == 0) {
    drawDialGauge(40, 45, 22, temp, 60, ST77XX_GREEN, "T");
    drawDialGauge(40, 100, 22, hum, 100, ST77XX_BLUE, "H");

    int gasMapped = map(gas, 0, 2000, 0, 100);
    drawDialGauge(120, 45, 22, gasMapped, 100, ST77XX_YELLOW, "G");

  } else {
    drawRadar(115, 60, 30);

    tft.setCursor(5, 40);
    tft.setTextColor(ST77XX_WHITE);
    tft.print("Lat:");
    tft.println(phoneLat, 2);

    tft.setCursor(5, 55);
    tft.print("Lon:");
    tft.println(phoneLon, 2);
  }
}

// -------- ALERT SCREEN --------
void drawAlertScreen() {
  tft.fillScreen(ST77XX_BLACK);

  tft.fillTriangle(80, 20, 30, 100, 130, 100, ST77XX_RED);

  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(3);
  tft.setCursor(70, 50);
  tft.print("!");

  tft.setTextSize(1);
  tft.setCursor(35, 120);
  tft.setTextColor(ST77XX_RED);
  tft.println("SENDING SOS");

  forceFullRedraw = true;
}

// -------- SETUP --------
void setup() {
  Serial.begin(115200);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  dht.begin();

  SPI.begin(18, -1, 23, 5);
  tft.initR(INITR_GREENTAB);
  delay(100);

  tft.setRotation(1);
  tft.fillScreen(ST77XX_BLACK);
  tft.setCursor(20, 40);
  tft.setTextColor(ST77XX_GREEN);
  tft.print("Booting...");

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  tft.fillScreen(ST77XX_BLACK);
  tft.setCursor(20, 40);
  tft.print("WiFi OK");

  server.on("/phone", HTTP_POST, handlePhoneData);
  server.begin();
}

// -------- LOOP --------
void loop() {

  // Frame limiter
  static unsigned long lastFrame = 0;
  if (millis() - lastFrame < 400) return;
  lastFrame = millis();

  server.handleClient();

  // SOS BUTTON
  bool sos = (digitalRead(BUTTON_PIN) == LOW);

  if (sos) {
    drawAlertScreen();
    alertBlink();
    Serial.println("🚨 SOS TRIGGERED");
    return;
  }

  // Sensors
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  int gas = analogRead(MQ2_PIN);

  if (isnan(temp) || isnan(hum)) return;

  bool danger = (gas > 3000 || temp > 40);

  if (danger) {
    drawAlertScreen();
    alertBlink();
  } else {
    digitalWrite(BUZZER_PIN, LOW);
    digitalWrite(LED_PIN, LOW);
    drawNormalScreen(temp, hum, gas);
  }
}