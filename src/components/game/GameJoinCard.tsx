import React from 'react';
import { motion } from 'framer-motion';
import { 
  Users, 
  Clock, 
  ArrowRight, 
  Loader2 
} from 'lucide-react';
import { Game } from '../../types/game';
import { useGame } from '../../context/GameContext';
import Button from '../ui/Button';

interface GameJoinCardProps {
  game: Game;
  onJoinSuccess?: (gameId: string) => void;
  className?: string;
}

const GameJoinCard: React.FC<GameJoinCardProps> = ({
  game,
  onJoinSuccess,
  className = ''
}) => {
  const { isLoading, actions } = useGame();
  const [isJoining, setIsJoining] = React.useState(false);
  
  // Format creation time
  const formatCreationTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // Calculate time since creation
  const getTimeSinceCreation = (timestamp: string) => {
    const created = new Date(timestamp).getTime();
    const now = Date.now();
    const diffInSeconds = Math.floor((now - created) / 1000);
    
    if (diffInSeconds < 60) {
      return `${diffInSeconds}s ago`;
    } else if (diffInSeconds < 3600) {
      return `${Math.floor(diffInSeconds / 60)}m ago`;
    } else {
      return `${Math.floor(diffInSeconds / 3600)}h ago`;
    }
  };
  
  // Handle join game
  const handleJoinGame = async () => {
    setIsJoining(true);
    
    try {
      const result = await actions.joinGame(game.id);
      
      if (result.success) {
        onJoinSuccess?.(game.id);
      }
    } catch (error) {
      console.error('Failed to join game:', error);
    } finally {
      setIsJoining(false);
    }
  };
  
  return (
    <motion.div
      whileHover={{ y: -5 }}
      className={`bg-white rounded-lg border-2 border-dark p-4 hand-drawn shadow-[4px_4px_0px_0px_rgba(0,0,0,0.8)] ${className}`}
    >
      <div className="flex justify-between items-start mb-3">
        <h3 className="font-heading font-bold text-lg text-dark truncate max-w-[70%]">
          "{game.prompt}"
        </h3>
        <div className="flex items-center bg-secondary/10 px-2 py-1 rounded-full border border-secondary/30">
          <Clock size={14} className="text-secondary mr-1" />
          <span className="text-xs">{getTimeSinceCreation(game.created_at)}</span>
        </div>
      </div>
      
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <Users size={16} className="text-medium-gray mr-1" />
          <span className="text-sm text-medium-gray">
            {game.current_players}/{game.max_players} players
          </span>
        </div>
        
        <div className="flex items-center">
          <Clock size={16} className="text-medium-gray mr-1" />
          <span className="text-sm text-medium-gray">
            {game.round_duration}s rounds
          </span>
        </div>
      </div>
      
      <Button
        variant="primary"
        size="sm"
        onClick={handleJoinGame}
        disabled={isLoading || isJoining || game.current_players >= game.max_players}
        className="w-full"
      >
        {isJoining ? (
          <div className="flex items-center justify-center">
            <Loader2 size={16} className="mr-2 animate-spin" />
            <span>Joining...</span>
          </div>
        ) : game.current_players >= game.max_players ? (
          <span>Game Full</span>
        ) : (
          <div className="flex items-center justify-center">
            <span>Join Game</span>
            <ArrowRight size={16} className="ml-2" />
          </div>
        )}
      </Button>
    </motion.div>
  );
};

export default GameJoinCard;