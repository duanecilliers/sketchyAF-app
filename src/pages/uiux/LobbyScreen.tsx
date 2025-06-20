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
  Loader2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Seo from '../../components/utils/Seo';
import { useGame, useQueueStatus } from '../../context/GameContext';
import { GamePhase } from '../../types/game-state';
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
  
  const {
    isInQueue,
    queuePosition,
    estimatedWaitTime,
    playersInQueue,
    joinQueue,
    leaveQueue
  } = useQueueStatus();
  
  const [currentTip, setCurrentTip] = useState(0);
  const [currentSketch, setCurrentSketch] = useState(0);
  const [showMatchFound, setShowMatchFound] = useState(false);
  
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
  
  // Simulate match found after some time (for demo)
  useEffect(() => {
    if (isInQueue && queuePosition === 1) {
      const timer = setTimeout(() => {
        setShowMatchFound(true);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [isInQueue, queuePosition]);

  const handleExitQueue = () => {
    if (isInGame) {
      actions.leaveGame();
    } else if (isInQueue) {
      leaveQueue();
    }
    navigate('/');
  };

  const handleJoinQueue = async () => {
    await joinQueue();
  };

  const handleAcceptMatch = () => {
    setShowMatchFound(false);
    // Match acceptance is handled automatically by the matchmaking service
  };

  const handleDeclineMatch = () => {
    setShowMatchFound(false);
    leaveQueue();
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

  const currentSketchData = RECENT_SKETCHES[currentSketch];

  return (
    <>
      <Seo 
        title="Finding Players... | SketchyAF"
        description="Joining a SketchyAF drawing game - finding other players to create chaos with!"
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
            {isInGame ? 'Leave Game' : isInQueue ? 'Exit Queue' : 'Exit Lobby'}
          </Button>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col justify-center px-4 pb-8">
          {isInGame && currentGame ? (
            // In-game lobby
            <GameLobby />
          ) : isInQueue ? (
            // Matchmaking queue
            <div className="max-w-md mx-auto w-full space-y-6">
              {/* Queue Status Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-white rounded-lg border-2 border-dark p-6 hand-drawn shadow-[8px_8px_0px_0px_rgba(0,0,0,0.8)]"
              >
                <div className="text-center mb-6">
                  <h1 className="font-heading font-bold text-2xl text-dark mb-2 transform rotate-[-1deg]">
                    Finding Players...
                  </h1>
                  <p className="text-medium-gray">Get ready for some sketchy chaos!</p>
                </div>

                {/* Animated Loading Doodles */}
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <motion.div
                      animate={{ 
                        rotate: 360,
                        scale: [1, 1.1, 1]
                      }}
                      transition={{ 
                        rotate: { duration: 4, repeat: Infinity, ease: "linear" },
                        scale: { duration: 2, repeat: Infinity }
                      }}
                      className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full"
                    />
                    <motion.div
                      animate={{ 
                        x: [-20, 20, -20],
                        y: [-10, 10, -10]
                      }}
                      transition={{ 
                        duration: 3, 
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                      className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-2xl"
                    >
                      🎨
                    </motion.div>
                  </div>
                </div>

                {/* Queue Stats */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <motion.div 
                    className="bg-secondary/10 p-3 rounded-lg text-center border border-secondary/30"
                    whileHover={{ scale: 1.05 }}
                  >
                    <div className="flex items-center justify-center mb-1">
                      <Trophy size={16} className="text-secondary mr-1" />
                      <span className="text-xs text-medium-gray">Position</span>
                    </div>
                    <motion.p 
                      key={queuePosition}
                      initial={{ scale: 1.2, color: "#22a7e5" }}
                      animate={{ scale: 1, color: "#2d2d2d" }}
                      className="font-heading font-bold text-xl"
                    >
                      #{queuePosition || '...'}
                    </motion.p>
                  </motion.div>

                  <motion.div 
                    className="bg-green/10 p-3 rounded-lg text-center border border-green/30"
                    whileHover={{ scale: 1.05 }}
                  >
                    <div className="flex items-center justify-center mb-1">
                      <Users size={16} className="text-green mr-1" />
                      <span className="text-xs text-medium-gray">In Queue</span>
                    </div>
                    <motion.p 
                      key={playersInQueue}
                      initial={{ scale: 1.2, color: "#7bc043" }}
                      animate={{ scale: 1, color: "#2d2d2d" }}
                      className="font-heading font-bold text-xl"
                    >
                      {playersInQueue || '...'}
                    </motion.p>
                  </motion.div>
                </div>

                {/* Estimated Wait Time */}
                <div className="bg-accent/10 p-4 rounded-lg border border-accent/30 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Clock size={18} className="text-accent mr-2" />
                    <span className="text-sm text-medium-gray">Estimated Wait</span>
                  </div>
                  <motion.p 
                    key={estimatedWaitTime}
                    initial={{ scale: 1.1 }}
                    animate={{ scale: 1 }}
                    className="font-heading font-bold text-lg"
                  >
                    ~{estimatedWaitTime || '...'} seconds
                  </motion.p>
                </div>
              </motion.div>

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
          ) : (
            // Join queue button
            <div className="max-w-md mx-auto w-full space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-white rounded-lg border-2 border-dark p-6 hand-drawn shadow-[8px_8px_0px_0px_rgba(0,0,0,0.8)]"
              >
                <div className="text-center mb-6">
                  <h1 className="font-heading font-bold text-2xl text-dark mb-2 transform rotate-[-1deg]">
                    Ready to Get Sketchy?
                  </h1>
                  <p className="text-medium-gray">Join the queue to find other players!</p>
                </div>
                
                <div className="flex justify-center">
                  <Button 
                    variant="primary" 
                    size="lg" 
                    onClick={handleJoinQueue}
                    className="animate-pulse"
                  >
                    <Users size={20} className="mr-2" />
                    Find Players
                  </Button>
                </div>
              </motion.div>
              
              {/* Tips & Trivia */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="bg-pink/20 rounded-lg border-2 border-pink p-4 hand-drawn"
              >
                <div className="flex items-center mb-2">
                  <Lightbulb size={18} className="text-dark mr-2" />
                  <span className="font-heading font-semibold text-dark">SketchyAF Tips</span>
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
            </div>
          )}
        </div>

        {/* Match Found Modal */}
        <AnimatePresence>
          {showMatchFound\ && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="bg-white rounded-lg border-2 border-dark p-6 max-w-sm w-full hand-drawn shadow-[8px_8px_0px_0px_rgba(0,0,0,0.8)]"
              >
                <div className="text-center">
                  <motion.div
                    animate={{ 
                      scale: [1, 1.2, 1],
                      rotate: [0, 5, -5, 0]
                    }}
                    transition={{ 
                      duration: 0.6,
                      repeat: Infinity,
                      repeatDelay: 1
                    }}
                    className="text-4xl mb-4"
                  >
                    🎉
                  </motion.div>
                  
                  <h2 className="font-heading font-bold text-2xl text-dark mb-2 transform rotate-[-1deg]">
                    Match Found!
                  </h2>
                  <p className="text-medium-gray mb-6">
                    4 players ready to create chaos!
                  </p>
                  
                  <div className="flex gap-3">
                    <Button 
                      variant="primary" 
                      size="sm" 
                      onClick={handleAcceptMatch}
                      className="flex-1"
                    >
                      Accept
                    </Button>
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      onClick={handleDeclineMatch}
                      className="flex-1"
                    >
                      Decline
                    </Button>
                  </div>
                  
                  <p className="text-xs text-medium-gray mt-3">
                    Auto-accepting in 10s...
                  </p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export default LobbyScreen;