import React from 'react';
import { motion } from 'framer-motion';
import { 
  Play, 
  LogOut, 
  Loader2,
  RefreshCw
} from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { GamePhase } from '../../types/game-state';
import { useGameParticipants } from '../../hooks/useGameParticipants';
import Button from '../ui/Button';

interface GameControlsProps {
  className?: string;
  onLeaveGame?: () => void;
  onStartGame?: () => void;
}

const GameControls: React.FC<GameControlsProps> = ({
  className = '',
  onLeaveGame,
  onStartGame
}) => {
  const { 
    gamePhase, 
    isInGame, 
    isLoading, 
    actions,
    currentGame
  } = useGame();
  
  const { 
    isGameCreator, 
    readyParticipants, 
    activeParticipants 
  } = useGameParticipants();
  
  // Skip rendering if not in a game
  if (!isInGame) {
    return null;
  }
  
  // Handle leave game
  const handleLeaveGame = async () => {
    try {
      await actions.leaveGame();
      onLeaveGame?.();
    } catch (error) {
      console.error('Failed to leave game:', error);
    }
  };
  
  // Handle start game (only for game creator in waiting phase)
  const handleStartGame = async () => {
    if (!isGameCreator || gamePhase !== GamePhase.WAITING) return;
    
    try {
      await actions.startGame();
      onStartGame?.();
    } catch (error) {
      console.error('Failed to start game:', error);
    }
  };
  
  // Handle refresh game state
  const handleRefreshGameState = async () => {
    try {
      await actions.refreshGameState();
    } catch (error) {
      console.error('Failed to refresh game state:', error);
    }
  };
  
  // Check if game can be started
  const canStartGame = 
    isGameCreator && 
    gamePhase === GamePhase.WAITING && 
    readyParticipants.length >= 2 &&
    readyParticipants.length === activeParticipants.length;
  
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {/* Start Game Button (only for game creator in waiting phase) */}
      {gamePhase === GamePhase.WAITING && isGameCreator && (
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Button
            variant="primary"
            onClick={handleStartGame}
            disabled={!canStartGame || isLoading}
            className={`${!canStartGame ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isLoading ? (
              <div className="flex items-center">
                <Loader2 size={20} className="mr-2 animate-spin" />
                <span>Starting...</span>
              </div>
            ) : (
              <div className="flex items-center">
                <Play size={20} className="mr-2" />
                <span>Start Game</span>
              </div>
            )}
          </Button>
        </motion.div>
      )}
      
      {/* Refresh Button */}
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button
          variant="secondary"
          onClick={handleRefreshGameState}
          disabled={isLoading}
        >
          <RefreshCw size={20} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </motion.div>
      
      {/* Leave Game Button */}
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button
          variant="tertiary"
          onClick={handleLeaveGame}
          disabled={isLoading}
        >
          <LogOut size={20} className="mr-2" />
          <span>Leave Game</span>
        </Button>
      </motion.div>
    </div>
  );
};

export default GameControls;