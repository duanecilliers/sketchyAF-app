import React, { createContext, useContext, useReducer, useEffect, useCallback, useState } from 'react';
import { useAuth } from './AuthContext';
import { useRealtimeGame } from '../hooks/useRealtimeGame';
import { GameService } from '../services/GameService';
import { SubmissionService } from '../services/SubmissionService';
import { VotingService } from '../services/VotingService';
import { 
  GameState, 
  GameActions, 
  GameContextType, 
  GameStateEvent, 
  GamePhase,
  PlayerStatus,
  GAME_STATE_CONSTANTS,
  PHASE_TRANSITIONS,
  initialGameState,
  mapStatusToPhase,
  determinePlayerStatus
} from '../types/game-state';
import { 
  Game, 
  GameParticipant, 
  Submission, 
  Vote, 
  GameResults,
  ServiceResponse
} from '../types/game';
import { 
  GameEvent, 
  GameEventType,
  PresenceEvent,
  ConnectionStatus
} from '../types/realtime';

// Create the context
const GameContext = createContext<GameContextType | undefined>(undefined);

// Game state reducer
function gameStateReducer(state: GameState, event: GameStateEvent): GameState {
  switch (event.type) {
    case 'GAME_CREATED':
      return {
        ...state,
        currentGame: event.game,
        gamePhase: mapStatusToPhase(event.game.status),
        isInGame: true,
        playerStatus: PlayerStatus.WAITING,
        isReady: false,
        selectedBoosterPack: null,
        hasSubmitted: false,
        hasVoted: false,
        participants: [],
        submissions: [],
        votes: [],
        results: null,
        phaseStartTime: Date.now(),
        phaseEndTime: null,
        phaseTimeRemaining: null,
        error: null
      };
      
    case 'GAME_JOINED':
      return {
        ...state,
        currentGame: event.game,
        gamePhase: mapStatusToPhase(event.game.status),
        isInGame: true,
        playerStatus: determinePlayerStatus({
          ...state,
          isInGame: true,
          currentGame: event.game,
          gamePhase: mapStatusToPhase(event.game.status)
        }),
        participants: event.participants,
        error: null
      };
      
    case 'GAME_LEFT':
      return {
        ...initialGameState,
        connectionStatus: state.connectionStatus
      };
      
    case 'PLAYER_READY_CHANGED':
      return {
        ...state,
        isReady: event.isReady,
        playerStatus: event.isReady ? PlayerStatus.READY : PlayerStatus.WAITING
      };
      
    case 'BOOSTER_PACK_SELECTED':
      return {
        ...state,
        selectedBoosterPack: event.packId
      };
      
    case 'GAME_PHASE_CHANGED':
      return {
        ...state,
        gamePhase: event.phase,
        phaseStartTime: event.startTime || Date.now(),
        phaseEndTime: event.endTime || null,
        phaseTimeRemaining: event.endTime ? event.endTime - Date.now() : null,
        playerStatus: determinePlayerStatus({
          ...state,
          gamePhase: event.phase
        })
      };
      
    case 'PARTICIPANTS_UPDATED':
      return {
        ...state,
        participants: event.participants
      };
      
    case 'DRAWING_SUBMITTED':
      const newSubmissions = [...state.submissions];
      const existingIndex = newSubmissions.findIndex(s => s.id === event.submission.id);
      
      if (existingIndex >= 0) {
        newSubmissions[existingIndex] = event.submission;
      } else {
        newSubmissions.push(event.submission);
      }
      
      const isCurrentUserSubmission = event.submission.user_id === state.currentGame?.created_by;
      
      return {
        ...state,
        submissions: newSubmissions,
        hasSubmitted: isCurrentUserSubmission ? true : state.hasSubmitted,
        playerStatus: isCurrentUserSubmission ? PlayerStatus.SUBMITTED : state.playerStatus
      };
      
    case 'VOTE_CAST':
      const newVotes = [...state.votes];
      const existingVoteIndex = newVotes.findIndex(v => v.id === event.vote.id);
      
      if (existingVoteIndex >= 0) {
        newVotes[existingVoteIndex] = event.vote;
      } else {
        newVotes.push(event.vote);
      }
      
      const isCurrentUserVote = event.vote.voter_id === state.currentGame?.created_by;
      
      return {
        ...state,
        votes: newVotes,
        hasVoted: isCurrentUserVote ? true : state.hasVoted,
        playerStatus: isCurrentUserVote ? PlayerStatus.VOTED : state.playerStatus
      };
      
    case 'RESULTS_RECEIVED':
      return {
        ...state,
        results: event.results
      };
      
    case 'TIMER_UPDATED':
      return {
        ...state,
        phaseTimeRemaining: event.timeRemaining
      };
      
    case 'CONNECTION_STATUS_CHANGED':
      return {
        ...state,
        connectionStatus: event.status
      };
      
    case 'ERROR':
      return {
        ...state,
        error: event.error,
        isLoading: false
      };
      
    case 'LOADING_STARTED':
      return {
        ...state,
        isLoading: true,
        error: null
      };
      
    case 'LOADING_FINISHED':
      return {
        ...state,
        isLoading: false
      };
      
    case 'RESET_STATE':
      return {
        ...initialGameState,
        connectionStatus: state.connectionStatus
      };
      
    default:
      return state;
  }
}

