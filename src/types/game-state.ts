// Game State Management Types
// TypeScript definitions for the SketchyAF game state management system

import { 
  Game, 
  GameParticipant, 
  Submission, 
  Vote, 
  GameResults, 
  GameStatus,
  ServiceResponse
} from './game';
import { ConnectionStatus } from './realtime';

// Game Phase Enum (mirrors GameStatus but with more specific naming)
export enum GamePhase {
  WAITING = 'waiting',
  BRIEFING = 'briefing',
  DRAWING = 'drawing',
  VOTING = 'voting',
  RESULTS = 'results',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NOT_IN_GAME = 'not_in_game'
}

// Player Status in a Game
export enum PlayerStatus {
  NOT_IN_GAME = 'not_in_game',
  WAITING = 'waiting',
  READY = 'ready',
  DRAWING = 'drawing',
  SUBMITTED = 'submitted',
  VOTING = 'voting',
  VOTED = 'voted',
  COMPLETED = 'completed'
}

// Game State Interface
export interface GameState {
  // Current Game
  currentGame: Game | null;
  gamePhase: GamePhase;
  isInGame: boolean;
  
  // Player State
  playerStatus: PlayerStatus;
  isReady: boolean;
  selectedBoosterPack: string | null; // asset_directory_name
  hasSubmitted: boolean;
  hasVoted: boolean;
  
  // Game Data
  participants: GameParticipant[];
  submissions: Submission[];
  votes: Vote[];
  results: GameResults | null;
  
  // Timers
  phaseStartTime: number | null;
  phaseEndTime: number | null;
  phaseTimeRemaining: number | null;
  
  // UI State
  isLoading: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
}

// Game Actions Interface
export interface GameActions {
  // Game Management
  createGame: (prompt: string, maxPlayers?: number, roundDuration?: number, votingDuration?: number) => Promise<ServiceResponse<Game>>;
  joinGame: (gameId: string) => Promise<ServiceResponse<void>>;
  leaveGame: () => Promise<ServiceResponse<void>>;
  setPlayerReady: (ready: boolean) => Promise<ServiceResponse<void>>;
  selectBoosterPack: (packId: string | null) => Promise<ServiceResponse<void>>;
  
  // Game Flow
  startGame: () => Promise<ServiceResponse<void>>;
  submitDrawing: (drawingData: any, drawingUrl: string, metadata?: {
    canvasWidth?: number;
    canvasHeight?: number;
    elementCount?: number;
    drawingTimeSeconds?: number;
  }) => Promise<ServiceResponse<void>>;
  castVote: (submissionId: string) => Promise<ServiceResponse<void>>;
  
  // State Management
  refreshGameState: () => Promise<ServiceResponse<void>>;
  clearError: () => void;
  resetGameState: () => void;
}

// GameContext Type
export interface GameContextType extends GameState {
  actions: GameActions;
}

// Phase Transition Definition
export interface PhaseTransition {
  from: GamePhase;
  to: GamePhase;
  condition: (state: GameState) => boolean;
  action?: (state: GameState) => Promise<void>;
}

// Game State Update Types
export type GameStateUpdate = Partial<GameState>;

// Game Event Types for internal state management
export type GameStateEvent = 
  | { type: 'GAME_CREATED'; game: Game }
  | { type: 'GAME_JOINED'; game: Game; participants: GameParticipant[] }
  | { type: 'GAME_LEFT' }
  | { type: 'PLAYER_READY_CHANGED'; isReady: boolean }
  | { type: 'BOOSTER_PACK_SELECTED'; packId: string | null }
  | { type: 'GAME_PHASE_CHANGED'; phase: GamePhase; startTime?: number; endTime?: number }
  | { type: 'PARTICIPANTS_UPDATED'; participants: GameParticipant[] }
  | { type: 'DRAWING_SUBMITTED'; submission: Submission }
  | { type: 'VOTE_CAST'; vote: Vote }
  | { type: 'RESULTS_RECEIVED'; results: GameResults }
  | { type: 'TIMER_UPDATED'; timeRemaining: number }
  | { type: 'CONNECTION_STATUS_CHANGED'; status: ConnectionStatus }
  | { type: 'ERROR'; error: string }
  | { type: 'LOADING_STARTED' }
  | { type: 'LOADING_FINISHED' }
  | { type: 'RESET_STATE' };

