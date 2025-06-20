/*
  # Fix Games Table RLS Policy Infinite Recursion

  1. Problem Analysis
    - The current RLS policies on the games table are causing infinite recursion
    - This happens when policies reference each other or create circular dependencies
    - The "Game creators can update their games" policy has role "public" which may conflict with other policies

  2. Solution
    - Drop all existing problematic policies
    - Recreate simplified, non-recursive policies
    - Ensure proper role assignments and clear policy logic
    - Remove any circular references between policies

  3. Security
    - Maintain the same security model but with cleaner policy logic
    - Ensure authenticated users can create games
    - Ensure game creators can manage their games
    - Ensure participants can view games they're part of
    - Ensure public can view waiting games
*/

-- Drop all existing policies on games table to start fresh
DROP POLICY IF EXISTS "Authenticated users can create games" ON games;
DROP POLICY IF EXISTS "Game creators can update their games" ON games;
DROP POLICY IF EXISTS "Users can view games they created" ON games;
DROP POLICY IF EXISTS "Users can view games they joined" ON games;
DROP POLICY IF EXISTS "Users can view public waiting games" ON games;

-- Create new, simplified policies without recursion

-- Policy 1: Allow authenticated users to create games (they must set created_by to their own ID)
CREATE POLICY "authenticated_users_can_create_games"
  ON games
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Policy 2: Allow game creators to update their own games
CREATE POLICY "creators_can_update_own_games"
  ON games
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Policy 3: Allow game creators to view their own games
CREATE POLICY "creators_can_view_own_games"
  ON games
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- Policy 4: Allow participants to view games they've joined (non-recursive check)
CREATE POLICY "participants_can_view_joined_games"
  ON games
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM game_participants gp 
      WHERE gp.game_id = games.id 
        AND gp.user_id = auth.uid() 
        AND gp.left_at IS NULL
    )
  );

-- Policy 5: Allow public (including anonymous) to view waiting games that have space
CREATE POLICY "public_can_view_waiting_games"
  ON games
  FOR SELECT
  TO public
  USING (
    status = 'waiting'::game_status 
    AND current_players < max_players
  );

-- Policy 6: Allow game creators to delete their own games (if needed)
CREATE POLICY "creators_can_delete_own_games"
  ON games
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());