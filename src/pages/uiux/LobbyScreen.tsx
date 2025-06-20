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
  Loader2,
  AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Seo from '../../components/utils/Seo';
import { useGame, useQueueStatus } from '../../context/GameContext';
import { GamePhase } from '../../types/game-state';
import GameLobby from '../../components/game/GameLobby';

const LobbyScreen: React.FC = () => {
  const navigate = useNavigate();
  const { 
    isInGame, 
    gamePhase, 
    currentGame, 
    connectionStatus, 
    actions,
    error: gameError
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
  const [showMatchFound, setShowMatchFound] = useState(false);
  const [isJoiningQueue, setIsJoiningQueue] = useState(false);
  const [isLeavingQueue, setIsLeavingQueue] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  
  // Tips for the waiting screen
  const TIPS_AND_TRIVIA = [
    "💡 Tip: The worse your drawing, the funnier it gets!",
    "🎨 Did you know? 73% of SketchyAF winners can't draw stick figures properly.",
    "⚡ Pro tip: Use booster packs for maximum chaos and confusion.",
    "🏆 Fun fact: The most voted drawing was literally just a potato with legs.",
    "🎭 Remember: Artistic skill is optional, creativity is everything!",
    "🌟 Tip: Sometimes the best strategy is to embrace the chaos."
  ];
  
  // Rotate tips every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTip(prev => (prev + 1) % TIPS_AND_TRIVIA.length);
    }, 4000);

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
  
  // Check for match found
  useEffect(() => {
    if (isInQueue && queuePosition === 1 && !showMatchFound) {
      setShowMatchFound(true);
    }
  }, [isInQueue, queuePosition, showMatchFound]);
  
  // Clear local error after 5 seconds
  useEffect(() => {
    if (localError) {
      const timer = setTimeout(() => {
        setLocalError(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [localError]);

  const handleExitQueue = async () => {
    if (isInGame) {
      setIsLeavingQueue(true);
      try {
        await actions.leaveGame();
      } catch (error) {
        setLocalError('Failed to leave game. Please try again.');
      } finally {
        setIsLeavingQueue(false);
      }
    } else if (isInQueue) {
      setIsLeavingQueue(true);
      try {
        await leaveQueue();
      } catch (error) {
        setLocalError('Failed to leave queue. Please try again.');
      } finally {
        setIsLeavingQueue(false);
      }
    }
    navigate('/');
  };

  const handleJoinQueue = async () => {
    setIsJoiningQueue(true);
    setLocalError(null);
    
    try {
      const result = await joinQueue();
      if (!result.success) {
        setLocalError(result.error || 'Failed to join queue. Please try again.');
      }
    } catch (error) {
      setLocalError('Failed to join queue. Please try again.');
      console.error('Error joining queue:', error);
    } finally {
      setIsJoiningQueue(false);
    }
  };

  const handleAcceptMatch = () => {
    setShowMatchFound(false);
    // Match acceptance is handled automatically by the matchmaking service
  };

  const handleDeclineMatch = async () => {
    setShowMatchFound(false);
    try {
      await leaveQueue();
    } catch (error) {
      setLocalError('Failed to decline match. Please try again.');
      console.error('Error declining match:', error);
    }
  };

  const handleInviteFriend = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Join me in SketchyAF!',
        text: 'Come draw terrible sketches with me!',
        url: window.location.origin,
      }).catch(error => {
        console.error('Error sharing:', error);
      });
    } else {
      // Fallback for desktop
      navigator.clipboard.writeText(window.location.origin)
        .then(() => {
          setLocalError('Invite link copied to clipboard!');
        })
        .catch(error => {
          console.error('Error copying to clipboard:', error);
          setLocalError('Failed to copy invite link.');
        });
    }
  };

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
            disabled={isLeavingQueue}
            className="text-medium-gray"
          >
            {isLeavingQueue ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <X size={18} className="mr-1" />
            )}
            {isInGame ? 'Leave Game' : isInQueue ? 'Exit Queue' : 'Exit Lobby'}
          </Button>
        </div>

        {/* Error display */}
        {(gameError || localError) && (
          <div className="px-4 mb-4">
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-red/10 border border-red rounded-lg p-3 flex items-start"
            >
              <AlertCircle size={20} className="text-red mr-2 flex-shrink-0 mt-1" />
              <p className="text-red">{gameError || localError}</p>
            </motion.div>
          </div>
        )}

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
                
                {/* Leave Queue Button */}
                <div className="mt-6">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={handleExitQueue}
                    disabled={isLeavingQueue}
                    className="w-full"
                  >
                    {isLeavingQueue ? (
                      <div className="flex items-center justify-center">
                        <Loader2 size={18} className="mr-2 animate-spin" />
                        <span>Leaving Queue...</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center">
                        <X size={18} className="mr-2" />
                        <span>Leave Queue</span>
                      </div>
                    )}
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
                    disabled={isJoiningQueue}
                    className={isJoiningQueue ? "" : "animate-pulse"}
                  >
                    {isJoiningQueue ? (
                      <div className="flex items-center justify-center">
                        <Loader2 size={20} className="mr-2 animate-spin" />
                        <span>Joining Queue...</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center">
                        <Users size={20} className="mr-2" />
                        <span>Find Players</span>
                      </div>
                    )}
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
            </div>
          )}
        </div>

        {/* Match Found Modal */}
        <AnimatePresence>
          {showMatchFound && (
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
                    {playersInQueue} players ready to create chaos!
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