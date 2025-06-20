import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, Star, Crown } from 'lucide-react';
import { useGameParticipants } from '../../hooks/useGameParticipants';
import { GameParticipant } from '../../types/game';

interface ParticipantListProps {
  compact?: boolean;
  showReadyStatus?: boolean;
  className?: string;
}

const ParticipantList: React.FC<ParticipantListProps> = ({
  compact = false,
  showReadyStatus = true,
  className = ''
}) => {
  const { 
    sortedParticipants, 
    isGameCreator, 
    gameCreator,
    currentUserParticipant
  } = useGameParticipants();
  
  if (!sortedParticipants.length) {
    return (
      <div className={`text-center p-4 ${className}`}>
        <p className="text-medium-gray">No participants yet</p>
      </div>
    );
  }
  
  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        staggerChildren: 0.05 
      } 
    }
  };
  
  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 }
  };
  
  // Render a participant item
  const renderParticipant = (participant: GameParticipant) => {
    const isCreator = participant.user_id === gameCreator?.user_id;
    const isCurrentUser = participant.user_id === currentUserParticipant?.user_id;
    
    return (
      <motion.div
        key={participant.id}
        variants={itemVariants}
        className={`flex items-center p-3 rounded-lg ${
          participant.is_ready 
            ? 'bg-green/10 border border-green' 
            : 'bg-orange/10 border border-orange'
        } ${compact ? 'mb-1' : 'mb-2'}`}
      >
        {/* Avatar placeholder */}
        <div className="relative mr-3">
          <div className="w-8 h-8 rounded-full bg-light-gray flex items-center justify-center text-medium-gray">
            {participant.username?.charAt(0).toUpperCase() || '?'}
          </div>
          
          {/* Creator crown */}
          {isCreator && (
            <div className="absolute -top-2 -right-2 text-xs">
              <Crown size={14} className="text-accent fill-accent" />
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center">
            <p className={`font-heading font-semibold text-sm truncate ${isCurrentUser ? 'text-primary' : 'text-dark'}`}>
              {participant.username || 'Unknown'}
              {isCurrentUser && ' (You)'}
            </p>
            
            {/* Premium badge example */}
            {Math.random() > 0.7 && (
              <div className="ml-1 bg-primary text-white px-1 py-0.5 rounded-full text-xs font-heading font-bold flex items-center">
                <Star size={8} className="mr-0.5 fill-white" />
                <span className="text-[10px]">PRO</span>
              </div>
            )}
          </div>
          
          {/* Ready status */}
          {showReadyStatus && (
            <div className="flex items-center mt-0.5">
              {participant.is_ready ? (
                <>
                  <CheckCircle size={12} className="text-green mr-1" />
                  <span className="text-xs text-green font-heading font-semibold">Ready</span>
                </>
              ) : (
                <>
                  <Clock size={12} className="text-orange mr-1" />
                  <span className="text-xs text-orange font-heading font-semibold">
                    {isCurrentUser ? 'Ready up!' : 'Not ready'}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </motion.div>
    );
  };
  
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {sortedParticipants.map(renderParticipant)}
    </motion.div>
  );
};

export default ParticipantList;