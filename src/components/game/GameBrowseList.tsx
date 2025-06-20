import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, 
  RefreshCw, 
  Loader2, 
  AlertTriangle 
} from 'lucide-react';
import { Game } from '../../types/game';
import { GameService } from '../../services/GameService';
import GameJoinCard from './GameJoinCard';
import Button from '../ui/Button';

interface GameBrowseListProps {
  onJoinGame?: (gameId: string) => void;
  className?: string;
}

const GameBrowseList: React.FC<GameBrowseListProps> = ({
  onJoinGame,
  className = ''
}) => {
  const [games, setGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Load available games
  const loadGames = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await GameService.getAvailableGames();
      
      if (result.success && result.data) {
        setGames(result.data.data);
      } else {
        setError(result.error || 'Failed to load games');
      }
    } catch (error) {
      console.error('Failed to load games:', error);
      setError('Failed to load available games');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Load games on mount
  useEffect(() => {
    loadGames();
  }, []);
  
  // Filter games by search term
  const filteredGames = searchTerm.trim()
    ? games.filter(game => 
        game.prompt.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : games;
  
  // Sort games by creation time (newest first)
  const sortedGames = [...filteredGames].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  
  // Handle join game
  const handleJoinGame = (gameId: string) => {
    onJoinGame?.(gameId);
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-lg border-2 border-dark p-6 hand-drawn shadow-[8px_8px_0px_0px_rgba(0,0,0,0.8)] ${className}`}
    >
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-heading font-bold text-2xl text-dark">Available Games</h2>
        
        <Button
          variant="tertiary"
          size="sm"
          onClick={loadGames}
          disabled={isLoading}
        >
          <RefreshCw size={18} className={`mr-1 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>
      
      {/* Search */}
      <div className="relative mb-6">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search games by prompt..."
          className="w-full pl-10 pr-4 py-3 rounded-md border-2 border-dark focus:ring-2 focus:ring-primary focus:border-primary font-body"
        />
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-medium-gray" size={20} />
      </div>
      
      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-red/10 border border-red rounded-lg flex items-start">
          <AlertTriangle size={20} className="text-red mr-2 flex-shrink-0 mt-1" />
          <p className="text-red">{error}</p>
        </div>
      )}
      
      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 size={24} className="animate-spin text-primary mr-2" />
          <span className="text-medium-gray">Loading available games...</span>
        </div>
      )}
      
      {/* No games found */}
      {!isLoading && sortedGames.length === 0 && (
        <div className="text-center p-8 border-2 border-dashed border-light-gray rounded-lg">
          <p className="text-medium-gray mb-2">No games available</p>
          <p className="text-sm text-medium-gray">
            {searchTerm.trim() 
              ? 'Try a different search term or create a new game' 
              : 'Create a new game to get started'}
          </p>
        </div>
      )}
      
      {/* Games list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sortedGames.map(game => (
          <GameJoinCard
            key={game.id}
            game={game}
            onJoinSuccess={handleJoinGame}
          />
        ))}
      </div>
    </motion.div>
  );
};

export default GameBrowseList;