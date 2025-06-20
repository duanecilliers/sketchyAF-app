import React from 'react';
import { motion } from 'framer-motion';
import { 
  Pencil, 
  Users, 
  Clock, 
  Shuffle, 
  Loader2 
} from 'lucide-react';
import { useGameCreation } from '../../hooks/useGameCreation';
import Button from '../ui/Button';

interface GameCreationFormProps {
  onGameCreated?: (gameId: string) => void;
  className?: string;
}

const GameCreationForm: React.FC<GameCreationFormProps> = ({
  onGameCreated,
  className = ''
}) => {
  const {
    prompt,
    setPrompt,
    maxPlayers,
    setMaxPlayers,
    roundDuration,
    setRoundDuration,
    votingDuration,
    setVotingDuration,
    createGame,
    generateRandomPrompt,
    isLoading,
    error
  } = useGameCreation({
    onSuccess: (game) => {
      onGameCreated?.(game.id);
    }
  });
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createGame();
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`bg-white rounded-lg border-2 border-dark p-6 hand-drawn shadow-[8px_8px_0px_0px_rgba(0,0,0,0.8)] ${className}`}
    >
      <h2 className="font-heading font-bold text-2xl mb-6 flex items-center">
        <Pencil size={24} className="mr-2 text-primary" />
        Create a New Game
      </h2>
      
      {error && (
        <div className="mb-6 p-3 bg-red/10 border border-red rounded-lg text-red text-sm">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          {/* Prompt */}
          <div>
            <label className="block mb-1 font-heading font-bold text-dark">
              Drawing Prompt
            </label>
            <div className="flex">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., A raccoon having an existential crisis"
                className="flex-1 px-4 py-3 rounded-md border-2 border-dark focus:ring-2 focus:ring-primary focus:border-primary font-body"
                required
              />
              <Button
                type="button"
                variant="tertiary"
                onClick={generateRandomPrompt}
                className="ml-2"
              >
                <Shuffle size={20} />
              </Button>
            </div>
          </div>
          
          {/* Game Settings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Max Players */}
            <div>
              <label className="block mb-1 font-heading font-bold text-dark flex items-center">
                <Users size={16} className="mr-1" />
                Max Players
              </label>
              <select
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                className="w-full px-4 py-3 rounded-md border-2 border-dark focus:ring-2 focus:ring-primary focus:border-primary font-body"
              >
                {[2, 3, 4, 5, 6, 7, 8].map(num => (
                  <option key={num} value={num}>{num} players</option>
                ))}
              </select>
            </div>
            
            {/* Round Duration */}
            <div>
              <label className="block mb-1 font-heading font-bold text-dark flex items-center">
                <Clock size={16} className="mr-1" />
                Drawing Time
              </label>
              <select
                value={roundDuration}
                onChange={(e) => setRoundDuration(Number(e.target.value))}
                className="w-full px-4 py-3 rounded-md border-2 border-dark focus:ring-2 focus:ring-primary focus:border-primary font-body"
              >
                <option value={30}>30 seconds</option>
                <option value={45}>45 seconds</option>
                <option value={60}>60 seconds</option>
                <option value={90}>90 seconds</option>
                <option value={120}>2 minutes</option>
                <option value={180}>3 minutes</option>
                <option value={300}>5 minutes</option>
              </select>
            </div>
            
            {/* Voting Duration */}
            <div>
              <label className="block mb-1 font-heading font-bold text-dark flex items-center">
                <Vote size={16} className="mr-1" />
                Voting Time
              </label>
              <select
                value={votingDuration}
                onChange={(e) => setVotingDuration(Number(e.target.value))}
                className="w-full px-4 py-3 rounded-md border-2 border-dark focus:ring-2 focus:ring-primary focus:border-primary font-body"
              >
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={45}>45 seconds</option>
                <option value={60}>60 seconds</option>
                <option value={90}>90 seconds</option>
                <option value={120}>2 minutes</option>
              </select>
            </div>
          </div>
          
          {/* Submit Button */}
          <div className="pt-4">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={isLoading || !prompt.trim()}
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <Loader2 size={20} className="mr-2 animate-spin" />
                  <span>Creating Game...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  <Pencil size={20} className="mr-2" />
                  <span>Create Game</span>
                </div>
              )}
            </Button>
          </div>
        </div>
      </form>
    </motion.div>
  );
};

export default GameCreationForm;