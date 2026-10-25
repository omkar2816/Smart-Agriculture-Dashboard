# Tilth · Smart Agriculture Monitoring & AI Prediction Dashboard

A modern, responsive full-stack web application for monitoring and forecasting telemetry from an **ESP32-driven Smart Irrigation System**. Built with **Next.js 16 (App Router)**, **TypeScript**, **Tailwind CSS v4**, **shadcn UI**, **Supabase**, and **Open-Meteo**.

---

## 🌾 System Architecture

```
  +-------------------------------------------------------------+
  |                   ESP32 Microcontroller                     |
  |  - 2x Capacitive Soil Moisture Sensors (Plant 1 & Plant 2)  |
  |  - 1x DHT11 (Ambient Temperature & Humidity)                |
  |  - 1x Relay Module (Pump, Valve 1, Valve 2)                 |
  |  - 1x 0.96" SSD1306 OLED Display (Local Telemetry)          |
  +------------------------------+------------------------------+
                                 |
                        HTTPS POST / PostgREST
                                 v
  +-------------------------------------------------------------+
  |                   Supabase PostgreSQL DB                     |
  |               Table: public.sensor_readings                 |
  |       Row-Level Security (RLS) & Composite B-Tree Indexes   |
  +------------------------------+------------------------------+
                                 |
                 SSR & Incremental Browser Polling
                                 v
  +-------------------------------------------------------------+
  |               Tilth Next.js 16 Web Dashboard                |
  |  - Overview Dashboard (Summary Cards, 24h Trends, Actuators)|
  |  - Live Stream (2h high-res stream & ADC diagnostics)       |
  |  - Historical Analytics (Presets & custom CSV export)       |
  |  - Multi-Horizon Mathematical Forecast (6, 12, 24 h)        |
  |  - Server-Side Grounded AI Agronomy Insights                |
  |  - Real Meteorological Forecast (Open-Meteo API)            |
  |  - Irrigation History & Moisture Response Verification      |
  +-------------------------------------------------------------+
```

---

## ✨ Key Features

1. **Physical Grounding & Honest Telemetry**
   - Telemetry status ("Reporting", "Delayed", "Offline") is derived strictly from database timestamp freshness, never an invented WebSocket state.
   - Actuator commands (`pump_on`, `valve_1_on`, `valve_2_on`) are distinguished from physical water delivery. The dashboard validates whether soil moisture rose after an activation.
   - Irregular sampling intervals are handled using time-weighted trapezoidal averages and chart gap-breaking to avoid misleading interpolations.

2. **Transparent Mathematical Forecasting**
   - 6, 12, and 24-hour numerical predictions use rigorous mathematical baselines:
     - **Persistence** (naïve baseline)
     - **Damped-Trend Holt Exponential Smoothing** (handles dry-downs without wild extrapolation)
     - **Seasonal 24-hour Model** (captures diurnal temperature and humidity cycles)
   - Rolling-origin backtesting automatically selects the best-performing model and calculates empirical **80% prediction intervals**.

3. **Grounded AI Agronomy Insights**
   - Secure server-side endpoint supporting **Google Gemini** or **OpenAI**.
   - Input payloads are grounded exclusively in measured statistics and Open-Meteo forecasts.
   - Server-side numerical verification ensures the AI never hallucinates numbers not present in the telemetry.
   - Built-in in-memory rate limiting and token guards protect free-tier API quotas.

4. **Real Meteorological Integration (Open-Meteo)**
   - 48-hour hourly outlooks and 7-day daily forecasts via Open-Meteo (no API key required).
   - Real-time rain probability and precipitation volume calculations inform intelligent irrigation deferral.

5. **Warm Natural Aesthetic**
   - Curated palette featuring warm ivory (`#f8f4ea`), deep forest green (`#2c5a3c`), muted olive (`#6b7c52`), and earthy terracotta accents.
   - Refined typography using **Figtree**, **Fraunces**, and **IBM Plex Mono**.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v20.x or higher (Node 24 recommended)
