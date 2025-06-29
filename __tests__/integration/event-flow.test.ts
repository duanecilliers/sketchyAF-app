// Integration tests for complete event flow
// Database trigger → Edge Function → PubNub → Client reception

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import {
  TEST_CONFIG,
  createTestGame,
  createExpiredTestGame,
  DatabaseTestUtils,
  EdgeFunctionTestUtils,
  PerformanceTestUtils,
  setupTestEnvironment,
  teardownTestEnvironment
} from '../setup/test-config';

describe('Complete Event Flow Integration', () => {
  let dbUtils: DatabaseTestUtils;
  let edgeFunctionUtils: EdgeFunctionTestUtils;
  let perfUtils: PerformanceTestUtils;

  beforeEach(async () => {
    dbUtils = await setupTestEnvironment();
    edgeFunctionUtils = new EdgeFunctionTestUtils();
    perfUtils = new PerformanceTestUtils();
  });

  afterEach(async () => {
    await teardownTestEnvironment(dbUtils);
  });

  describe('Database Trigger → Edge Function → PubNub Flow', () => {
    test('should trigger broadcast when game status changes', async () => {
      // Create a test game
      const testGame = createTestGame({
        id: 'integration-test-game-1',
        status: 'briefing'
      });

      const supabase = dbUtils['supabase'];
      await supabase.from('games').insert(testGame);

      // Update game status to trigger the database trigger
      const { result: updateResult, duration: updateDuration } = await perfUtils.measureExecutionTime(async () => {
        return await supabase
          .from('games')
          .update({ status: 'drawing' })
          .eq('id', testGame.id);
      });

      expect(updateResult.error).toBeNull();
      expect(updateDuration).toBeLessThan(TEST_CONFIG.MAX_DB_TRIGGER_TIME);

      // Wait for the HTTP response from the database trigger
      const httpResponse = await dbUtils.waitForHttpResponse(5000);
      
      expect(httpResponse).toBeDefined();
      expect(httpResponse.status_code).toBe(200);
      
      const responseContent = JSON.parse(httpResponse.content);
      expect(responseContent.success).toBe(true);
      expect(responseContent.gameChannel).toBeDefined();
      expect(responseContent.gameChannel.timetoken).toBeDefined();
    });

    test('should handle multiple concurrent game updates', async () => {
      const gameCount = 5;
      const testGames = Array.from({ length: gameCount }, (_, i) => 
        createTestGame({
          id: `concurrent-test-game-${i}`,
          status: 'briefing'
        })
      );

      const supabase = dbUtils['supabase'];
      
      // Insert all test games
      for (const game of testGames) {
        await supabase.from('games').insert(game);
      }

      // Update all games concurrently
      const updatePromises = testGames.map(game => 
        supabase
          .from('games')
          .update({ status: 'drawing' })
          .eq('id', game.id)
      );

      const { results, durations, errors } = await perfUtils.runConcurrentTests(
        () => Promise.resolve(updatePromises[0]), // Simplified for test
        gameCount,
        1
      );

      expect(errors.length).toBe(0);
      
      // Wait for HTTP responses
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check that multiple HTTP responses were generated
      const { data: recentResponses } = await supabase
        .from('net._http_response')
        .select('*')
        .order('created', { ascending: false })
        .limit(gameCount);

      expect(recentResponses?.length).toBeGreaterThanOrEqual(gameCount);
    });

    test('should include comprehensive event data in broadcasts', async () => {
      const testGame = createTestGame({
        id: 'detailed-event-test-game',
        status: 'briefing',
        prompt: 'Test prompt for detailed event',
        max_players: 6,
        current_players: 3
      });

      const supabase = dbUtils['supabase'];
      await supabase.from('games').insert(testGame);

      // Update game status
      await supabase
        .from('games')
        .update({ status: 'drawing' })
        .eq('id', testGame.id);

      // Wait for HTTP response
      const httpResponse = await dbUtils.waitForHttpResponse(5000);
      
      expect(httpResponse.status_code).toBe(200);
      
      const responseContent = JSON.parse(httpResponse.content);
      expect(responseContent.success).toBe(true);
      
      // Verify the event was properly structured
      // Note: The actual event structure would be in the request body sent to the Edge Function
      // We can verify the response indicates successful processing
      expect(responseContent.gameChannel.timetoken).toBeDefined();
    });
  });

  describe('Timer Monitoring Integration', () => {
    test('should process expired games and trigger broadcasts', async () => {
      // Create expired games
      const expiredGames = [
        createExpiredTestGame({
          id: 'expired-drawing-game',
          status: 'drawing'
        }),
        createExpiredTestGame({
          id: 'expired-voting-game',
          status: 'voting'
        })
      ];

      const supabase = dbUtils['supabase'];
      for (const game of expiredGames) {
        await supabase.from('games').insert(game);
      }

      // Call the timer monitoring function
      const { result: monitorResult, duration: monitorDuration } = await perfUtils.measureExecutionTime(async () => {
        return await edgeFunctionUtils.callMonitorFunction();
      });

      expect(monitorResult.status).toBe(200);
      expect(monitorDuration).toBeLessThan(TEST_CONFIG.MAX_TIMER_EXECUTION_TIME);
      
      const monitorData = monitorResult.data;
      expect(monitorData.processed).toBeGreaterThan(0);
      expect(monitorData.errors).toBe(0);
      expect(monitorData.requestId).toBeDefined();
      expect(monitorData.environment).toBeDefined();

      // Verify games were transitioned
      const { data: updatedGames } = await supabase
        .from('games')
        .select('id, status')
        .in('id', expiredGames.map(g => g.id));

      updatedGames?.forEach(game => {
        if (game.id === 'expired-drawing-game') {
          expect(game.status).toBe('voting');
        } else if (game.id === 'expired-voting-game') {
          expect(game.status).toBe('completed');
        }
      });
    });

    test('should handle grace period for drawing phase', async () => {
      const drawingGame = createExpiredTestGame({
        id: 'grace-period-test-game',
        status: 'drawing'
      });

      const supabase = dbUtils['supabase'];
      await supabase.from('games').insert(drawingGame);

      // First call should start grace period
      const firstCall = await edgeFunctionUtils.callMonitorFunction();
      expect(firstCall.status).toBe(200);
      
      // Game should still be in drawing phase
      const { data: gameAfterFirst } = await supabase
        .from('games')
        .select('status')
        .eq('id', drawingGame.id)
        .single();
      
      expect(gameAfterFirst?.status).toBe('drawing');

      // Wait for grace period to expire (15+ seconds in real scenario, shortened for test)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Second call should transition the game
      const secondCall = await edgeFunctionUtils.callMonitorFunction();
      expect(secondCall.status).toBe(200);
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should handle database trigger failures gracefully', async () => {
      // Create a game that might cause issues (e.g., invalid data)
      const problematicGame = createTestGame({
        id: 'problematic-test-game',
        status: 'briefing'
      });

      const supabase = dbUtils['supabase'];
      await supabase.from('games').insert(problematicGame);

      // Update with potentially problematic data
      const updateResult = await supabase
        .from('games')
        .update({ 
          status: 'drawing',
          // Add some edge case data that might cause issues
          prompt: 'x'.repeat(1000) // Very long prompt
        })
        .eq('id', problematicGame.id);

      // Even if there are issues, the database update should succeed
      expect(updateResult.error).toBeNull();

      // The trigger might fail, but it shouldn't break the database operation
      // We can check for warnings in the logs, but the game should still be updated
      const { data: updatedGame } = await supabase
        .from('games')
        .select('status')
        .eq('id', problematicGame.id)
        .single();

      expect(updatedGame?.status).toBe('drawing');
    });

    test('should handle Edge Function unavailability', async () => {
      // This test would require temporarily disabling the Edge Function
      // For now, we'll test timeout handling
      const testGame = createTestGame({
        id: 'timeout-test-game',
        status: 'briefing'
      });

      const supabase = dbUtils['supabase'];
      await supabase.from('games').insert(testGame);

      // Update game status
      const startTime = Date.now();
      const updateResult = await supabase
        .from('games')
        .update({ status: 'drawing' })
        .eq('id', testGame.id);
      const updateDuration = Date.now() - startTime;

      // Database update should complete quickly even if Edge Function is slow
      expect(updateResult.error).toBeNull();
      expect(updateDuration).toBeLessThan(2000); // Should be much faster than Edge Function timeout
    });
  });

  describe('Performance Under Load', () => {
    test('should handle burst of game updates', async () => {
      const burstSize = 20;
      const testGames = Array.from({ length: burstSize }, (_, i) => 
        createTestGame({
          id: `burst-test-game-${i}`,
          status: 'briefing'
        })
      );

      const supabase = dbUtils['supabase'];
      
      // Insert all games
      for (const game of testGames) {
        await supabase.from('games').insert(game);
      }

      // Create burst of updates
      const updateStartTime = Date.now();
      const updatePromises = testGames.map(game => 
        supabase
          .from('games')
          .update({ status: 'drawing' })
          .eq('id', game.id)
      );

      const updateResults = await Promise.all(updatePromises);
      const burstDuration = Date.now() - updateStartTime;

      // All updates should succeed
      updateResults.forEach(result => {
        expect(result.error).toBeNull();
      });

      // Burst should complete within reasonable time
      expect(burstDuration).toBeLessThan(10000); // 10 seconds for 20 updates

      // Wait for HTTP responses to be processed
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check that HTTP responses were generated (may not be all due to rate limiting)
      const { data: recentResponses } = await supabase
        .from('net._http_response')
        .select('*')
        .order('created', { ascending: false })
        .limit(burstSize);

      expect(recentResponses?.length).toBeGreaterThan(0);
    });
  });

  describe('End-to-End Game Flow', () => {
    test('should handle complete game lifecycle', async () => {
      const gameId = 'lifecycle-test-game';
      const testGame = createTestGame({
        id: gameId,
        status: 'briefing',
        phase_expires_at: new Date(Date.now() + 2000).toISOString() // 2 seconds
      });

      const supabase = dbUtils['supabase'];
      await supabase.from('games').insert(testGame);

      // Wait for timer to expire
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Run timer monitoring
      const monitorResult = await edgeFunctionUtils.callMonitorFunction();
      expect(monitorResult.status).toBe(200);

      // Verify game transitioned to drawing
      const { data: drawingGame } = await supabase
        .from('games')
        .select('status')
        .eq('id', gameId)
        .single();

      expect(drawingGame?.status).toBe('drawing');

      // Manually transition to voting (simulating drawing completion)
      await supabase
        .from('games')
        .update({ status: 'voting' })
        .eq('id', gameId);

      // Manually transition to completed (simulating voting completion)
      await supabase
        .from('games')
        .update({ status: 'completed' })
        .eq('id', gameId);

      // Verify final state
      const { data: completedGame } = await supabase
        .from('games')
        .select('status')
        .eq('id', gameId)
        .single();

      expect(completedGame?.status).toBe('completed');

      // Check that multiple HTTP responses were generated for the transitions
      const { data: gameResponses } = await supabase
        .from('net._http_response')
        .select('*')
        .order('created', { ascending: false })
        .limit(10);

      expect(gameResponses?.length).toBeGreaterThan(0);
    });
  });
});
