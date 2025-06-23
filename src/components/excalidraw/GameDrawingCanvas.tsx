import React, { useRef, useState, useEffect } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import { Image, Clock, Send, AlertTriangle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types';
import { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types';
import { AppState } from '@excalidraw/excalidraw/types/types';

import AssetDrawer from './AssetDrawer';
import Button from '../ui/Button';
import useMobileOptimization from '../../hooks/useMobileOptimization';
import { useDrawingSession } from '../../hooks/useDrawingSession';
import { useGame } from '../../context/GameContext';

interface GameDrawingCanvasProps {
  onExit?: () => void;
}

const GameDrawingCanvas: React.FC<GameDrawingCanvasProps> = ({ onExit }) => {
  // Apply mobile optimizations
  useMobileOptimization();

  // Ref for Excalidraw API
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);

  // Asset Drawer state
  const [isAssetDrawerOpen, setIsAssetDrawerOpen] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Game context
  const { gamePhase, currentGame } = useGame();
  
  // Drawing session hook
  const { 
    state: drawingState, 
    actions: drawingActions 
  } = useDrawingSession(excalidrawAPIRef);

  // Format time for display
  const formatTime = (seconds: number | null): string => {
    if (seconds === null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Load saved progress on mount
  useEffect(() => {
    const loadSavedProgress = async () => {
      const savedData = await drawingActions.loadProgress();
      if (savedData && excalidrawAPIRef.current) {
        excalidrawAPIRef.current.updateScene({
          elements: savedData.elements,
          appState: savedData.appState
        });
        setHasDrawn(savedData.elements.length > 0);
      }
    };

    if (drawingState.isDrawingPhase && !drawingState.hasSubmitted) {
      loadSavedProgress();
    }
  }, [drawingState.isDrawingPhase, drawingState.hasSubmitted]);

  // Handle scene change to detect drawing activity
  const handleChange = (elements: readonly ExcalidrawElement[], appState: AppState) => {
    if (elements.length > 0 && !hasDrawn) {
      setHasDrawn(true);
    }
  };

  // Handle drawing submission
  const handleSubmit = async () => {
    if (!excalidrawAPIRef.current || !hasDrawn) {
      return;
    }

    const elements = excalidrawAPIRef.current.getSceneElements();
    const appState = excalidrawAPIRef.current.getAppState();

    if (elements.length === 0) {
      alert('Please draw something first!');
      return;
    }

    await drawingActions.submitDrawing(elements, appState);
  };

  // Handle exit confirmation
  const handleExit = () => {
    if (hasDrawn && !drawingState.hasSubmitted) {
      setShowExitConfirm(true);
    } else {
      onExit?.();
    }
  };

  // Confirm exit and discard drawing
  const confirmExit = () => {
    setShowExitConfirm(false);
    onExit?.();
  };

  // Cancel exit and continue drawing
  const cancelExit = () => {
    setShowExitConfirm(false);
  };

  return (
    <div className="h-screen w-full relative">
      {/* Hide default library elements and customize toolbar */}
      <style>{`
        /* Hide default library panel completely */
        .excalidraw .library-menu-items__no-items__hint,
        .excalidraw .library-menu-browse-button,
        .excalidraw .library-menu-dropdown-container,
        .excalidraw .library-menu-items-container__header--excal,
        .excalidraw .library-menu-items-container__header--excal + div,
        .excalidraw .library-menu {
          display: none !important;
        }

        /* Toolbar customizations */
        .excalidraw button[title="More tools"],
        .excalidraw .App-toolbar .dropdown-menu-button,
        .excalidraw .main-menu-trigger,
        .excalidraw .help-icon {
          display: none !important;
        }

        label[title="Library"] {
          display: none !important;
        }
      `}</style>

      {/* Game Info Header */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-white border-b-2 border-dark p-3 flex items-center justify-between">
        {/* Timer */}
        <motion.div
          key={drawingState.timeRemaining}
          initial={{ scale: drawingState.timeRemaining && drawingState.timeRemaining <= 10 ? 1.1 : 1 }}
          animate={{ scale: 1 }}
          className={`flex items-center px-3 py-2 rounded-full border-2 border-dark ${
            drawingState.timeRemaining && drawingState.timeRemaining <= 10 
              ? 'bg-red text-white animate-pulse' 
              : drawingState.timeRemaining && drawingState.timeRemaining <= 30 
              ? 'bg-accent text-dark' 
              : 'bg-green text-dark'
          }`}
        >
          <Clock size={18} className="mr-2" />
          <span className="font-heading font-bold text-lg">
            {formatTime(drawingState.timeRemaining)}
          </span>
        </motion.div>

        {/* Prompt */}
        <div className="flex-1 text-center px-4">
          <p className="font-heading font-bold text-lg text-dark truncate">
            "{drawingState.prompt || 'Loading prompt...'}"
          </p>
        </div>

        {/* Exit Button */}
        <Button 
          variant="tertiary" 
          size="sm" 
          onClick={handleExit}
          className="text-medium-gray"
        >
          Exit
        </Button>
      </div>

      {/* Custom Image Library Button */}
      <button
        onClick={() => setIsAssetDrawerOpen(true)}
        className="fixed top-20 right-4 z-20 bg-white border-2 border-dark rounded-lg p-3 shadow-lg hover:bg-off-white transition-colors"
        title="Open Image Library"
      >
        <Image size={20} className="text-dark" />
      </button>

      {/* Excalidraw Canvas */}
      <Excalidraw
        excalidrawAPI={(api) => {
          excalidrawAPIRef.current = api;
        }}
        initialData={{
          elements: [],
          appState: {
            viewBackgroundColor: "#ffffff",
          }
        }}
        onChange={handleChange}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false, // Keep white background
          },
          tools: {
            image: false, // Disable image tool for drawing game
          }
        }}
      />

      {/* Asset Drawer */}
      <AssetDrawer
        isOpen={isAssetDrawerOpen}
        onClose={() => setIsAssetDrawerOpen(false)}
        excalidrawAPI={excalidrawAPIRef.current}
        onAssetUsed={(assetFilename, position) => {
          drawingActions.trackAssetUsage(assetFilename, position);
        }}
      />

      {/* Submit Button */}
      {drawingState.isDrawingPhase && !drawingState.hasSubmitted && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: hasDrawn ? 1 : 0.5, y: 0 }}
          className="absolute bottom-4 right-4 z-20"
        >
          <Button 
            variant="primary" 
            size="lg" 
            onClick={handleSubmit}
            disabled={!hasDrawn || drawingState.isLoading}
            className="shadow-lg"
          >
            {drawingState.isLoading ? (
              <>
                <div className="animate-spin h-5 w-5 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
                Submitting...
              </>
            ) : (
              <>
                <Send size={20} className="mr-2" />
                Submit Drawing
              </>
            )}
          </Button>
        </motion.div>
      )}

      {/* Submitted Overlay */}
      {drawingState.hasSubmitted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-30"
        >
          <div className="bg-white rounded-lg border-2 border-dark p-6 text-center hand-drawn shadow-[8px_8px_0px_0px_rgba(0,0,0,0.8)]">
            <Check size={48} className="text-green mx-auto mb-4" />
            <h3 className="font-heading font-bold text-2xl text-dark mb-2">
              Drawing Submitted!
            </h3>
            <p className="text-medium-gray">
              Waiting for other players to finish...
            </p>
          </div>
        </motion.div>
      )}

      {/* Error Message */}
      {drawingState.error && (
        <div className="absolute bottom-20 left-4 right-4 z-30">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red/10 border-2 border-red rounded-lg p-4 flex items-center shadow-lg"
          >
            <AlertTriangle size={24} className="text-red mr-3 flex-shrink-0" />
            <p className="text-dark flex-grow">{drawingState.error}</p>
            <button 
              onClick={drawingActions.clearError}
              className="ml-2 text-red hover:text-red/80"
            >
              &times;
            </button>
          </motion.div>
        </div>
      )}

      {/* Exit Confirmation Modal */}
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="bg-white rounded-lg border-2 border-dark p-6 max-w-sm w-full hand-drawn shadow-[8px_8px_0px_0px_rgba(0,0,0,0.8)]"
            >
              <div className="text-center">
                <AlertTriangle size={48} className="text-red mx-auto mb-4" />
                <h2 className="font-heading font-bold text-xl text-dark mb-2">
                  Exit Game?
                </h2>
                <p className="text-medium-gray mb-6">
                  You'll lose your drawing progress and miss out on the voting round!
                </p>
                
                <div className="flex gap-3">
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={cancelExit}
                    className="flex-1"
                  >
                    Keep Drawing
                  </Button>
                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={confirmExit}
                    className="flex-1 bg-red hover:bg-red/90"
                  >
                    Exit Game
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GameDrawingCanvas;