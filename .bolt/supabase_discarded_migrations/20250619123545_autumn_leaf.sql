/*
  # SketchyAF Game System Database Schema

  1. New Tables
    - `games` - Game session management
    - `game_participants` - Player participation tracking
    - `submissions` - Drawing submissions storage
    - `votes` - Voting system implementation
    - `booster_packs` - Premium content management
    - `user_booster_packs` - User ownership of booster packs
    - `asset_usage_tracking` - Analytics for asset usage

  2. Security
    - Enable RLS on all tables
    - Set up policies for secure access control
    - Implement validation in database functions

  3. Changes
    - Added comprehensive game management system
    - Created booster pack management system
    - Implemented voting and submission tracking
*/

-- =====================================================
-- ENUMS AND TYPES
-- =====================================================

-- Game status enum
DO $$ BEGIN
  CREATE TYPE game_status AS ENUM (
    'waiting',      -- Waiting for players to join
    'briefing',     -- Pre-round briefing phase
    'drawing',      -- Active drawing phase
    'voting',       -- Voting on submissions
    'results',      -- Showing results
    'completed',    -- Game finished
    'cancelled'     -- Game cancelled/expired
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Purchase method enum
DO $$ BEGIN
  CREATE TYPE purchase_method AS ENUM (
    'free',         -- Free pack
    'purchase',     -- One-time purchase
    'subscription', -- Premium subscription
    'admin'         -- Admin granted
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- DEPENDENCY CHECKS
-- =====================================================

-- Ensure users table exists (should be created by auth schema first)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users' AND table_schema = 'public') THEN
    RAISE EXCEPTION 'Users table must exist before running this migration. Run auth schema migration first.';
  END IF;
END $$;

-- =====================================================
-- CORE GAME TABLES
-- =====================================================

-- Booster packs for premium content (moved before game_participants to fix dependency)
CREATE TABLE IF NOT EXISTS booster_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  is_premium BOOLEAN DEFAULT FALSE,
  asset_directory_name TEXT NOT NULL UNIQUE, -- References folder in ./src/assets/image-libraries/
  cover_image_url TEXT,
  price_cents INTEGER DEFAULT 0 CHECK (price_cents >= 0),
  category TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Metadata
  asset_count INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0
);

-- Games table for game sessions
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status game_status NOT NULL DEFAULT 'waiting',
  prompt TEXT NOT NULL,
  max_players INTEGER NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 2 AND 8),
  current_players INTEGER NOT NULL DEFAULT 0 CHECK (current_players >= 0),
  round_duration INTEGER NOT NULL DEFAULT 60 CHECK (round_duration BETWEEN 30 AND 300),
  voting_duration INTEGER NOT NULL DEFAULT 30 CHECK (voting_duration BETWEEN 15 AND 120),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  drawing_started_at TIMESTAMP WITH TIME ZONE,
  voting_started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '30 minutes'),
  winner_id UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),

  -- Constraints
  CONSTRAINT valid_game_timing CHECK (
    (started_at IS NULL OR started_at >= created_at) AND
    (drawing_started_at IS NULL OR drawing_started_at >= started_at) AND
    (voting_started_at IS NULL OR voting_started_at >= drawing_started_at) AND
    (completed_at IS NULL OR completed_at >= voting_started_at)
  ),
  CONSTRAINT valid_player_count CHECK (current_players <= max_players)
);

-- Game participants junction table
CREATE TABLE IF NOT EXISTS game_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  left_at TIMESTAMP WITH TIME ZONE,
  is_ready BOOLEAN DEFAULT FALSE,
  selected_booster_pack UUID REFERENCES booster_packs(id),
  placement INTEGER, -- Final placement in game (1st, 2nd, etc.)

  -- Constraints
  UNIQUE(game_id, user_id),
  CONSTRAINT valid_placement CHECK (placement IS NULL OR placement > 0)
);

