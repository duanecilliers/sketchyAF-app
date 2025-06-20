import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Loader2 } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { GamePhase } from '../../types/game-state';

interface ReadyButtonProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  onReadyStateChange?: (isReady: boolean) => void;
}

const ReadyButton: React.FC<ReadyButtonProps> = ({
  className = '',
  size = 'md',
  onReadyStateChange
}) => {
  const { gamePhase, isReady, isLoading, actions } = useGame();
  
  // Only show in waiting phase
  if (gamePhase !== GamePhase.WAITING) {
    return null;
  }
  
  const handleToggleReady = async () => {
    try {
      await actions.setPlayerReady(!isReady);
      onReadyStateChange?.(!isReady);
    } catch (error) {
      console.error('Failed to toggle ready status:', error);
    }
  };
  
  // Size classes
  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg'
  };
  
  return (
    <motion.button
      onClick={handleToggleReady}
      disabled={isLoading}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`
        font-heading font-bold rounded-lg transition-colors
        ${sizeClasses[size]}
        ${isReady 
          ? 'bg-green text-dark border-2 border-dark hover:bg-green/90' 
          : 'bg-orange text-dark border-2 border-dark hover:bg-orange/90'
        }
        ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}
        ${className}
      `}
    >
      <div className="flex items-center justify-center">
        {isLoading ? (
          <Loader2 size={20} className="mr-2 animate-spin" />
        ) : (
          <CheckCircle size={20} className="mr-2" />
        )}
        <span>{isReady ? 'Ready!' : 'Ready Up'}</span>
      </div>
    </motion.button>
  );
};

export default ReadyButton;