# Testing Strategy: Real-time Events & Timer Monitoring

## Overview
Comprehensive testing strategy for the SketchyAF real-time event broadcasting and timer monitoring system before production deployment.

## 🧪 Test Categories

### 1. Unit Tests

#### A. Edge Function Tests
**File**: `__tests__/edge-functions/broadcast-pubnub-event.test.ts`

```typescript
describe('broadcast-pubnub-event', () => {
  test('validates required fields', async () => {
    // Test missing gameId, type, userId
  });
  
  test('handles payload size limits', async () => {
    // Test 32KB limit enforcement
  });
  
  test('implements retry logic correctly', async () => {
    // Test exponential backoff
  });
  
  test('handles timeout scenarios', async () => {
    // Test 10s timeout handling
  });
  
  test('generates proper PubNub signatures', async () => {
    // Test HMAC-SHA256 signature generation
  });
});
```

#### B. Database Function Tests
**File**: `__tests__/database/broadcast-game-event.test.ts`

```sql
-- Test database trigger function
BEGIN;
  -- Test phase_changed event
  INSERT INTO games (id, status, prompt, max_players) 
  VALUES ('test-game-id', 'briefing', 'Test prompt', 4);
  
  UPDATE games SET status = 'drawing' WHERE id = 'test-game-id';
  
  -- Verify pg_net.http_post was called
  SELECT * FROM net._http_response ORDER BY created DESC LIMIT 1;
ROLLBACK;
```

#### C. Timer Monitoring Tests
**File**: `__tests__/edge-functions/monitor-game-timers.test.ts`

```typescript
describe('monitor-game-timers', () => {
  test('processes expired games correctly', async () => {
    // Test timer expiration logic
  });
  
  test('handles grace period for drawing phase', async () => {
    // Test 15-second grace period
  });
  
  test('prevents concurrent executions', async () => {
    // Test advisory locking
  });
  
  test('handles database connection failures', async () => {
    // Test error recovery
  });
});
```

### 2. Integration Tests

#### A. End-to-End Event Flow
**File**: `__tests__/integration/event-flow.test.ts`

```typescript
describe('Event Broadcasting Flow', () => {
  test('database trigger → edge function → pubnub', async () => {
    // 1. Create game and trigger status change
    // 2. Verify edge function receives request
    // 3. Verify PubNub receives message
    // 4. Verify client receives event
  });
  
  test('timer expiration → phase transition → broadcast', async () => {
    // 1. Create game with short timer
    // 2. Wait for expiration
    // 3. Verify phase transition
    // 4. Verify broadcast to clients
  });
});
```

#### B. Real-time Client Integration
**File**: `__tests__/integration/client-events.test.ts`

```typescript
describe('Client Event Reception', () => {
  test('receives phase change events', async () => {
    // Test client PubNub subscription
  });
  
  test('handles connection interruptions', async () => {
    // Test reconnection logic
  });
  
  test('processes event ordering correctly', async () => {
    // Test event sequence handling
  });
});
```

### 3. Load Tests

#### A. Concurrent Game Processing
**File**: `__tests__/load/concurrent-games.test.ts`

```typescript
describe('Load Testing', () => {
  test('handles 50 concurrent games', async () => {
    // Create 50 games simultaneously
    // Trigger timer expirations
    // Verify all events are processed
  });
  
  test('pubnub rate limiting', async () => {
    // Test 100 messages/second limit
  });
  
  test('database connection pooling', async () => {
    // Test connection pool exhaustion
  });
});
```

#### B. High-Frequency Events
**File**: `__tests__/load/high-frequency.test.ts`

```typescript
describe('High Frequency Events', () => {
  test('rapid phase transitions', async () => {
    // Multiple games transitioning simultaneously
  });
  
  test('burst event handling', async () => {
    // 200 events in 1 second burst
  });
});
```

### 4. Failure Scenario Tests

#### A. Network Failures
**File**: `__tests__/failure/network-failures.test.ts`

```typescript
describe('Network Failure Scenarios', () => {
  test('pubnub api unavailable', async () => {
    // Mock PubNub API failures
    // Verify retry logic
    // Verify graceful degradation
  });
  
  test('edge function timeout', async () => {
    // Mock slow edge function responses
    // Verify timeout handling
  });
  
  test('database connection loss', async () => {
    // Mock database disconnection
    // Verify reconnection logic
  });
});
```

