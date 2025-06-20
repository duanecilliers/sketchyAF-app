import { useMemo, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import { useAuth } from '../context/AuthContext';
import { Vote } from '../types/game';

/**
 * Custom hook for working with game votes
 * 
 * @returns Vote-related data and utilities
 */
export function useGameVotes() {
  const { votes, submissions, participants, currentGame } = useGame();
  const { currentUser } = useAuth();
  
  // Get current user's vote
  const currentUserVote = useMemo(() => {
    if (!currentUser || !votes.length) return null;
    return votes.find(v => v.voter_id === currentUser.id) || null;
  }, [currentUser, votes]);
  
  // Get votes for a specific submission
  const getVotesForSubmission = useCallback((submissionId: string): Vote[] => {
    return votes.filter(v => v.submission_id === submissionId);
  }, [votes]);
  
  // Get vote count for a specific submission
  const getVoteCountForSubmission = useCallback((submissionId: string): number => {
    return getVotesForSubmission(submissionId).length;
  }, [getVotesForSubmission]);
  
  // Get submission with most votes
  const mostVotedSubmission = useMemo(() => {
    if (!submissions.length) return null;
    
    const submissionVoteCounts = submissions.map(submission => ({
      submission,
      voteCount: getVoteCountForSubmission(submission.id)
    }));
    
    const sorted = submissionVoteCounts.sort((a, b) => b.voteCount - a.voteCount);
    return sorted[0]?.submission || null;
  }, [submissions, getVoteCountForSubmission]);
  
  // Get vote distribution as percentages
  const voteDistribution = useMemo(() => {
    if (!submissions.length || !votes.length) return [];
    
    const totalVotes = votes.length;
    
    return submissions.map(submission => {
      const voteCount = getVoteCountForSubmission(submission.id);
      const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
      
      return {
        submissionId: submission.id,
        userId: submission.user_id,
        voteCount,
        percentage
      };
    }).sort((a, b) => b.voteCount - a.voteCount);
  }, [submissions, votes, getVoteCountForSubmission]);
  
  // Check if all active participants have voted
  const haveAllVoted = useMemo(() => {
    const activeParticipants = participants.filter(p => !p.left_at);
    return votes.length >= activeParticipants.length;
  }, [participants, votes]);
  
  return {
    allVotes: votes,
    currentUserVote,
    getVotesForSubmission,
    getVoteCountForSubmission,
    mostVotedSubmission,
    voteDistribution,
    haveAllVoted,
    voteCount: votes.length,
    hasCurrentUserVoted: !!currentUserVote
  };
}

export default useGameVotes;