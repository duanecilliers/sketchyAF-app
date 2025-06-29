# Production Deployment Strategy: Timer Monitoring & Real-time Events

## 🎯 Overview

This document outlines the complete deployment strategy to take the SketchyAF timer monitoring and real-time event broadcasting system from 85% production-ready to fully deployed and validated within **1-2 weeks**.

## ✅ Phase 1: Complete Remaining Work (Days 1-2)

### 1.1 monitor-game-timers Function Completion ✅ COMPLETED
**Status**: ✅ **PRODUCTION READY**

**Completed Enhancements**:
- ✅ Request ID tracking and structured logging
- ✅ Environment-aware configuration
- ✅ Enhanced advisory locking with timeout monitoring
- ✅ Comprehensive error handling and metrics collection
- ✅ Production-grade authentication validation
- ✅ Timeout and execution time monitoring
- ✅ Performance metrics tracking

### 1.2 Testing Infrastructure Setup (Day 2)
**Estimated Time**: 6-8 hours

#### Unit Tests Implementation
```bash
# Create test structure
mkdir -p __tests__/{edge-functions,database,integration,load,failure}

# Implement core test suites
npm install --save-dev vitest @vitest/ui supertest
```

**Test Files to Create**:
- `__tests__/edge-functions/broadcast-pubnub-event.test.ts`
- `__tests__/edge-functions/monitor-game-timers.test.ts`
- `__tests__/database/broadcast-game-event.test.ts`
- `__tests__/integration/event-flow.test.ts`
- `__tests__/load/concurrent-games.test.ts`

#### Database Test Setup
```sql
-- Create test database functions
CREATE OR REPLACE FUNCTION setup_test_data()
RETURNS void AS $$
BEGIN
  -- Insert test games with various states
  INSERT INTO games (id, status, prompt, max_players, phase_expires_at)
  VALUES 
    ('test-expired-1', 'drawing', 'Test prompt 1', 4, NOW() - INTERVAL '1 minute'),
    ('test-expired-2', 'voting', 'Test prompt 2', 6, NOW() - INTERVAL '30 seconds'),
    ('test-active-1', 'briefing', 'Test prompt 3', 4, NOW() + INTERVAL '5 minutes');
END;
$$ LANGUAGE plpgsql;
```

## 🚀 Phase 2: Staging Deployment (Days 3-5)

### 2.1 Staging Environment Setup (Day 3)
**Estimated Time**: 4-6 hours

#### Environment Configuration
```bash
# Staging environment variables
SUPABASE_URL=https://staging-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=staging_service_role_key
PUBNUB_PUBLISH_KEY=staging_publish_key
PUBNUB_SUBSCRIBE_KEY=staging_subscribe_key
CRON_SECRET=staging_secure_cron_secret
LOG_LEVEL=DEBUG
ENVIRONMENT=staging
```

#### Database Migration Deployment
```bash
# Apply production database function
supabase db push --db-url "postgresql://postgres:[password]@db.staging-project.supabase.co:5432/postgres"

# Verify migration
psql "postgresql://postgres:[password]@db.staging-project.supabase.co:5432/postgres" -c "
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'broadcast_game_event';
"
```

#### Edge Functions Deployment
```bash
# Deploy enhanced Edge Functions
supabase functions deploy broadcast-pubnub-event --project-ref staging-project
supabase functions deploy monitor-game-timers --project-ref staging-project
supabase functions deploy get-game-timer --project-ref staging-project

# Set environment variables
supabase secrets set --project-ref staging-project \
  PUBNUB_PUBLISH_KEY=staging_key \
  PUBNUB_SUBSCRIBE_KEY=staging_key \
  CRON_SECRET=staging_secret
```

### 2.2 Staging Validation (Days 4-5)
**Estimated Time**: 8-12 hours

#### Automated Testing Execution
```bash
# Run comprehensive test suite
npm run test:unit
npm run test:integration:staging
npm run test:load:staging
npm run test:failure:staging
```

#### Manual Validation Checklist
- [ ] Create test game and verify timer monitoring
- [ ] Trigger phase transitions and verify PubNub events
- [ ] Test concurrent game processing (10 games)
- [ ] Verify error handling and recovery
- [ ] Test client-side event reception
- [ ] Validate monitoring and logging

