// Test configuration and setup for SketchyAF real-time events testing
// Comprehensive testing infrastructure for production deployment

import { createClient } from '@supabase/supabase-js';

// Test environment configuration
export const TEST_CONFIG = {
  // Database configuration
  SUPABASE_URL: process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  
  // PubNub configuration
  PUBNUB_PUBLISH_KEY: process.env.PUBNUB_PUBLISH_KEY || 'test-publish-key',
  PUBNUB_SUBSCRIBE_KEY: process.env.PUBNUB_SUBSCRIBE_KEY || 'test-subscribe-key',
  PUBNUB_SECRET_KEY: process.env.PUBNUB_SECRET_KEY || 'test-secret-key',
  
  // Edge Functions configuration
  EDGE_FUNCTIONS_URL: process.env.EDGE_FUNCTIONS_URL || 'http://127.0.0.1:54321/functions/v1',
  CRON_SECRET: process.env.CRON_SECRET || 'test-cron-secret',
  
  // Test timeouts and limits
  TEST_TIMEOUT: 30000, // 30 seconds
  LOAD_TEST_GAMES: 50,
  CONCURRENT_LIMIT: 5,
  
  // Performance thresholds
  MAX_TIMER_EXECUTION_TIME: 5000, // 5 seconds
  MAX_BROADCAST_LATENCY: 2000, // 2 seconds
  MAX_DB_TRIGGER_TIME: 500, // 500ms
  MAX_PUBNUB_DELIVERY_TIME: 1000, // 1 second
};

// Test data factories
export const createTestGame = (overrides: Partial<any> = {}) => ({
  id: `test-game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  status: 'briefing',
  prompt: 'Test drawing prompt for automated testing',
  max_players: 4,
  current_players: 2,
  phase_expires_at: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides
});

export const createExpiredTestGame = (overrides: Partial<any> = {}) => ({
  ...createTestGame(),
  status: 'drawing',
  phase_expires_at: new Date(Date.now() - 30000).toISOString(), // 30 seconds ago
  ...overrides
});

export const createTestGameEvent = (overrides: Partial<any> = {}) => ({
  type: 'phase_changed',
  gameId: `test-game-${Date.now()}`,
  userId: 'test-user',
  timestamp: Date.now(),
  version: '2.0.0',
  data: {
    newPhase: 'drawing',
    previousPhase: 'briefing',
    phaseStartedAt: new Date().toISOString(),
    transitionTriggeredBy: 'test'
  },
  ...overrides
});

// Mock PubNub responses
export const mockPubNubSuccess = () => [1, "Sent", "17512012980260245"];
export const mockPubNubFailure = () => [0, "Failed", "Test error message"];

// Test database client
export const getTestSupabaseClient = () => {
  return createClient(
    TEST_CONFIG.SUPABASE_URL,
    TEST_CONFIG.SUPABASE_SERVICE_ROLE_KEY
  );
};

// Database test utilities
export class DatabaseTestUtils {
  private supabase = getTestSupabaseClient();

  async setupTestData() {
    // Create test games with various states
    const testGames = [
      createExpiredTestGame({ id: 'expired-drawing-game', status: 'drawing' }),
      createExpiredTestGame({ id: 'expired-voting-game', status: 'voting' }),
      createTestGame({ id: 'active-briefing-game', status: 'briefing' }),
      createTestGame({ id: 'active-drawing-game', status: 'drawing' })
    ];

    for (const game of testGames) {
      await this.supabase.from('games').upsert(game);
    }

    return testGames;
  }

  async cleanupTestData() {
    // Clean up test games
    await this.supabase
      .from('games')
      .delete()
      .like('id', 'test-game-%');

    // Clean up test metadata
    await this.supabase
      .from('game_metadata')
      .delete()
      .like('game_id', 'test-game-%');

    // Clean up pg_net responses (if accessible)
    try {
      await this.supabase.rpc('cleanup_test_http_responses');
    } catch (error) {
      console.warn('Could not cleanup HTTP responses:', error);
    }
  }

  async getLatestHttpResponse() {
    const { data } = await this.supabase
      .from('net._http_response')
      .select('*')
      .order('created', { ascending: false })
      .limit(1)
      .single();
    
    return data;
  }

  async waitForHttpResponse(timeoutMs = 5000): Promise<any> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const response = await this.getLatestHttpResponse();
      if (response && response.created > new Date(startTime)) {
        return response;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`No HTTP response received within ${timeoutMs}ms`);
  }
}

// Edge Function test utilities
export class EdgeFunctionTestUtils {
  async callBroadcastFunction(event: any) {
    const response = await fetch(`${TEST_CONFIG.EDGE_FUNCTIONS_URL}/broadcast-pubnub-event`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_CONFIG.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    });

    return {
      status: response.status,
      data: await response.json()
    };
  }

  async callMonitorFunction() {
    const response = await fetch(`${TEST_CONFIG.EDGE_FUNCTIONS_URL}/monitor-game-timers`, {
      method: 'POST',
      headers: {
        'x-cron-secret': TEST_CONFIG.CRON_SECRET,
        'Content-Type': 'application/json'
      }
    });

    return {
      status: response.status,
      data: await response.json()
    };
  }

  async callHealthCheck() {
    const response = await fetch(`${TEST_CONFIG.EDGE_FUNCTIONS_URL}/health`, {
      method: 'GET'
    });

    return {
      status: response.status,
      data: await response.json()
    };
  }
}

// Performance testing utilities
export class PerformanceTestUtils {
  async measureExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const startTime = Date.now();
    const result = await fn();
    const duration = Date.now() - startTime;
    
    return { result, duration };
  }

  async runConcurrentTests<T>(
    testFn: () => Promise<T>,
    concurrency: number,
    iterations: number
  ): Promise<{ results: T[]; durations: number[]; errors: Error[] }> {
    const results: T[] = [];
    const durations: number[] = [];
    const errors: Error[] = [];

    const chunks = [];
    for (let i = 0; i < iterations; i += concurrency) {
      chunks.push(Array.from({ length: Math.min(concurrency, iterations - i) }, () => testFn));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (fn) => {
        try {
          const { result, duration } = await this.measureExecutionTime(fn);
          results.push(result);
          durations.push(duration);
        } catch (error) {
          errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      });

      await Promise.allSettled(promises);
    }

    return { results, durations, errors };
  }

  calculatePercentile(values: number[], percentile: number): number {
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  generatePerformanceReport(durations: number[], errors: Error[]) {
    const successCount = durations.length;
    const errorCount = errors.length;
    const totalCount = successCount + errorCount;

    return {
      totalRequests: totalCount,
      successCount,
      errorCount,
      errorRate: errorCount / totalCount,
      averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      p50: this.calculatePercentile(durations, 50),
      p95: this.calculatePercentile(durations, 95),
      p99: this.calculatePercentile(durations, 99),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations)
    };
  }
}

// Test environment setup and teardown
export const setupTestEnvironment = async () => {
  const dbUtils = new DatabaseTestUtils();
  await dbUtils.cleanupTestData();
  return dbUtils;
};

export const teardownTestEnvironment = async (dbUtils: DatabaseTestUtils) => {
  await dbUtils.cleanupTestData();
};

// Global test configuration
export const globalTestSetup = () => {
  // Set test timeouts
  jest.setTimeout(TEST_CONFIG.TEST_TIMEOUT);
  
  // Mock console methods in test environment
  if (process.env.NODE_ENV === 'test') {
    global.console = {
      ...console,
      log: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
  }
};

// Export all utilities
export {
  DatabaseTestUtils,
  EdgeFunctionTestUtils,
  PerformanceTestUtils
};
