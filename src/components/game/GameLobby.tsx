import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Clock, 
  Lightbulb,
  Share2
} from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { GamePhase } from '../../types/game-state';
import { useGameParticipants } from '../../hooks/useGameParticipants';
import GameStatusIndicator from './GameStatusIndicator';
import ParticipantList from './ParticipantList';
import ReadyButton from './ReadyButton';
import BoosterPackSelector from './BoosterPackSelector';
import GameControls from './GameControls';
import Button from '../ui/Button';

interface GameLobbyProps {
  className?: string;
  onGameStart?: () => void;
}

const GameLobby: React.FC<GameLobbyProps> = ({
  className = '',
  onGameStart
}) => {
  const { gamePhase, currentGame, isInGame } = useGame();
  const { readyCount, totalParticipants, isGameCreator } = useGameParticipants();
  const navigate = useNavigate();
  
  // Skip rendering if not in a game or not in waiting phase
  if (!isInGame || gamePhase !== GamePhase.WAITING || !currentGame) {
    return null;
  }
  
  // Random tips for the waiting screen
  const tips = [
    "💡 Tip: The worse your drawing, the funnier it gets!",
    "🎨 Did you know? 73% of SketchyAF winners can't draw stick figures properly.",
    "⚡ Pro tip: Use booster packs for maximum chaos and confusion.",
    "🏆 Fun fact: The most voted drawing was literally just a potato with legs.",
    "🎭 Remember: Artistic skill is optional, creativity is everything!",
    "🌟 Tip: Sometimes the best strategy is to embrace the chaos."
  ];
  
  const randomTip = tips[Math.floor(Math.random() * tips.length)];
  
  // Handle game start
  const handleGameStart = () => {
    onGameStart?.();
  };
  
  // Handle share game
  const handleShareGame = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Join my SketchyAF game!',
        text: `Join my drawing game with prompt: "${currentGame.prompt}"`,
        url: `${window.location.origin}/game/${currentGame.id}`
      }).catch(console.error);
    } else {
      // Fallback for browsers that don't support navigator.share
      navigator.clipboard.writeText(`${window.location.origin}/game/${currentGame.id}`)
        .then(() => alert('Game link copied to clipboard!'))
        .catch(console.error);
    }
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-lg border-2 border-dark p-6 hand-drawn shadow-[8px_8px_0px_0px_rgba(0,0,0,0.8)] ${className}`}
    >
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Column - Game Info */}
        <div className="md:w-1/2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-heading font-bold text-2xl text-dark">Game Lobby</h2>
            <GameStatusIndicator />
          </div>
          
          {/* Game Prompt */}
          <div className="mb-6">
            <h3 className="font-heading font-semibold text-lg text-dark mb-2">Prompt:</h3>
            <div className="bg-primary/10 p-4 rounded-lg border border-primary/30">
              <p className="font-heading font-bold text-xl text-primary">
                "{currentGame.prompt}"
              </p>
            </div>
          </div>
          
          {/* Game Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-off-white p-3 rounded-lg border border-light-gray">
              <div className="flex items-center text-medium-gray mb-1">
                <Users size={16} className="mr-1" />
                <span className="text-sm">Players</span>
              </div>
              <p className="font-heading font-bold text-lg">
                {totalParticipants}/{currentGame.max_players}
              </p>
            </div>
            
            <div className="bg-off-white p-3 rounded-lg border border-light-gray">
              <div className="flex items-center text-medium-gray mb-1">
                <Clock size={16} className="mr-1" />
                <span className="text-sm">Round Time</span>
              </div>
              <p className="font-heading font-bold text-lg">
                {currentGame.round_duration}s
              </p>
            </div>
          </div>
          
          {/* Tip Box */}
          <div className="bg-accent/10 p-4 rounded-lg border border-accent mb-6">
            <div className="flex items-center mb-2">
              <Lightbulb size={18} className="text-accent mr-2" />
              <h3 className="font-heading font-semibold text-dark">Tip</h3>
            </div>
            <p className="text-dark-gray text-sm">{randomTip}</p>
          </div>
          
          {/* Share Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleShareGame}
            className="w-full mb-6"
          >
            <Share2 size={18} className="mr-2" />
            <span>Invite Friends</span>
          </Button>
          
          {/* Game Controls */}
          <GameControls onStartGame={handleGameStart} />
        </div>
        
        {/* Right Column - Players & Ready */}
        <div className="md:w-1/2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-heading font-bold text-xl text-dark flex items-center">
              <Users size={20} className="mr-2 text-secondary" />
              Players ({readyCount}/{totalParticipants} ready)
            </h3>
          </div>
          
          {/* Participants List */}
          <div className="mb-6">
            <ParticipantList />
          </div>
          
          {/* Booster Pack Selector */}
          <div className="mb-6">
            <BoosterPackSelector />
          </div>
          
          {/* Ready Button */}
          <ReadyButton className="w-full" />
        </div>
      </div>
    </motion.div>
  );
};

export default GameLobby;