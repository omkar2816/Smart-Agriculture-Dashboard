-- ============================================================================
-- Row Level Security (RLS) Policies for Smart Agriculture Dashboard
-- Table: public.sensor_readings
-- Direct Access Mode (No Login Required)
-- ============================================================================

-- 1. Ensure Row Level Security is active
ALTER TABLE public.sensor_readings ENABLE ROW LEVEL SECURITY;

-- 2. Policy: Allow dashboard users (anonymous & authenticated) to SELECT sensor readings
DROP POLICY IF EXISTS "Allow authenticated users to read sensor readings" ON public.sensor_readings;
DROP POLICY IF EXISTS "Allow anonymous read access" ON public.sensor_readings;
DROP POLICY IF EXISTS "Allow dashboard read access" ON public.sensor_readings;

CREATE POLICY "Allow dashboard read access"
ON public.sensor_readings
FOR SELECT
TO anon, authenticated
USING (true);

-- 3. Policy: Allow ESP32 / IoT Devices to INSERT readings
-- If your ESP32 uses the publishable/anon key with an Authorization header:
DROP POLICY IF EXISTS "Allow IoT device inserts" ON public.sensor_readings;

CREATE POLICY "Allow IoT device inserts"
ON public.sensor_readings
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Note: The dashboard itself NEVER inserts or updates sensor readings;
-- telemetry is strictly appended by the ESP32 hardware firmware.