-- Drawing submissions
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  drawing_data JSONB NOT NULL, -- Excalidraw elements and app state
  drawing_url TEXT, -- Exported image URL for display
  drawing_thumbnail_url TEXT, -- Smaller thumbnail for lists
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  vote_count INTEGER DEFAULT 0 CHECK (vote_count >= 0),
  is_winner BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  canvas_width INTEGER,
  canvas_height INTEGER,
  element_count INTEGER,
  drawing_time_seconds INTEGER,
  
  -- Constraints
  UNIQUE(game_id, user_id),
  CONSTRAINT valid_drawing_data CHECK (jsonb_typeof(drawing_data) = 'object')
);

-- Voting system
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  voted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Constraints
  UNIQUE(game_id, voter_id) -- One vote per player per game
  -- Note: Self-voting prevention is handled by RLS policies and application logic
);

-- =====================================================
-- BOOSTER PACK SYSTEM (CONTINUED)
-- =====================================================

-- User booster pack ownership
CREATE TABLE IF NOT EXISTS user_booster_packs (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booster_pack_id UUID NOT NULL REFERENCES booster_packs(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  purchase_method purchase_method DEFAULT 'free',
  purchase_price_cents INTEGER DEFAULT 0,
  
  PRIMARY KEY (user_id, booster_pack_id)
);

-- Asset usage tracking for analytics
CREATE TABLE IF NOT EXISTS asset_usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  booster_pack_id UUID NOT NULL REFERENCES booster_packs(id) ON DELETE CASCADE,
  asset_filename TEXT NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Analytics metadata
  session_id TEXT, -- For grouping usage in same session
  canvas_position JSONB -- Where asset was placed on canvas
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Games table indexes
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at);
CREATE INDEX IF NOT EXISTS idx_games_expires_at ON games(expires_at);
CREATE INDEX IF NOT EXISTS idx_games_status_created ON games(status, created_at);
CREATE INDEX IF NOT EXISTS idx_games_waiting_players ON games(status, current_players, max_players) 
  WHERE status = 'waiting';

-- Game participants indexes
CREATE INDEX IF NOT EXISTS idx_game_participants_game_id ON game_participants(game_id);
CREATE INDEX IF NOT EXISTS idx_game_participants_user_id ON game_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_game_participants_active ON game_participants(game_id, user_id) 
  WHERE left_at IS NULL;

-- Submissions indexes
CREATE INDEX IF NOT EXISTS idx_submissions_game_id ON submissions(game_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_vote_count ON submissions(vote_count DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_game_votes ON submissions(game_id, vote_count DESC);

-- Votes indexes
CREATE INDEX IF NOT EXISTS idx_votes_game_id ON votes(game_id);
CREATE INDEX IF NOT EXISTS idx_votes_submission_id ON votes(submission_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter_id ON votes(voter_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_unique_game_voter ON votes(game_id, voter_id);

-- Booster packs indexes
CREATE INDEX IF NOT EXISTS idx_booster_packs_active ON booster_packs(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_booster_packs_category ON booster_packs(category, is_active);
CREATE INDEX IF NOT EXISTS idx_booster_packs_premium ON booster_packs(is_premium, is_active);

-- User booster packs indexes
CREATE INDEX IF NOT EXISTS idx_user_booster_packs_user ON user_booster_packs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_booster_packs_pack ON user_booster_packs(booster_pack_id);

-- Asset usage tracking indexes
CREATE INDEX IF NOT EXISTS idx_asset_usage_user_id ON asset_usage_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_asset_usage_game_id ON asset_usage_tracking(game_id);
CREATE INDEX IF NOT EXISTS idx_asset_usage_pack_id ON asset_usage_tracking(booster_pack_id);
CREATE INDEX IF NOT EXISTS idx_asset_usage_used_at ON asset_usage_tracking(used_at);

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE booster_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_booster_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_usage_tracking ENABLE ROW LEVEL SECURITY;

-- Games table policies
CREATE POLICY "Users can view games they participate in" ON games
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM game_participants gp
      WHERE gp.game_id = games.id
        AND gp.user_id = auth.uid()
        AND gp.left_at IS NULL
    )
  );

CREATE POLICY "Users can view public waiting games" ON games
  FOR SELECT USING (status = 'waiting' AND current_players < max_players);

CREATE POLICY "Authenticated users can create games" ON games
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "Game creators can update their games" ON games
  FOR UPDATE USING (created_by = auth.uid());

-- Game participants policies
CREATE POLICY "Users can view participants in their games" ON game_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM game_participants gp2
      WHERE gp2.game_id = game_participants.game_id
        AND gp2.user_id = auth.uid()
        AND gp2.left_at IS NULL
    )
  );

CREATE POLICY "Users can join games" ON game_participants
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own participation" ON game_participants
  FOR UPDATE USING (user_id = auth.uid());

-- Submissions policies
CREATE POLICY "Game participants can view all submissions in their games" ON submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM game_participants gp
      WHERE gp.game_id = submissions.game_id
        AND gp.user_id = auth.uid()
        AND gp.left_at IS NULL
    )
  );

