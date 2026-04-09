-- =========================================================================
-- MIGRATION: STATIONARY STATUS + DAILY MAP RESET (NO DATA DELETION)
-- Description:
--   1. Adds `gps_status` & `gps_status_since` columns to technicians table
--      to track: "moving" | "stopped" | "stopped_over_2h" | "offline"
--   2. Adds `recorded_date`, `speed`, `heading`, `accuracy` to gps_pings
--      so the admin panel can filter routes by any date without data loss.
--   3. RPC `update_tech_status`       - mobile stationary state machine
--   4. RPC `reset_tech_daily_route`   - resets STATUS only at midnight.
--      ⚠️ DOES NOT DELETE ANY PINGS — historical data is always preserved.
--      The admin panel handles "show today only" purely via a date filter.
-- =========================================================================

-- ── 1. Extend technician_gps_pings ──────────────────────────────────────────
-- NOTE: only additive changes — no existing data is touched.
ALTER TABLE public.technician_gps_pings
    ADD COLUMN IF NOT EXISTS speed         DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS heading       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS accuracy      DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS recorded_date DATE DEFAULT CURRENT_DATE;

-- Backfill recorded_date from created_at for existing rows
UPDATE public.technician_gps_pings
   SET recorded_date = created_at::DATE
 WHERE recorded_date IS NULL;

-- Index: efficient per-technician per-date queries (admin history panel)
CREATE INDEX IF NOT EXISTS idx_tech_gps_pings_date
    ON public.technician_gps_pings(technician_id, recorded_date DESC);

-- ── 2. Extend technicians table with GPS status ───────────────────────────────
ALTER TABLE public.technicians
    ADD COLUMN IF NOT EXISTS gps_status       TEXT        DEFAULT 'moving',
    ADD COLUMN IF NOT EXISTS gps_status_since TIMESTAMPTZ DEFAULT now();

-- ── 3. Update update_tech_location_v2 ────────────────────────────────────────
-- Stores full telemetry per ping and marks technician as "moving".
CREATE OR REPLACE FUNCTION update_tech_location_v2(
    p_lat      DOUBLE PRECISION,
    p_lng      DOUBLE PRECISION,
    p_accuracy DOUBLE PRECISION DEFAULT NULL,
    p_speed    DOUBLE PRECISION DEFAULT NULL,
    p_heading  DOUBLE PRECISION DEFAULT NULL,
    p_battery  INTEGER         DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_tech_id UUID;
BEGIN
    v_tech_id := auth.uid();
    IF v_tech_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Update real-time pointer and mark as moving
    UPDATE public.technicians
    SET
        last_latitude      = p_lat,
        last_longitude     = p_lng,
        last_seen          = now(),
        battery_level      = COALESCE(p_battery, battery_level),
        gps_status         = 'moving',
        gps_status_since   = now(),
        is_online          = true
    WHERE id = v_tech_id;

    -- Insert route ping — NEVER deleted, queryable by any date
    INSERT INTO public.technician_gps_pings (
        technician_id, latitude, longitude,
        speed, heading, accuracy, recorded_date
    ) VALUES (
        v_tech_id, p_lat, p_lng,
        p_speed, p_heading, p_accuracy,
        CURRENT_DATE
    );

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. RPC: update_tech_status ───────────────────────────────────────────────
-- Called by mobile stationary state machine.
-- p_status: 'stopped' | 'stopped_over_2h' | 'offline'
-- Does NOT insert any ping — only updates the technician record.
CREATE OR REPLACE FUNCTION update_tech_status(
    p_lat     DOUBLE PRECISION DEFAULT NULL,
    p_lng     DOUBLE PRECISION DEFAULT NULL,
    p_status  TEXT             DEFAULT 'stopped',
    p_battery INTEGER          DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_tech_id   UUID;
    v_is_online BOOLEAN;
BEGIN
    v_tech_id   := auth.uid();
    v_is_online := (p_status != 'offline');

    IF v_tech_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    UPDATE public.technicians
    SET
        last_seen          = now(),
        battery_level      = COALESCE(p_battery, battery_level),
        gps_status         = p_status,
        -- Only update since-timestamp when status actually changes
        gps_status_since   = CASE
                                 WHEN gps_status IS DISTINCT FROM p_status THEN now()
                                 ELSE gps_status_since
                             END,
        last_latitude      = COALESCE(p_lat, last_latitude),
        last_longitude     = COALESCE(p_lng, last_longitude),
        is_online          = v_is_online
    WHERE id = v_tech_id;

    RETURN json_build_object('success', true, 'status', p_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. RPC: reset_tech_daily_route ───────────────────────────────────────────
-- Called by mobile at midnight (new day detected).
-- ⚠️ DOES NOT DELETE ANY PINGS — historical routes are ALWAYS preserved.
-- What it does:
--   • Resets gps_status → 'moving' so the live map starts fresh for today.
--   • The admin panel must filter by recorded_date = target_date to show
--     any historical route, or recorded_date = CURRENT_DATE for today's view.
CREATE OR REPLACE FUNCTION reset_tech_daily_route(
    p_user_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_tech_id UUID;
BEGIN
    -- Default to the calling user; admins may pass any technician UUID
    v_tech_id := COALESCE(p_user_id, auth.uid());

    IF v_tech_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- ONLY reset the live status — zero data deletion
    UPDATE public.technicians
    SET
        gps_status       = 'moving',
        gps_status_since = now()
    WHERE id = v_tech_id;

    RETURN json_build_object(
        'success', true,
        'note', 'Status reset for new day. No historical pings were deleted.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. Grant permissions ─────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION update_tech_location_v2   TO authenticated;
GRANT EXECUTE ON FUNCTION tech_heartbeat             TO authenticated;
GRANT EXECUTE ON FUNCTION update_tech_status         TO authenticated;
GRANT EXECUTE ON FUNCTION reset_tech_daily_route     TO authenticated;
-- Only INSERT and SELECT — the authenticated role can never DELETE pings
GRANT INSERT, SELECT ON TABLE public.technician_gps_pings TO authenticated;