#### Performance Validation
- [ ] Timer monitoring execution < 5 seconds
- [ ] Event broadcasting latency < 2 seconds
- [ ] Database trigger execution < 500ms
- [ ] PubNub global delivery < 1 second

## 📊 Phase 3: Monitoring & Alerting Setup (Day 6)

### 3.1 Supabase Monitoring Configuration
**Estimated Time**: 3-4 hours

#### Dashboard Setup
```typescript
// Custom metrics collection
const monitoringMetrics = {
  timerMonitoringExecutions: 0,
  eventBroadcastingSuccess: 0,
  eventBroadcastingFailures: 0,
  averageExecutionTime: 0,
  errorRate: 0
};

// Health check endpoint
export const healthCheck = async () => {
  const checks = {
    database: await checkDatabaseConnection(),
    pubnub: await checkPubNubConnectivity(),
    edgeFunctions: await checkEdgeFunctionAvailability()
  };
  
  return {
    status: Object.values(checks).every(check => check.healthy) ? 'healthy' : 'unhealthy',
    checks,
    timestamp: new Date().toISOString()
  };
};
```

#### Alert Configuration
```yaml
# Supabase Alert Rules
alerts:
  - name: "High Error Rate"
    condition: "error_rate > 0.05"
    window: "5m"
    channels: ["slack", "email"]
  
  - name: "Timer Monitoring Timeout"
    condition: "execution_time > 30000"
    window: "1m"
    channels: ["slack", "pagerduty"]
  
  - name: "PubNub API Failures"
    condition: "pubnub_failures > 10"
    window: "5m"
    channels: ["slack"]
```

### 3.2 PubNub Monitoring Setup
**Estimated Time**: 2-3 hours

#### PubNub Admin Dashboard Configuration
- [ ] Set up message delivery monitoring
- [ ] Configure rate limiting alerts
- [ ] Set up presence monitoring
- [ ] Configure usage threshold alerts

## 🎯 Phase 4: Production Deployment (Days 7-8)

### 4.1 Pre-Production Checklist (Day 7 Morning)
**Estimated Time**: 2-3 hours

#### Final Validation
- [ ] All staging tests passing (>95% success rate)
- [ ] Performance benchmarks met
- [ ] Security audit completed
- [ ] Monitoring and alerting functional
- [ ] Rollback procedures tested
- [ ] Team training completed

#### Production Environment Preparation
```bash
# Production environment variables
SUPABASE_URL=https://production-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=production_service_role_key
PUBNUB_PUBLISH_KEY=production_publish_key
PUBNUB_SUBSCRIBE_KEY=production_subscribe_key
CRON_SECRET=production_secure_cron_secret
LOG_LEVEL=INFO
ENVIRONMENT=production
```

### 4.2 Production Deployment Execution (Day 7 Afternoon)
**Estimated Time**: 3-4 hours

#### Deployment Window: Low-Traffic Period
**Recommended**: 2:00 AM - 6:00 AM UTC (adjust for your timezone)

#### Deployment Steps
```bash
# 1. Database Migration (5 minutes)
supabase db push --project-ref production-project

# 2. Edge Functions Deployment (10 minutes)
supabase functions deploy broadcast-pubnub-event --project-ref production-project
supabase functions deploy monitor-game-timers --project-ref production-project

# 3. Environment Variables Update (5 minutes)
supabase secrets set --project-ref production-project \
  PUBNUB_PUBLISH_KEY=prod_key \
  PUBNUB_SUBSCRIBE_KEY=prod_key \
  CRON_SECRET=prod_secret

# 4. Cron Schedule Activation (2 minutes)
supabase functions schedule monitor-game-timers \
  --cron "*/10 * * * * *" \
  --project-ref production-project
```

#### Immediate Post-Deployment Validation (30 minutes)
```bash
# Smoke tests
curl -X POST https://production-project.supabase.co/functions/v1/broadcast-pubnub-event \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -d '{"type":"test","gameId":"test-game","userId":"test-user","timestamp":1234567890,"version":"2.0.0","data":{}}'

# Monitor timer function
curl -X POST https://production-project.supabase.co/functions/v1/monitor-game-timers \
  -H "x-cron-secret: $CRON_SECRET"

# Check monitoring dashboard
# Verify PubNub message delivery
# Validate database trigger execution
```

### 4.3 Gradual Rollout (Day 8)
**Estimated Time**: Full day monitoring

