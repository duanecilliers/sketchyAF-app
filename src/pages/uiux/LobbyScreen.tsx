import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Clock, 
  Users, 
  Trophy, 
  Lightbulb, 
  X, 
  Wifi, 
  Share2,
  Plus,
  Search
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Seo from '../../components/utils/Seo';
import { useGame } from '../../context/GameContext';
import { GamePhase } from '../../types/game-state';
import GameCreationForm from '../../components/game/GameCreationForm';
import GameBrowseList from '../../components/game/GameBrowseList';
import GameLobby from '../../components/game/GameLobby';

// Mock data for demo purposes
const TIPS_AND_TRIVIA = [
  "💡 Tip: The worse your drawing, the funnier it gets!",
  "🎨 Did you know? 73% of SketchyAF winners can't draw stick figures properly.",
  "⚡ Pro tip: Use booster packs for maximum chaos and confusion.",
  "🏆 Fun fact: The most voted drawing was literally just a potato with legs.",
  "🎭 Remember: Artistic skill is optional, creativity is everything!",
  "🌟 Tip: Sometimes the best strategy is to embrace the chaos.",
];

const RECENT_SKETCHES = [
  {
    id: 1,
    text: "🐱 Someone just drew 'A cat having an existential crisis'",
    drawingUrl: 'https://images.pexels.com/photos/1092364/pexels-photo-1092364.jpeg?auto=compress&cs=tinysrgb&w=150',
    drawingId: 1
  },
  {
    id: 2,
    text: "🚀 Winner: 'Astronaut eating spaghetti in zero gravity'",
    drawingUrl: 'https://images.pexels.com/photos/1887946/pexels-photo-1887946.jpeg?auto=compress&cs=tinysrgb&w=150',
    drawingId: 2
  },
  {
    id: 3,
    text: "🦄 Epic sketch: 'Unicorn working in customer service'",
    drawingUrl: 'https://images.pexels.com/photos/1616403/pexels-photo-1616403.jpeg?auto=compress&cs=tinysrgb&w=150',
    drawingId: 3
  },
  {
    id: 4,
    text: "🍕 Masterpiece: 'Pizza slice contemplating life choices'",
    drawingUrl: 'https://images.pexels.com/photos/1266302/pexels-photo-1266302.jpeg?auto=compress&cs=tinysrgb&w=150',
    drawingId: 4
  },
];

