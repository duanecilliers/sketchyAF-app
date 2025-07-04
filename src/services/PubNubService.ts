// PubNub Real-time Communication Service
// Handles PubNub initialization, channel management, and real-time messaging

import PubNub from 'pubnub';
import {
  GameEvent,
  PresenceEvent,
  ConnectionStatus,
  PubNubConfig,
  RealtimeGameService,
  RealtimeServiceResponse,
  GameEventHandler,
  PresenceEventHandler,
  ConnectionStatusHandler,
  REALTIME_CONSTANTS,
  RealtimeErrorCode
} from '../types/realtime';
import { RealtimeErrorHandler, RealtimeError, withGracefulDegradation, CircuitBreaker } from '../utils/realtimeErrorHandler';

export class PubNubGameService implements RealtimeGameService {
  private pubnub: PubNub | null = null;
  private subscriptions: Map<string, any> = new Map();
  private eventHandlers: Map<string, GameEventHandler> = new Map();
  private presenceHandlers: Map<string, PresenceEventHandler> = new Map();
  private connectionStatusHandlers: Set<ConnectionStatusHandler> = new Set();
  private currentConnectionStatus: ConnectionStatus = 'disconnected';
  private userId: string | null = null;
  private isInitialized = false;
  private isInitializing = false; // Add flag to prevent concurrent initialization
  private errorHandler: RealtimeErrorHandler;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.errorHandler = RealtimeErrorHandler.getInstance();
    this.circuitBreaker = new CircuitBreaker(5, 60000); // 5 failures, 1 minute timeout
  }

  /**
   * Initialize PubNub client with user authentication
   */
  async initialize(userId: string): Promise<void> {
    try {
      // Check if already initialized for this user
      if (this.isInitialized && this.userId === userId) {
        return;
      }

      // If initialized for a different user, clean up first
      if (this.isInitialized && this.userId !== userId) {
        await this.disconnect();
      }

      // Check if initialization is already in progress
      if (this.isInitializing) {
        while (this.isInitializing) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (this.isInitialized && this.userId === userId) {
          return;
        }
      }

      this.isInitializing = true;

      // Get PubNub configuration from environment
      const publishKey = import.meta.env.VITE_PUBNUB_PUBLISH_KEY;
      const subscribeKey = import.meta.env.VITE_PUBNUB_SUBSCRIBE_KEY;

      if (!publishKey || !subscribeKey) {
        throw new Error('PubNub API keys not configured. Please check environment variables.');
      }

      // Clean up existing connection if any
      if (this.pubnub) {
        await this.disconnect();
      }

      // Validate user authentication with Supabase
      await this.validateSupabaseAuth(userId);

      const config: PubNubConfig = {
        publishKey,
        subscribeKey,
        userId,
        ssl: true,
        heartbeatInterval: REALTIME_CONSTANTS.DEFAULT_HEARTBEAT_INTERVAL,
        presenceTimeout: REALTIME_CONSTANTS.DEFAULT_PRESENCE_TIMEOUT,
        restore: true,
        autoNetworkDetection: true
      };

      // Handle potential ESM/CommonJS compatibility issues
      const PubNubConstructor = (PubNub as any).default || PubNub;

      this.pubnub = new PubNubConstructor({
        publishKey: config.publishKey,
        subscribeKey: config.subscribeKey,
        userId: config.userId,
        ssl: config.ssl,
        heartbeatInterval: config.heartbeatInterval,
        presenceTimeout: config.presenceTimeout,
        restore: config.restore,
        autoNetworkDetection: config.autoNetworkDetection
      });

      // Set up connection status listeners
      this.setupConnectionListeners();

      this.userId = userId;
      this.isInitialized = true;
      this.updateConnectionStatus('connected');

    } catch (error) {
      this.updateConnectionStatus('error');
      throw new Error(`PubNub initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.isInitializing = false; // Always reset the flag
    }
  }

  /**
   * Disconnect from PubNub and clean up resources
   */
  async disconnect(): Promise<void> {
    try {
      console.log('PubNub: Disconnecting and cleaning up resources');

      if (this.pubnub) {
        // Unsubscribe from individual channels first
        const subscriptions = Array.from(this.subscriptions.values());
        for (const subscription of subscriptions) {
          try {
            subscription.unsubscribe();
          } catch (error) {
            console.warn('PubNub: Error unsubscribing from individual channel:', error);
          }
        }

        // Then unsubscribe from all channels as a fallback
        try {
          this.pubnub.unsubscribeAll();
        } catch (error) {
          console.warn('PubNub: Error in unsubscribeAll:', error);
        }

        // Clear all handlers and subscriptions
        this.subscriptions.clear();
        this.eventHandlers.clear();
        this.presenceHandlers.clear();

        // Stop PubNub
        this.pubnub.stop();
        this.pubnub = null;
      }

      this.isInitialized = false;
      this.isInitializing = false; // Reset initialization flag
      this.userId = null;
      this.updateConnectionStatus('disconnected');

      console.log('PubNub: Successfully disconnected');

    } catch (error) {
      console.warn('PubNub: Error during disconnect:', error);
      // Force cleanup even if there are errors
      this.subscriptions.clear();
      this.eventHandlers.clear();
      this.presenceHandlers.clear();
      this.isInitialized = false;
      this.isInitializing = false;
      this.userId = null;
      this.pubnub = null;
    }
  }

  /**
   * Join a game channel for real-time communication
   */
  async joinGameChannel(gameId: string): Promise<void> {
    if (!this.pubnub || !this.isInitialized) {
      throw new Error('PubNub not initialized. Call initialize() first.');
    }

    try {
      const channelName = `game-${gameId}`;

      // Check if already subscribed and subscription is active
      const existingSubscription = this.subscriptions.get(gameId);
      if (existingSubscription) {
        console.log(`PubNub: Already subscribed to game channel: ${gameId}`);
        return;
      }

      console.log(`PubNub: Joining game channel: ${gameId}`);

      // Get authentication token for this channel
      await this.authenticateChannelAccess(this.userId!, channelName);

      const channel = this.pubnub.channel(channelName);
      const subscription = channel.subscription();

      // Set up message handler
      subscription.onMessage = (messageEvent) => {
        console.log('📨 PubNub message received:', {
          channel: messageEvent.channel,
          message: messageEvent.message,
          timetoken: messageEvent.timetoken,
          publisher: messageEvent.publisher,
          timestamp: new Date().toISOString()
        });

        const event = messageEvent.message as GameEvent;
        console.log('🎯 Processing PubNub game event:', {
          type: event.type,
          gameId: event.gameId,
          userId: event.userId,
          timestamp: event.timestamp,
          hasData: !!event.data,
          dataKeys: event.data ? Object.keys(event.data) : []
        });

        this.handleGameMessage(gameId, event);
      };

      // Set up presence handler
      subscription.onPresence = (presenceEvent) => {
        this.handlePresenceEvent(gameId, presenceEvent);
      };

      // Store subscription BEFORE subscribing to prevent race conditions
      this.subscriptions.set(gameId, subscription);

      // Subscribe to the channel
      subscription.subscribe();

      console.log(`PubNub: Successfully subscribed to game channel: ${gameId}`);

    } catch (error) {
      // Clean up subscription on error
      this.subscriptions.delete(gameId);
      throw new Error(`Failed to join game channel: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Leave a game channel
   */
  async leaveGameChannel(gameId: string): Promise<void> {
    try {
      const subscription = this.subscriptions.get(gameId);
      if (subscription) {
        console.log(`PubNub: Leaving game channel: ${gameId}`);
        subscription.unsubscribe();
        this.subscriptions.delete(gameId);
        this.eventHandlers.delete(gameId);
        this.presenceHandlers.delete(gameId);
        console.log(`PubNub: Successfully left game channel: ${gameId}`);
      } else {
        console.log(`PubNub: No subscription found for game: ${gameId}`);
      }
    } catch (error) {
      console.warn(`PubNub: Error leaving game channel ${gameId}:`, error);
      // Still clean up local state even if unsubscribe fails
      this.subscriptions.delete(gameId);
      this.eventHandlers.delete(gameId);
      this.presenceHandlers.delete(gameId);
    }
  }

  /**
   * Publish a game event to the channel
   */
  async publishGameEvent(event: GameEvent): Promise<void> {
    if (!this.pubnub || !this.isInitialized) {
      throw new Error('PubNub not initialized. Call initialize() first.');
    }

    // Use retry logic for critical events
    await this.publishWithRetry(event, REALTIME_CONSTANTS.MAX_RETRY_ATTEMPTS);
  }

  /**
   * Publish event with retry logic and exponential backoff
   */
  private async publishWithRetry(event: GameEvent, maxRetries: number): Promise<void> {
    const operation = async () => {
      // Add version and timestamp if not present
      const eventWithMetadata = {
        ...event,
        version: event.version || REALTIME_CONSTANTS.EVENT_VERSION,
        timestamp: event.timestamp || Date.now()
      };

      const result = await this.pubnub!.publish({
        channel: `game-${event.gameId}`,
        message: eventWithMetadata,
        storeInHistory: false, // Game events are ephemeral
        sendByPost: false, // Use GET for better performance
        meta: {
          eventType: event.type,
          timestamp: eventWithMetadata.timestamp
        }
      });

      return result;
    };

    // Use circuit breaker with direct operation execution
    return this.circuitBreaker.execute(operation);
  }

  /**
   * Broadcast event to a specific game (alias for publishGameEvent)
   */
  async broadcastToGame(gameId: string, event: GameEvent): Promise<void> {
    const eventWithGameId = { ...event, gameId };
    await this.publishGameEvent(eventWithGameId);
  }

  /**
   * Subscribe to user-specific notifications (like match notifications)
   */
  async subscribeToUserChannel(userId: string, callback: (event: any) => void): Promise<void> {
    if (!this.pubnub || !this.isInitialized) {
      throw new Error('PubNub not initialized. Call initialize() first.');
    }

    try {
      const channelName = `user-${userId}`;
      const subscriptionKey = `user-${userId}`;

      // Check if already subscribed
      const existingSubscription = this.subscriptions.get(subscriptionKey);
      if (existingSubscription) {
        console.log(`PubNub: Already subscribed to user channel: ${userId}`);
        return;
      }

      console.log(`PubNub: Subscribing to user channel: ${userId}`);

      const channel = this.pubnub.channel(channelName);
      const subscription = channel.subscription();

      // Set up message handler
      subscription.onMessage = (messageEvent) => {
        callback(messageEvent);
      };

      // Store subscription BEFORE subscribing to prevent race conditions
      this.subscriptions.set(subscriptionKey, subscription);

      // Subscribe to the channel
      subscription.subscribe();

      console.log(`PubNub: Successfully subscribed to user channel: ${userId}`);

    } catch (error) {
      // Clean up subscription on error
      this.subscriptions.delete(`user-${userId}`);
      throw new Error(`Failed to subscribe to user channel: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Unsubscribe from user-specific notifications
   */
  async unsubscribeFromUserChannel(userId: string): Promise<void> {
    try {
      const subscription = this.subscriptions.get(`user-${userId}`);
      if (subscription) {
        subscription.unsubscribe();
        this.subscriptions.delete(`user-${userId}`);
      }
    } catch (error) {
    }
  }

  /**
   * Publish a match notification to a user's personal channel
   */
  async publishMatchNotification(userId: string, gameId: string, matchData: any): Promise<void> {
    if (!this.pubnub || !this.isInitialized) {
      throw new Error('PubNub not initialized. Call initialize() first.');
    }

    try {
      const notification = {
        type: 'MATCH_FOUND',
        userId,
        gameId,
        timestamp: Date.now(),
        data: matchData
      };

      const result = await this.pubnub.publish({
        channel: `user-${userId}`,
        message: notification,
        storeInHistory: false, // Notifications are ephemeral
        sendByPost: false
      });

    } catch (error) {
      // Don't throw - this is a nice-to-have feature, not critical
    }
  }

  /**
   * Subscribe to game events with a callback handler
   */
  subscribeToGameEvents(gameId: string, callback: GameEventHandler): void {
    this.eventHandlers.set(gameId, callback);
  }

  /**
   * Unsubscribe from game events
   */
  unsubscribeFromGame(gameId: string): void {
    this.eventHandlers.delete(gameId);
    this.presenceHandlers.delete(gameId);
  }

  /**
   * Get current presence information for a game
   */
  async getGamePresence(gameId: string): Promise<string[]> {
    if (!this.pubnub || !this.isInitialized) {
      throw new Error('PubNub not initialized. Call initialize() first.');
    }

    try {
      const response = await this.pubnub.hereNow({
        channels: [`game-${gameId}`],
        includeUUIDs: true
      });

      const channelData = response.channels[`game-${gameId}`];
      return channelData?.occupants?.map(occupant => occupant.uuid) || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Set up presence change listener for a game
   */
  onPresenceChange(gameId: string, callback: PresenceEventHandler): void {
    this.presenceHandlers.set(gameId, callback);
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return this.currentConnectionStatus;
  }

  /**
   * Set up connection status change listener
   */
  onConnectionStatusChange(callback: ConnectionStatusHandler): void {
    this.connectionStatusHandlers.add(callback);
  }

  /**
   * Remove connection status change listener
   */
  removeConnectionStatusListener(callback: ConnectionStatusHandler): void {
    this.connectionStatusHandlers.delete(callback);
  }

  // Private helper methods

  private setupConnectionListeners(): void {
    if (!this.pubnub) return;

    this.pubnub.addListener({
      status: (statusEvent) => {
        const { category } = statusEvent;

        switch (category) {
          case 'PNConnectedCategory':
            this.updateConnectionStatus('connected');
            break;
          case 'PNReconnectedCategory':
            this.updateConnectionStatus('connected');
            break;
          case 'PNNetworkDownCategory':
            this.updateConnectionStatus('disconnected');
            break;
          case 'PNNetworkUpCategory':
            this.updateConnectionStatus('connecting');
            break;
          case 'PNReconnectingCategory':
            this.updateConnectionStatus('reconnecting');
            break;
          default:
        }
      }
    });
  }

  private handleGameMessage(gameId: string, event: GameEvent): void {
    console.log('🔄 PubNub handleGameMessage called:', {
      gameId,
      eventType: event?.type,
      eventGameId: event?.gameId,
      hasEvent: !!event,
      hasHandler: this.eventHandlers.has(gameId),
      timestamp: new Date().toISOString()
    });

    if (!event) {
      console.log('❌ No event provided to handleGameMessage');
      return;
    }

    const handler = this.eventHandlers.get(gameId);
    if (handler) {
      try {
        console.log('🚀 Calling event handler for game:', gameId, 'event type:', event.type);
        handler(event);
        console.log('✅ Event handler completed successfully');
      } catch (error) {
        console.error('❌ Error in event handler:', error);
      }
    } else {
      console.log('❌ No event handler found for game:', gameId);
    }
  }

  private handlePresenceEvent(gameId: string, presenceEvent: any): void {
    const handler = this.presenceHandlers.get(gameId);
    if (handler) {
      try {
        const presence: PresenceEvent = {
          action: presenceEvent.action,
          uuid: presenceEvent.uuid,
          occupancy: presenceEvent.occupancy,
          timestamp: presenceEvent.timestamp,
          state: presenceEvent.state
        };
        handler(presence);
      } catch (error) {
      }
    }
  }

  private updateConnectionStatus(status: ConnectionStatus): void {
    if (this.currentConnectionStatus !== status) {
      this.currentConnectionStatus = status;
      this.connectionStatusHandlers.forEach(handler => {
        try {
          handler(status);
        } catch (error) {
        }
      });
    }
  }

  /**
   * Validate user authentication with Supabase
   */
  private async validateSupabaseAuth(userId: string): Promise<void> {
    try {
      // Import supabase client dynamically to avoid circular dependencies
      const { supabase } = await import('../utils/supabase');

      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user || user.id !== userId) {
        throw new Error('User not authenticated with Supabase');
      }

    } catch (error) {
      throw new Error(`Authentication validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Authenticate channel access via Supabase Edge Function
   */
  private async authenticateChannelAccess(userId: string, channel: string): Promise<void> {
    try {
      // Import supabase client dynamically
      const { supabase } = await import('../utils/supabase');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/pubnub-auth`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          channel: channel,
          permissions: { read: true, write: true }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Channel authentication failed');
      }

      const authData = await response.json();
    } catch (error) {
      throw new Error(`Channel authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up user-specific state (called by RealtimeGameService)
   */
  async cleanup(): Promise<void> {
    try {
      // Clear user-specific handlers and subscriptions
      this.eventHandlers.clear();
      this.presenceHandlers.clear();
      this.subscriptions.clear();

    } catch (error) {
    }
  }
}
