import { useCallback, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { GamePhase, GAME_STATE_CONSTANTS } from '../types/game-state';

interface UseGamePhaseManagerOptions {
  onPhaseChange?: (newPhase: GamePhase, oldPhase: GamePhase) => void;
  autoTransition?: boolean;
}

/**
 * Custom hook for managing game phase transitions
 * 
 * @param options Configuration options for phase management
 * @returns Phase management utilities
 */
export function useGamePhaseManager(options: UseGamePhaseManagerOptions = {}) {
  const { onPhaseChange, autoTransition = true } = options;
  const { 
    gamePhase, 
    currentGame, 
    isInGame, 
    participants, 
    submissions, 
    votes,
    phaseTimeRemaining,
    actions
  } = useGame();
  
  // Check if all players are ready
  const areAllPlayersReady = useCallback((): boolean => {
    if (!participants.length) return false;
    
    const activePlayers = participants.filter(p => !p.left_at);
    if (activePlayers.length < GAME_STATE_CONSTANTS.MIN_PLAYERS_TO_START) return false;
    
    return activePlayers.every(p => p.is_ready);
  }, [participants]);
  
  // Check if all players have submitted
  const haveAllPlayersSubmitted = useCallback((): boolean => {
    if (!participants.length || !submissions.length) return false;
    
    const activePlayers = participants.filter(p => !p.left_at);
    return submissions.length >= activePlayers.length;
  }, [participants, submissions]);
  
  // Check if all players have voted
  const haveAllPlayersVoted = useCallback((): boolean => {
    if (!participants.length || !votes.length) return false;
    
    const activePlayers = participants.filter(p => !p.left_at);
    return votes.length >= activePlayers.length;
  }, [participants, votes]);
  
  // Manually transition to next phase
  const transitionToNextPhase = useCallback(async (): Promise<boolean> => {
    if (!isInGame || !currentGame) return false;
    
    let nextPhase: GamePhase | null = null;
    
    switch (gamePhase) {
      case GamePhase.WAITING:
        if (areAllPlayersReady()) {
          nextPhase = GamePhase.BRIEFING;
        }
        break;
      case GamePhase.BRIEFING:
        nextPhase = GamePhase.DRAWING;
        break;
      case GamePhase.DRAWING:
        nextPhase = GamePhase.VOTING;
        break;
      case GamePhase.VOTING:
        nextPhase = GamePhase.RESULTS;
        break;
      case GamePhase.RESULTS:
        nextPhase = GamePhase.COMPLETED;
        break;
      default:
        return false;
    }
    
    if (!nextPhase) return false;
    
    try {
      // Only game creator can transition the game
      if (currentGame.created_by === currentUser?.id) {
        await actions.startGame();
      }
      return true;
    } catch (error) {
      console.error('Failed to transition to next phase:', error);
      return false;
    }
  }, [
    isInGame, 
    currentGame, 
    gamePhase, 
    areAllPlayersReady, 
    actions,
    currentUser
  ]);
  
  // Check conditions for auto-transition
  useEffect(() => {
    if (!autoTransition || !isInGame || !currentGame) return;
    
    // Only game creator can auto-transition
    if (currentGame.created_by !== currentUser?.id) return;
    
    // Check conditions based on current phase
    let shouldTransition = false;
    
    switch (gamePhase) {
      case GamePhase.WAITING:
        shouldTransition = areAllPlayersReady();
        break;
      case GamePhase.BRIEFING:
        shouldTransition = phaseTimeRemaining !== null && phaseTimeRemaining <= 0;
        break;
      case GamePhase.DRAWING:
        shouldTransition = 
          (phaseTimeRemaining !== null && phaseTimeRemaining <= 0) || 
          haveAllPlayersSubmitted();
        break;
      case GamePhase.VOTING:
        shouldTransition = 
          (phaseTimeRemaining !== null && phaseTimeRemaining <= 0) || 
          haveAllPlayersVoted();
        break;
      case GamePhase.RESULTS:
        shouldTransition = phaseTimeRemaining !== null && phaseTimeRemaining <= 0;
        break;
      default:
        break;
    }
    
    if (shouldTransition) {
      transitionToNextPhase().catch(console.error);
    }
  }, [
    autoTransition,
    isInGame,
    currentGame,
    gamePhase,
    phaseTimeRemaining,
    areAllPlayersReady,
    haveAllPlayersSubmitted,
    haveAllPlayersVoted,
    transitionToNextPhase,
    currentUser
  ]);
  
  // Call onPhaseChange callback when phase changes
  useEffect(() => {
    if (onPhaseChange) {
      const oldPhase = gamePhase;
      return () => {
        if (gamePhase !== oldPhase) {
          onPhaseChange(gamePhase, oldPhase);
        }
      };
    }
  }, [gamePhase, onPhaseChange]);
  
  return {
    currentPhase: gamePhase,
    canTransition: {
      fromWaiting: areAllPlayersReady(),
      fromDrawing: haveAllPlayersSubmitted(),
      fromVoting: haveAllPlayersVoted()
    },
    transitionToNextPhase,
    isTimeUp: phaseTimeRemaining !== null && phaseTimeRemaining <= 0
  };
}

export default useGamePhaseManager;