const LobbyScreen: React.FC = () => {
  const navigate = useNavigate();
  const { 
    isInGame, 
    gamePhase, 
    currentGame, 
    connectionStatus, 
    actions 
  } = useGame();
  
  const [currentTip, setCurrentTip] = useState(0);
  const [currentSketch, setCurrentSketch] = useState(0);
  const [showCreateGame, setShowCreateGame] = useState(false);
  
  // Rotate tips every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTip(prev => (prev + 1) % TIPS_AND_TRIVIA.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Rotate recent sketches every 6 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSketch(prev => (prev + 1) % RECENT_SKETCHES.length);
    }, 6000);

    return () => clearInterval(interval);
  }, []);
  
  // Navigate to appropriate screen based on game phase
  useEffect(() => {
    if (isInGame && currentGame) {
      switch (gamePhase) {
        case GamePhase.BRIEFING:
          navigate('/uiux/pre-round');
          break;
        case GamePhase.DRAWING:
          navigate('/uiux/drawing');
          break;
        case GamePhase.VOTING:
          navigate('/uiux/voting');
          break;
        case GamePhase.RESULTS:
          navigate('/uiux/results');
          break;
        case GamePhase.COMPLETED:
          navigate('/uiux/post-game');
          break;
        default:
          // Stay on lobby screen for WAITING phase
          break;
      }
    }
  }, [isInGame, gamePhase, currentGame, navigate]);

  const handleExitQueue = () => {
    if (isInGame) {
      actions.leaveGame();
    }
    navigate('/');
  };

  const handleInviteFriend = () => {
    // In real app, this would open share dialog
    if (navigator.share) {
      navigator.share({
        title: 'Join me in SketchyAF!',
        text: 'Come draw terrible sketches with me!',
        url: window.location.origin,
      });
    } else {
      // Fallback for desktop
      navigator.clipboard.writeText(window.location.origin);
      alert('Invite link copied to clipboard!');
    }
  };
  
  // Handle game creation
  const handleGameCreated = (gameId: string) => {
    setShowCreateGame(false);
  };
  
  // Handle joining a game
  const handleJoinGame = (gameId: string) => {
    // Navigation will happen automatically via the useEffect
  };
  
  // Handle game start
  const handleGameStart = () => {
    // Navigation will happen automatically via the useEffect
  };

  const currentSketchData = RECENT_SKETCHES[currentSketch];

  return (
    <>
      <Seo 
        title="Game Lobby | SketchyAF"
        description="Join or create a SketchyAF drawing game - find other players to create chaos with!"
      />
      
      <div className="min-h-screen bg-gradient-to-br from-cream via-turquoise/20 to-pink/20 flex flex-col">
        {/* Header */}
        <div className="p-4 flex justify-between items-center">
          <div className="flex items-center">
            <Wifi className={`w-5 h-5 mr-2 ${
              connectionStatus === 'connected' ? 'text-green' :
              connectionStatus === 'connecting' || connectionStatus === 'reconnecting' ? 'text-orange animate-pulse' :
              'text-red'
            }`} />
            <span className="text-sm font-heading font-bold text-dark">
              {connectionStatus === 'connected' ? 'Connected' :
               connectionStatus === 'connecting' ? 'Connecting...' :
               connectionStatus === 'reconnecting' ? 'Reconnecting...' :
               'Disconnected'}
            </span>
          </div>
          
          <Button 
            variant="tertiary" 
            size="sm" 
            onClick={handleExitQueue}
            className="text-medium-gray"
          >
            <X size={18} className="mr-1" />
            {isInGame ? 'Leave Game' : 'Exit Lobby'}
          </Button>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col justify-center px-4 pb-8">
          {isInGame && currentGame ? (
            // In-game lobby
            <GameLobby onGameStart={handleGameStart} />
          ) : (
            // Game browser/creator
            <div className="max-w-6xl mx-auto w-full space-y-6">
              {/* Create/Browse Tabs */}
              <div className="flex border-b border-light-gray">
                <button
                  onClick={() => setShowCreateGame(false)}
                  className={`flex-1 py-3 px-4 font-heading font-semibold text-lg ${
                    !showCreateGame 
                      ? 'text-primary border-b-2 border-primary' 
                      : 'text-medium-gray hover:text-dark'
                  }`}
                >
                  <Search size={20} className="inline-block mr-2" />
                  Browse Games
                </button>
                <button
                  onClick={() => setShowCreateGame(true)}
                  className={`flex-1 py-3 px-4 font-heading font-semibold text-lg ${
                    showCreateGame 
                      ? 'text-primary border-b-2 border-primary' 
                      : 'text-medium-gray hover:text-dark'
                  }`}
                >
                  <Plus size={20} className="inline-block mr-2" />
                  Create Game
                </button>
              </div>
              
              {/* Create or Browse Content */}
              {showCreateGame ? (
                <GameCreationForm onGameCreated={handleGameCreated} />
              ) : (
                <GameBrowseList onJoinGame={handleJoinGame} />
              )}
              
              {/* Tips & Trivia */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="bg-pink/20 rounded-lg border-2 border-pink p-4 hand-drawn"
              >
                <div className="flex items-center mb-2">
                  <Lightbulb size={18} className="text-dark mr-2" />
                  <span className="font-heading font-semibold text-dark">While You Wait...</span>
                </div>
                
                <AnimatePresence mode="wait">
                  <motion.p
                    key={currentTip}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="text-dark-gray"
                  >
                    {TIPS_AND_TRIVIA[currentTip]}
                  </motion.p>
                </AnimatePresence>
              </motion.div>

              {/* Recent Activity */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="bg-turquoise/20 rounded-lg border-2 border-turquoise p-4 hand-drawn"
              >
                <h3 className="font-heading font-semibold text-dark mb-3">🎯 Recent Activity</h3>
                
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentSketch}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.4 }}
                    className="flex items-start space-x-3"
                  >
                    {/* Thumbnail */}
                    <Link 
                      to={`/art/${currentSketchData.drawingId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 group"
                    >
                      <motion.img 
                        src={currentSketchData.drawingUrl} 
                        alt="Recent winning sketch"
                        className="w-12 h-12 rounded-lg border-2 border-turquoise object-cover group-hover:scale-110 transition-transform duration-200"
                        whileHover={{ scale: 1.1 }}
                      />
                    </Link>
                    
                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <p className="text-dark-gray text-sm">
                        {currentSketchData.text}
                      </p>
                      <Link 
                        to={`/art/${currentSketchData.drawingId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-turquoise hover:underline inline-flex items-center mt-1"
                      >
                        View artwork →
                      </Link>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </motion.div>

              {/* Invite Friend Button */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="text-center"
              >
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={handleInviteFriend}
                  className="w-full"
                >
                  <Share2 size={18} className="mr-2" />
                  Invite a Friend
                </Button>
              </motion.div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default LobbyScreen;