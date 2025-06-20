import { useCallback, useEffect, useState } from 'react';
import { useGame } from '../context/GameContext';
import { ServiceResponse } from '../types/game';

/**
 * Custom hook for working with matchmaking queue status
 * 
 * @returns Queue status and actions
 */
export function useQueueStatus() {
  const { 
    isInQueue, 
    queuePosition, 
    estimatedWaitTime, 
    playersInQueue, 
    actions 
  } = useGame();
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  
  // Join matchmaking queue
  const joinQueue = useCallback(async (): Promise<ServiceResponse<void>> => {
    try {
      return await actions.joinQueue();
    } catch (error) {
      console.error('Error joining queue:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to join queue',
        code: 'JOIN_FAILED'
      };
    }
  }, [actions]);
  
  // Leave matchmaking queue
  const leaveQueue = useCallback(async (): Promise<ServiceResponse<void>> => {
    try {
      return await actions.leaveQueue();
    } catch (error) {
      console.error('Error leaving queue:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to leave queue',
        code: 'LEAVE_FAILED'
      };
    }
  }, [actions]);
  
  // Refresh queue status
  const refreshQueueStatus = useCallback(async (): Promise<ServiceResponse<void>> => {
    if (isRefreshing || !isInQueue || Date.now() - lastRefreshTime < 1000) {
      return { success: true };
    }
    
    setIsRefreshing(true);
    
    try {
      const result = await actions.refreshQueueStatus();
      setLastRefreshTime(Date.now());
      return result;
    } catch (error) {
      console.error('Error refreshing queue status:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to refresh queue status',
        code: 'REFRESH_FAILED'
      };
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, isInQueue, lastRefreshTime, actions]);
  
  return {
    isInQueue,
    queuePosition,
    estimatedWaitTime,
    playersInQueue,
    isRefreshing,
    joinQueue,
    leaveQueue,
    refreshQueueStatus
  };
}

export default useQueueStatus;