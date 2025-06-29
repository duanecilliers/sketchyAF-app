# Monitoring & Alerting Setup Guide

## 🎯 Overview

This guide provides step-by-step instructions for setting up comprehensive monitoring and alerting for the SketchyAF timer monitoring and real-time event broadcasting system.

## 📊 Supabase Monitoring Dashboard

### 1. Custom Metrics Collection

#### Edge Function Metrics
```typescript
// Add to each Edge Function for metrics collection
interface MetricsCollector {
  recordExecution(functionName: string, duration: number, success: boolean): void;
  recordError(functionName: string, error: string, context?: any): void;
  recordPerformance(functionName: string, metrics: Record<string, number>): void;
}

const metrics: MetricsCollector = {
  recordExecution: (functionName, duration, success) => {
    console.log(JSON.stringify({
      type: 'execution_metric',
      function: functionName,
      duration,
      success,
      timestamp: new Date().toISOString()
    }));
  },
  
  recordError: (functionName, error, context) => {
    console.error(JSON.stringify({
      type: 'error_metric',
      function: functionName,
      error,
      context,
      timestamp: new Date().toISOString()
    }));
  },
  
  recordPerformance: (functionName, performanceMetrics) => {
    console.log(JSON.stringify({
      type: 'performance_metric',
      function: functionName,
      metrics: performanceMetrics,
      timestamp: new Date().toISOString()
    }));
  }
};
```

#### Database Metrics Collection
```sql
-- Create metrics table for custom monitoring
CREATE TABLE IF NOT EXISTS monitoring_metrics (
  id BIGSERIAL PRIMARY KEY,
  metric_type TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  labels JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_monitoring_metrics_type_name_created 
ON monitoring_metrics(metric_type, metric_name, created_at);

-- Function to record metrics
CREATE OR REPLACE FUNCTION record_metric(
  p_type TEXT,
  p_name TEXT,
  p_value NUMERIC,
  p_labels JSONB DEFAULT '{}'
) RETURNS void AS $$
BEGIN
  INSERT INTO monitoring_metrics (metric_type, metric_name, metric_value, labels)
  VALUES (p_type, p_name, p_value, p_labels);
END;
$$ LANGUAGE plpgsql;
```

### 2. Dashboard Configuration

#### Supabase Dashboard Queries
```sql
-- Timer Monitoring Performance
SELECT 
  DATE_TRUNC('minute', created_at) as time_bucket,
  AVG(metric_value) as avg_execution_time,
  MAX(metric_value) as max_execution_time,
  COUNT(*) as execution_count
FROM monitoring_metrics 
WHERE metric_type = 'timer_monitoring' 
  AND metric_name = 'execution_time'
  AND created_at >= NOW() - INTERVAL '1 hour'
GROUP BY time_bucket
ORDER BY time_bucket;

-- Event Broadcasting Success Rate
SELECT 
  DATE_TRUNC('minute', created_at) as time_bucket,
  SUM(CASE WHEN labels->>'success' = 'true' THEN 1 ELSE 0 END) as successful_broadcasts,
  COUNT(*) as total_broadcasts,
  (SUM(CASE WHEN labels->>'success' = 'true' THEN 1 ELSE 0 END)::FLOAT / COUNT(*)) * 100 as success_rate
FROM monitoring_metrics 
WHERE metric_type = 'event_broadcasting'
  AND created_at >= NOW() - INTERVAL '1 hour'
GROUP BY time_bucket
ORDER BY time_bucket;

-- Database Trigger Performance
SELECT 
  DATE_TRUNC('minute', created_at) as time_bucket,
  AVG(metric_value) as avg_trigger_time,
  COUNT(*) as trigger_count
FROM monitoring_metrics 
WHERE metric_type = 'database_trigger' 
  AND metric_name = 'execution_time'
  AND created_at >= NOW() - INTERVAL '1 hour'
GROUP BY time_bucket
ORDER BY time_bucket;
```

## 🚨 Alert Configuration

### 1. Supabase Alert Rules

