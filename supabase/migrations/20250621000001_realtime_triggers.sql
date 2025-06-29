-- Migration: Add database triggers for automatic real-time event broadcasting
-- This migration adds functions and triggers to automatically broadcast PubNub events
-- when game state changes occur in the database

-- =====================================================
-- FUNCTIONS FOR REAL-TIME EVENT BROADCASTING
-- =====================================================

-- Function to broadcast game events via PubNub Edge Function
CREATE OR REPLACE FUNCTION broadcast_game_event()
RETURNS TRIGGER AS $$
DECLARE
  event_data JSONB;
  event_type TEXT;
  game_uuid UUID;
BEGIN
  -- Determine event type based on trigger operation and arguments
  event_type := TG_ARGV[0];
  game_uuid := COALESCE(NEW.id, OLD.id);
  
  -- Prepare event data based on trigger type
  CASE event_type
    WHEN 'phase_changed' THEN
      event_data := jsonb_build_object(
        'type', 'phase_changed',
        'gameId', game_uuid,
        'timestamp', extract(epoch from now()) * 1000,
        'userId', 'system',
        'version', '1.0.0',
        'data', jsonb_build_object(
          'newPhase', NEW.status,
          'previousPhase', OLD.status,
          'phaseStartedAt', now(),
          'gameData', jsonb_build_object(
            'prompt', NEW.prompt,
            'maxPlayers', NEW.max_players,
            'currentPlayers', NEW.current_players
          )
        )
      );
    WHEN 'player_joined' THEN
      event_data := jsonb_build_object(
        'type', 'player_joined',
        'gameId', NEW.game_id,
        'timestamp', extract(epoch from now()) * 1000,
        'userId', NEW.user_id,
        'version', '1.0.0',
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
        'gameId', NEW.game_id,
        'timestamp', extract(epoch from now()) * 1000,
        'userId', NEW.user_id,
        'version', '1.0.0',
        'data', jsonb_build_object(
          'userId', NEW.user_id,
          'leftAt', NEW.left_at
        )
      );
    WHEN 'drawing_submitted' THEN
      event_data := jsonb_build_object(
        'type', 'drawing_submitted',
        'gameId', NEW.game_id,
        'timestamp', extract(epoch from now()) * 1000,
        'userId', NEW.user_id,
        'version', '1.0.0',
        'data', jsonb_build_object(
          'submissionId', NEW.id,
          'userId', NEW.user_id,
          'submittedAt', NEW.submitted_at
        )
      );
    WHEN 'vote_cast' THEN
      event_data := jsonb_build_object(
        'type', 'vote_cast',
        'gameId', NEW.game_id,
        'timestamp', extract(epoch from now()) * 1000,
        'userId', NEW.user_id,
        'version', '1.0.0',
        'data', jsonb_build_object(
          'voteId', NEW.id,
          'userId', NEW.user_id,
          'submissionId', NEW.submission_id,
          'votedAt', NEW.voted_at
        )
      );
    ELSE
      -- Default event structure
      event_data := jsonb_build_object(
        'type', event_type,
        'gameId', game_uuid,
        'timestamp', extract(epoch from now()) * 1000,
        'userId', 'system',
        'version', '1.0.0',
        'data', '{}'::jsonb
      );
  END CASE;
  
  -- Call Edge Function to broadcast via PubNub
  -- Using pg_net extension for HTTP requests
  -- In development: use local Edge Functions server (port 9999)
  -- In production: use Supabase API Gateway (port 54321)
  PERFORM net.http_post(
    url := CASE
      WHEN current_setting('app.environment', true) = 'development' THEN 'http://localhost:9999/functions/v1/broadcast-pubnub-event'
      ELSE COALESCE(current_setting('app.supabase_url', true), 'http://127.0.0.1:54321') || '/functions/v1/broadcast-pubnub-event'
    END,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || COALESCE(current_setting('app.service_role_key', true), 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'),
      'Content-Type', 'application/json'
    ),
    body := event_data
  );
  
  RETURN COALESCE(NEW, OLD);
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the original operation
    RAISE WARNING 'Failed to broadcast game event: %', SQLERRM;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- TRIGGERS FOR GAME STATE CHANGES
-- =====================================================

-- Trigger for game status/phase changes
DROP TRIGGER IF EXISTS trigger_broadcast_phase_change ON games;
CREATE TRIGGER trigger_broadcast_phase_change
  AFTER UPDATE OF status ON games
  FOR EACH ROW 
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION broadcast_game_event('phase_changed');

-- Trigger for player joining games
DROP TRIGGER IF EXISTS trigger_broadcast_player_joined ON game_participants;
CREATE TRIGGER trigger_broadcast_player_joined
  AFTER INSERT ON game_participants
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_game_event('player_joined');

-- Trigger for player leaving games
DROP TRIGGER IF EXISTS trigger_broadcast_player_left ON game_participants;
CREATE TRIGGER trigger_broadcast_player_left
  AFTER UPDATE OF left_at ON game_participants
  FOR EACH ROW
  WHEN (OLD.left_at IS NULL AND NEW.left_at IS NOT NULL)
  EXECUTE FUNCTION broadcast_game_event('player_left');

-- Trigger for drawing submissions
DROP TRIGGER IF EXISTS trigger_broadcast_drawing_submitted ON submissions;
CREATE TRIGGER trigger_broadcast_drawing_submitted
  AFTER INSERT ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_game_event('drawing_submitted');

-- Trigger for vote casting
DROP TRIGGER IF EXISTS trigger_broadcast_vote_cast ON votes;
CREATE TRIGGER trigger_broadcast_vote_cast
  AFTER INSERT ON votes
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_game_event('vote_cast');

-- =====================================================
-- CONFIGURATION SETTINGS
-- =====================================================

-- Set up configuration for the broadcast function
-- These should be set via environment variables in production
DO $$
BEGIN
  -- Only set if not already configured
  IF current_setting('app.supabase_url', true) IS NULL THEN
    PERFORM set_config('app.supabase_url', 'http://localhost:54321', false);
  END IF;
  
  IF current_setting('app.service_role_key', true) IS NULL THEN
    PERFORM set_config('app.service_role_key', 'your-service-role-key-here', false);
  END IF;
END $$;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to manually trigger event broadcasting (for testing)
CREATE OR REPLACE FUNCTION manual_broadcast_event(
  p_event_type TEXT,
  p_game_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_data JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN AS $$
DECLARE
  event_data JSONB;
BEGIN
  event_data := jsonb_build_object(
    'type', p_event_type,
    'gameId', p_game_id,
    'timestamp', extract(epoch from now()) * 1000,
    'userId', COALESCE(p_user_id::text, 'system'),
    'version', '1.0.0',
    'data', p_data
  );
  
  PERFORM net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/broadcast-pubnub-event',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := event_data::text
  );
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Manual broadcast failed: %', SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION broadcast_game_event() TO authenticated;
GRANT EXECUTE ON FUNCTION manual_broadcast_event(TEXT, UUID, UUID, JSONB) TO authenticated;