- **Supabase Project**: An active Supabase database project
- Optional: **Google Gemini API Key** or **OpenAI API Key** for LLM insights

### 2. Installation
```bash
# Clone the repository
git clone <repository-url>
cd "Smart Agriculture Dashboard"

# Install dependencies
npm install
```

### 3. Environment Variables
Copy the template file to `.env.local`:
```bash
cp .env.example .env.local
```

Fill in your configuration in `.env.local`:
```ini
# Supabase Configuration (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-publishable-key-here

# Authentication
NEXT_PUBLIC_REQUIRE_AUTH=false

# Optional AI Key (Google Gemini or OpenAI)
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
```

> **Security Note:** Never put your Supabase `service_role` key in `.env.local` or client-side files. Only the publishable `anon` key should be exposed to browsers.

### 4. Supabase Database Setup
In the [Supabase SQL Editor](https://app.supabase.com/), execute the schema migrations located in the `supabase/` folder:

1. **Policies and Schema**: Run [supabase/policies.sql](file:///c:/Users/Omkar%20Korgaonkar/OneDrive/Desktop/Smart%20Agriculture%20Dashboard/supabase/policies.sql)
2. **Indexes**: Run [supabase/indexes.sql](file:///c:/Users/Omkar%20Korgaonkar/OneDrive/Desktop/Smart%20Agriculture%20Dashboard/supabase/indexes.sql) to add optimal B-Tree indexes for fast telemetry queries.

---

## 📡 ESP32 Telemetry Specification

The ESP32 firmware should send telemetry rows via HTTPS POST directly to the Supabase PostgREST endpoint:
`POST https://<project-ref>.supabase.co/rest/v1/sensor_readings`

### Expected JSON Payload Format:
```json
{
  "device_id": "esp32-greenhouse-01",
  "soil_1_raw": 2150,
  "soil_2_raw": 1980,
  "soil_1_moisture": 42.5,
  "soil_2_moisture": 58.2,
  "temperature_c": 27.4,
  "humidity_percent": 63.8,
  "pump_on": false,
  "valve_1_on": false,
  "valve_2_on": false,
  "recorded_at": "2026-10-25T12:00:00Z"
}
```

### Database Schema Table Definition:
| Column | Type | Description |
|---|---|---|
| `id` | `bigint` (Primary Key, Identity) | Auto-incrementing identifier |
| `device_id` | `text` | ESP32 device identifier |
| `soil_1_raw` | `integer` | Raw ADC reading (0–4095) for Plant 1 |
| `soil_2_raw` | `integer` | Raw ADC reading (0–4095) for Plant 2 |
| `soil_1_moisture` | `numeric(5,2)` | Calibrated percentage (0–100%) for Plant 1 |
| `soil_2_moisture` | `numeric(5,2)` | Calibrated percentage (0–100%) for Plant 2 |
| `temperature_c` | `numeric(5,2)` | Ambient temperature in Celsius |
| `humidity_percent` | `numeric(5,2)` | Relative humidity percentage (0–100%) |
| `pump_on` | `boolean` | Relay state for the master pump |
| `valve_1_on` | `boolean` | Relay state for Solenoid Valve 1 |
| `valve_2_on` | `boolean` | Relay state for Solenoid Valve 2 |
| `recorded_at` | `timestamptz` | Reading timestamp (default `now()`) |

---

## 🧪 Testing & Code Quality

Run unit tests covering normalization, stats, RFC 4180 CSV export with formula injection sanitization, forecasting baselines, and Open-Meteo client:
```bash
# Run unit tests
npm test

# Run TypeScript type check
npx tsc --noEmit

# Run ESLint
npm run lint

# Run production build
npm run build
```

---

## ☁️ Deployment Guide (Vercel)

1. Push your code to a GitHub repository.
2. Link the repository in the [Vercel Dashboard](https://vercel.com).
3. In **Project Settings → Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `GEMINI_API_KEY` (if using AI)
   - `AI_PROVIDER` (e.g. `gemini`)
4. Click **Deploy**. Vercel will automatically run `npm run build` and launch the project globally.