// GameProvider component
export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(gameStateReducer, initialGameState);
  const { currentUser, isLoggedIn } = useAuth();
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  
  // Initialize real-time game service
  const { 
    isConnected,
    connectionStatus,
    isInitialized,
    activeGameId,
    gamePresence,
    initializeRealtime,
    joinGame: joinRealtimeGame,
    leaveGame: leaveRealtimeGame,
    broadcastPlayerReady,
    broadcastTimerSync,
    refreshPresence,
    addEventListener,
    removeEventListener,
    addPresenceListener,
    removePresenceListener,
    error: realtimeError
  } = useRealtimeGame({ autoConnect: true });
  
  // Update connection status when real-time status changes
  useEffect(() => {
    dispatch({ type: 'CONNECTION_STATUS_CHANGED', status: connectionStatus });
    
    if (realtimeError) {
      dispatch({ type: 'ERROR', error: `Real-time connection error: ${realtimeError}` });
    }
  }, [connectionStatus, realtimeError]);
  
  // Set up real-time event listeners
  useEffect(() => {
    if (!isInitialized) return;
    
    // Define event handlers
    const handlePlayerJoined = (event: GameEvent) => {
      if (event.type !== 'player_joined') return;
      refreshGameState();
    };
    
    const handlePlayerLeft = (event: GameEvent) => {
      if (event.type !== 'player_left') return;
      refreshGameState();
    };
    
    const handlePlayerReady = (event: GameEvent) => {
      if (event.type !== 'player_ready') return;
      refreshGameState();
    };
    
    const handlePhaseChanged = (event: GameEvent) => {
      if (event.type !== 'phase_changed') return;
      refreshGameState();
    };
    
    const handleDrawingSubmitted = (event: GameEvent) => {
      if (event.type !== 'drawing_submitted') return;
      refreshGameState();
    };
    
    const handleVoteCast = (event: GameEvent) => {
      if (event.type !== 'vote_cast') return;
      refreshGameState();
    };
    
    const handleGameCompleted = (event: GameEvent) => {
      if (event.type !== 'game_completed') return;
      refreshGameState();
    };
    
    // Add event listeners
    addEventListener('player_joined', handlePlayerJoined);
    addEventListener('player_left', handlePlayerLeft);
    addEventListener('player_ready', handlePlayerReady);
    addEventListener('phase_changed', handlePhaseChanged);
    addEventListener('drawing_submitted', handleDrawingSubmitted);
    addEventListener('vote_cast', handleVoteCast);
    addEventListener('game_completed', handleGameCompleted);
    
    // Add presence listener
    const handlePresenceChange = (presence: PresenceEvent) => {
      refreshPresence();
    };
    
    addPresenceListener(handlePresenceChange);
    
    // Cleanup
    return () => {
      removeEventListener('player_joined', handlePlayerJoined);
      removeEventListener('player_left', handlePlayerLeft);
      removeEventListener('player_ready', handlePlayerReady);
      removeEventListener('phase_changed', handlePhaseChanged);
      removeEventListener('drawing_submitted', handleDrawingSubmitted);
      removeEventListener('vote_cast', handleVoteCast);
      removeEventListener('game_completed', handleGameCompleted);
      removePresenceListener(handlePresenceChange);
    };
  }, [
    isInitialized, 
    addEventListener, 
    removeEventListener, 
    addPresenceListener, 
    removePresenceListener, 
    refreshPresence
  ]);
  
  // Timer management
  useEffect(() => {
    // Clear existing timer
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    
    // Only set up timer if in a game and phase has a time limit
    if (!state.isInGame || !state.phaseStartTime) return;
    
    // Calculate phase duration based on game phase
    let phaseDuration = 0;
    
    if (state.currentGame) {
      switch (state.gamePhase) {
        case GamePhase.BRIEFING:
          phaseDuration = GAME_STATE_CONSTANTS.DEFAULT_BRIEFING_DURATION * 1000;
          break;
        case GamePhase.DRAWING:
          phaseDuration = state.currentGame.round_duration * 1000;
          break;
        case GamePhase.VOTING:
          phaseDuration = state.currentGame.voting_duration * 1000;
          break;
        case GamePhase.RESULTS:
          phaseDuration = GAME_STATE_CONSTANTS.DEFAULT_RESULTS_DURATION * 1000;
          break;
        default:
          return; // No timer for other phases
      }
    }
    
    if (phaseDuration <= 0) return;
    
    // Calculate end time if not already set
    const endTime = state.phaseEndTime || (state.phaseStartTime + phaseDuration);
    
    // Update phase end time if not already set
    if (!state.phaseEndTime) {
      dispatch({ 
        type: 'GAME_PHASE_CHANGED', 
        phase: state.gamePhase,
        startTime: state.phaseStartTime,
        endTime
      });
    }
    
    // Set up timer interval
    const interval = setInterval(() => {
      const now = Date.now();
      const timeRemaining = Math.max(0, endTime - now);
      
      dispatch({ type: 'TIMER_UPDATED', timeRemaining });
      
      // Broadcast timer sync every 5 seconds if host
      if (
        state.currentGame && 
        currentUser && 
        state.currentGame.created_by === currentUser.id &&
        timeRemaining % 5000 < 1000
      ) {
        broadcastTimerSync(
          Math.floor(timeRemaining / 1000),
          state.gamePhase as any,
          Math.floor(phaseDuration / 1000)
        ).catch(console.error);
      }
      
      // Check for phase transition when timer reaches zero
      if (timeRemaining <= 0) {
        checkPhaseTransitions();
        clearInterval(interval);
        setTimerInterval(null);
      }
    }, GAME_STATE_CONSTANTS.TIMER_UPDATE_INTERVAL);
    
    setTimerInterval(interval);
    
    return () => {
      clearInterval(interval);
      setTimerInterval(null);
    };
  }, [
    state.isInGame, 
    state.gamePhase, 
    state.phaseStartTime, 
    state.phaseEndTime,
    state.currentGame,
    currentUser,
    broadcastTimerSync
  ]);
  
  // Check for phase transitions based on current state
  const checkPhaseTransitions = useCallback(() => {
    if (!state.isInGame || !state.currentGame) return;
    
    // Find applicable transition
    const transition = PHASE_TRANSITIONS.find(t => 
      t.from === state.gamePhase && t.condition(state)
    );
    
    if (transition) {
      // Transition to next phase
      const nextPhase = transition.to;
      
      // Update game status in database if current user is game creator
      if (currentUser && state.currentGame.created_by === currentUser.id) {
        GameService.transitionGameStatus(state.currentGame.id, mapPhaseToStatus(nextPhase)!)
          .catch(error => {
            console.error('Failed to transition game status:', error);
            dispatch({ type: 'ERROR', error: 'Failed to transition game phase' });
          });
      }
      
      // Update local state
      dispatch({ 
        type: 'GAME_PHASE_CHANGED', 
        phase: nextPhase,
        startTime: Date.now()
      });
      
      // Execute transition action if defined
      if (transition.action) {
        transition.action(state).catch(error => {
          console.error('Failed to execute transition action:', error);
          dispatch({ type: 'ERROR', error: 'Failed to execute phase transition action' });
        });
      }
    }
  }, [state, currentUser]);
  
  // Refresh game state from server
  const refreshGameState = useCallback(async (): Promise<ServiceResponse<void>> => {
    if (!state.currentGame || !state.isInGame) {
      return { success: false, error: 'Not in a game', code: 'NOT_IN_GAME' };
    }
    
    dispatch({ type: 'LOADING_STARTED' });
    
    try {
      // Get game details with participants
      const gameResult = await GameService.getGame(state.currentGame.id);
      
      if (!gameResult.success || !gameResult.data) {
        dispatch({ type: 'ERROR', error: gameResult.error || 'Failed to fetch game' });
        return gameResult;
      }
      
      const game = gameResult.data;
      
      // Update game and participants
      dispatch({ 
        type: 'GAME_JOINED', 
        game, 
        participants: game.participants 
      });
      
      // Update game phase if changed
      if (mapStatusToPhase(game.status) !== state.gamePhase) {
        dispatch({ 
          type: 'GAME_PHASE_CHANGED', 
          phase: mapStatusToPhase(game.status),
          startTime: Date.now()
        });
      }
      
      // Get submissions if in drawing, voting, or results phase
      if (['drawing', 'voting', 'results', 'completed'].includes(game.status)) {
        const submissionsResult = await SubmissionService.getGameSubmissions(game.id);
        
        if (submissionsResult.success && submissionsResult.data) {
          // Update submissions
          submissionsResult.data.forEach(submission => {
            dispatch({ type: 'DRAWING_SUBMITTED', submission });
          });
          
          // Check if current user has submitted
          if (currentUser) {
            const userSubmission = submissionsResult.data.find(s => s.user_id === currentUser.id);
            if (userSubmission) {
              dispatch({ 
                type: 'PLAYER_STATUS_CHANGED', 
                status: PlayerStatus.SUBMITTED 
              });
            }
          }
        }
      }
      
      // Get votes if in voting or results phase
      if (['voting', 'results', 'completed'].includes(game.status)) {
        const votesResult = await VotingService.getGameVotes(game.id);
        
        if (votesResult.success && votesResult.data) {
          // Update votes
          votesResult.data.forEach(vote => {
            dispatch({ type: 'VOTE_CAST', vote });
          });
          
          // Check if current user has voted
          if (currentUser) {
            const userVote = votesResult.data.find(v => v.voter_id === currentUser.id);
            if (userVote) {
              dispatch({ 
                type: 'PLAYER_STATUS_CHANGED', 
                status: PlayerStatus.VOTED 
              });
            }
          }
        }
      }
      
      // Get results if in results or completed phase
      if (['results', 'completed'].includes(game.status)) {
        const resultsResult = await VotingService.getGameResults(game.id);
        
        if (resultsResult.success && resultsResult.data) {
          dispatch({ type: 'RESULTS_RECEIVED', results: resultsResult.data });
        }
      }
      
      dispatch({ type: 'LOADING_FINISHED' });
      return { success: true };
    } catch (error) {
      console.error('Failed to refresh game state:', error);
      dispatch({ 
        type: 'ERROR', 
        error: error instanceof Error ? error.message : 'Failed to refresh game state' 
      });
      return { 
        success: false, 
        error: 'Failed to refresh game state', 
        code: 'REFRESH_FAILED' 
      };
    }
  }, [state.currentGame, state.isInGame, state.gamePhase, currentUser]);
  
  // Create a new game
  const createGame = useCallback(async (
    prompt: string, 
    maxPlayers?: number, 
    roundDuration?: number, 
    votingDuration?: number
  ): Promise<ServiceResponse<Game>> => {
    if (!isLoggedIn || !currentUser) {
      return { success: false, error: 'User not logged in', code: 'UNAUTHENTICATED' };
    }
    
    dispatch({ type: 'LOADING_STARTED' });
    
    try {
      const result = await GameService.createGame({
        prompt,
        max_players: maxPlayers,
        round_duration: roundDuration,
        voting_duration: votingDuration
      });
      
      if (!result.success || !result.data) {
        dispatch({ type: 'ERROR', error: result.error || 'Failed to create game' });
        return result;
      }
      
      // Update state with new game
      dispatch({ type: 'GAME_CREATED', game: result.data });
      
      // Join real-time game channel
      await joinRealtimeGame(result.data.id);
      
      // Refresh game state to get participants
      await refreshGameState();
      
      dispatch({ type: 'LOADING_FINISHED' });
      return result;
    } catch (error) {
      console.error('Failed to create game:', error);
      dispatch({ 
        type: 'ERROR', 
        error: error instanceof Error ? error.message : 'Failed to create game' 
      });
      return { 
        success: false, 
        error: 'Failed to create game', 
        code: 'CREATE_FAILED' 
      };
    }
  }, [isLoggedIn, currentUser, joinRealtimeGame, refreshGameState]);
  
  // Join an existing game
  const joinGame = useCallback(async (gameId: string): Promise<ServiceResponse<void>> => {
    if (!isLoggedIn || !currentUser) {
      return { success: false, error: 'User not logged in', code: 'UNAUTHENTICATED' };
    }
    
    dispatch({ type: 'LOADING_STARTED' });
    
    try {
      // Join game in database
      const result = await GameService.joinGame({ game_id: gameId });
      
      if (!result.success) {
        dispatch({ type: 'ERROR', error: result.error || 'Failed to join game' });
        return result;
      }
      
      // Get game details
      const gameResult = await GameService.getGame(gameId);
      
      if (!gameResult.success || !gameResult.data) {
        dispatch({ type: 'ERROR', error: gameResult.error || 'Failed to fetch game details' });
        return { success: false, error: 'Failed to fetch game details', code: 'FETCH_FAILED' };
      }
      
      // Update state with game and participants
      dispatch({ 
        type: 'GAME_JOINED', 
        game: gameResult.data, 
        participants: gameResult.data.participants 
      });
      
      // Join real-time game channel
      await joinRealtimeGame(gameId);
      
      // Refresh game state to get all data
      await refreshGameState();
      
      dispatch({ type: 'LOADING_FINISHED' });
      return { success: true };
    } catch (error) {
      console.error('Failed to join game:', error);
      dispatch({ 
        type: 'ERROR', 
        error: error instanceof Error ? error.message : 'Failed to join game' 
      });
      return { 
        success: false, 
        error: 'Failed to join game', 
        code: 'JOIN_FAILED' 
      };
    }
  }, [isLoggedIn, currentUser, joinRealtimeGame, refreshGameState]);
  
  // Leave current game
  const leaveGame = useCallback(async (): Promise<ServiceResponse<void>> => {
    if (!state.currentGame) {
      return { success: true }; // Nothing to leave
    }
    
    dispatch({ type: 'LOADING_STARTED' });
    
    try {
      // Leave game in database
      const result = await GameService.leaveGame(state.currentGame.id);
      
      // Leave real-time game channel
      await leaveRealtimeGame();
      
      // Reset state
      dispatch({ type: 'GAME_LEFT' });
      
      dispatch({ type: 'LOADING_FINISHED' });
      return result;
    } catch (error) {
      console.error('Failed to leave game:', error);
      dispatch({ 
        type: 'ERROR', 
        error: error instanceof Error ? error.message : 'Failed to leave game' 
      });
      return { 
        success: false, 
        error: 'Failed to leave game', 
        code: 'LEAVE_FAILED' 
      };
    }
  }, [state.currentGame, leaveRealtimeGame]);
  
  // Set player ready status
  const setPlayerReady = useCallback(async (ready: boolean): Promise<ServiceResponse<void>> => {
    if (!state.currentGame) {
      return { success: false, error: 'Not in a game', code: 'NOT_IN_GAME' };
    }
    
    if (state.gamePhase !== GamePhase.WAITING) {
      return { success: false, error: 'Can only set ready status in waiting phase', code: 'INVALID_PHASE' };
    }
    
    dispatch({ type: 'LOADING_STARTED' });
    
    try {
      // Update ready status in database
      const result = await GameService.updateReadyStatus(state.currentGame.id, ready);
      
      if (!result.success) {
        dispatch({ type: 'ERROR', error: result.error || 'Failed to update ready status' });
        return result;
      }
      
      // Broadcast ready status to other players
      await broadcastPlayerReady(ready, state.selectedBoosterPack || undefined);
      
      // Update local state
      dispatch({ type: 'PLAYER_READY_CHANGED', isReady: ready });
      
      // Check for phase transition
      checkPhaseTransitions();
      
      dispatch({ type: 'LOADING_FINISHED' });
      return { success: true };
    } catch (error) {
      console.error('Failed to set player ready:', error);
      dispatch({ 
        type: 'ERROR', 
        error: error instanceof Error ? error.message : 'Failed to set ready status' 
      });
      return { 
        success: false, 
        error: 'Failed to set ready status', 
        code: 'UPDATE_FAILED' 
      };
    }
  }, [state.currentGame, state.gamePhase, state.selectedBoosterPack, broadcastPlayerReady, checkPhaseTransitions]);
  
  // Select booster pack
  const selectBoosterPack = useCallback(async (packId: string | null): Promise<ServiceResponse<void>> => {
    if (!state.currentGame) {
      return { success: false, error: 'Not in a game', code: 'NOT_IN_GAME' };
    }
    
    if (state.gamePhase !== GamePhase.WAITING && state.gamePhase !== GamePhase.BRIEFING) {
      return { 
        success: false, 
        error: 'Can only select booster pack in waiting or briefing phase', 
        code: 'INVALID_PHASE' 
      };
    }
    
    dispatch({ type: 'LOADING_STARTED' });
    
    try {
      // Update local state
      dispatch({ type: 'BOOSTER_PACK_SELECTED', packId });
      
      // Broadcast ready status with new booster pack
      await broadcastPlayerReady(state.isReady, packId || undefined);
      
      dispatch({ type: 'LOADING_FINISHED' });
      return { success: true };
    } catch (error) {
      console.error('Failed to select booster pack:', error);
      dispatch({ 
        type: 'ERROR', 
        error: error instanceof Error ? error.message : 'Failed to select booster pack' 
      });
      return { 
        success: false, 
        error: 'Failed to select booster pack', 
        code: 'UPDATE_FAILED' 
      };
    }
  }, [state.currentGame, state.gamePhase, state.isReady, broadcastPlayerReady]);
  
  // Start game (transition from waiting to briefing)
  const startGame = useCallback(async (): Promise<ServiceResponse<void>> => {
    if (!state.currentGame) {
      return { success: false, error: 'Not in a game', code: 'NOT_IN_GAME' };
    }
    
    if (state.gamePhase !== GamePhase.WAITING) {
      return { success: false, error: 'Game already started', code: 'INVALID_PHASE' };
    }
    
    if (!currentUser || state.currentGame.created_by !== currentUser.id) {
      return { success: false, error: 'Only game creator can start the game', code: 'UNAUTHORIZED' };
    }
    
    const readyParticipants = state.participants.filter(p => p.is_ready);
    if (readyParticipants.length < GAME_STATE_CONSTANTS.MIN_PLAYERS_TO_START) {
      return { 
        success: false, 
        error: `Need at least ${GAME_STATE_CONSTANTS.MIN_PLAYERS_TO_START} ready players to start`, 
        code: 'INSUFFICIENT_PLAYERS' 
      };
    }
    
    dispatch({ type: 'LOADING_STARTED' });
    
    try {
      // Transition game status in database
      const result = await GameService.transitionGameStatus(
        state.currentGame.id, 
        'briefing',
        'waiting'
      );
      
      if (!result.success) {
        dispatch({ type: 'ERROR', error: result.error || 'Failed to start game' });
        return result;
      }
      
      // Update local state
      dispatch({ 
        type: 'GAME_PHASE_CHANGED', 
        phase: GamePhase.BRIEFING,
        startTime: Date.now()
      });
      
      dispatch({ type: 'LOADING_FINISHED' });
      return { success: true };
    } catch (error) {
      console.error('Failed to start game:', error);
      dispatch({ 
        type: 'ERROR', 
        error: error instanceof Error ? error.message : 'Failed to start game' 
      });
      return { 
        success: false, 
        error: 'Failed to start game', 
        code: 'START_FAILED' 
      };
    }
  }, [state.currentGame, state.gamePhase, state.participants, currentUser]);
  
  // Submit drawing
  const submitDrawing = useCallback(async (
    drawingData: any, 
    drawingUrl: string,
    metadata?: {
      canvasWidth?: number;
      canvasHeight?: number;
      elementCount?: number;
      drawingTimeSeconds?: number;
    }
  ): Promise<ServiceResponse<void>> => {
    if (!state.currentGame) {
      return { success: false, error: 'Not in a game', code: 'NOT_IN_GAME' };
    }
    
    if (state.gamePhase !== GamePhase.DRAWING) {
      return { success: false, error: 'Can only submit during drawing phase', code: 'INVALID_PHASE' };
    }
    
    dispatch({ type: 'LOADING_STARTED' });
    
    try {
      // Submit drawing to database
      const result = await SubmissionService.submitDrawing({
        game_id: state.currentGame.id,
        drawing_data: drawingData,
        drawing_url: drawingUrl,
        canvas_width: metadata?.canvasWidth,
        canvas_height: metadata?.canvasHeight,
        element_count: metadata?.elementCount,
        drawing_time_seconds: metadata?.drawingTimeSeconds
      });
      
      if (!result.success || !result.data) {
        dispatch({ type: 'ERROR', error: result.error || 'Failed to submit drawing' });
        return { success: false, error: result.error || 'Failed to submit drawing', code: result.code };
      }
      
      // Update local state
      dispatch({ type: 'DRAWING_SUBMITTED', submission: result.data });
      dispatch({ type: 'PLAYER_READY_CHANGED', isReady: true });
      
      // Check for phase transition
      checkPhaseTransitions();
      
      dispatch({ type: 'LOADING_FINISHED' });
      return { success: true };
    } catch (error) {
      console.error('Failed to submit drawing:', error);
      dispatch({ 
        type: 'ERROR', 
        error: error instanceof Error ? error.message : 'Failed to submit drawing' 
      });
      return { 
        success: false, 
        error: 'Failed to submit drawing', 
        code: 'SUBMISSION_FAILED' 
      };
    }
  }, [state.currentGame, state.gamePhase, checkPhaseTransitions]);
  
  // Cast vote
  const castVote = useCallback(async (submissionId: string): Promise<ServiceResponse<void>> => {
    if (!state.currentGame) {
      return { success: false, error: 'Not in a game', code: 'NOT_IN_GAME' };
    }
    
    if (state.gamePhase !== GamePhase.VOTING) {
      return { success: false, error: 'Can only vote during voting phase', code: 'INVALID_PHASE' };
    }
    
    if (state.hasVoted) {
      return { success: false, error: 'Already voted', code: 'ALREADY_VOTED' };
    }
    
    dispatch({ type: 'LOADING_STARTED' });
    
    try {
      // Cast vote in database
      const result = await VotingService.castVote({
        game_id: state.currentGame.id,
        submission_id: submissionId
      });
      
      if (!result.success || !result.data) {
        dispatch({ type: 'ERROR', error: result.error || 'Failed to cast vote' });
        return { success: false, error: result.error || 'Failed to cast vote', code: result.code };
      }
      
      // Update local state
      dispatch({ type: 'VOTE_CAST', vote: result.data });
      
      // Check for phase transition
      checkPhaseTransitions();
      
      dispatch({ type: 'LOADING_FINISHED' });
      return { success: true };
    } catch (error) {
      console.error('Failed to cast vote:', error);
      dispatch({ 
        type: 'ERROR', 
        error: error instanceof Error ? error.message : 'Failed to cast vote' 
      });
      return { 
        success: false, 
        error: 'Failed to cast vote', 
        code: 'VOTE_FAILED' 
      };
    }
  }, [state.currentGame, state.gamePhase, state.hasVoted, checkPhaseTransitions]);
  
  // Clear error
  const clearError = useCallback(() => {
    dispatch({ type: 'ERROR', error: null });
  }, []);
  
  // Reset game state
  const resetGameState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);
  
  // Helper function to map GamePhase to GameStatus
  const mapPhaseToStatus = useCallback((phase: GamePhase): string | null => {
    switch (phase) {
      case GamePhase.WAITING: return 'waiting';
      case GamePhase.BRIEFING: return 'briefing';
      case GamePhase.DRAWING: return 'drawing';
      case GamePhase.VOTING: return 'voting';
      case GamePhase.RESULTS: return 'results';
      case GamePhase.COMPLETED: return 'completed';
      case GamePhase.CANCELLED: return 'cancelled';
      case GamePhase.NOT_IN_GAME: return null;
      default: return null;
    }
  }, []);
  
  // Restore game state from local storage on mount
  useEffect(() => {
    if (!isLoggedIn || !currentUser) return;
    
    const savedGameId = localStorage.getItem(GAME_STATE_CONSTANTS.STORAGE_KEY_CURRENT_GAME);
    
    if (savedGameId) {
      // Attempt to rejoin the saved game
      joinGame(savedGameId).catch(error => {
        console.error('Failed to rejoin saved game:', error);
        localStorage.removeItem(GAME_STATE_CONSTANTS.STORAGE_KEY_CURRENT_GAME);
      });
    }
  }, [isLoggedIn, currentUser, joinGame]);
  
  // Save current game ID to local storage when it changes
  useEffect(() => {
    if (state.currentGame) {
      localStorage.setItem(GAME_STATE_CONSTANTS.STORAGE_KEY_CURRENT_GAME, state.currentGame.id);
    } else {
      localStorage.removeItem(GAME_STATE_CONSTANTS.STORAGE_KEY_CURRENT_GAME);
    }
  }, [state.currentGame]);
  
  // Periodic game state refresh
  useEffect(() => {
    if (!state.isInGame || !state.currentGame) return;
    
    const interval = setInterval(() => {
      refreshGameState().catch(console.error);
    }, GAME_STATE_CONSTANTS.GAME_STATE_REFRESH_INTERVAL);
    
    return () => clearInterval(interval);
  }, [state.isInGame, state.currentGame, refreshGameState]);
  
  // Create game actions object
  const gameActions: GameActions = {
    createGame,
    joinGame,
    leaveGame,
    setPlayerReady,
    selectBoosterPack,
    startGame,
    submitDrawing,
    castVote,
    refreshGameState,
    clearError,
    resetGameState
  };
  
  // Combine state and actions for context value
  const contextValue: GameContextType = {
    ...state,
    actions: gameActions
  };
  
  return (
    <GameContext.Provider value={contextValue}>
      {children}
    </GameContext.Provider>
  );
};