CREATE POLICY "Users can create their own submissions" ON submissions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own submissions before voting" ON submissions
  FOR UPDATE USING (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM games g
      WHERE g.id = submissions.game_id
        AND g.status IN ('waiting', 'briefing', 'drawing')
    )
  );

-- Votes policies
CREATE POLICY "Game participants can view votes in their games" ON votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM game_participants gp
      WHERE gp.game_id = votes.game_id
        AND gp.user_id = auth.uid()
        AND gp.left_at IS NULL
    )
  );

CREATE POLICY "Users can cast votes in their games" ON votes
  FOR INSERT TO authenticated WITH CHECK (
    voter_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM game_participants gp
      WHERE gp.game_id = votes.game_id
        AND gp.user_id = auth.uid()
        AND gp.left_at IS NULL
    )
  );

-- Booster packs policies (public read access)
CREATE POLICY "Anyone can view active booster packs" ON booster_packs
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage booster packs" ON booster_packs
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM users WHERE email LIKE '%@sketchyaf.app'
    )
  );

-- User booster packs policies
CREATE POLICY "Users can view their own booster packs" ON user_booster_packs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can unlock booster packs" ON user_booster_packs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Asset usage tracking policies
CREATE POLICY "Users can view their own asset usage" ON asset_usage_tracking
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can track their own asset usage" ON asset_usage_tracking
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- =====================================================
-- DATABASE FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp (needed for booster_packs trigger)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update participant count when players join/leave
CREATE OR REPLACE FUNCTION update_game_participant_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Player joined
    UPDATE games 
    SET current_players = current_players + 1
    WHERE id = NEW.game_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Player left (left_at was set)
    IF OLD.left_at IS NULL AND NEW.left_at IS NOT NULL THEN
      UPDATE games 
      SET current_players = current_players - 1
      WHERE id = NEW.game_id;
    -- Player rejoined (left_at was cleared)
    ELSIF OLD.left_at IS NOT NULL AND NEW.left_at IS NULL THEN
      UPDATE games 
      SET current_players = current_players + 1
      WHERE id = NEW.game_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Player removed completely
    IF OLD.left_at IS NULL THEN
      UPDATE games 
      SET current_players = current_players - 1
      WHERE id = OLD.game_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to prevent self-voting and update submission vote count
CREATE OR REPLACE FUNCTION handle_vote_insert()
RETURNS TRIGGER AS $$
DECLARE
  submission_user_id UUID;
BEGIN
  -- Check if voter is trying to vote for their own submission
  SELECT user_id INTO submission_user_id
  FROM submissions
  WHERE id = NEW.submission_id;

  IF submission_user_id = NEW.voter_id THEN
    RAISE EXCEPTION 'Users cannot vote for their own submissions';
  END IF;

  -- Update vote count
  UPDATE submissions
  SET vote_count = vote_count + 1
  WHERE id = NEW.submission_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update submission vote count on delete
CREATE OR REPLACE FUNCTION handle_vote_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE submissions
  SET vote_count = vote_count - 1
  WHERE id = OLD.submission_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate game results and determine winner
