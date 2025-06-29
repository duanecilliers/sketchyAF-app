// Load testing for concurrent game processing
// Tests system performance under production-like load

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

describe('Concurrent Games Load Testing', () => {
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

  describe('50 Concurrent Games Processing', () => {
    test('should handle 50 concurrent game updates', async () => {
      const gameCount = TEST_CONFIG.LOAD_TEST_GAMES;
      const testGames = Array.from({ length: gameCount }, (_, i) => 
        createTestGame({
          id: `load-test-game-${i}`,
          status: 'briefing'
        })
      );

      const supabase = dbUtils['supabase'];
      
      // Insert all test games
      console.log(`Inserting ${gameCount} test games...`);
      const insertStartTime = Date.now();
      
      for (const game of testGames) {
        await supabase.from('games').insert(game);
      }
      
      const insertDuration = Date.now() - insertStartTime;
      console.log(`Game insertion completed in ${insertDuration}ms`);

      // Perform concurrent updates
      console.log(`Starting concurrent updates for ${gameCount} games...`);
      
      const { results, durations, errors } = await perfUtils.runConcurrentTests(
        async () => {
          const gameIndex = Math.floor(Math.random() * gameCount);
          const gameId = `load-test-game-${gameIndex}`;
          
          return await supabase
            .from('games')
            .update({ status: 'drawing' })
            .eq('id', gameId);
        },
        TEST_CONFIG.CONCURRENT_LIMIT,
        gameCount
      );

      // Analyze results
      const performanceReport = perfUtils.generatePerformanceReport(durations, errors);
      
      console.log('Load Test Performance Report:', {
        totalRequests: performanceReport.totalRequests,
        successCount: performanceReport.successCount,
        errorCount: performanceReport.errorCount,
        errorRate: performanceReport.errorRate,
        averageDuration: performanceReport.averageDuration,
        p95: performanceReport.p95,
        p99: performanceReport.p99
      });

      // Assertions
      expect(performanceReport.errorRate).toBeLessThan(0.05); // Less than 5% error rate
      expect(performanceReport.p95).toBeLessThan(TEST_CONFIG.MAX_DB_TRIGGER_TIME); // 95th percentile under 500ms
      expect(performanceReport.successCount).toBeGreaterThan(gameCount * 0.95); // At least 95% success

      // Wait for HTTP responses to be processed
      console.log('Waiting for HTTP responses to be processed...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check HTTP response generation
      const { data: recentResponses } = await supabase
        .from('net._http_response')
        .select('*')
        .order('created', { ascending: false })
        .limit(gameCount);

      expect(recentResponses?.length).toBeGreaterThan(0);
      console.log(`Generated ${recentResponses?.length} HTTP responses`);
    });

    test('should handle 50 expired games in timer monitoring', async () => {
      const expiredGameCount = TEST_CONFIG.LOAD_TEST_GAMES;
      const expiredGames = Array.from({ length: expiredGameCount }, (_, i) => 
        createExpiredTestGame({
          id: `expired-load-test-${i}`,
          status: i % 2 === 0 ? 'drawing' : 'voting' // Mix of drawing and voting phases
        })
      );

      const supabase = dbUtils['supabase'];
      
      // Insert expired games
      console.log(`Inserting ${expiredGameCount} expired games...`);
      for (const game of expiredGames) {
        await supabase.from('games').insert(game);
      }

      // Run timer monitoring
      console.log('Running timer monitoring on expired games...');
      const { result: monitorResult, duration: monitorDuration } = await perfUtils.measureExecutionTime(async () => {
        return await edgeFunctionUtils.callMonitorFunction();
      });

      console.log(`Timer monitoring completed in ${monitorDuration}ms`);

      // Verify results
      expect(monitorResult.status).toBe(200);
      expect(monitorDuration).toBeLessThan(TEST_CONFIG.MAX_TIMER_EXECUTION_TIME);
      
      const monitorData = monitorResult.data;
      expect(monitorData.processed).toBeGreaterThan(0);
      expect(monitorData.processed).toBeLessThanOrEqual(expiredGameCount);
      expect(monitorData.errors).toBeLessThan(monitorData.processed * 0.1); // Less than 10% errors

      console.log('Timer Monitoring Results:', {
        processed: monitorData.processed,
        errors: monitorData.errors,
        skipped: monitorData.skipped,
        executionTime: monitorData.executionTime
      });

      // Verify game state transitions
      const { data: updatedGames } = await supabase
        .from('games')
        .select('id, status')
        .like('id', 'expired-load-test-%');

      const transitionedGames = updatedGames?.filter(game => 
        game.status === 'voting' || game.status === 'completed'
      );

      expect(transitionedGames?.length).toBeGreaterThan(0);
      console.log(`${transitionedGames?.length} games successfully transitioned`);
    });
  });

  describe('High-Frequency Event Broadcasting', () => {
    test('should handle burst of 100 broadcast events', async () => {
      const burstSize = 100;
      const events = Array.from({ length: burstSize }, (_, i) => ({
        type: 'phase_changed',
        gameId: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
        userId: 'system',
        timestamp: Date.now(),
        version: '2.0.0',
        data: {
          newPhase: 'drawing',
          previousPhase: 'briefing',
          phaseStartedAt: new Date().toISOString()
        }
      }));

      console.log(`Starting burst test with ${burstSize} events...`);

      const { results, durations, errors } = await perfUtils.runConcurrentTests(
        async () => {
          const event = events[Math.floor(Math.random() * events.length)];
          return await edgeFunctionUtils.callBroadcastFunction(event);
        },
        10, // 10 concurrent requests at a time
        burstSize
      );

      const performanceReport = perfUtils.generatePerformanceReport(durations, errors);
      
      console.log('Burst Test Performance Report:', {
        totalRequests: performanceReport.totalRequests,
        successCount: performanceReport.successCount,
        errorCount: performanceReport.errorCount,
        errorRate: performanceReport.errorRate,
        averageDuration: performanceReport.averageDuration,
        p95: performanceReport.p95,
        p99: performanceReport.p99
      });

      // Assertions for burst handling
      expect(performanceReport.errorRate).toBeLessThan(0.1); // Less than 10% error rate for burst
      expect(performanceReport.p95).toBeLessThan(TEST_CONFIG.MAX_BROADCAST_LATENCY * 2); // Allow 2x latency for burst
      expect(performanceReport.successCount).toBeGreaterThan(burstSize * 0.9); // At least 90% success

      // Check that successful requests returned proper structure
      const successfulResults = results.filter(result => result && result.status === 200);
      expect(successfulResults.length).toBeGreaterThan(0);
      
      successfulResults.slice(0, 5).forEach(result => {
        expect(result.data.success).toBe(true);
        expect(result.data.requestId).toBeDefined();
        expect(result.data.channels).toBeDefined();
      });
    });

    test('should maintain performance under sustained load', async () => {
      const sustainedDuration = 30000; // 30 seconds
      const requestInterval = 100; // 100ms between requests (10 requests/second)
      const expectedRequests = sustainedDuration / requestInterval;

      console.log(`Starting sustained load test for ${sustainedDuration}ms...`);

      const results: any[] = [];
      const durations: number[] = [];
      const errors: Error[] = [];
      const startTime = Date.now();

      while (Date.now() - startTime < sustainedDuration) {
        try {
          const event = {
            type: 'phase_changed',
            gameId: `550e8400-e29b-41d4-a716-446655440000`,
            userId: 'system',
            timestamp: Date.now(),
            version: '2.0.0',
            data: { newPhase: 'drawing', previousPhase: 'briefing' }
          };

          const { result, duration } = await perfUtils.measureExecutionTime(async () => {
            return await edgeFunctionUtils.callBroadcastFunction(event);
          });

          results.push(result);
          durations.push(duration);

          // Wait before next request
          await new Promise(resolve => setTimeout(resolve, requestInterval));
        } catch (error) {
          errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }

      const actualDuration = Date.now() - startTime;
      const performanceReport = perfUtils.generatePerformanceReport(durations, errors);

      console.log('Sustained Load Test Results:', {
        actualDuration,
        totalRequests: performanceReport.totalRequests,
        requestsPerSecond: performanceReport.totalRequests / (actualDuration / 1000),
        successCount: performanceReport.successCount,
        errorRate: performanceReport.errorRate,
        averageDuration: performanceReport.averageDuration,
        p95: performanceReport.p95
      });

      // Assertions for sustained load
      expect(performanceReport.errorRate).toBeLessThan(0.05); // Less than 5% error rate
      expect(performanceReport.averageDuration).toBeLessThan(TEST_CONFIG.MAX_BROADCAST_LATENCY);
      expect(performanceReport.totalRequests).toBeGreaterThan(expectedRequests * 0.8); // At least 80% of expected requests
    });
  });

  describe('Database Connection Pool Testing', () => {
    test('should handle connection pool exhaustion gracefully', async () => {
      const connectionCount = 25; // Attempt to exceed typical connection pool size
      
      console.log(`Testing connection pool with ${connectionCount} concurrent connections...`);

      const { results, durations, errors } = await perfUtils.runConcurrentTests(
        async () => {
          const supabase = dbUtils['supabase'];
          
          // Perform a database operation that holds connection briefly
          const testGame = createTestGame({
            id: `pool-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          });
          
          await supabase.from('games').insert(testGame);
          
          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 100));
          
          return await supabase.from('games').delete().eq('id', testGame.id);
        },
        connectionCount, // All concurrent
        1 // Single iteration with all concurrent
      );

      const performanceReport = perfUtils.generatePerformanceReport(durations, errors);
      
      console.log('Connection Pool Test Results:', {
        totalRequests: performanceReport.totalRequests,
        successCount: performanceReport.successCount,
        errorRate: performanceReport.errorRate,
        averageDuration: performanceReport.averageDuration
      });

      // Should handle gracefully even if some connections fail
      expect(performanceReport.errorRate).toBeLessThan(0.2); // Less than 20% error rate
      expect(performanceReport.successCount).toBeGreaterThan(connectionCount * 0.7); // At least 70% success
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should not leak memory during extended operation', async () => {
      const iterations = 200;
      
      console.log(`Testing memory usage over ${iterations} iterations...`);

      // Measure initial memory (if available)
      const initialMemory = process.memoryUsage();
      
      for (let i = 0; i < iterations; i++) {
        const event = {
          type: 'phase_changed',
          gameId: `550e8400-e29b-41d4-a716-446655440000`,
          userId: 'system',
          timestamp: Date.now(),
          version: '2.0.0',
          data: { 
            newPhase: 'drawing', 
            previousPhase: 'briefing',
            iteration: i 
          }
        };

        await edgeFunctionUtils.callBroadcastFunction(event);

        // Periodic memory check
        if (i % 50 === 0) {
          const currentMemory = process.memoryUsage();
          console.log(`Iteration ${i}: Memory usage - RSS: ${Math.round(currentMemory.rss / 1024 / 1024)}MB, Heap: ${Math.round(currentMemory.heapUsed / 1024 / 1024)}MB`);
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log('Memory Usage Summary:', {
        initialHeap: Math.round(initialMemory.heapUsed / 1024 / 1024),
        finalHeap: Math.round(finalMemory.heapUsed / 1024 / 1024),
        increase: Math.round(memoryIncrease / 1024 / 1024),
        iterations
      });

      // Memory increase should be reasonable (less than 100MB for 200 iterations)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // 100MB
    });
  });
});
