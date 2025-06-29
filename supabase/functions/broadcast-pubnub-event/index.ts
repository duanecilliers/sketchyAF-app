// Supabase Edge Function for Broadcasting PubNub Events
// Handles database-triggered real-time event broadcasting via PubNub
// Production-ready with comprehensive error handling, logging, and monitoring

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

interface GameEvent {
  type: string;
  gameId: string;
  userId: string;
  timestamp: number;
  version: string;
  data: any;
}

interface PubNubPublishResponse {
  timetoken: string;
  error?: string;
}

interface BroadcastMetrics {
  requestId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  channels: string[];
  error?: string;
}

// Production configuration
const CONFIG = {
  MAX_PAYLOAD_SIZE: 32 * 1024, // 32KB limit for PubNub
  REQUEST_TIMEOUT: 10000, // 10 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second base delay
  LOG_LEVEL: Deno.env.get('LOG_LEVEL') || 'INFO'
};

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  // Initialize metrics
  const metrics: BroadcastMetrics = {
    requestId,
    startTime,
    success: false,
    channels: []
  };

  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    // Validate HTTP method
    if (req.method !== 'POST') {
      logError(requestId, 'Invalid HTTP method', { method: req.method });
      return createErrorResponse(405, 'Method not allowed', requestId);
    }

    // Parse and validate request body with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

    let gameEvent: GameEvent;
    try {
      const body = await req.text();
      clearTimeout(timeoutId);

      if (!body || body.trim() === '') {
        return createErrorResponse(400, 'Empty request body', requestId);
      }

      // Check payload size
      if (body.length > CONFIG.MAX_PAYLOAD_SIZE) {
        logError(requestId, 'Payload too large', { size: body.length, limit: CONFIG.MAX_PAYLOAD_SIZE });
        return createErrorResponse(413, 'Payload too large', requestId);
      }

      gameEvent = JSON.parse(body);
    } catch (parseError) {
      clearTimeout(timeoutId);
      logError(requestId, 'JSON parse error', parseError);
      return createErrorResponse(400, 'Invalid JSON payload', requestId);
    }

    // Validate required fields
    const validationError = validateGameEvent(gameEvent);
    if (validationError) {
      logError(requestId, 'Validation error', { error: validationError, event: gameEvent });
      return createErrorResponse(400, validationError, requestId);
    }

    // Get and validate PubNub configuration
    const pubNubConfig = getPubNubConfig();
    if (!pubNubConfig.isValid) {
      logError(requestId, 'PubNub configuration invalid', pubNubConfig.errors);
      return createErrorResponse(500, 'Service configuration error', requestId);
    }

    logInfo(requestId, 'Processing game event', {
      type: gameEvent.type,
      gameId: gameEvent.gameId,
      userId: gameEvent.userId
    });

    // Broadcast to channels with retry logic
    const broadcastResults = await broadcastWithRetry(
      pubNubConfig,
      gameEvent,
      requestId,
      metrics
    );

    // Update metrics
    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.success = broadcastResults.success;

    if (broadcastResults.success) {
      logInfo(requestId, 'Event broadcasted successfully', {
        type: gameEvent.type,
        gameId: gameEvent.gameId,
        userId: gameEvent.userId,
        channels: metrics.channels,
        duration: metrics.duration,
        results: broadcastResults.results
      });

      return new Response(
        JSON.stringify({
          success: true,
          requestId,
          duration: metrics.duration,
          channels: metrics.channels,
          results: broadcastResults.results
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    } else {
      logError(requestId, 'Broadcast failed', broadcastResults.error);
      return createErrorResponse(500, 'Broadcast failed', requestId, broadcastResults.error);
    }

  } catch (error) {
    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.error = error instanceof Error ? error.message : 'Unknown error';

    logError(requestId, 'Unexpected error in broadcast function', {
      error: metrics.error,
      duration: metrics.duration,
      stack: error instanceof Error ? error.stack : undefined
    });

    return createErrorResponse(500, 'Internal server error', requestId, metrics.error);
  }
})

// Helper functions for production-ready error handling and logging