CREATE OR REPLACE FUNCTION calculate_game_results(game_uuid UUID)
RETURNS TABLE(
  submission_id UUID,
  user_id UUID,
  username TEXT,
  vote_count INTEGER,
  placement INTEGER
) AS $$
BEGIN
  -- Update submission vote counts first
  UPDATE submissions s
  SET vote_count = (
    SELECT COUNT(*) FROM votes v WHERE v.submission_id = s.id
  )
  WHERE s.game_id = game_uuid;

  -- Calculate placements and update submissions
  WITH ranked_submissions AS (
    SELECT 
      s.id,
      s.user_id,
      s.vote_count,
      RANK() OVER (ORDER BY s.vote_count DESC, s.submitted_at ASC) as placement
    FROM submissions s
    WHERE s.game_id = game_uuid
  )
  UPDATE submissions s
  SET is_winner = (rs.placement = 1)
  FROM ranked_submissions rs
  WHERE s.id = rs.id;

  -- Update game participants with placements
  WITH ranked_submissions AS (
    SELECT 
      s.user_id,
      RANK() OVER (ORDER BY s.vote_count DESC, s.submitted_at ASC) as placement
    FROM submissions s
    WHERE s.game_id = game_uuid
  )
  UPDATE game_participants gp
  SET placement = rs.placement
  FROM ranked_submissions rs
  WHERE gp.game_id = game_uuid AND gp.user_id = rs.user_id;

  -- Update game winner
  UPDATE games g
  SET winner_id = (
    SELECT s.user_id 
    FROM submissions s 
    WHERE s.game_id = game_uuid 
    ORDER BY s.vote_count DESC, s.submitted_at ASC 
    LIMIT 1
  )
  WHERE g.id = game_uuid;

  -- Return results
  RETURN QUERY
  SELECT 
    s.id as submission_id,
    s.user_id,
    u.username,
    s.vote_count,
    gp.placement
  FROM submissions s
  JOIN users u ON s.user_id = u.id
  JOIN game_participants gp ON s.game_id = gp.game_id AND s.user_id = gp.user_id
  WHERE s.game_id = game_uuid
  ORDER BY gp.placement ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to transition game status with validation
CREATE OR REPLACE FUNCTION transition_game_status(
  game_uuid UUID, 
  new_status game_status
)
RETURNS BOOLEAN AS $$
DECLARE
  current_status game_status;
  participant_count INTEGER;
  submission_count INTEGER;
  valid_transition BOOLEAN := FALSE;
BEGIN
  -- Get current game state
  SELECT status, current_players INTO current_status, participant_count
  FROM games WHERE id = game_uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found: %', game_uuid;
  END IF;

  -- Validate state transitions
  CASE current_status
    WHEN 'waiting' THEN
      valid_transition := new_status IN ('briefing', 'cancelled');
    WHEN 'briefing' THEN
      valid_transition := new_status IN ('drawing', 'cancelled');
    WHEN 'drawing' THEN
      valid_transition := new_status IN ('voting', 'cancelled');
    WHEN 'voting' THEN
      valid_transition := new_status IN ('results', 'cancelled');
    WHEN 'results' THEN
      valid_transition := new_status IN ('completed');
    ELSE
      valid_transition := FALSE;
  END CASE;

  IF NOT valid_transition THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', current_status, new_status;
  END IF;

  -- Additional validation for specific transitions
  IF new_status = 'briefing' AND participant_count < 2 THEN
    RAISE EXCEPTION 'Cannot start game with less than 2 players';
  END IF;

  IF new_status = 'voting' THEN
    SELECT COUNT(*) INTO submission_count
    FROM submissions WHERE game_id = game_uuid;
    
    IF submission_count = 0 THEN
      RAISE EXCEPTION 'Cannot start voting with no submissions';
    END IF;
  END IF;

  -- Update game status and timestamps
  UPDATE games 
  SET 
    status = new_status,
    started_at = CASE 
      WHEN new_status = 'briefing' AND started_at IS NULL THEN now()
      ELSE started_at 
    END,
    drawing_started_at = CASE 
      WHEN new_status = 'drawing' AND drawing_started_at IS NULL THEN now()
      ELSE drawing_started_at 
    END,
    voting_started_at = CASE 
      WHEN new_status = 'voting' AND voting_started_at IS NULL THEN now()
      ELSE voting_started_at 
    END,
    completed_at = CASE 
      WHEN new_status IN ('completed', 'cancelled') AND completed_at IS NULL THEN now()
      ELSE completed_at 
    END
  WHERE id = game_uuid;

  -- Calculate results if transitioning to results
  IF new_status = 'results' THEN
    PERFORM calculate_game_results(game_uuid);
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup expired games
CREATE OR REPLACE FUNCTION cleanup_expired_games()
RETURNS INTEGER AS $$
DECLARE
  cleanup_count INTEGER;