// Custom hook to use the game context
export function useGame(): GameContextType {
  const context = useContext(GameContext);
  
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  
  return context;
}

// Specialized hooks for specific game state aspects
export function useGamePhase(): [GamePhase, boolean] {
  const { gamePhase, isLoading } = useGame();
  return [gamePhase, isLoading];
}

export function useGameTimer(): number | null {
  const { phaseTimeRemaining } = useGame();
  return phaseTimeRemaining;
}

export function usePlayerStatus(): PlayerStatus {
  const { playerStatus } = useGame();
  return playerStatus;
}

export function useGameParticipants(): GameParticipant[] {
  const { participants } = useGame();
  return participants;
}

export function useGameSubmissions(): Submission[] {
  const { submissions } = useGame();
  return submissions;
}

export function useGameResults(): GameResults | null {
  const { results } = useGame();
  return results;
}

export function useGameError(): [string | null, () => void] {
  const { error, actions } = useGame();
  return [error, actions.clearError];
}

export function usePlayerActions(): Pick<GameActions, 'setPlayerReady' | 'selectBoosterPack'> {
  const { actions } = useGame();
  return {
    setPlayerReady: actions.setPlayerReady,
    selectBoosterPack: actions.selectBoosterPack
  };
}

export function useGameActions(): GameActions {
  const { actions } = useGame();
  return actions;
}

export default GameContext;