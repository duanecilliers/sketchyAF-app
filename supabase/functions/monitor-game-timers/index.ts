// supabase/functions/monitor-game-timers/index.ts
// Production-ready scheduled Edge Function to monitor and process expired game timers
// Runs every 10 seconds via Supabase Cron with comprehensive error handling and monitoring

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface MonitoringResult {
  processed: number;
  errors: number;
  skipped: number;
  executionTime: number;
  timestamp: string;
  requestId: string;
  environment: string;
  version: string;
  message?: string;
  error?: string;
  metrics?: {
    lockAcquisitionTime?: number;
    queryTime?: number;
    processingTime?: number;
    broadcastTime?: number;
  };
}

// Production configuration
const MONITOR_CONFIG = {
  VERSION: '2.0.0',
  MAX_EXECUTION_TIME: 50000, // 50 seconds (leave 10s buffer for 60s timeout)
  MAX_GAMES_PER_EXECUTION: 50,
  CONCURRENCY_LIMIT: 5,
  GRACE_PERIOD_SECONDS: 15,
  LOCK_TIMEOUT_SECONDS: 60,
  LOG_LEVEL: Deno.env.get('LOG_LEVEL') || 'INFO'
};

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  let processed = 0;
  let errors = 0;
  let skipped = 0;

  // Performance metrics
  const metrics = {
    lockAcquisitionTime: 0,
    queryTime: 0,
    processingTime: 0,
    broadcastTime: 0
  };

  // Determine environment
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const environment = determineEnvironment(supabaseUrl);

  try {
    logInfo(requestId, 'Timer monitoring started', {
      environment,
      version: MONITOR_CONFIG.VERSION,
      maxExecutionTime: MONITOR_CONFIG.MAX_EXECUTION_TIME,
      maxGames: MONITOR_CONFIG.MAX_GAMES_PER_EXECUTION
    });

    // Validate this is a scheduled execution (enhanced security)
    const authResult = validateCronAuthentication(req, requestId);
    if (!authResult.isValid) {
      return createErrorResponse(401, authResult.error, requestId, environment);
    }

    // Check execution timeout early
    if (Date.now() - startTime > MONITOR_CONFIG.MAX_EXECUTION_TIME) {
      logError(requestId, 'Execution timeout during initialization');
      return createErrorResponse(408, 'Execution timeout', requestId, environment);
    }

    // Initialize Supabase client with enhanced error handling
    const supabaseConfig = getSupabaseConfig();
    if (!supabaseConfig.isValid) {
      logError(requestId, 'Supabase configuration invalid', supabaseConfig.errors);
      return createErrorResponse(500, 'Service configuration error', requestId, environment);
    }

    const supabase = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey);

    // Enhanced advisory locking for production with timeout monitoring
    const lockKey = 'timer_monitoring_lock';
    let lockAcquired = false;
    const lockStartTime = Date.now();

    logInfo(requestId, 'Starting advisory lock acquisition', {
      environment,
      lockKey,
      timeout: MONITOR_CONFIG.LOCK_TIMEOUT_SECONDS
    });

    if (environment === 'production') {
      try {
        // Production: Use enhanced advisory locking with cleanup
        const lockResult = await acquireProductionLock(supabase, lockKey, requestId);

        if (!lockResult.acquired) {
          metrics.lockAcquisitionTime = Date.now() - lockStartTime;
          logInfo(requestId, 'Lock acquisition failed', {
            reason: lockResult.reason,
            lockTime: metrics.lockAcquisitionTime
          });

          return createSuccessResponse({
            processed: 0,
            errors: 0,
            skipped: 1,
            executionTime: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            requestId,
            environment,
            version: MONITOR_CONFIG.VERSION,
            message: lockResult.reason,
            metrics: { lockAcquisitionTime: metrics.lockAcquisitionTime }
          });
        }

        lockAcquired = true;
        metrics.lockAcquisitionTime = Date.now() - lockStartTime;
        logInfo(requestId, 'Production advisory lock acquired', {
          lockTime: metrics.lockAcquisitionTime
        });

      } catch (lockError) {
        metrics.lockAcquisitionTime = Date.now() - lockStartTime;
        logError(requestId, 'Lock acquisition failed with error', {
          error: lockError instanceof Error ? lockError.message : 'Unknown error',
          lockTime: metrics.lockAcquisitionTime
        });

        return createErrorResponse(500, 'Failed to acquire advisory lock', requestId, environment);
      }
    } else {
      // Development: Skip locking but log for consistency
      metrics.lockAcquisitionTime = Date.now() - lockStartTime;
      logInfo(requestId, 'Development environment - skipping advisory lock', {
        lockTime: metrics.lockAcquisitionTime
      });
    }

    try {
      // Check execution timeout before starting main processing
      if (Date.now() - startTime > MONITOR_CONFIG.MAX_EXECUTION_TIME) {
        logError(requestId, 'Execution timeout before processing');
        return createErrorResponse(408, 'Execution timeout', requestId, environment);
      }

      // Find expired games with timeout monitoring
      const queryStartTime = Date.now();
      logInfo(requestId, 'Querying expired games', {
        limit: MONITOR_CONFIG.MAX_GAMES_PER_EXECUTION
      });

      const { data: expiredGames, error: queryError } = await supabase
        .rpc('find_expired_games', { limit_count: MONITOR_CONFIG.MAX_GAMES_PER_EXECUTION });

      metrics.queryTime = Date.now() - queryStartTime;

      if (queryError) {
        logError(requestId, 'Database query failed', {
          error: queryError.message,
          queryTime: metrics.queryTime
        });
        errors++;

        return createErrorResponse(500, 'Database query failed', requestId, environment, {
          queryTime: metrics.queryTime,
          error: queryError.message
        });
      }

      const gameCount = expiredGames?.length || 0;
      logInfo(requestId, 'Expired games query completed', {
        gameCount,
        queryTime: metrics.queryTime
      });

      if (gameCount === 0) {
        return createSuccessResponse({
          processed: 0,
          errors: 0,
          skipped: 0,
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          requestId,
          environment,
          version: MONITOR_CONFIG.VERSION,
          message: 'No expired games found',
          metrics: {
            lockAcquisitionTime: metrics.lockAcquisitionTime,
            queryTime: metrics.queryTime,
            processingTime: 0,
            broadcastTime: 0
          }
        });
      }

      // Process expired games in parallel with concurrency limit
      const concurrencyLimit = 5;
      const gameChunks = [];

      for (let i = 0; i < expiredGames.length; i += concurrencyLimit) {
        gameChunks.push(expiredGames.slice(i, i + concurrencyLimit));
      }

      for (const chunk of gameChunks) {
        const promises = chunk.map(async (game) => {
          try {
            const executionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            console.log(`Processing expired game ${game.game_id}: ${game.current_status}`, { executionId });

            // Handle timer expiration directly in this function to avoid auth issues
            const nextPhaseMap: Record<string, string> = {
              'briefing': 'drawing',
              'drawing': 'voting',
              'voting': 'completed'
            };

            const nextStatus = nextPhaseMap[game.current_status];
            if (!nextStatus) {
              console.log(`No valid next phase for ${game.current_status}, skipping game ${game.game_id}`);
              skipped++;
              return;
            }

            console.log(`Next phase for ${game.current_status} is ${nextStatus} for game ${game.game_id}`);

            // Special handling for drawing -> voting transition with grace period
            if (game.current_status === 'drawing' && nextStatus === 'voting') {
              const graceResult = await handleDrawingPhaseGracePeriod(supabase, game.game_id, executionId);
              if (graceResult.shouldSkip) {
                console.log(`Game ${game.game_id} transition skipped: ${graceResult.reason}`);
                skipped++;
                return;
              }
              if (graceResult.shouldDelay) {
                console.log(`Game ${game.game_id} transition delayed: ${graceResult.reason}`);
                skipped++;
                return;
              }
            }

            // Verify game still exists and is in expected state
            const { data: gameCheck, error: gameError } = await supabase
              .from('games')
              .select('id, status, phase_expires_at')
              .eq('id', game.game_id)
              .single();

            if (gameError || !gameCheck) {
              console.log(`Game ${game.game_id} not found or inaccessible, skipping`);
              skipped++;
              return;
            }

            // Check if game status has already changed (race condition)
            if (gameCheck.status !== game.current_status) {
              console.log(`Game ${game.game_id} status already changed from ${game.current_status} to ${gameCheck.status}, skipping`);
              skipped++;
              return;
            }

            console.log(`Game ${game.game_id} status confirmed: ${gameCheck.status}, proceeding with transition`);

            // Double-check timer hasn't been extended
            if (gameCheck.phase_expires_at) {
              const expiresAt = new Date(gameCheck.phase_expires_at);
              const now = new Date();
              console.log(`Game ${game.game_id} timer check: expires at ${expiresAt.toISOString()}, now is ${now.toISOString()}`);
              if (expiresAt > now) {
                console.log(`Game ${game.game_id} timer was extended, skipping expiration`);
                skipped++;
                return;
              }
            }

            // Trigger phase transition using database function
            const { error: transitionError } = await supabase.rpc('transition_game_status', {
              game_uuid: game.game_id,
              new_status: nextStatus
            });

            if (transitionError) {
              console.error(`Timer expiration transition failed for game ${game.game_id}:`, transitionError);
              errors++;
              return;
            }

            console.log(`Successfully transitioned game ${game.game_id} from ${game.current_status} to ${nextStatus}`);
            processed++;

            // Fetch the updated game object with all related data for broadcasting
            try {
              const { data: updatedGame, error: fetchError } = await supabase
                .from('games')
                // .select(`
                //   *,
                //   game_participants(
                //     user_id,
                //     joined_at,
                //     users(username, avatar_url)
                //   ),
                //   submissions(
                //     id,
                //     user_id,
                //     drawing_url,
                //     drawing_thumbnail_url,
                //     submitted_at,
                //     canvas_width,
                //     canvas_height,
                //     element_count,
                //     drawing_time_seconds
                //   )
                // `)
                .select(`*`)
                .eq('id', game.game_id)
                .single();

              if (fetchError) {
                console.warn(`Failed to fetch updated game data for ${game.game_id}:`, fetchError);
                // Fallback to minimal broadcast
                await broadcastPhaseChangeEvent(game.game_id, game.current_status, nextStatus, executionId);
              } else {
                // Broadcast with full game object
                await broadcastPhaseChangeEventWithGame(game.game_id, game.current_status, nextStatus, updatedGame, executionId);
                console.log(`Successfully broadcasted phase change event with game object for ${game.game_id}: ${game.current_status} → ${nextStatus}`);
              }
            } catch (broadcastError) {
              console.warn(`Failed to broadcast phase change event for game ${game.game_id}:`, broadcastError);
              // Don't increment errors for broadcast failures
            }

          } catch (error) {
            console.error(`Exception processing game ${game.game_id}:`, error);
            errors++;
          }
        });

        // Wait for current chunk to complete before processing next
        await Promise.allSettled(promises);
      }

    } finally {
      // Always release the advisory lock if it was acquired
      if (lockAcquired) {
        console.log('Releasing enhanced advisory lock');
        try {
          await supabase.rpc('release_advisory_lock_enhanced', { p_lock_key: lockKey });
          console.log('Enhanced advisory lock released successfully');
        } catch (releaseError) {
          console.error('Failed to release enhanced advisory lock:', releaseError);
          // Don't throw here as it would mask the original error
        }
      }
    }

    const result: MonitoringResult = {
      processed,
      errors,
      skipped,
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

    console.log('Timer monitoring completed:', result);

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Unexpected error in timer monitoring:', error);
    return new Response(
      JSON.stringify({
        processed,
        errors: errors + 1,
        skipped,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

/**
 * Broadcast phase change event directly to PubNub
 *
 * Note: This sends minimal event data since Supabase realtime automatically
 * provides the full game state to clients when the database is updated.
 * PubNub events are used for immediate notifications only.
 */
async function broadcastPhaseChangeEvent(
  gameId: string,
  previousPhase: string,
  newPhase: string,
  executionId: string
): Promise<void> {
  console.log(`🔔 [${executionId}] Starting PubNub broadcast for game ${gameId}: ${previousPhase} → ${newPhase}`);

  const publishKey = Deno.env.get('PUBNUB_PUBLISH_KEY');
  const subscribeKey = Deno.env.get('PUBNUB_SUBSCRIBE_KEY');
  const secretKey = Deno.env.get('PUBNUB_SECRET_KEY');

  console.log(`🔑 [${executionId}] PubNub config check:`, {
    hasPublishKey: !!publishKey,
    hasSubscribeKey: !!subscribeKey,
    hasSecretKey: !!secretKey,
    publishKeyPrefix: publishKey?.substring(0, 10) + '...',
    subscribeKeyPrefix: subscribeKey?.substring(0, 10) + '...',
    secretKeyPrefix: secretKey?.substring(0, 10) + '...'
  });

  if (!publishKey || !subscribeKey) {
    throw new Error('PubNub configuration missing');
  }

  const gameEvent = {
    type: 'phase_changed',
    gameId,
    userId: 'server',
    timestamp: Date.now(),
    version: '1.0.0',
    data: {
      newPhase,
      previousPhase,
      phaseStartedAt: new Date().toISOString(),
      transitionTriggeredBy: 'server_timer',
      executionId
    }
  };

  console.log(`📦 [${executionId}] Game event payload:`, JSON.stringify(gameEvent, null, 2));

  // Build PubNub publish URL
  const timestamp = Math.floor(Date.now() / 1000);
  const uuid = 'server-monitor';
  const channel = `game-${gameId}`;

  console.log(`📡 [${executionId}] Publishing to channel: ${channel}`);

  // Use POST method to avoid URL length limits
  const publishUrl = new URL(`https://ps.pndsn.com/publish/${publishKey}/${subscribeKey}/0/${channel}/0`);

  // Add query parameters
  publishUrl.searchParams.set('uuid', uuid);
  publishUrl.searchParams.set('timestamp', timestamp.toString());
  // Note: Signature authentication is more complex for POST requests
  // For now, we'll rely on the publish/subscribe keys for authentication

  console.log(`🌐 [${executionId}] PubNub URL: ${publishUrl.toString()}`);
  console.log(`📦 [${executionId}] Payload size: ${JSON.stringify(gameEvent).length} characters`);

  // Make the HTTP request to PubNub using POST
  console.log(`🚀 [${executionId}] Making HTTP request to PubNub...`);

  const response = await fetch(publishUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(gameEvent)
  });

  console.log(`📥 [${executionId}] PubNub response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ [${executionId}] PubNub API error response:`, errorText);
    throw new Error(`PubNub API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();
  console.log(`📊 [${executionId}] PubNub response result:`, JSON.stringify(result));

  // PubNub returns [1, "Sent", "timetoken"] for success
  if (!Array.isArray(result) || result[0] !== 1) {
    console.error(`❌ [${executionId}] PubNub publish failed with result:`, result);
    throw new Error(`PubNub publish failed: ${JSON.stringify(result)}`);
  }

  console.log(`✅ [${executionId}] PubNub event published successfully to ${channel}:`, {
    timetoken: result[2],
    status: result[1],
    eventType: gameEvent.type,
    transition: `${previousPhase} → ${newPhase}`
  });
}



/**
 * Broadcast phase change event with full game object
 * This version includes the complete game data in the event for better client-side handling
 */
async function broadcastPhaseChangeEventWithGame(
  gameId: string,
  previousPhase: string,
  newPhase: string,
  gameObject: Record<string, any>, // Game object with participants and submissions
  executionId: string
): Promise<void> {
  console.log(`🔔 [${executionId}] Starting PubNub broadcast with game object for ${gameId}: ${previousPhase} → ${newPhase}`);

  const publishKey = Deno.env.get('PUBNUB_PUBLISH_KEY');
  const subscribeKey = Deno.env.get('PUBNUB_SUBSCRIBE_KEY');

  if (!publishKey || !subscribeKey) {
    throw new Error('PubNub configuration missing');
  }

  console.log(`📡 [${executionId}] PubNub config loaded - Publish Key: ${publishKey.substring(0, 8)}...`);

  // Build the game event with full game object
  const gameEvent = {
    type: 'phase_changed',
    gameId,
    transition: `${previousPhase} → ${newPhase}`,
    gameStatus: newPhase,
    timestamp: new Date().toISOString(),
    data: {
      previousPhase,
      newPhase,
      game: gameObject, // Include full game object
      phaseStartedAt: new Date().toISOString(),
      transitionTriggeredBy: 'server_timer',
      executionId
    }
  };

  console.log(`📦 [${executionId}] Game event with full object:`, {
    type: gameEvent.type,
    gameId: gameEvent.gameId,
    transition: gameEvent.transition,
    gameStatus: gameEvent.gameStatus,
    hasGameObject: !!gameEvent.data.game
  });

  // Build PubNub publish URL
  const timestamp = Math.floor(Date.now() / 1000);
  const uuid = 'server-monitor';
  const channel = `game-${gameId}`;

  console.log(`📡 [${executionId}] Publishing to channel: ${channel}`);

  // Use POST method for large payloads to avoid URL length limits
  const publishUrl = new URL(`https://ps.pndsn.com/publish/${publishKey}/${subscribeKey}/0/${channel}/0`);

  publishUrl.searchParams.set('uuid', uuid);
  publishUrl.searchParams.set('timestamp', timestamp.toString());
  // Note: Signature authentication is more complex for POST requests
  // For now, we'll rely on the publish/subscribe keys for authentication

  console.log(`🌐 [${executionId}] PubNub URL: ${publishUrl.toString()}`);
  console.log(`📦 [${executionId}] Payload size: ${JSON.stringify(gameEvent).length} characters`);

  // Make the HTTP request to PubNub using POST for large payloads
  const response = await fetch(publishUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(gameEvent)
  });

  console.log(`📥 [${executionId}] PubNub response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ [${executionId}] PubNub API error response:`, errorText);
    throw new Error(`PubNub API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();
  console.log(`📊 [${executionId}] PubNub response result:`, JSON.stringify(result));

  // PubNub returns [1, "Sent", "timetoken"] for success
  if (!Array.isArray(result) || result[0] !== 1) {
    console.error(`❌ [${executionId}] PubNub publish failed with result:`, result);
    throw new Error(`PubNub publish failed: ${JSON.stringify(result)}`);
  }

  console.log(`✅ [${executionId}] Successfully broadcast phase change event with game object for ${gameId}`);
}

/**
 * Handle grace period for drawing phase transitions
 * Implements logic to wait for auto-submissions before transitioning to voting
 */
async function handleDrawingPhaseGracePeriod(
  supabase: ReturnType<typeof createClient>,
  gameId: string,
  executionId: string
): Promise<{ shouldSkip: boolean; shouldDelay: boolean; reason: string }> {
  console.log(`🎯 [${executionId}] Checking drawing phase grace period for game ${gameId}`);

  // Get game participants and submissions
  const { data: gameData, error: gameError } = await supabase
    .from('games')
    .select(`
      id,
      status,
      phase_expires_at,
      current_players,
      game_participants(user_id),
      submissions(id, user_id, submitted_at)
    `)
    .eq('id', gameId)
    .single();

  if (gameError || !gameData) {
    console.log(`❌ [${executionId}] Failed to fetch game data: ${gameError?.message}`);
    return { shouldSkip: true, shouldDelay: false, reason: 'Failed to fetch game data' };
  }

  const participantCount = gameData.game_participants?.length || 0;
  const submissionCount = gameData.submissions?.length || 0;
  const allSubmitted = submissionCount >= participantCount;

  console.log(`📊 [${executionId}] Submission status: ${submissionCount}/${participantCount} submitted`);

  // If all players have submitted, proceed immediately
  if (allSubmitted) {
    console.log(`✅ [${executionId}] All players submitted, proceeding with transition`);
    return { shouldSkip: false, shouldDelay: false, reason: 'All submissions complete' };
  }

  // Check if we're already in grace period
  const graceKey = `drawing_grace_${gameId}`;
  const { data: graceData, error: graceError } = await supabase
    .from('game_metadata')
    .select('value')
    .eq('game_id', gameId)
    .eq('key', graceKey)
    .single();

  const now = new Date();
  const gracePeriodSeconds = 15; // 15 second grace period

  if (graceError && graceError.code !== 'PGRST116') { // PGRST116 = not found
    console.log(`❌ [${executionId}] Error checking grace period: ${graceError.message}`);
    return { shouldSkip: true, shouldDelay: false, reason: 'Grace period check failed' };
  }

  if (!graceData) {
    // Start grace period
    const graceStartTime = now.toISOString();
    console.log(`⏰ [${executionId}] Starting ${gracePeriodSeconds}s grace period for auto-submissions`);

    const { error: insertError } = await supabase
      .from('game_metadata')
      .insert({
        game_id: gameId,
        key: graceKey,
        value: graceStartTime
      });

    if (insertError) {
      console.log(`❌ [${executionId}] Failed to start grace period: ${insertError.message}`);
      return { shouldSkip: true, shouldDelay: false, reason: 'Failed to start grace period' };
    }

    // Extend the phase timer by grace period
    const newExpiresAt = new Date(now.getTime() + gracePeriodSeconds * 1000);
    const { error: updateError } = await supabase
      .from('games')
      .update({ phase_expires_at: newExpiresAt.toISOString() })
      .eq('id', gameId);

    if (updateError) {
      console.log(`⚠️ [${executionId}] Failed to extend timer: ${updateError.message}`);
    }

    return { shouldSkip: false, shouldDelay: true, reason: 'Grace period started' };
  }

  // Check if grace period has expired
  const graceStartTime = new Date(graceData.value);
  const graceEndTime = new Date(graceStartTime.getTime() + gracePeriodSeconds * 1000);
  const graceExpired = now >= graceEndTime;

  console.log(`⏱️ [${executionId}] Grace period: started ${graceStartTime.toISOString()}, expires ${graceEndTime.toISOString()}, expired: ${graceExpired}`);

  if (!graceExpired) {
    console.log(`⏳ [${executionId}] Grace period still active, delaying transition`);
    return { shouldSkip: false, shouldDelay: true, reason: 'Grace period still active' };
  }

  // Grace period expired, clean up and proceed
  console.log(`⏰ [${executionId}] Grace period expired, proceeding with transition`);

  // Clean up grace period metadata
  await supabase
    .from('game_metadata')
    .delete()
    .eq('game_id', gameId)
    .eq('key', graceKey);

  return { shouldSkip: false, shouldDelay: false, reason: 'Grace period expired' };
}

// Production helper functions for enhanced monitoring and error handling

function determineEnvironment(supabaseUrl: string): string {
  if (supabaseUrl.includes('127.0.0.1') ||
      supabaseUrl.includes('localhost') ||
      supabaseUrl.includes('kong:8000') ||
      supabaseUrl.includes('supabase_kong_site')) {
    return 'development';
  }
  return 'production';
}

function validateCronAuthentication(req: Request, requestId: string): { isValid: boolean; error?: string } {
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');

  logDebug(requestId, 'Validating cron authentication', {
    hasReceivedSecret: !!cronSecret,
    hasExpectedSecret: !!expectedSecret
  });

  if (!cronSecret || !expectedSecret) {
    return {
      isValid: false,
      error: 'Missing cron authentication credentials'
    };
  }

  if (cronSecret !== expectedSecret) {
    return {
      isValid: false,
      error: 'Invalid cron authentication'
    };
  }

  return { isValid: true };
}

interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
  isValid: boolean;
  errors: string[];
}

function getSupabaseConfig(): SupabaseConfig {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  const errors: string[] = [];

  if (!url) errors.push('SUPABASE_URL missing');
  if (!serviceRoleKey) errors.push('SUPABASE_SERVICE_ROLE_KEY missing');

  return {
    url: url || '',
    serviceRoleKey: serviceRoleKey || '',
    isValid: errors.length === 0,
    errors
  };
}

async function acquireProductionLock(
  supabase: ReturnType<typeof createClient>,
  lockKey: string,
  requestId: string
): Promise<{ acquired: boolean; reason: string }> {
  try {
    // First, clean up any stuck locks
    logDebug(requestId, 'Cleaning up stuck advisory locks');

    const { data: cleanupCount } = await supabase.rpc('cleanup_stuck_advisory_locks');
    if (cleanupCount && cleanupCount > 0) {
      logInfo(requestId, 'Cleaned up stuck advisory locks', { count: cleanupCount });
    }

    // Try to acquire the lock with enhanced function
    logDebug(requestId, 'Attempting to acquire advisory lock', {
      lockKey,
      timeout: MONITOR_CONFIG.LOCK_TIMEOUT_SECONDS
    });

    const { data: lockResult, error: lockError } = await supabase.rpc('acquire_advisory_lock_enhanced', {
      p_lock_key: lockKey,
      p_timeout_seconds: MONITOR_CONFIG.LOCK_TIMEOUT_SECONDS,
      p_acquired_by: `monitor-game-timers-${requestId.slice(0, 8)}`
    });

    if (lockError) {
      logError(requestId, 'Advisory lock RPC error', lockError);
      throw new Error(`Lock RPC failed: ${lockError.message}`);
    }

    if (!lockResult) {
      return {
        acquired: false,
        reason: 'Timer monitoring already in progress'
      };
    }

    return {
      acquired: true,
      reason: 'Lock acquired successfully'
    };

  } catch (error) {
    logError(requestId, 'Lock acquisition exception', error);
    throw error;
  }
}

function createErrorResponse(
  status: number,
  message: string,
  requestId: string,
  environment: string,
  additionalData?: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      requestId,
      environment,
      version: MONITOR_CONFIG.VERSION,
      timestamp: new Date().toISOString(),
      ...additionalData
    }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

function createSuccessResponse(data: MonitoringResult): Response {
  return new Response(
    JSON.stringify(data),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

function logInfo(requestId: string, message: string, data?: unknown): void {
  if (MONITOR_CONFIG.LOG_LEVEL === 'DEBUG' || MONITOR_CONFIG.LOG_LEVEL === 'INFO') {
    console.log(`[${requestId}] ${message}`, data ? JSON.stringify(data) : '');
  }
}

function logError(requestId: string, message: string, data?: unknown): void {
  console.error(`[${requestId}] ERROR: ${message}`, data ? JSON.stringify(data) : '');
}

function logDebug(requestId: string, message: string, data?: unknown): void {
  if (MONITOR_CONFIG.LOG_LEVEL === 'DEBUG') {
    console.log(`[${requestId}] DEBUG: ${message}`, data ? JSON.stringify(data) : '');
  }
}
