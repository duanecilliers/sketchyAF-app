import { useState, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import { Game, ServiceResponse } from '../types/game';

interface UseGameCreationOptions {
  onSuccess?: (game: Game) => void;
  onError?: (error: string) => void;
}

/**
 * Custom hook for game creation workflow
 * 
 * @param options Configuration options
 * @returns Game creation utilities and state
 */
export function useGameCreation(options: UseGameCreationOptions = {}) {
  const { onSuccess, onError } = options;
  const { actions, isLoading, error } = useGame();
  const [prompt, setPrompt] = useState<string>('');
  const [maxPlayers, setMaxPlayers] = useState<number>(4);
  const [roundDuration, setRoundDuration] = useState<number>(60);
  const [votingDuration, setVotingDuration] = useState<number>(30);
  
  // Create a new game
  const createGame = useCallback(async (): Promise<ServiceResponse<Game>> => {
    if (!prompt.trim()) {
      const error = 'Prompt is required';
      onError?.(error);
      return { success: false, error, code: 'VALIDATION_ERROR' };
    }
    
    try {
      const result = await actions.createGame(
        prompt.trim(),
        maxPlayers,
        roundDuration,
        votingDuration
      );
      
      if (result.success && result.data) {
        onSuccess?.(result.data);
      } else if (result.error) {
        onError?.(result.error);
      }
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create game';
      onError?.(errorMessage);
      return { success: false, error: errorMessage, code: 'UNKNOWN_ERROR' };
    }
  }, [prompt, maxPlayers, roundDuration, votingDuration, actions, onSuccess, onError]);
  
  // Reset form
  const resetForm = useCallback(() => {
    setPrompt('');
    setMaxPlayers(4);
    setRoundDuration(60);
    setVotingDuration(30);
  }, []);
  
  // Generate a random prompt
  const generateRandomPrompt = useCallback(() => {
    const prompts = [
      'A raccoon having an existential crisis',
      'Your boss as a potato',
      'A cat wearing a business suit',
      'Aliens visiting a fast-food restaurant',
      'A dinosaur riding a skateboard',
      'A penguin on vacation in Hawaii',
      'The internet if it were a person',
      'A superhero whose power is minor inconvenience',
      'A ghost trying to use a smartphone',
      'Two robots falling in love'
    ];
    
    setPrompt(prompts[Math.floor(Math.random() * prompts.length)]);
  }, []);
  
  return {
    // Form state
    prompt,
    setPrompt,
    maxPlayers,
    setMaxPlayers,
    roundDuration,
    setRoundDuration,
    votingDuration,
    setVotingDuration,
    
    // Actions
    createGame,
    resetForm,
    generateRandomPrompt,
    
    // Status
    isLoading,
    error
  };
}

export default useGameCreation;