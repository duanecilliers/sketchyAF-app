/*
  # Database Timer Monitoring Function with PubNub Broadcasting

  This migration creates a database function that can be called directly
  by Supabase cron, eliminating the need for Edge Functions and providing
  much better performance for timer monitoring.

  Features:
  - Game transition processing
  - PubNub event broadcasting for real-time client updates
  - Advisory lock management
  - Comprehensive error handling

  Benefits over Edge Function approach:
  - No boot/shutdown overhead
  - Faster execution (native PostgreSQL)
  - Simpler advisory lock handling
  - More reliable

  Date: 2025-06-29
  Purpose: Replace Edge Function timer monitoring with database function
*/

-- =====================================================
-- PUBNUB BROADCASTING FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION broadcast_pubnub_phase_change(
  p_game_id UUID,
  p_previous_phase TEXT,
  p_new_phase TEXT,
  p_execution_id TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  pubnub_url TEXT;
  game_event JSON;
  http_request_id BIGINT;
BEGIN
  -- Build PubNub publish URL (using hardcoded keys for simplicity)
  pubnub_url := format(
    'https://ps.pndsn.com/publish/pub-c-34b5fb2e-56f0-429f-b6c5-6c1adbaaa8d2/sub-c-9af13d34-62a8-4a21-be6e-2b12e5ad9f37/0/game-%s/0?uuid=server-monitor-db&timestamp=%s',
    p_game_id::text,
    extract(epoch from now())::bigint
  );

  -- Build game event payload
  game_event := json_build_object(
    'type', 'phase_changed',
    'gameId', p_game_id,
    'userId', 'server',
    'timestamp', extract(epoch from now()) * 1000,
    'version', '1.0.0',
    'data', json_build_object(
      'newPhase', p_new_phase,
      'previousPhase', p_previous_phase,
      'phaseStartedAt', now(),
      'transitionTriggeredBy', 'server_timer_db',
      'executionId', coalesce(p_execution_id, 'db-' || extract(epoch from now())::bigint::text)
    )
  );

  -- Make async HTTP POST request to PubNub
  SELECT net.http_post(
    url := pubnub_url,
    body := game_event::text,
    headers := '{"Content-Type": "application/json"}'::jsonb
  ) INTO http_request_id;

  RAISE NOTICE '[%] PubNub broadcast initiated for game %: % → % (request_id: %)',
    p_execution_id, p_game_id, p_previous_phase, p_new_phase, http_request_id;

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[%] PubNub broadcast exception for game %: %',
    p_execution_id, p_game_id, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- DATABASE TIMER MONITORING FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION monitor_game_timers_db()
RETURNS JSON AS $$
DECLARE
  start_time TIMESTAMP := clock_timestamp();
  processed_count INTEGER := 0;
  error_count INTEGER := 0;
  skipped_count INTEGER := 0;
  lock_acquired BOOLEAN := FALSE;
  expired_games RECORD;
  next_status TEXT;
  execution_id TEXT;
  result JSON;
BEGIN
  -- Generate unique execution ID for logging
  execution_id := extract(epoch from clock_timestamp())::bigint::text || '-' || substr(md5(random()::text), 1, 8);

  RAISE NOTICE '[%] Starting database timer monitoring', execution_id;

  -- Try to acquire advisory lock to prevent concurrent executions
  SELECT acquire_advisory_lock_enhanced(
    p_lock_key := 'timer_monitoring_lock',
    p_timeout_seconds := 60,
    p_acquired_by := 'database_monitor'
  ) INTO lock_acquired;

  IF NOT lock_acquired THEN
    RAISE NOTICE '[%] Timer monitoring already in progress, skipping execution', execution_id;

    result := json_build_object(
      'processed', 0,
      'errors', 0,
      'skipped', 1,
      'execution_time_ms', extract(milliseconds from clock_timestamp() - start_time)::integer,
      'timestamp', clock_timestamp(),
      'message', 'Execution skipped - already in progress',
      'execution_id', execution_id
    );

    RETURN result;
  END IF;

  RAISE NOTICE '[%] Advisory lock acquired successfully', execution_id;

  BEGIN
    -- Find and process expired games
    FOR expired_games IN
      SELECT * FROM find_expired_games(50)
    LOOP
      BEGIN
        RAISE NOTICE '[%] Processing expired game %: %', execution_id, expired_games.game_id, expired_games.current_status;

        -- Determine next phase
        next_status := CASE expired_games.current_status
          WHEN 'briefing' THEN 'drawing'
          WHEN 'drawing' THEN 'voting'
          WHEN 'voting' THEN 'completed'
          ELSE NULL
        END;

        IF next_status IS NULL THEN
          RAISE NOTICE '[%] No valid next phase for %, skipping', execution_id, expired_games.current_status;
          skipped_count := skipped_count + 1;
          CONTINUE;
        END IF;

        -- Handle drawing phase grace period
        IF expired_games.current_status = 'drawing' AND next_status = 'voting' THEN
          -- Check if all players have submitted
          DECLARE
            participant_count INTEGER;
            submission_count INTEGER;
          BEGIN
            SELECT COUNT(*) INTO participant_count
            FROM game_participants
            WHERE game_id = expired_games.game_id;

            SELECT COUNT(*) INTO submission_count
            FROM submissions
            WHERE game_id = expired_games.game_id;

            -- If not all players submitted, implement grace period logic here
            -- For now, we'll proceed with transition
            RAISE NOTICE '[%] Drawing phase: %/% submissions', execution_id, submission_count, participant_count;
          END;
        END IF;

        -- Transition the game (cast text to game_status enum)
        IF transition_game_status(expired_games.game_id, next_status::game_status) THEN
          RAISE NOTICE '[%] Successfully transitioned game % from % to %',
            execution_id, expired_games.game_id, expired_games.current_status, next_status;
          processed_count := processed_count + 1;

          -- Broadcast PubNub event directly for real-time client updates
          BEGIN
            PERFORM broadcast_pubnub_phase_change(
              expired_games.game_id,
              expired_games.current_status,
              next_status,
              execution_id
            );
          EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '[%] PubNub broadcast failed for game % (non-critical): %',
              execution_id, expired_games.game_id, SQLERRM;
            -- Don't increment error count for broadcast failures
          END;

        ELSE
          RAISE NOTICE '[%] Failed to transition game % from % to %',
            execution_id, expired_games.game_id, expired_games.current_status, next_status;
          error_count := error_count + 1;
        END IF;

      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '[%] Exception processing game %: %', execution_id, expired_games.game_id, SQLERRM;
        error_count := error_count + 1;
      END;
    END LOOP;

  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[%] Exception in main processing loop: %', execution_id, SQLERRM;
    error_count := error_count + 1;
  END;

  -- Always release the advisory lock
  PERFORM release_advisory_lock_enhanced('timer_monitoring_lock');
  RAISE NOTICE '[%] Advisory lock released', execution_id;

  -- Build result
  result := json_build_object(
    'processed', processed_count,
    'errors', error_count,
    'skipped', skipped_count,
    'execution_time_ms', extract(milliseconds from clock_timestamp() - start_time)::integer,
    'timestamp', clock_timestamp(),
    'execution_id', execution_id
  );

  RAISE NOTICE '[%] Timer monitoring completed: %', execution_id, result;

  RETURN result;

EXCEPTION WHEN OTHERS THEN
  -- Emergency cleanup in case of unexpected errors
  PERFORM release_advisory_lock_enhanced('timer_monitoring_lock');

  result := json_build_object(
    'processed', processed_count,
    'errors', error_count + 1,
    'skipped', skipped_count,
    'execution_time_ms', extract(milliseconds from clock_timestamp() - start_time)::integer,
    'timestamp', clock_timestamp(),
    'error', SQLERRM,
    'execution_id', execution_id
  );

  RAISE NOTICE '[%] Timer monitoring failed: %', execution_id, result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- HELPER FUNCTION FOR MANUAL TESTING
-- =====================================================

-- Function to test the monitor without advisory locks (for debugging)
CREATE OR REPLACE FUNCTION test_monitor_game_timers_db()
RETURNS JSON AS $$
DECLARE
  start_time TIMESTAMP := clock_timestamp();
  expired_games_count INTEGER;
  result JSON;
BEGIN
  -- Count expired games without processing them
  SELECT COUNT(*) INTO expired_games_count FROM find_expired_games(10);

  result := json_build_object(
    'expired_games_found', expired_games_count,
    'execution_time_ms', extract(milliseconds from clock_timestamp() - start_time)::integer,
    'timestamp', clock_timestamp(),
    'test_mode', true
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- VERIFICATION AND TESTING
-- =====================================================

-- Test the function exists and can be called
DO $$
DECLARE
  test_result JSON;
BEGIN
  -- Test the helper function first
  SELECT test_monitor_game_timers_db() INTO test_result;
  RAISE NOTICE 'Test function result: %', test_result;

  RAISE NOTICE 'Database timer monitoring function created successfully';
  RAISE NOTICE 'Usage: SELECT monitor_game_timers_db();';
  RAISE NOTICE 'Test: SELECT test_monitor_game_timers_db();';
END $$;