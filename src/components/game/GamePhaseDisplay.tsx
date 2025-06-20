import React from 'react';
import { motion } from 'framer-motion';
import { 
  Clock, 
  Pencil, 
  Vote, 
  Trophy, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  Users
} from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { GamePhase } from '../../types/game-state';
import useGameTimer from '../../hooks/useGameTimer';

interface GamePhaseDisplayProps {
  className?: string;
  showDescription?: boolean;
}

const GamePhaseDisplay: React.FC<GamePhaseDisplayProps> = ({
  className = '',
  showDescription = true
}) => {
  const { gamePhase, isInGame } = useGame();
  const { formattedTime, isTimeAlmostUp } = useGameTimer();
  
  // Skip rendering if not in a game
  if (!isInGame) {
    return null;
  }
  
  // Get phase information
  const getPhaseInfo = () => {
    switch (gamePhase) {
      case GamePhase.WAITING:
        return {
          icon: <Users size={24} className="text-secondary" />,
          label: 'Waiting for Players',
          description: 'Get ready to start the game!',
          color: 'bg-secondary/10 border-secondary'
        };
      case GamePhase.BRIEFING:
        return {
          icon: <Clock size={24} className="text-accent" />,
          label: 'Briefing',
          description: 'Prepare for the drawing phase',
          color: 'bg-accent/10 border-accent'
        };
      case GamePhase.DRAWING:
        return {
          icon: <Pencil size={24} className="text-green" />,
          label: 'Drawing',
          description: 'Create your masterpiece!',
          color: 'bg-green/10 border-green'
        };
      case GamePhase.VOTING:
        return {
          icon: <Vote size={24} className="text-primary" />,
          label: 'Voting',
          description: 'Vote for your favorite drawing',
          color: 'bg-primary/10 border-primary'
        };
      case GamePhase.RESULTS:
        return {
          icon: <Trophy size={24} className="text-purple" />,
          label: 'Results',
          description: 'See who won the round',
          color: 'bg-purple/10 border-purple'
        };
      case GamePhase.COMPLETED:
        return {
          icon: <CheckCircle size={24} className="text-success" />,
          label: 'Completed',
          description: 'Game has ended',
          color: 'bg-success/10 border-success'
        };
      case GamePhase.CANCELLED:
        return {
          icon: <XCircle size={24} className="text-error" />,
          label: 'Cancelled',
          description: 'Game was cancelled',
          color: 'bg-error/10 border-error'
        };
      default:
        return {
          icon: <AlertTriangle size={24} className="text-warning" />,
          label: 'Unknown',
          description: 'Unknown game phase',
          color: 'bg-warning/10 border-warning'
        };
    }
  };
  
  const { icon, label, description, color } = getPhaseInfo();
  
  return (
    <div className={`${className}`}>
      <div className={`p-4 rounded-lg border ${color}`}>
        <div className="flex items-center">
          <div className="mr-3">
            {icon}
          </div>
          
          <div className="flex-1">
            <h3 className="font-heading font-bold text-lg text-dark">{label}</h3>
            {showDescription && (
              <p className="text-medium-gray text-sm">{description}</p>
            )}
          </div>
          
          {/* Timer for timed phases */}
          {(gamePhase === GamePhase.BRIEFING || 
            gamePhase === GamePhase.DRAWING || 
            gamePhase === GamePhase.VOTING || 
            gamePhase === GamePhase.RESULTS) && (
            <motion.div
              key={formattedTime}
              initial={{ scale: isTimeAlmostUp ? 1.1 : 1 }}
              animate={{ scale: 1 }}
              className={`px-3 py-1 rounded-full ${
                isTimeAlmostUp 
                  ? 'bg-red text-white animate-pulse' 
                  : 'bg-white text-dark border border-light-gray'
              }`}
            >
              <div className="flex items-center">
                <Clock size={16} className="mr-1" />
                <span className="font-heading font-semibold text-sm">{formattedTime}</span>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GamePhaseDisplay;