#### SQL-based Alert Queries
```sql
-- High Error Rate Alert (>5% in 5 minutes)
CREATE OR REPLACE FUNCTION check_error_rate()
RETURNS TABLE(alert_triggered BOOLEAN, error_rate NUMERIC, total_requests BIGINT) AS $$
DECLARE
  error_count BIGINT;
  total_count BIGINT;
  calculated_error_rate NUMERIC;
BEGIN
  -- Count errors in last 5 minutes
  SELECT COUNT(*) INTO error_count
  FROM monitoring_metrics 
  WHERE metric_type = 'error' 
    AND created_at >= NOW() - INTERVAL '5 minutes';
  
  -- Count total requests in last 5 minutes
  SELECT COUNT(*) INTO total_count
  FROM monitoring_metrics 
  WHERE metric_type IN ('execution', 'request')
    AND created_at >= NOW() - INTERVAL '5 minutes';
  
  -- Calculate error rate
  IF total_count > 0 THEN
    calculated_error_rate := (error_count::NUMERIC / total_count::NUMERIC);
  ELSE
    calculated_error_rate := 0;
  END IF;
  
  RETURN QUERY SELECT 
    calculated_error_rate > 0.05 as alert_triggered,
    calculated_error_rate as error_rate,
    total_count as total_requests;
END;
$$ LANGUAGE plpgsql;

-- Timer Monitoring Timeout Alert (>30 seconds)
CREATE OR REPLACE FUNCTION check_timer_monitoring_timeout()
RETURNS TABLE(alert_triggered BOOLEAN, max_execution_time NUMERIC, avg_execution_time NUMERIC) AS $$
DECLARE
  max_time NUMERIC;
  avg_time NUMERIC;
BEGIN
  SELECT 
    MAX(metric_value),
    AVG(metric_value)
  INTO max_time, avg_time
  FROM monitoring_metrics 
  WHERE metric_type = 'timer_monitoring' 
    AND metric_name = 'execution_time'
    AND created_at >= NOW() - INTERVAL '10 minutes';
  
  RETURN QUERY SELECT 
    COALESCE(max_time, 0) > 30000 as alert_triggered,
    COALESCE(max_time, 0) as max_execution_time,
    COALESCE(avg_time, 0) as avg_execution_time;
END;
$$ LANGUAGE plpgsql;
```

### 2. External Monitoring Integration