function createErrorResponse(status: number, message: string, requestId: string, details?: string): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      requestId,
      details,
      timestamp: new Date().toISOString()
    }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

function logInfo(requestId: string, message: string, data?: any): void {
  if (CONFIG.LOG_LEVEL === 'DEBUG' || CONFIG.LOG_LEVEL === 'INFO') {
    console.log(`[${requestId}] ${message}`, data ? JSON.stringify(data) : '');
  }
}

function logError(requestId: string, message: string, data?: any): void {
  console.error(`[${requestId}] ERROR: ${message}`, data ? JSON.stringify(data) : '');
}

function logDebug(requestId: string, message: string, data?: any): void {
  if (CONFIG.LOG_LEVEL === 'DEBUG') {
    console.log(`[${requestId}] DEBUG: ${message}`, data ? JSON.stringify(data) : '');
  }
}

interface PubNubConfig {
  publishKey: string;
  subscribeKey: string;
  secretKey?: string;
  isValid: boolean;
  errors: string[];
}

function getPubNubConfig(): PubNubConfig {
  const publishKey = Deno.env.get('PUBNUB_PUBLISH_KEY');
  const subscribeKey = Deno.env.get('PUBNUB_SUBSCRIBE_KEY');
  const secretKey = Deno.env.get('PUBNUB_SECRET_KEY');

  const errors: string[] = [];

  if (!publishKey) errors.push('PUBNUB_PUBLISH_KEY missing');
  if (!subscribeKey) errors.push('PUBNUB_SUBSCRIBE_KEY missing');

  return {
    publishKey: publishKey || '',
    subscribeKey: subscribeKey || '',
    secretKey,
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Broadcast to multiple channels with retry logic and comprehensive error handling
 */
async function broadcastWithRetry(
  config: PubNubConfig,
  gameEvent: GameEvent,
  requestId: string,
  metrics: BroadcastMetrics
): Promise<{ success: boolean; results: any; error?: string }> {
  const channels = determineChannels(gameEvent);
  metrics.channels = channels;

  logDebug(requestId, 'Broadcasting to channels', { channels, eventType: gameEvent.type });

  const results: Record<string, any> = {};
  let hasErrors = false;
  let lastError = '';

  for (const channel of channels) {
    try {
      const result = await broadcastToPubNubWithRetry(
        config,
        channel,
        gameEvent,
        requestId
      );
      results[channel] = result;
      logDebug(requestId, `Successfully broadcast to ${channel}`, result);
    } catch (error) {
      hasErrors = true;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      lastError = errorMsg;
      results[channel] = { error: errorMsg };
      logError(requestId, `Failed to broadcast to ${channel}`, { error: errorMsg });
    }
  }

  return {
    success: !hasErrors,
    results,
    error: hasErrors ? lastError : undefined
  };
}

/**
 * Determine which channels to broadcast to based on event type
 */
function determineChannels(gameEvent: GameEvent): string[] {
  const channels: string[] = [];

  // Always broadcast to main game channel
  channels.push(`game-${gameEvent.gameId}`);

  // User-specific channel for certain events
  if (gameEvent.type === 'MATCH_FOUND' && gameEvent.userId && gameEvent.userId !== 'system') {
    channels.push(`user-${gameEvent.userId}`);
  }

  // Presence channel for presence-related events
  if (['player_joined', 'player_left', 'connection_status'].includes(gameEvent.type)) {
    channels.push(`presence-${gameEvent.gameId}`);
  }

  return channels;
}

/**
 * Broadcast event to PubNub channel with retry logic
 */
async function broadcastToPubNubWithRetry(
  config: PubNubConfig,
  channel: string,
  message: GameEvent,
  requestId: string
): Promise<PubNubPublishResponse> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= CONFIG.RETRY_ATTEMPTS; attempt++) {
    try {
      logDebug(requestId, `Broadcast attempt ${attempt}/${CONFIG.RETRY_ATTEMPTS}`, { channel });

      const result = await broadcastToPubNub(config, channel, message, requestId);

      if (attempt > 1) {
        logInfo(requestId, `Broadcast succeeded on attempt ${attempt}`, { channel });
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      logError(requestId, `Broadcast attempt ${attempt} failed`, {
        channel,
        error: lastError.message,
        willRetry: attempt < CONFIG.RETRY_ATTEMPTS
      });

      // Wait before retrying (exponential backoff)
      if (attempt < CONFIG.RETRY_ATTEMPTS) {
        const delay = CONFIG.RETRY_DELAY * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

/**
 * Core PubNub broadcast function with production-grade error handling
 */
async function broadcastToPubNub(
  config: PubNubConfig,
  channel: string,
  message: GameEvent,
  requestId: string
): Promise<PubNubPublishResponse> {
  try {
    // Prepare the message with metadata
    const messageWithMetadata = {
      ...message,
      timestamp: message.timestamp || Date.now(),
      version: message.version || '1.0.0',
      requestId // Add request ID for tracing
    };

    // Validate message size
    const messageJson = JSON.stringify(messageWithMetadata);
    if (messageJson.length > CONFIG.MAX_PAYLOAD_SIZE) {
      throw new Error(`Message too large: ${messageJson.length} bytes (limit: ${CONFIG.MAX_PAYLOAD_SIZE})`);
    }

    // Build PubNub publish URL - use POST for reliability with large payloads
    const timestamp = Math.floor(Date.now() / 1000);
    const uuid = `server-${requestId.slice(0, 8)}`;

    // Create signature if secret key is available
    let signature = '';
    if (config.secretKey) {
      const signatureString = `${config.subscribeKey}\n${config.publishKey}\n${channel}\n${messageJson}\n${timestamp}`;
      signature = await generateSignature(signatureString, config.secretKey);
    }

    const publishUrl = new URL(`https://ps.pndsn.com/publish/${config.publishKey}/${config.subscribeKey}/0/${channel}/0`);

    // Add query parameters
    publishUrl.searchParams.set('uuid', uuid);
    publishUrl.searchParams.set('timestamp', timestamp.toString());
    if (signature) {
      publishUrl.searchParams.set('signature', signature);
    }

    logDebug(requestId, 'Making PubNub request', {
      channel,
      url: publishUrl.toString(),
      messageSize: messageJson.length,
      hasSignature: !!signature
    });

    // Make the HTTP request to PubNub with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

    const response = await fetch(publishUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SketchyAF-Server/1.0'
      },
      body: messageJson,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PubNub API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();

    // PubNub returns [1, "Sent", "timetoken"] for success
    if (Array.isArray(result) && result[0] === 1) {
      return { timetoken: result[2] };
    } else {
      throw new Error(`PubNub publish failed: ${JSON.stringify(result)}`);
    }

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`PubNub request timeout after ${CONFIG.REQUEST_TIMEOUT}ms`);
    }
    throw error;
  }
}

/**
 * Generate HMAC-SHA256 signature for PubNub authentication
 */
async function generateSignature(message: string, secretKey: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const messageData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signatureArray = new Uint8Array(signature);

    // Convert to base64
    return btoa(String.fromCharCode(...signatureArray));
  } catch (error) {
    logError('signature', 'Failed to generate signature', error);
    return '';
  }
}

/**
 * Validate game event structure with comprehensive checks
 */
function validateGameEvent(event: any): string | null {
  if (!event || typeof event !== 'object') {
    return 'Event must be an object';
  }

  if (!event.type || typeof event.type !== 'string' || event.type.trim() === '') {
    return 'Event type is required and must be a non-empty string';
  }

  if (!event.gameId || typeof event.gameId !== 'string' || event.gameId.trim() === '') {
    return 'Game ID is required and must be a non-empty string';
  }

  if (!event.userId || typeof event.userId !== 'string' || event.userId.trim() === '') {
    return 'User ID is required and must be a non-empty string';
  }

  if (event.timestamp && typeof event.timestamp !== 'number') {
    return 'Timestamp must be a number if provided';
  }

  if (event.version && typeof event.version !== 'string') {
    return 'Version must be a string if provided';
  }

  if (event.data === undefined) {
    return 'Event data is required';
  }

  // Validate game ID format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(event.gameId)) {
    return 'Game ID must be a valid UUID';
  }

  return null; // No validation errors
}
