import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Image, AlertCircle, Loader2 } from 'lucide-react';
import { ImageCollection, ImageAsset, AssetDrawerState } from '../../types/assets';
import { loadAllCollections, searchAssets, cleanupAssetPreviews, calculateAdaptiveImageSize } from '../../utils/assetLoader';
import { 
  getViewportCenter, 
  imageToDataURL, 
  generateElementId, 
  createTimestamp,
  createImageElement,
  createExcalidrawFile,
  EXCALIDRAW_DEFAULTS
} from '../../utils/excalidrawHelpers';
import { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types';
import { useGame } from '../../context/GameContext';

interface AssetDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  onAssetUsed?: (assetFilename: string, position?: { x: number; y: number }) => void;
}

const AssetDrawer: React.FC<AssetDrawerProps> = ({ 
  isOpen, 
  onClose, 
  excalidrawAPI,
  onAssetUsed 
}) => {
  const [state, setState] = useState<AssetDrawerState>({
    isOpen: false,
    selectedCollection: null,
    searchQuery: '',
    isLoading: false,
    error: null,
  });

  const [collections, setCollections] = useState<ImageCollection[]>([]);
  const [filteredAssets, setFilteredAssets] = useState<ImageAsset[]>([]);
  const [convertingAsset, setConvertingAsset] = useState<string | null>(null);
  
  // Get game context for booster pack access
  const { selectedBoosterPack } = useGame();

  // Load collections on mount
  useEffect(() => {
    if (isOpen && collections.length === 0) {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      loadAllCollections()
        .then(loadedCollections => {
          // Filter collections based on selected booster pack if applicable
          let availableCollections = loadedCollections;
          
          if (selectedBoosterPack) {
            // Find collection matching the selected booster pack's asset_directory_name
            availableCollections = loadedCollections.filter(
              collection => collection.name === selectedBoosterPack
            );
            
            // If no matching collection found, show all collections as fallback
            if (availableCollections.length === 0) {
              availableCollections = loadedCollections;
            }
          }
          
          setCollections(availableCollections);

          // Set initial selected collection
          if (availableCollections.length > 0) {
            setState(prev => ({
              ...prev,
              selectedCollection: availableCollections[0].id,
              isLoading: false
            }));
          } else {
            setState(prev => ({
              ...prev,
              isLoading: false,
              error: 'No collections available'
            }));
          }
        })
        .catch(error => {
          console.error('Failed to load collections:', error);
          setState(prev => ({
            ...prev,
            isLoading: false,
            error: 'Failed to load image collections'
          }));
        });
    }
  }, [isOpen, collections.length, selectedBoosterPack]);

  // Update filtered assets when collection or search changes
  useEffect(() => {
    if (state.searchQuery.trim()) {
      // Search across all collections
      const results = searchAssets(collections, state.searchQuery);
      setFilteredAssets(results);
    } else if (state.selectedCollection) {
      // Show assets from selected collection
      const selectedCollection = collections.find(c => c.id === state.selectedCollection);
      setFilteredAssets(selectedCollection?.assets || []);
    } else {
      setFilteredAssets([]);
    }
  }, [collections, state.selectedCollection, state.searchQuery]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      collections.forEach(collection => {
        cleanupAssetPreviews(collection.assets);
      });
    };
  }, [collections]);

  /**
   * Handle clicking on an image asset to insert it into the Excalidraw canvas
   * Converts the image to a data URL and creates an image element
   */
  const handleAssetClick = useCallback(async (asset: ImageAsset) => {
    if (!excalidrawAPI) {
      console.error('No Excalidraw API available');
      return;
    }

    if (convertingAsset) {
      return;
    }

    setConvertingAsset(asset.id);

    try {
      // Get current app state to determine insertion position and zoom level
      const appState = excalidrawAPI.getAppState();
      const center = getViewportCenter(appState);

      // Extract zoom level for adaptive sizing
      const zoomLevel = typeof appState.zoom === 'object' ? appState.zoom.value : appState.zoom || 1.0;

      // Get viewport dimensions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Calculate adaptive image dimensions
      const adaptiveSize = calculateAdaptiveImageSize(
        asset.width,
        asset.height,
        viewportWidth,
        viewportHeight,
        zoomLevel
      );

      // Convert image to data URL
      const contentOrUrl = asset.content || asset.previewUrl;
      const dataURL = imageToDataURL(contentOrUrl, asset.format, asset.mimeType);
      const fileId = generateElementId();
      const imageId = generateElementId();
      const width = adaptiveSize.width;
      const height = adaptiveSize.height;
      const now = createTimestamp();

      // Create Excalidraw image element with proper positioning
      const imageElement = createImageElement({
        id: imageId,
        fileId,
        x: center.x,
        y: center.y,
        width,
        height,
        timestamp: now,
      });

      // Register the image file with Excalidraw's file system
      if (excalidrawAPI.addFiles) {
        const file = createExcalidrawFile({
          id: fileId,
          dataURL,
          mimeType: asset.mimeType,
          timestamp: now,
        });
        excalidrawAPI.addFiles([file]);
      }

      // Add the image element to the canvas
      excalidrawAPI.updateScene({
        elements: [...excalidrawAPI.getSceneElements(), imageElement],
      });

      // Track asset usage if callback provided
      if (onAssetUsed) {
        onAssetUsed(asset.fileName, { x: center.x, y: center.y });
      }

      onClose(); // Close the drawer after successful insertion
    } catch (error) {
      console.error('Error inserting image:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to insert image. Please try again.'
      }));
    } finally {
      setConvertingAsset(null);
    }
  }, [excalidrawAPI, convertingAsset, onClose, onAssetUsed]);

  /**
   * Handle collection tab selection
   */
  const handleCollectionChange = (collectionId: string) => {
    setState(prev => ({ 
      ...prev, 
      selectedCollection: collectionId,
      searchQuery: '', // Clear search when changing collections
      error: null // Clear any previous errors
    }));
  };

  /**
   * Handle search input changes
   */
  const handleSearchChange = (query: string) => {
    setState(prev => ({ 
      ...prev, 
      searchQuery: query,
      selectedCollection: query.trim() ? null : collections[0]?.id || null,
      error: null // Clear any previous errors
    }));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 100 }}
          className="fixed right-0 top-0 bottom-0 w-80 bg-white border-l-2 border-dark shadow-lg z-30 overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-4 border-b-2 border-dark bg-off-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold text-lg flex items-center">
                <Image size={20} className="mr-2" />
                Image Library
              </h3>
              <button
                onClick={onClose}
                className="text-medium-gray hover:text-dark transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Search */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-medium-gray" />
              <input
                type="text"
                value={state.searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search images..."
                className="w-full pl-10 pr-4 py-2 border border-light-gray rounded-md text-sm focus:outline-none focus:border-purple"
              />
            </div>
          </div>

          {/* Collection Tabs */}
          {!state.searchQuery && collections.length > 0 && (
            <div className="flex border-b border-light-gray bg-white">
              {collections.map((collection) => (
                <button
                  key={collection.id}
                  onClick={() => handleCollectionChange(collection.id)}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    state.selectedCollection === collection.id
                      ? 'bg-purple text-white'
                      : 'text-medium-gray hover:text-dark hover:bg-off-white'
                  }`}
                >
                  {collection.displayName}
                  <span className="ml-1 text-xs opacity-75">({collection.totalCount})</span>
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {state.isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 size={24} className="animate-spin text-purple" />
                <span className="ml-2 text-medium-gray">Loading images...</span>
              </div>
            ) : state.error ? (
              <div className="p-4 text-center">
                <AlertCircle size={24} className="text-red mx-auto mb-2" />
                <p className="text-sm text-medium-gray">{state.error}</p>
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="p-4 text-center">
                <Image size={24} className="text-medium-gray mx-auto mb-2" />
                <p className="text-sm text-medium-gray">
                  {state.searchQuery ? 'No images found' : 'No images available'}
                </p>
              </div>
            ) : (
              <div className="p-4">
                <div className="grid grid-cols-2 gap-3">
                  {filteredAssets.map((asset) => (
                    <motion.button
                      key={asset.id}
                      onClick={() => handleAssetClick(asset)}
                      disabled={convertingAsset === asset.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="relative p-3 bg-off-white border border-light-gray rounded-lg hover:border-purple transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {convertingAsset === asset.id && (
                        <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                          <Loader2 size={16} className="animate-spin text-purple" />
                        </div>
                      )}
                      
                      <div className="aspect-square mb-2 flex items-center justify-center">
                        <img
                          src={asset.previewUrl}
                          alt={asset.name}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      
                      <p className="text-xs font-medium text-dark truncate">
                        {asset.name}
                      </p>
                      
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-medium-gray uppercase">
                          {asset.format}
                        </span>
                        {asset.width && asset.height && (
                          <span className="text-xs text-medium-gray">
                            {asset.width}×{asset.height}
                          </span>
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-light-gray bg-off-white">
            <p className="text-xs text-center text-medium-gray">
              💡 Click any image to add it to your canvas
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AssetDrawer;