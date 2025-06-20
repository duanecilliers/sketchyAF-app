/*
  # Fix RLS Policy Infinite Recursion Issues

  1. Policy Updates
    - Fix game_participants policies to avoid circular references
    - Simplify users table policies for better performance
    - Update games table policies to work with the new participant policies

  2. Performance Improvements
    - Add missing indexes for policy performance
    - Optimize policy conditions to reduce query complexity

  3. Security
    - Maintain proper access control while fixing recursion
    - Ensure users can only access their own data appropriately
*/

-- Drop existing problematic policies on game_participants
DROP POLICY IF EXISTS "Users can view participants in their games" ON game_participants;
DROP POLICY IF EXISTS "Users can join games" ON game_participants;
DROP POLICY IF EXISTS "Users can update their own participation" ON game_participants;

-- Drop existing problematic policies on games that might cause issues
DROP POLICY IF EXISTS "Users can view games they participate in" ON games;

-- Create new, non-recursive policies for game_participants
CREATE POLICY "Users can insert their own participation"
  ON game_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own participation"
  ON game_participants
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own participation"
  ON game_participants
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Game creators can view all participants in their games"
  ON game_participants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM games 
      WHERE games.id = game_participants.game_id 
      AND games.created_by = auth.uid()
    )
  );

-- Create new policies for games table that work with the fixed participant policies
CREATE POLICY "Users can view games they created"
  ON games
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can view games they joined"
  ON games
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT game_id FROM game_participants 
      WHERE user_id = auth.uid() 
      AND left_at IS NULL
    )
  );

-- Simplify users table policies for better performance
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;

CREATE POLICY "Users can manage their own profile"
  ON users
  FOR ALL
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Add indexes to improve policy performance
CREATE INDEX IF NOT EXISTS idx_game_participants_user_game 
  ON game_participants(user_id, game_id) 
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_games_created_by 
  ON games(created_by);

-- Create a function to check if user is in game (for use in policies if needed)
CREATE OR REPLACE FUNCTION user_is_in_game(game_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM game_participants 
    WHERE game_id = game_uuid 
    AND user_id = user_uuid 
    AND left_at IS NULL
  );
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION user_is_in_game(uuid, uuid) TO authenticated;