BEGIN
  -- Cancel games that have expired
  UPDATE games 
  SET status = 'cancelled', completed_at = now()
  WHERE status IN ('waiting', 'briefing') 
    AND expires_at < now();
  
  GET DIAGNOSTICS cleanup_count = ROW_COUNT;
  
  -- Optionally delete very old completed games (older than 30 days)
  DELETE FROM games 
  WHERE status IN ('completed', 'cancelled') 
    AND completed_at < now() - INTERVAL '30 days';
  
  RETURN cleanup_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get available booster packs for a user
CREATE OR REPLACE FUNCTION get_user_available_packs(user_uuid UUID)
RETURNS TABLE(
  pack_id UUID,
  title TEXT,
  description TEXT,
  is_premium BOOLEAN,
  asset_directory_name TEXT,
  cover_image_url TEXT,
  price_cents INTEGER,
  category TEXT,
  is_owned BOOLEAN,
  unlocked_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bp.id as pack_id,
    bp.title,
    bp.description,
    bp.is_premium,
    bp.asset_directory_name,
    bp.cover_image_url,
    bp.price_cents,
    bp.category,
    (ubp.user_id IS NOT NULL) as is_owned,
    ubp.unlocked_at
  FROM booster_packs bp
  LEFT JOIN user_booster_packs ubp ON bp.id = ubp.booster_pack_id AND ubp.user_id = user_uuid
  WHERE bp.is_active = true
  ORDER BY bp.sort_order, bp.title;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger for updating participant count
CREATE OR REPLACE TRIGGER trigger_update_participant_count
  AFTER INSERT OR UPDATE OR DELETE ON game_participants
  FOR EACH ROW EXECUTE FUNCTION update_game_participant_count();

-- Triggers for vote handling (separate for insert and delete)
CREATE OR REPLACE TRIGGER trigger_handle_vote_insert
  BEFORE INSERT ON votes
  FOR EACH ROW EXECUTE FUNCTION handle_vote_insert();

CREATE OR REPLACE TRIGGER trigger_handle_vote_delete
  AFTER DELETE ON votes
  FOR EACH ROW EXECUTE FUNCTION handle_vote_delete();

-- Trigger for updating booster pack updated_at
CREATE OR REPLACE TRIGGER trigger_update_booster_pack_timestamp
  BEFORE UPDATE ON booster_packs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Insert default free booster packs
INSERT INTO booster_packs (title, description, is_premium, asset_directory_name, category, sort_order)
VALUES 
  ('Basic Shapes', 'Essential geometric shapes for your drawings', false, 'shapes', 'basics', 1),
  ('Meme Collection', 'Classic internet memes and reaction faces', false, 'troll', 'memes', 2)
ON CONFLICT (asset_directory_name) DO NOTHING;

-- Grant free packs to all existing users (only if users exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users LIMIT 1) THEN
    INSERT INTO user_booster_packs (user_id, booster_pack_id, purchase_method)
    SELECT
      u.id,
      bp.id,
      'free'::purchase_method
    FROM users u
    CROSS JOIN booster_packs bp
    WHERE bp.is_premium = false
    ON CONFLICT (user_id, booster_pack_id) DO NOTHING;
  END IF;
END $$;