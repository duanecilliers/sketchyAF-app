import React, { Suspense, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Seo from '../components/utils/Seo';
import { useGame } from '../context/GameContext';

// Dynamic import to avoid loading Excalidraw on initial bundle
const GameDrawingCanvas = React.lazy(() => import('../components/excalidraw/GameDrawingCanvas'));

const ExcalidrawDraw = () => {
  const navigate = useNavigate();
  const { gamePhase, isInGame, currentGame } = useGame();
  
  // Redirect if not in a game or not in drawing phase
  useEffect(() => {
    if (!isInGame) {
      navigate('/uiux/lobby');
      return;
    }
    
    if (gamePhase !== 'drawing' && gamePhase !== 'waiting' && gamePhase !== 'briefing') {
      // Redirect based on game phase
      switch (gamePhase) {
        case 'voting':
          navigate('/uiux/voting');
          break;
        case 'results':
          navigate('/uiux/results');
          break;
        case 'completed':
          navigate('/uiux/post-game');
          break;
        default:
          navigate('/uiux/lobby');
      }
    }
  }, [isInGame, gamePhase, navigate]);

  // Handle exit from drawing canvas
  const handleExit = () => {
    navigate('/uiux/lobby');
  };

  return (
    <>
      <Seo 
        title={`Drawing: ${currentGame?.prompt || 'Loading...'}`}
        description="Create your masterpiece in SketchyAF's drawing game!"
      />
      <div className="min-h-screen bg-white">
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-medium-gray">Loading drawing canvas...</p>
            </div>
          </div>
        }>
          <GameDrawingCanvas onExit={handleExit} />
        </Suspense>
      </div>
    </>
  );
};

export default ExcalidrawDraw;