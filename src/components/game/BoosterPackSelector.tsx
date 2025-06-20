import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, 
  ChevronDown, 
  ChevronUp, 
  Star, 
  Check,
  Loader2
} from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { GamePhase } from '../../types/game-state';
import { BoosterPack } from '../../types/game';
import { BoosterPackService } from '../../services/BoosterPackService';

interface BoosterPackSelectorProps {
  className?: string;
  onPackSelected?: (packId: string | null) => void;
}

const BoosterPackSelector: React.FC<BoosterPackSelectorProps> = ({
  className = '',
  onPackSelected
}) => {
  const { gamePhase, selectedBoosterPack, isLoading, actions } = useGame();
  const [isExpanded, setIsExpanded] = useState(false);
  const [packs, setPacks] = useState<BoosterPack[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(false);
  
  // Only show in waiting or briefing phase
  const isVisible = gamePhase === GamePhase.WAITING || gamePhase === GamePhase.BRIEFING;
  
  // Load booster packs
  useEffect(() => {
    const loadPacks = async () => {
      setLoadingPacks(true);
      
      try {
        const result = await BoosterPackService.getUserPacks();
        
        if (result.success && result.data) {
          setPacks(result.data);
        }
      } catch (error) {
        console.error('Failed to load booster packs:', error);
      } finally {
        setLoadingPacks(false);
      }
    };
    
    if (isVisible) {
      loadPacks();
    }
  }, [isVisible]);
  
  // Get selected pack
  const selectedPack = packs.find(pack => pack.id === selectedBoosterPack);
  
  // Handle pack selection
  const handleSelectPack = async (packId: string | null) => {
    try {
      await actions.selectBoosterPack(packId);
      onPackSelected?.(packId);
      setIsExpanded(false);
    } catch (error) {
      console.error('Failed to select booster pack:', error);
    }
  };
  
  if (!isVisible) {
    return null;
  }
  
  return (
    <div className={`relative ${className}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-lg border-2 border-dark p-4 hand-drawn"
      >
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center">
            <Package size={20} className="text-purple mr-2" />
            <h3 className="font-heading font-bold text-lg text-dark">Booster Pack</h3>
          </div>
          
          {isExpanded ? (
            <ChevronUp size={20} className="text-medium-gray" />
          ) : (
            <ChevronDown size={20} className="text-medium-gray" />
          )}
        </div>
        
        {/* Selected pack display */}
        {!isExpanded && (
          <div className="mt-3 p-3 bg-off-white rounded-lg border border-light-gray">
            {selectedPack ? (
              <div className="flex items-center">
                <div className="w-10 h-10 bg-purple/10 rounded-lg flex items-center justify-center mr-3">
                  <Package size={20} className="text-purple" />
                </div>
                <div>
                  <p className="font-heading font-semibold text-dark">{selectedPack.title}</p>
                  <p className="text-xs text-medium-gray">{selectedPack.asset_count} assets</p>
                </div>
              </div>
            ) : (
              <div className="text-center text-medium-gray">
                <p>No booster pack selected</p>
                <p className="text-xs mt-1">Click to select a pack</p>
              </div>
            )}
          </div>
        )}
        
        {/* Pack selection */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 overflow-hidden"
            >
              {loadingPacks ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 size={24} className="animate-spin text-purple" />
                  <span className="ml-2 text-medium-gray">Loading packs...</span>
                </div>
              ) : packs.length === 0 ? (
                <div className="text-center p-4 text-medium-gray">
                  <p>No booster packs available</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* None option */}
                  <div
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedBoosterPack === null
                        ? 'bg-purple/10 border-purple'
                        : 'bg-off-white border-light-gray hover:border-purple'
                    }`}
                    onClick={() => handleSelectPack(null)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-light-gray rounded-lg flex items-center justify-center mr-3">
                          <Package size={16} className="text-medium-gray" />
                        </div>
                        <div>
                          <p className="font-heading font-semibold text-dark">No Pack</p>
                          <p className="text-xs text-medium-gray">Draw without boosters</p>
                        </div>
                      </div>
                      
                      {selectedBoosterPack === null && (
                        <Check size={16} className="text-purple" />
                      )}
                    </div>
                  </div>
                  
                  {/* Pack options */}
                  {packs.map(pack => (
                    <div
                      key={pack.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedBoosterPack === pack.id
                          ? 'bg-purple/10 border-purple'
                          : 'bg-off-white border-light-gray hover:border-purple'
                      }`}
                      onClick={() => handleSelectPack(pack.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="w-8 h-8 bg-purple/10 rounded-lg flex items-center justify-center mr-3">
                            <Package size={16} className="text-purple" />
                          </div>
                          <div>
                            <div className="flex items-center">
                              <p className="font-heading font-semibold text-dark">{pack.title}</p>
                              {pack.is_premium && (
                                <div className="ml-2 bg-primary text-white px-2 py-0.5 rounded-full text-xs font-heading font-bold flex items-center">
                                  <Star size={8} className="mr-0.5 fill-white" />
                                  <span className="text-[10px]">PRO</span>
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-medium-gray">{pack.asset_count || 0} assets</p>
                          </div>
                        </div>
                        
                        {selectedBoosterPack === pack.id && (
                          <Check size={16} className="text-purple" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default BoosterPackSelector;