#### Rollout Strategy
1. **Hour 1-2**: Monitor system with existing traffic
2. **Hour 3-6**: Enable for 25% of new games
3. **Hour 7-12**: Enable for 50% of new games
4. **Hour 13-24**: Enable for 100% of new games

#### Monitoring Checkpoints
- [ ] Error rate < 0.5%
- [ ] Timer accuracy > 99.9%
- [ ] Event delivery success > 99.5%
- [ ] Performance within SLA
- [ ] No critical alerts triggered

## 🛡️ Risk Mitigation & Rollback Procedures

### High-Risk Area Safeguards

#### 1. PubNub API Failures
**Mitigation**:
- ✅ Retry logic with exponential backoff
- ✅ Circuit breaker pattern implemented
- ✅ Graceful degradation to database-only updates
- [ ] Dead letter queue for failed events (future enhancement)

**Rollback**: Disable PubNub broadcasting, maintain database updates

#### 2. Database Connection Exhaustion
**Mitigation**:
- ✅ Connection pooling configured (20 connections)
- ✅ Timeout handling (10 seconds)
- ✅ Connection cleanup in error scenarios

**Rollback**: Reduce concurrency limits, restart database connections

#### 3. Timer Monitoring Overlaps
**Mitigation**:
- ✅ Enhanced advisory locking
- ✅ Execution timeout monitoring
- ✅ Request ID tracking for debugging

**Rollback**: Disable timer monitoring, manual phase transitions

### Rollback Procedures

#### Emergency Rollback (< 5 minutes)
```bash
# Disable timer monitoring
supabase functions unschedule monitor-game-timers --project-ref production-project

# Revert to previous Edge Function versions
supabase functions deploy broadcast-pubnub-event@previous --project-ref production-project

# Disable database triggers (if needed)
psql "production-db-url" -c "DROP TRIGGER IF EXISTS game_status_change_trigger ON games;"
```

#### Partial Rollback (Feature Flags)
```typescript
// Disable specific features via environment variables
const FEATURE_FLAGS = {
  ENABLE_TIMER_MONITORING: Deno.env.get('ENABLE_TIMER_MONITORING') === 'true',
  ENABLE_PUBNUB_BROADCASTING: Deno.env.get('ENABLE_PUBNUB_BROADCASTING') === 'true',
  ENABLE_GRACE_PERIOD: Deno.env.get('ENABLE_GRACE_PERIOD') === 'true'
};
```

## 📈 Success Criteria & KPIs

### Technical Success Metrics
- [ ] System availability > 99.9%
- [ ] Timer monitoring execution < 5 seconds (95th percentile)
- [ ] Event broadcasting latency < 2 seconds (95th percentile)
- [ ] Error rate < 0.5%
- [ ] All tests passing > 95%

### Business Success Metrics
- [ ] Player satisfaction with real-time responsiveness
- [ ] Reduced support tickets for timing issues
- [ ] Improved game completion rates
- [ ] Enhanced multiplayer experience quality

### Monitoring Dashboard KPIs
- Timer monitoring executions per hour
- Event broadcasting success/failure rates
- Average response times by function
- Database connection pool utilization
- PubNub message delivery rates

## 📋 Post-Deployment Activities (Days 9-14)

### Week 2: Optimization & Monitoring
1. **Performance Analysis**: Review production metrics and optimize
2. **User Feedback**: Collect and analyze player experience feedback
3. **System Tuning**: Adjust thresholds and configurations based on real usage
4. **Documentation Updates**: Update operational procedures and runbooks
5. **Team Training**: Conduct post-deployment training and knowledge transfer

### Continuous Improvement
- Weekly performance reviews
- Monthly security audits
- Quarterly load testing
- Bi-annual disaster recovery testing

## 🎯 Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 1: Complete Work | Days 1-2 | ✅ Production-ready functions, Test infrastructure |
| Phase 2: Staging | Days 3-5 | Staging deployment, Comprehensive testing |
| Phase 3: Monitoring | Day 6 | Monitoring setup, Alert configuration |
| Phase 4: Production | Days 7-8 | Production deployment, Gradual rollout |
| Phase 5: Optimization | Days 9-14 | Performance tuning, Documentation |

**Total Timeline**: 14 days (2 weeks)
**Critical Path**: Testing infrastructure → Staging validation → Production deployment
**Risk Buffer**: 2-3 days built into each phase for unexpected issues
