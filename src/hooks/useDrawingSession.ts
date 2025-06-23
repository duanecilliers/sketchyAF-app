import { useState, useEffect, useCallback, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { SubmissionService } from '../services/SubmissionService';
import { BoosterPackService } from '../services/BoosterPackService';
import { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types';
import { AppState } from '@excalidraw/excalidraw/types/types';
import { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types';

export interface DrawingSessionState {
  // Game state
  gameId: string | null;
  prompt: string | null;
  timeRemaining: number | null;
  isDrawingPhase: boolean;
  canSubmit: boolean;
  
  // Drawing state
  hasSubmitted: boolean;
  submissionId: string | null;
  drawingData: ExcalidrawElement[] | null;
  appState: AppState | null;
  
  // UI state
  isLoading: boolean;
  error: string | null;
  
  // Booster pack state
  selectedBoosterPack: string | null;
}

export interface DrawingSessionActions {
  submitDrawing: (elements: ExcalidrawElement[], appState: AppState) => Promise<boolean>;
  saveProgress: (elements: ExcalidrawElement[], appState: AppState) => Promise<boolean>;
  loadProgress: () => Promise<{ elements: ExcalidrawElement[]; appState: AppState } | null>;
  trackAssetUsage: (assetFilename: string, position?: { x: number; y: number }) => Promise<void>;
  clearError: () => void;
}

export interface UseDrawingSessionResult {
  state: DrawingSessionState;
  actions: DrawingSessionActions;
}

/**
 * Custom hook for managing drawing session state and actions
 */
export function useDrawingSession(excalidrawAPI: React.MutableRefObject<ExcalidrawImperativeAPI | null>): UseDrawingSessionResult {
  const { 
    currentGame, 
    gamePhase, 
    isInGame,
    currentTimer,
    hasSubmitted,
    selectedBoosterPack,
    actions: gameActions
  } = useGame();
  
  // Local state
  const [state, setState] = useState<DrawingSessionState>({
    gameId: null,
    prompt: null,
    timeRemaining: null,
    isDrawingPhase: false,
    canSubmit: false,
    hasSubmitted: false,
    submissionId: null,
    drawingData: null,
    appState: null,
    isLoading: false,
    error: null,
    selectedBoosterPack: null
  });
  
  // Refs for tracking state between renders
  const progressSaveTimerRef = useRef<number | null>(null);
  const lastSavedDataRef = useRef<string | null>(null);
  
  // Update state when game context changes
  useEffect(() => {
    setState(prevState => ({
      ...prevState,
      gameId: currentGame?.id || null,
      prompt: currentGame?.prompt || null,
      timeRemaining: currentTimer,
      isDrawingPhase: gamePhase === 'drawing',
      canSubmit: gamePhase === 'drawing' && !hasSubmitted,
      hasSubmitted,
      selectedBoosterPack
    }));
  }, [currentGame, gamePhase, currentTimer, hasSubmitted, selectedBoosterPack]);
  
  // Auto-save drawing progress periodically
  useEffect(() => {
    if (state.isDrawingPhase && !state.hasSubmitted && excalidrawAPI.current) {
      // Clear existing timer
      if (progressSaveTimerRef.current) {
        window.clearInterval(progressSaveTimerRef.current);
      }
      
      // Set up new timer for auto-save every 10 seconds
      progressSaveTimerRef.current = window.setInterval(() => {
        const elements = excalidrawAPI.current?.getSceneElements();
        const appState = excalidrawAPI.current?.getAppState();
        
        if (elements && appState) {
          // Only save if there are changes
          const currentData = JSON.stringify(elements);
          if (currentData !== lastSavedDataRef.current) {
            saveProgress(elements, appState);
            lastSavedDataRef.current = currentData;
          }
        }
      }, 10000); // 10 seconds
    }
    
    return () => {
      if (progressSaveTimerRef.current) {
        window.clearInterval(progressSaveTimerRef.current);
        progressSaveTimerRef.current = null;
      }
    };
  }, [state.isDrawingPhase, state.hasSubmitted]);
  
  // Auto-submit when time expires
  useEffect(() => {
    if (state.isDrawingPhase && state.timeRemaining === 0 && !state.hasSubmitted && excalidrawAPI.current) {
      const elements = excalidrawAPI.current.getSceneElements();
      const appState = excalidrawAPI.current.getAppState();
      
      if (elements && elements.length > 0) {
        submitDrawing(elements, appState);
      }
    }
  }, [state.isDrawingPhase, state.timeRemaining, state.hasSubmitted]);
  
  /**
   * Submit drawing to the server
   */
  const submitDrawing = useCallback(async (
    elements: ExcalidrawElement[], 
    appState: AppState
  ): Promise<boolean> => {
    if (!state.gameId || state.hasSubmitted || !state.isDrawingPhase) {
      return false;
    }
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // Export drawing as image
      const drawingUrl = await exportDrawingToImage(elements, appState);
      
      // Calculate drawing metadata
      const drawingTimeSeconds = calculateDrawingTime(appState);
      const elementCount = elements.length;
      
      // Submit drawing
      const result = await SubmissionService.submitDrawing({
        game_id: state.gameId,
        drawing_data: elements,
        drawing_url: drawingUrl,
        canvas_width: appState.width,
        canvas_height: appState.height,
        element_count: elementCount,
        drawing_time_seconds: drawingTimeSeconds
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to submit drawing');
      }
      
      // Update state
      setState(prev => ({
        ...prev,
        hasSubmitted: true,
        submissionId: result.data?.id || null,
        isLoading: false
      }));
      
      // Refresh game state
      await gameActions.refreshGameState();
      
      return true;
    } catch (error) {
      console.error('Error submitting drawing:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to submit drawing'
      }));
      return false;
    }
  }, [state.gameId, state.hasSubmitted, state.isDrawingPhase, gameActions]);
  
  /**
   * Save drawing progress locally
   */
  const saveProgress = useCallback(async (
    elements: ExcalidrawElement[], 
    appState: AppState
  ): Promise<boolean> => {
    if (!state.gameId) {
      return false;
    }
    
    try {
      // Save to localStorage
      const saveKey = `drawing_progress_${state.gameId}`;
      const saveData = {
        elements,
        appState,
        timestamp: Date.now()
      };
      
      localStorage.setItem(saveKey, JSON.stringify(saveData));
      
      // Update state
      setState(prev => ({
        ...prev,
        drawingData: elements,
        appState
      }));
      
      return true;
    } catch (error) {
      console.error('Error saving drawing progress:', error);
      return false;
    }
  }, [state.gameId]);
  
  /**
   * Load saved drawing progress
   */
  const loadProgress = useCallback(async (): Promise<{ elements: ExcalidrawElement[]; appState: AppState } | null> => {
    if (!state.gameId) {
      return null;
    }
    
    try {
      // Load from localStorage
      const saveKey = `drawing_progress_${state.gameId}`;
      const savedData = localStorage.getItem(saveKey);
      
      if (!savedData) {
        return null;
      }
      
      const { elements, appState, timestamp } = JSON.parse(savedData);
      
      // Check if data is too old (more than 1 hour)
      const isExpired = Date.now() - timestamp > 60 * 60 * 1000;
      if (isExpired) {
        localStorage.removeItem(saveKey);
        return null;
      }
      
      // Update state
      setState(prev => ({
        ...prev,
        drawingData: elements,
        appState
      }));
      
      return { elements, appState };
    } catch (error) {
      console.error('Error loading drawing progress:', error);
      return null;
    }
  }, [state.gameId]);
  
  /**
   * Track asset usage for analytics
   */
  const trackAssetUsage = useCallback(async (
    assetFilename: string,
    position?: { x: number; y: number }
  ): Promise<void> => {
    if (!state.gameId || !state.selectedBoosterPack) {
      return;
    }
    
    try {
      await BoosterPackService.trackAssetUsage(
        state.selectedBoosterPack,
        assetFilename,
        state.gameId,
        position
      );
    } catch (error) {
      console.error('Error tracking asset usage:', error);
      // Don't throw or update error state - this is non-critical
    }
  }, [state.gameId, state.selectedBoosterPack]);
  
  /**
   * Clear error state
   */
  const clearError = useCallback((): void => {
    setState(prev => ({ ...prev, error: null }));
  }, []);
  
  // Return state and actions
  return {
    state,
    actions: {
      submitDrawing,
      saveProgress,
      loadProgress,
      trackAssetUsage,
      clearError
    }
  };
}

/**
 * Export drawing to image URL
 */
async function exportDrawingToImage(
  elements: ExcalidrawElement[],
  appState: AppState
): Promise<string> {
  // For now, return a placeholder URL
  // In a real implementation, this would export the drawing to an image
  // and upload it to Supabase Storage
  return "https://images.pexels.com/photos/1266302/pexels-photo-1266302.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1";
}

/**
 * Calculate drawing time from app state
 */
function calculateDrawingTime(appState: AppState): number {
  // In a real implementation, this would calculate the actual drawing time
  // based on app state and timestamps
  return 60; // Default to 60 seconds
}