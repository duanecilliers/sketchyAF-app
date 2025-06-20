import React from 'react';
import { motion } from 'framer-motion';
import { 
  LogOut, 
  Loader2,
  RefreshCw
} from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { useGameParticipants } from '../../hooks/useGameParticipants';
import Button from '../ui/Button';

interface GameControlsProps {
  className?: string;
  onLeaveGame?: () => void;
}

const GameControls: React.FC<GameControlsProps> = ({
  className = '',
  onLeaveGame
}) => {
  const { 
    isInGame, 
    isLoading, 
    actions
  } = useGame();
  
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
  
  // Handle refresh game state
  const handleRefreshGameState = async () => {
    try {
      await actions.refreshGameState();
    } catch (error) {
      console.error('Failed to refresh game state:', error);
    }
  };
  
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
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