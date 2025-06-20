import { useState, useEffect, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import { GamePhase, GAME_STATE_CONSTANTS } from '../types/game-state';

interface UseGameTimerOptions {
  format?: 'seconds' | 'mm:ss';
  onTimeUp?: () => void;
}

/**
 * Custom hook for managing and formatting game timers
 * 
 * @param options Configuration options for the timer
 * @returns Formatted time string and timer state
 */
export function useGameTimer(options: UseGameTimerOptions = {}) {
  const { format = 'mm:ss', onTimeUp } = options;
  const { phaseTimeRemaining, gamePhase, currentGame } = useGame();
  const [formattedTime, setFormattedTime] = useState<string>('--:--');
  const [isTimeAlmostUp, setIsTimeAlmostUp] = useState<boolean>(false);
  
  // Format time based on preference
  const formatTime = useCallback((timeInMs: number | null): string => {
    if (timeInMs === null) return format === 'seconds' ? '0' : '--:--';
    
    const seconds = Math.max(0, Math.floor(timeInMs / 1000));
    
    if (format === 'seconds') {
      return seconds.toString();
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, [format]);
  
  // Get total phase duration based on game phase
  const getPhaseDuration = useCallback((): number => {
    if (!currentGame) return 0;
    
    switch (gamePhase) {
      case GamePhase.BRIEFING:
        return GAME_STATE_CONSTANTS.DEFAULT_BRIEFING_DURATION * 1000;
      case GamePhase.DRAWING:
        return currentGame.round_duration * 1000;
      case GamePhase.VOTING:
        return currentGame.voting_duration * 1000;
      case GamePhase.RESULTS:
        return GAME_STATE_CONSTANTS.DEFAULT_RESULTS_DURATION * 1000;
      default:
        return 0;
    }
  }, [currentGame, gamePhase]);
  
  // Calculate percentage of time remaining
  const getTimeRemainingPercentage = useCallback((): number => {
    if (phaseTimeRemaining === null) return 0;
    
    const totalDuration = getPhaseDuration();
    if (totalDuration <= 0) return 0;
    
    return Math.max(0, Math.min(100, (phaseTimeRemaining / totalDuration) * 100));
  }, [phaseTimeRemaining, getPhaseDuration]);
  
  // Update formatted time when time remaining changes
  useEffect(() => {
    setFormattedTime(formatTime(phaseTimeRemaining));
    
    // Check if time is almost up (less than 10 seconds)
    if (phaseTimeRemaining !== null && phaseTimeRemaining <= 10000) {
      setIsTimeAlmostUp(true);
    } else {
      setIsTimeAlmostUp(false);
    }
    
    // Call onTimeUp callback when timer reaches zero
    if (phaseTimeRemaining !== null && phaseTimeRemaining <= 0 && onTimeUp) {
      onTimeUp();
    }
  }, [phaseTimeRemaining, formatTime, onTimeUp]);
  
  return {
    formattedTime,
    timeRemaining: phaseTimeRemaining,
    timeRemainingPercentage: getTimeRemainingPercentage(),
    isTimeAlmostUp,
    hasTimer: phaseTimeRemaining !== null,
    totalDuration: getPhaseDuration()
  };
}

export default useGameTimer;