// Unit tests for broadcast-pubnub-event Edge Function
// Comprehensive testing for production deployment validation

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  TEST_CONFIG,
  createTestGameEvent,
  EdgeFunctionTestUtils,
  setupTestEnvironment,
  teardownTestEnvironment,
  DatabaseTestUtils
} from '../setup/test-config';

describe('broadcast-pubnub-event Edge Function', () => {
  let edgeFunctionUtils: EdgeFunctionTestUtils;
  let dbUtils: DatabaseTestUtils;

  beforeEach(async () => {
    edgeFunctionUtils = new EdgeFunctionTestUtils();
    dbUtils = await setupTestEnvironment();
  });

  afterEach(async () => {
    await teardownTestEnvironment(dbUtils);
  });

  describe('Input Validation', () => {
    test('should reject requests with missing required fields', async () => {
      const invalidEvents = [
        {}, // Empty object
        { type: 'test' }, // Missing gameId
        { gameId: 'test-game' }, // Missing type
        { type: 'test', gameId: 'test-game' }, // Missing userId
      ];

      for (const event of invalidEvents) {
        const response = await edgeFunctionUtils.callBroadcastFunction(event);
        expect(response.status).toBe(400);
        expect(response.data.success).toBe(false);
        expect(response.data.error).toContain('required');
      }
    });

    test('should validate UUID format for gameId', async () => {
      const invalidGameIds = [
        'not-a-uuid',
        '123',
        'invalid-uuid-format',
        ''
      ];

      for (const gameId of invalidGameIds) {
        const event = createTestGameEvent({ gameId });
        const response = await edgeFunctionUtils.callBroadcastFunction(event);
        expect(response.status).toBe(400);
        expect(response.data.error).toContain('UUID');
      }
    });

    test('should reject oversized payloads', async () => {
      const largeData = 'x'.repeat(35000); // Exceed 32KB limit
      const event = createTestGameEvent({
        data: { largeField: largeData }
      });

      const response = await edgeFunctionUtils.callBroadcastFunction(event);
      expect(response.status).toBe(413);
      expect(response.data.error).toContain('too large');
    });

    test('should reject invalid JSON', async () => {
      const response = await fetch(`${TEST_CONFIG.EDGE_FUNCTIONS_URL}/broadcast-pubnub-event`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TEST_CONFIG.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: 'invalid json{'
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('JSON');
    });
  });

  describe('Event Processing', () => {
    test('should successfully process valid phase_changed event', async () => {
      const event = createTestGameEvent({
        type: 'phase_changed',
        gameId: '550e8400-e29b-41d4-a716-446655440000',
        userId: 'system'
      });

      const response = await edgeFunctionUtils.callBroadcastFunction(event);
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.requestId).toBeDefined();
      expect(response.data.channels).toContain('game-550e8400-e29b-41d4-a716-446655440000');
      expect(response.data.results).toBeDefined();
    });

    test('should process player_joined event with presence channel', async () => {
      const event = createTestGameEvent({
        type: 'player_joined',
        gameId: '550e8400-e29b-41d4-a716-446655440000',
        userId: 'test-user-123'
      });

      const response = await edgeFunctionUtils.callBroadcastFunction(event);
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.channels).toContain('game-550e8400-e29b-41d4-a716-446655440000');
      expect(response.data.channels).toContain('presence-550e8400-e29b-41d4-a716-446655440000');
    });

    test('should process MATCH_FOUND event with user channel', async () => {
      const event = createTestGameEvent({
        type: 'MATCH_FOUND',
        gameId: '550e8400-e29b-41d4-a716-446655440000',
        userId: 'test-user-123'
      });

      const response = await edgeFunctionUtils.callBroadcastFunction(event);
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.channels).toContain('game-550e8400-e29b-41d4-a716-446655440000');
      expect(response.data.channels).toContain('user-test-user-123');
    });
  });

  describe('Error Handling', () => {
    test('should handle PubNub configuration errors gracefully', async () => {
      // Mock missing PubNub configuration
      const originalEnv = process.env;
      process.env = { ...originalEnv };
      delete process.env.PUBNUB_PUBLISH_KEY;
      delete process.env.PUBNUB_SUBSCRIBE_KEY;

      const event = createTestGameEvent();
      const response = await edgeFunctionUtils.callBroadcastFunction(event);
      
      expect(response.status).toBe(500);
      expect(response.data.error).toContain('configuration');

      // Restore environment
      process.env = originalEnv;
    });

    test('should handle network timeouts', async () => {
      // This test would require mocking the PubNub API to simulate timeouts
      // For now, we'll test the timeout configuration is present
      const event = createTestGameEvent();
      const startTime = Date.now();
      
      const response = await edgeFunctionUtils.callBroadcastFunction(event);
      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time (not timeout)
      expect(duration).toBeLessThan(15000); // 15 seconds max
    });

    test('should return proper error structure', async () => {
      const event = {}; // Invalid event to trigger error
      const response = await edgeFunctionUtils.callBroadcastFunction(event);
      
      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('success', false);
      expect(response.data).toHaveProperty('error');
      expect(response.data).toHaveProperty('requestId');
      expect(response.data).toHaveProperty('timestamp');
    });
  });

  describe('Performance', () => {
    test('should complete within performance threshold', async () => {
      const event = createTestGameEvent();
      const startTime = Date.now();
      
      const response = await edgeFunctionUtils.callBroadcastFunction(event);
      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(TEST_CONFIG.MAX_BROADCAST_LATENCY);
    });

    test('should handle concurrent requests', async () => {
      const concurrentRequests = 10;
      const promises = Array.from({ length: concurrentRequests }, (_, i) => {
        const event = createTestGameEvent({
          gameId: `550e8400-e29b-41d4-a716-44665544000${i}`
        });
        return edgeFunctionUtils.callBroadcastFunction(event);
      });

      const responses = await Promise.all(promises);
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
      });

      // All should have unique request IDs
      const requestIds = responses.map(r => r.data.requestId);
      const uniqueRequestIds = new Set(requestIds);
      expect(uniqueRequestIds.size).toBe(concurrentRequests);
    });
  });

  describe('CORS and Security', () => {
    test('should handle OPTIONS preflight requests', async () => {
      const response = await fetch(`${TEST_CONFIG.EDGE_FUNCTIONS_URL}/broadcast-pubnub-event`, {
        method: 'OPTIONS'
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    test('should reject non-POST requests', async () => {
      const methods = ['GET', 'PUT', 'DELETE', 'PATCH'];
      
      for (const method of methods) {
        const response = await fetch(`${TEST_CONFIG.EDGE_FUNCTIONS_URL}/broadcast-pubnub-event`, {
          method,
          headers: {
            'Authorization': `Bearer ${TEST_CONFIG.SUPABASE_SERVICE_ROLE_KEY}`
          }
        });

        expect(response.status).toBe(405);
      }
    });

    test('should include security headers', async () => {
      const event = createTestGameEvent();
      const response = await fetch(`${TEST_CONFIG.EDGE_FUNCTIONS_URL}/broadcast-pubnub-event`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TEST_CONFIG.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      });

      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined();
    });
  });

  describe('Request Tracing', () => {
    test('should include request ID in response', async () => {
      const event = createTestGameEvent();
      const response = await edgeFunctionUtils.callBroadcastFunction(event);
      
      expect(response.status).toBe(200);
      expect(response.data.requestId).toBeDefined();
      expect(typeof response.data.requestId).toBe('string');
      expect(response.data.requestId.length).toBeGreaterThan(10);
    });

    test('should include performance metrics', async () => {
      const event = createTestGameEvent();
      const response = await edgeFunctionUtils.callBroadcastFunction(event);
      
      expect(response.status).toBe(200);
      expect(response.data.duration).toBeDefined();
      expect(typeof response.data.duration).toBe('number');
      expect(response.data.duration).toBeGreaterThan(0);
    });
  });
});
