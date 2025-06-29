-- Production-ready database function for broadcasting game events
-- Optimized for reliability, performance, and monitoring

-- Create enhanced broadcast function with production configurations
CREATE OR REPLACE FUNCTION broadcast_game_event()
RETURNS TRIGGER AS $$
DECLARE
  event_data JSONB;
  event_type TEXT;
  game_uuid UUID;
  function_url TEXT;
  request_id TEXT;
  start_time TIMESTAMP;
  is_production BOOLEAN;
  service_role_key TEXT;
BEGIN
  -- Generate unique request ID for tracing
  request_id := gen_random_uuid()::TEXT;
  start_time := now();
  
  -- Determine environment and configuration
  is_production := current_setting('app.environment', true) = 'production';
  
  -- Get service role key from settings or use default for development
  service_role_key := current_setting('app.service_role_key', true);
  IF service_role_key IS NULL OR service_role_key = '' THEN
    -- Development fallback
    service_role_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
  END IF;
  
  -- Determine event type and game UUID
  event_type := TG_ARGV[0];
  game_uuid := COALESCE(NEW.id, OLD.id);
  
  -- Set function URL based on environment
  IF is_production THEN
    -- Production: Use Supabase Edge Functions URL
    function_url := current_setting('app.supabase_url', true) || '/functions/v1/broadcast-pubnub-event';
  ELSE
    -- Development: Use Kong internal URL
    function_url := 'http://kong:8000/functions/v1/broadcast-pubnub-event';
  END IF;
  
  -- Log function execution start
  RAISE LOG 'broadcast_game_event started: request_id=%, event_type=%, game_id=%, environment=%', 
    request_id, event_type, game_uuid, CASE WHEN is_production THEN 'production' ELSE 'development' END;

  -- Prepare event data based on trigger type with enhanced structure
  CASE event_type
    WHEN 'phase_changed' THEN
      event_data := jsonb_build_object(
        'type', 'phase_changed',
        'gameId', game_uuid,
        'timestamp', extract(epoch from now()) * 1000,
        'userId', 'system',
        'version', '2.0.0',
        'requestId', request_id,
        'data', jsonb_build_object(
          'newPhase', NEW.status,
          'previousPhase', OLD.status,
          'phaseStartedAt', now(),
          'transitionTriggeredBy', 'database_trigger',
          'gameData', jsonb_build_object(
            'id', NEW.id,
            'prompt', NEW.prompt,
            'maxPlayers', NEW.max_players,
            'currentPlayers', NEW.current_players,
            'phaseExpiresAt', NEW.phase_expires_at,
            'createdAt', NEW.created_at,
            'updatedAt', NEW.updated_at
          )
        )
      );
    WHEN 'player_joined' THEN
      event_data := jsonb_build_object(
        'type', 'player_joined',
        'gameId', NEW.game_id,
        'timestamp', extract(epoch from now()) * 1000,
        'userId', NEW.user_id,
        'version', '2.0.0',
        'requestId', request_id,
        'data', jsonb_build_object(
          'userId', NEW.user_id,
          'joinedAt', NEW.joined_at,
          'isReady', NEW.is_ready,
          'selectedBoosterPack', NEW.selected_booster_pack
        )
      );
    WHEN 'player_left' THEN
      event_data := jsonb_build_object(
        'type', 'player_left',
        'gameId', OLD.game_id,
        'timestamp', extract(epoch from now()) * 1000,
        'userId', OLD.user_id,
        'version', '2.0.0',
        'requestId', request_id,
        'data', jsonb_build_object(
          'userId', OLD.user_id,
          'leftAt', now()
        )
      );
    WHEN 'drawing_submitted' THEN
      event_data := jsonb_build_object(
        'type', 'drawing_submitted',
        'gameId', NEW.game_id,
        'timestamp', extract(epoch from now()) * 1000,
        'userId', NEW.user_id,
        'version', '2.0.0',
        'requestId', request_id,
        'data', jsonb_build_object(
          'submissionId', NEW.id,
          'userId', NEW.user_id,
          'submittedAt', NEW.submitted_at,
          'hasDrawing', NEW.drawing_url IS NOT NULL
        )
      );
    WHEN 'vote_cast' THEN
      event_data := jsonb_build_object(
        'type', 'vote_cast',
        'gameId', NEW.game_id,
        'timestamp', extract(epoch from now()) * 1000,
        'userId', NEW.user_id,
        'version', '2.0.0',
        'requestId', request_id,
        'data', jsonb_build_object(
          'voteId', NEW.id,
          'userId', NEW.user_id,
          'submissionId', NEW.submission_id,
          'votedAt', NEW.voted_at
        )
      );
    ELSE
      -- Default event structure for unknown event types
      event_data := jsonb_build_object(
        'type', event_type,
        'gameId', game_uuid,
        'timestamp', extract(epoch from now()) * 1000,
        'userId', 'system',
        'version', '2.0.0',
        'requestId', request_id,
        'data', jsonb_build_object(
          'triggerOperation', TG_OP,
          'tableName', TG_TABLE_NAME
        )
      );
  END CASE;

  -- Call Edge Function to broadcast via PubNub with enhanced error handling
  BEGIN
    PERFORM net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_role_key,
        'Content-Type', 'application/json',
        'X-Request-ID', request_id,
        'X-Source', 'database-trigger'
      ),
      body := event_data,
      timeout_milliseconds := 10000 -- 10 second timeout
    );
    
    -- Log successful broadcast
    RAISE LOG 'broadcast_game_event completed successfully: request_id=%, duration_ms=%', 
      request_id, extract(epoch from (now() - start_time)) * 1000;
      
  EXCEPTION
    WHEN OTHERS THEN
      -- Enhanced error logging with context
      RAISE WARNING 'broadcast_game_event failed: request_id=%, event_type=%, game_id=%, error=%, sqlstate=%, duration_ms=%', 
        request_id, event_type, game_uuid, SQLERRM, SQLSTATE, extract(epoch from (now() - start_time)) * 1000;
      
      -- Don't fail the original operation, just log the broadcast failure
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION broadcast_game_event() IS 'Production-ready function to broadcast game events via PubNub. Includes comprehensive error handling, logging, and environment-aware configuration.';
