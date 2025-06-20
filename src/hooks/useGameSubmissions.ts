import { useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { useAuth } from '../context/AuthContext';
import { Submission } from '../types/game';

/**
 * Custom hook for working with game submissions
 * 
 * @returns Submission-related data and utilities
 */
export function useGameSubmissions() {
  const { submissions, votes, currentGame } = useGame();
  const { currentUser } = useAuth();
  
  // Get current user's submission
  const currentUserSubmission = useMemo(() => {
    if (!currentUser || !submissions.length) return null;
    return submissions.find(s => s.user_id === currentUser.id) || null;
  }, [currentUser, submissions]);
  
  // Get submissions with vote counts
  const submissionsWithVotes = useMemo(() => {
    return submissions.map(submission => {
      const submissionVotes = votes.filter(v => v.submission_id === submission.id);
      return {
        ...submission,
        voteCount: submissionVotes.length,
        voters: submissionVotes.map(v => v.voter_id)
      };
    });
  }, [submissions, votes]);
  
  // Sort submissions by vote count
  const sortedByVotes = useMemo(() => {
    return [...submissionsWithVotes].sort((a, b) => b.voteCount - a.voteCount);
  }, [submissionsWithVotes]);
  
  // Get winning submission
  const winningSubmission = useMemo(() => {
    if (!sortedByVotes.length) return null;
    return sortedByVotes[0];
  }, [sortedByVotes]);
  
  // Check if current user has voted for a submission
  const hasVotedFor = useCallback((submissionId: string): boolean => {
    if (!currentUser || !votes.length) return false;
    return votes.some(v => v.voter_id === currentUser.id && v.submission_id === submissionId);
  }, [currentUser, votes]);
  
  // Get submission by user ID
  const getSubmissionByUserId = useCallback((userId: string): Submission | null => {
    return submissions.find(s => s.user_id === userId) || null;
  }, [submissions]);
  
  // Get random submissions (for voting)
  const getRandomSubmissions = useCallback((count: number = 3): Submission[] => {
    if (!submissions.length) return [];
    
    // Filter out current user's submission
    const otherSubmissions = submissions.filter(s => s.user_id !== currentUser?.id);
    if (!otherSubmissions.length) return [];
    
    // Shuffle and take requested count
    return [...otherSubmissions]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(count, otherSubmissions.length));
  }, [submissions, currentUser]);
  
  return {
    allSubmissions: submissions,
    submissionsWithVotes,
    sortedByVotes,
    currentUserSubmission,
    winningSubmission,
    hasVotedFor,
    getSubmissionByUserId,
    getRandomSubmissions,
    submissionCount: submissions.length,
    hasCurrentUserSubmitted: !!currentUserSubmission
  };
}

export default useGameSubmissions;