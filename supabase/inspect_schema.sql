-- ============================================================================
-- SQL Inspection Query for Supabase SQL Editor
-- Run this query to inspect your public.sensor_readings columns, types & constraints
-- ============================================================================

SELECT 
    column_name, 
    data_type, 
    udt_name,
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'sensor_readings'
ORDER BY ordinal_position;

-- Check active indexes:
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'sensor_readings';

-- Check Row Level Security status:
SELECT 
    relname, 
    relrowsecurity, 
    relforcerowsecurity 
FROM pg_class 
WHERE relname = 'sensor_readings';