#### B. Data Corruption Scenarios
**File**: `__tests__/failure/data-corruption.test.ts`

```typescript
describe('Data Corruption Scenarios', () => {
  test('invalid json payload', async () => {
    // Test malformed JSON handling
  });
  
  test('missing required fields', async () => {
    // Test validation error handling
  });
  
  test('oversized payloads', async () => {
    // Test 32KB limit enforcement
  });
});
```

## 🎯 Test Execution Strategy

### 1. Local Development Testing
```bash
# Run unit tests
npm run test:unit

# Run integration tests with local Supabase
npm run test:integration:local

# Run load tests (limited scale)
npm run test:load:local
```

### 2. Staging Environment Testing
```bash
# Full integration test suite
npm run test:integration:staging

# Load testing with production-like data
npm run test:load:staging

# Failure scenario testing
npm run test:failure:staging
```

### 3. Production Smoke Testing
```bash
# Critical path verification
npm run test:smoke:production

# Health check validation
npm run test:health:production
```

## 📊 Test Data Management

### 1. Test Game Data
```typescript
// Test data factory
export const createTestGame = (overrides = {}) => ({
  id: 'test-game-' + Date.now(),
  status: 'briefing',
  prompt: 'Test drawing prompt',
  max_players: 4,
  current_players: 2,
  phase_expires_at: new Date(Date.now() + 60000), // 1 minute
  ...overrides
});
```

### 2. Mock PubNub Responses
```typescript
// Mock PubNub for testing
export const mockPubNubSuccess = () => [1, "Sent", "17512012980260245"];
export const mockPubNubFailure = () => [0, "Failed", "Error message"];
```

### 3. Database Test Fixtures
```sql
-- Test data setup
INSERT INTO games (id, status, prompt, max_players, phase_expires_at)
VALUES 
  ('expired-game-1', 'drawing', 'Test prompt 1', 4, NOW() - INTERVAL '1 minute'),
  ('expired-game-2', 'voting', 'Test prompt 2', 6, NOW() - INTERVAL '30 seconds'),
  ('active-game-1', 'briefing', 'Test prompt 3', 4, NOW() + INTERVAL '5 minutes');
```

## 🔍 Test Monitoring & Reporting

### 1. Test Metrics
- Test execution time
- Test coverage percentage
- Failure rates by category
- Performance benchmarks

### 2. Test Reports
- JUnit XML for CI/CD integration
- Coverage reports (Istanbul/NYC)
- Performance test results
- Load test metrics

### 3. Continuous Testing
```yaml
# GitHub Actions workflow
name: Real-time Events Testing
on: [push, pull_request]
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm run test:unit
  
  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
    steps:
      - uses: actions/checkout@v3
      - run: npm run test:integration
  
  load-tests:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - run: npm run test:load
```

## ✅ Test Completion Checklist

### Unit Tests
- [ ] Edge function input validation
- [ ] Database trigger logic
- [ ] PubNub message formatting
- [ ] Error handling scenarios
- [ ] Retry logic verification

### Integration Tests
- [ ] Database → Edge Function → PubNub flow
- [ ] Timer monitoring end-to-end
- [ ] Client event reception
- [ ] Cross-browser compatibility
- [ ] Mobile device testing

### Load Tests
- [ ] 50 concurrent games
- [ ] 100 messages/second PubNub rate
- [ ] Database connection pooling
- [ ] Edge function cold starts
- [ ] Memory usage under load

### Failure Tests
- [ ] Network interruptions
- [ ] API failures and timeouts
- [ ] Database connection loss
- [ ] Invalid data handling
- [ ] Resource exhaustion

### Performance Tests
- [ ] Timer monitoring < 5s execution
- [ ] Event broadcasting < 2s latency
- [ ] Database triggers < 500ms
- [ ] PubNub delivery < 1s global

## 🚀 Pre-Production Validation

### 1. Staging Environment
- [ ] Deploy latest code to staging
- [ ] Run full test suite
- [ ] Verify monitoring and alerting
- [ ] Test backup and recovery
- [ ] Validate security configurations

### 2. Production Readiness
- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Security audit completed
- [ ] Monitoring configured
- [ ] Runbooks prepared

### 3. Go/No-Go Criteria
- [ ] Test coverage > 80%
- [ ] Zero critical failures
- [ ] Performance within SLA
- [ ] Security vulnerabilities addressed
- [ ] Monitoring and alerting functional
