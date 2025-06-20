import { useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { useAuth } from '../context/AuthContext';

/**
 * Custom hook for working with game participants
 * 
 * @returns Participant-related data and utilities
 */
export function useGameParticipants() {
  const { participants, currentGame } = useGame();
  const { currentUser } = useAuth();
  
  // Get current user's participant data
  const currentUserParticipant = useMemo(() => {
    if (!currentUser || !participants.length) return null;
    return participants.find(p => p.user_id === currentUser.id) || null;
  }, [currentUser, participants]);
  
  // Get game creator participant
  const gameCreator = useMemo(() => {
    if (!currentGame || !participants.length) return null;
    return participants.find(p => p.user_id === currentGame.created_by) || null;
  }, [currentGame, participants]);
  
  // Check if current user is game creator
  const isGameCreator = useMemo(() => {
    return currentUser?.id === currentGame?.created_by;
  }, [currentUser, currentGame]);
  
  // Get active participants (not left)
  const activeParticipants = useMemo(() => {
    return participants.filter(p => !p.left_at);
  }, [participants]);
  
  // Get ready participants
  const readyParticipants = useMemo(() => {
    return activeParticipants.filter(p => p.is_ready);
  }, [activeParticipants]);
  
  // Calculate readiness percentage
  const readinessPercentage = useMemo(() => {
    if (!activeParticipants.length) return 0;
    return (readyParticipants.length / activeParticipants.length) * 100;
  }, [activeParticipants, readyParticipants]);
  
  // Sort participants by join time
  const sortedParticipants = useMemo(() => {
    return [...activeParticipants].sort((a, b) => {
      // Game creator first
      if (a.user_id === currentGame?.created_by) return -1;
      if (b.user_id === currentGame?.created_by) return 1;
      
      // Then current user
      if (a.user_id === currentUser?.id) return -1;
      if (b.user_id === currentUser?.id) return 1;
      
      // Then by join time
      return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
    });
  }, [activeParticipants, currentGame, currentUser]);
  
  return {
    allParticipants: participants,
    activeParticipants,
    readyParticipants,
    sortedParticipants,
    currentUserParticipant,
    gameCreator,
    isGameCreator,
    readinessPercentage,
    totalParticipants: activeParticipants.length,
    readyCount: readyParticipants.length
  };
}

export default useGameParticipants;