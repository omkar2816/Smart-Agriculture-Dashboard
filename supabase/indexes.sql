-- ============================================================================
-- Performance Indexes for Time-Series Historical Queries
-- Table: public.sensor_readings
-- ============================================================================

-- The dashboard frequently queries:
-- 1. ORDER BY recorded_at DESC LIMIT 1 (latest telemetry)
-- 2. WHERE device_id = ? AND recorded_at >= ? AND recorded_at <= ? ORDER BY recorded_at DESC

-- Composite B-Tree index for device-filtered time-range queries:
CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_recorded_at
ON public.sensor_readings (device_id, recorded_at DESC);

-- Index for global queries when no device_id filter is specified:
CREATE INDEX IF NOT EXISTS idx_sensor_readings_recorded_at_desc
ON public.sensor_readings (recorded_at DESC);
