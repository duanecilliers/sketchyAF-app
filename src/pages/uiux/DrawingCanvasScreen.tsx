import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Seo from '../../components/utils/Seo';
import { useGame } from '../../context/GameContext';
import GameDrawingCanvas from '../../components/excalidraw/GameDrawingCanvas';

const DrawingCanvasScreen: React.FC = () => {
  const navigate = useNavigate();
  const { gamePhase, isInGame, currentGame } = useGame();
  
  // Redirect if not in a game or not in drawing phase
  useEffect(() => {
    if (!isInGame) {
      navigate('/uiux/lobby');
      return;
    }
    
    if (gamePhase !== 'drawing') {
      // Redirect based on game phase
      switch (gamePhase) {
        case 'waiting':
        case 'briefing':
          navigate('/uiux/pre-round');
          break;
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
      <GameDrawingCanvas onExit={handleExit} />
    </>
  );
};

export default DrawingCanvasScreen;