#### Webhook Alert Function
```typescript
// Edge Function for sending alerts to external systems
export const sendAlert = async (req: Request) => {
  const { alertType, severity, message, metrics } = await req.json();
  
  const alertPayload = {
    timestamp: new Date().toISOString(),
    service: 'sketchyaf-realtime',
    alertType,
    severity,
    message,
    metrics,
    environment: Deno.env.get('ENVIRONMENT') || 'unknown'
  };
  
  // Send to Slack
  if (Deno.env.get('SLACK_WEBHOOK_URL')) {
    await fetch(Deno.env.get('SLACK_WEBHOOK_URL')!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 ${severity.toUpperCase()}: ${message}`,
        attachments: [{
          color: severity === 'critical' ? 'danger' : 'warning',
          fields: [
            { title: 'Service', value: 'SketchyAF Real-time Events', short: true },
            { title: 'Environment', value: alertPayload.environment, short: true },
            { title: 'Alert Type', value: alertType, short: true },
            { title: 'Timestamp', value: alertPayload.timestamp, short: true }
          ]
        }]
      })
    });
  }
  
  // Send to email (using SendGrid or similar)
  if (Deno.env.get('EMAIL_ALERTS_ENABLED') === 'true') {
    // Implementation for email alerts
  }
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
```

### 3. Cron-based Alert Monitoring

#### Alert Monitoring Function
```typescript
// Edge Function to run every minute and check for alerts
export const monitorAlerts = async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  const alerts = [];
  
  // Check error rate
  const { data: errorRateCheck } = await supabase.rpc('check_error_rate');
  if (errorRateCheck?.[0]?.alert_triggered) {
    alerts.push({
      type: 'high_error_rate',
      severity: 'warning',
      message: `Error rate is ${(errorRateCheck[0].error_rate * 100).toFixed(2)}% (${errorRateCheck[0].total_requests} requests)`,
      metrics: errorRateCheck[0]
    });
  }
  
  // Check timer monitoring timeout
  const { data: timeoutCheck } = await supabase.rpc('check_timer_monitoring_timeout');
  if (timeoutCheck?.[0]?.alert_triggered) {
    alerts.push({
      type: 'timer_monitoring_timeout',
      severity: 'critical',
      message: `Timer monitoring execution time exceeded 30s (max: ${timeoutCheck[0].max_execution_time}ms)`,
      metrics: timeoutCheck[0]
    });
  }
  
  // Send alerts
  for (const alert of alerts) {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-alert`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(alert)
    });
  }
  
  return new Response(JSON.stringify({
    alertsTriggered: alerts.length,
    alerts: alerts.map(a => ({ type: a.type, severity: a.severity }))
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
```

## 📈 PubNub Monitoring

### 1. PubNub Admin Dashboard Setup

#### Key Metrics to Monitor
- **Message Delivery Rate**: Messages/second delivered successfully
- **Message Failures**: Failed message deliveries
- **Channel Activity**: Active channels and subscriber counts
- **Presence Events**: User join/leave events
- **API Response Times**: PubNub API latency

#### PubNub Monitoring Configuration
```javascript
// PubNub monitoring client
const pubnubMonitor = new PubNub({
  publishKey: 'your-publish-key',
  subscribeKey: 'your-subscribe-key',
  userId: 'monitoring-client'
});

// Monitor message delivery
pubnubMonitor.addListener({
  status: (statusEvent) => {
    if (statusEvent.category === 'PNNetworkIssuesCategory') {
      // Record network issues
      recordMetric('pubnub_network_issue', 1, {
        category: statusEvent.category,
        operation: statusEvent.operation
      });
    }
  },
  
  message: (messageEvent) => {
    // Record successful message delivery
    recordMetric('pubnub_message_delivered', 1, {
      channel: messageEvent.channel,
      timetoken: messageEvent.timetoken
    });
  }
});
```

### 2. Custom PubNub Metrics Collection

#### Message Delivery Tracking
```typescript
// Enhanced PubNub client with monitoring
class MonitoredPubNubClient {
  private pubnub: PubNub;
  private metrics: MetricsCollector;
  
  constructor(config: any, metrics: MetricsCollector) {
    this.pubnub = new PubNub(config);
    this.metrics = metrics;
  }
  
  async publish(channel: string, message: any): Promise<any> {
    const startTime = Date.now();
    
    try {
      const result = await this.pubnub.publish({
        channel,
        message
      });
      
      const duration = Date.now() - startTime;
      this.metrics.recordPerformance('pubnub_publish', {
        duration,
        channel_count: 1,
        message_size: JSON.stringify(message).length
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.recordError('pubnub_publish', error.message, {
        channel,
        duration
      });
      throw error;
    }
  }
}
```

## 🔍 Health Check Endpoints

### 1. System Health Check
```typescript
// Comprehensive health check Edge Function
export const healthCheck = async (req: Request) => {
  const checks = {
    database: await checkDatabaseHealth(),
    pubnub: await checkPubNubHealth(),
    edgeFunctions: await checkEdgeFunctionHealth(),
    timerMonitoring: await checkTimerMonitoringHealth()
  };
  
  const overallHealth = Object.values(checks).every(check => check.healthy);
  
  return new Response(JSON.stringify({
    status: overallHealth ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks,
    version: '2.0.0'
  }), {
    status: overallHealth ? 200 : 503,
    headers: { 'Content-Type': 'application/json' }
  });
};

async function checkDatabaseHealth() {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const startTime = Date.now();
    const { data, error } = await supabase.from('games').select('count').limit(1);
    const responseTime = Date.now() - startTime;
    
    return {
      healthy: !error,
      responseTime,
      error: error?.message
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}

async function checkPubNubHealth() {
  try {
    const startTime = Date.now();
    const response = await fetch('https://ps.pndsn.com/time/0');
    const responseTime = Date.now() - startTime;
    
    return {
      healthy: response.ok,
      responseTime,
      status: response.status
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}
```

## 📋 Deployment Checklist

### Pre-Production Setup
- [ ] Deploy monitoring Edge Functions
- [ ] Create monitoring database tables and functions
- [ ] Configure Supabase dashboard queries
- [ ] Set up external alert integrations (Slack, email)
- [ ] Configure PubNub monitoring dashboard
- [ ] Test all alert conditions
- [ ] Verify health check endpoints

### Production Configuration
- [ ] Set production alert thresholds
- [ ] Configure alert escalation procedures
- [ ] Set up monitoring data retention policies
- [ ] Configure backup monitoring systems
- [ ] Test incident response procedures
- [ ] Document monitoring runbooks

### Alert Thresholds (Production)
- **Error Rate**: > 5% in 5-minute window
- **Timer Monitoring**: > 30 seconds execution time
- **Event Broadcasting**: > 5 seconds latency
- **Database Response**: > 2 seconds query time
- **PubNub Delivery**: > 10% failure rate

### Monitoring Schedule
- **Real-time**: Error rates, performance metrics
- **Every minute**: Health checks, alert monitoring
- **Every 5 minutes**: Performance trend analysis
- **Every hour**: Capacity planning metrics
- **Daily**: Performance reports and optimization recommendations