// Game State Constants
export const GAME_STATE_CONSTANTS = {
  // Default timer durations (in seconds)
  DEFAULT_BRIEFING_DURATION: 15,
  DEFAULT_DRAWING_DURATION: 60,
  DEFAULT_VOTING_DURATION: 30,
  DEFAULT_RESULTS_DURATION: 20,
  
  // Minimum player requirements
  MIN_PLAYERS_TO_START: 2,
  
  // Auto-transition delays (in milliseconds)
  PHASE_TRANSITION_DELAY: 1000,
  
  // Polling intervals (in milliseconds)
  GAME_STATE_REFRESH_INTERVAL: 5000,
  TIMER_UPDATE_INTERVAL: 1000,
  
  // Error handling
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  
  // Local storage keys
  STORAGE_KEY_CURRENT_GAME: 'sketchyaf_current_game',
  STORAGE_KEY_PLAYER_STATUS: 'sketchyaf_player_status',
  
  // Debug flags
  DEBUG_MODE: false,
} as const;

// Game Phase Transition Rules
export const PHASE_TRANSITIONS: PhaseTransition[] = [
  {
    from: GamePhase.WAITING,
    to: GamePhase.BRIEFING,
    condition: (state) => 
      state.participants.filter(p => p.is_ready).length >= GAME_STATE_CONSTANTS.MIN_PLAYERS_TO_START
  },
  {
    from: GamePhase.BRIEFING,
    to: GamePhase.DRAWING,
    condition: (state) => 
      state.phaseTimeRemaining !== null && state.phaseTimeRemaining <= 0
  },
  {
    from: GamePhase.DRAWING,
    to: GamePhase.VOTING,
    condition: (state) => 
      (state.phaseTimeRemaining !== null && state.phaseTimeRemaining <= 0) || 
      (state.submissions.length === state.participants.filter(p => !p.left_at).length)
  },
  {
    from: GamePhase.VOTING,
    to: GamePhase.RESULTS,
    condition: (state) => 
      (state.phaseTimeRemaining !== null && state.phaseTimeRemaining <= 0) || 
      (state.votes.length === state.participants.filter(p => !p.left_at).length)
  },
  {
    from: GamePhase.RESULTS,
    to: GamePhase.COMPLETED,
    condition: (state) => 
      state.phaseTimeRemaining !== null && state.phaseTimeRemaining <= 0
  }
];

// Helper function to map GameStatus to GamePhase
export function mapStatusToPhase(status: GameStatus | null): GamePhase {
  if (!status) return GamePhase.NOT_IN_GAME;
  
  switch (status) {
    case 'waiting': return GamePhase.WAITING;
    case 'briefing': return GamePhase.BRIEFING;
    case 'drawing': return GamePhase.DRAWING;
    case 'voting': return GamePhase.VOTING;
    case 'results': return GamePhase.RESULTS;
    case 'completed': return GamePhase.COMPLETED;
    case 'cancelled': return GamePhase.CANCELLED;
    default: return GamePhase.NOT_IN_GAME;
  }
}

// Helper function to map GamePhase to GameStatus
export function mapPhaseToStatus(phase: GamePhase): GameStatus | null {
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
}

// Helper function to determine player status based on game state
export function determinePlayerStatus(state: Partial<GameState>): PlayerStatus {
  if (!state.isInGame || !state.currentGame) {
    return PlayerStatus.NOT_IN_GAME;
  }
  
  if (state.gamePhase === GamePhase.WAITING) {
    return state.isReady ? PlayerStatus.READY : PlayerStatus.WAITING;
  }
  
  if (state.gamePhase === GamePhase.DRAWING) {
    return state.hasSubmitted ? PlayerStatus.SUBMITTED : PlayerStatus.DRAWING;
  }
  
  if (state.gamePhase === GamePhase.VOTING) {
    return state.hasVoted ? PlayerStatus.VOTED : PlayerStatus.VOTING;
  }
  
  if (state.gamePhase === GamePhase.RESULTS || state.gamePhase === GamePhase.COMPLETED) {
    return PlayerStatus.COMPLETED;
  }
  
  return PlayerStatus.WAITING;
}

// Initial game state
export const initialGameState: GameState = {
  // Current Game
  currentGame: null,
  gamePhase: GamePhase.NOT_IN_GAME,
  isInGame: false,
  
  // Player State
  playerStatus: PlayerStatus.NOT_IN_GAME,
  isReady: false,
  selectedBoosterPack: null,
  hasSubmitted: false,
  hasVoted: false,
  
  // Game Data
  participants: [],
  submissions: [],
  votes: [],
  results: null,
  
  // Timers
  phaseStartTime: null,
  phaseEndTime: null,
  phaseTimeRemaining: null,
  
  // UI State
  isLoading: false,
  error: null,
  connectionStatus: 'disconnected'
};