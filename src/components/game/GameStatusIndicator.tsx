import React from 'react';
import { motion } from 'framer-motion';
import { 
  Clock, 
  Users, 
  Pencil, 
  Vote, 
  Trophy, 
  CheckCircle, 
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { GamePhase } from '../../types/game-state';
import useGameTimer from '../../hooks/useGameTimer';

interface GameStatusIndicatorProps {
  showTimer?: boolean;
  showPhase?: boolean;
  showParticipants?: boolean;
  className?: string;
}

const GameStatusIndicator: React.FC<GameStatusIndicatorProps> = ({
  showTimer = true,
  showPhase = true,
  showParticipants = true,
  className = ''
}) => {
  const { gamePhase, participants, isInGame, connectionStatus } = useGame();
  const { formattedTime, isTimeAlmostUp } = useGameTimer();
  
  // Skip rendering if not in a game
  if (!isInGame) {
    return null;
  }
  
  // Get phase icon and color
  const getPhaseInfo = () => {
    switch (gamePhase) {
      case GamePhase.WAITING:
        return { 
          icon: <Clock size={18} />, 
          label: 'Waiting for Players', 
          color: 'bg-secondary text-white' 
        };
      case GamePhase.BRIEFING:
        return { 
          icon: <Clock size={18} />, 
          label: 'Briefing', 
          color: 'bg-accent text-dark' 
        };
      case GamePhase.DRAWING:
        return { 
          icon: <Pencil size={18} />, 
          label: 'Drawing', 
          color: 'bg-green text-dark' 
        };
      case GamePhase.VOTING:
        return { 
          icon: <Vote size={18} />, 
          label: 'Voting', 
          color: 'bg-primary text-white' 
        };
      case GamePhase.RESULTS:
        return { 
          icon: <Trophy size={18} />, 
          label: 'Results', 
          color: 'bg-purple text-white' 
        };
      case GamePhase.COMPLETED:
        return { 
          icon: <CheckCircle size={18} />, 
          label: 'Completed', 
          color: 'bg-success text-white' 
        };
      case GamePhase.CANCELLED:
        return { 
          icon: <XCircle size={18} />, 
          label: 'Cancelled', 
          color: 'bg-error text-white' 
        };
      default:
        return { 
          icon: <AlertTriangle size={18} />, 
          label: 'Unknown', 
          color: 'bg-warning text-dark' 
        };
    }
  };
  
  const { icon, label, color } = getPhaseInfo();
  const activeParticipants = participants.filter(p => !p.left_at);
  
  // Get connection status indicator
  const getConnectionStatus = () => {
    switch (connectionStatus) {
      case 'connected':
        return <div className="w-2 h-2 rounded-full bg-success"></div>;
      case 'connecting':
      case 'reconnecting':
        return <div className="w-2 h-2 rounded-full bg-warning animate-pulse"></div>;
      case 'disconnected':
      case 'error':
        return <div className="w-2 h-2 rounded-full bg-error"></div>;
      default:
        return null;
    }
  };
  
  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {/* Connection status */}
      <div className="mr-1">{getConnectionStatus()}</div>
      
      {/* Game phase */}
      {showPhase && (
        <div className={`flex items-center px-3 py-1 rounded-full ${color}`}>
          {icon}
          <span className="ml-1 font-heading font-semibold text-sm">{label}</span>
        </div>
      )}
      
      {/* Timer */}
      {showTimer && gamePhase !== GamePhase.WAITING && gamePhase !== GamePhase.COMPLETED && gamePhase !== GamePhase.CANCELLED && (
        <motion.div
          key={formattedTime}
          initial={{ scale: isTimeAlmostUp ? 1.1 : 1 }}
          animate={{ scale: 1 }}
          className={`flex items-center px-3 py-1 rounded-full border ${
            isTimeAlmostUp 
              ? 'bg-red text-white border-red animate-pulse' 
              : 'bg-white text-dark border-light-gray'
          }`}
        >
          <Clock size={16} className="mr-1" />
          <span className="font-heading font-semibold text-sm">{formattedTime}</span>
        </motion.div>
      )}
      
      {/* Participants */}
      {showParticipants && (
        <div className="flex items-center px-3 py-1 rounded-full bg-white text-dark border border-light-gray">
          <Users size={16} className="mr-1" />
          <span className="font-heading font-semibold text-sm">{activeParticipants.length}</span>
        </div>
      )}
    </div>
  );
};

export default GameStatusIndicator;