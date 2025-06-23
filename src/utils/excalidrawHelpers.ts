/**
 * Excalidraw utility functions for canvas operations and positioning
 *
 * This module provides helper functions for working with Excalidraw canvas,
 * including viewport calculations, image conversion, and element creation utilities.
 */

import { AppState } from '@excalidraw/excalidraw/types/types';
import { ExcalidrawImageElement, FileId } from '@excalidraw/excalidraw/types/element/types';
import { DataURL } from '@excalidraw/excalidraw/types/types';
import { ImageFormat, IMAGE_MIME_TYPES } from '../types/assets';

/**
 * Configuration for default element dimensions
 */
export const EXCALIDRAW_DEFAULTS = {
  DEFAULT_WIDTH: 200,
  DEFAULT_HEIGHT: 200,
  DEFAULT_STROKE_WIDTH: 1,
  DEFAULT_OPACITY: 100,
} as const;

/**
 * Calculate the center position of the current Excalidraw viewport
 * This is used to position new elements in the center of the visible area
 * 
 * @param appState - The current Excalidraw app state
 * @returns The center coordinates { x, y } in canvas space
 */
export function getViewportCenter(appState: AppState | null): { x: number; y: number } {
  // Default center position if appState is not available
  const defaultCenter = { x: 0, y: 0 };

  if (!appState) {
    return defaultCenter;
  }

  try {
    // Extract viewport properties with safe defaults
    const { scrollX = 0, scrollY = 0, zoom = { value: 1 } } = appState;
    const zoomValue = typeof zoom === 'object' ? zoom.value : zoom;

    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate center position in canvas coordinates
    // Formula: (screen_position - scroll_offset) / zoom_level
    const centerX = (-scrollX + viewportWidth / 2) / zoomValue;
    const centerY = (-scrollY + viewportHeight / 2) / zoomValue;

    return { x: centerX, y: centerY };
  } catch (error) {
    console.warn('Could not calculate viewport center:', error);
    return defaultCenter;
  }
}

/**
 * Convert image content to a data URL for use in Excalidraw
 *
 * @param content - The image content (for SVG) or URL (for other formats)
 * @param format - The image format
 * @param mimeType - The MIME type of the image
 * @returns A data URL string that can be used as an image source
 */
export function imageToDataURL(content: string, format: ImageFormat, mimeType: string): string {
  if (format === 'svg') {
    // For SVG, encode content to base64 data URL
    const encodedSvg = btoa(unescape(encodeURIComponent(content)));
    return `data:${mimeType};base64,${encodedSvg}`;
  } else {
    // For other formats, content is actually the URL
    return content;
  }
}

/**
 * Convert SVG string to a data URL for use in Excalidraw
 * @deprecated Use imageToDataURL instead
 */
export function svgToDataURL(svgContent: string): string {
  return imageToDataURL(svgContent, 'svg', IMAGE_MIME_TYPES.svg);
}

/**
 * Generate a unique ID for Excalidraw elements
 * Uses crypto.randomUUID() if available, falls back to a simple random string
 * 
 * @returns A unique identifier string
 */
export function generateElementId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback for environments without crypto.randomUUID
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Create a timestamp for Excalidraw elements
 *
 * @returns Current timestamp in milliseconds
 */
export function createTimestamp(): number {
  return Date.now();
}

/**
 * Create an Excalidraw image element from image content
 *
 * @param options - Configuration options for the image element
 * @returns A properly configured ExcalidrawImageElement
 */
export function createImageElement(options: {
  id: string;
  fileId: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  timestamp?: number;
}): ExcalidrawImageElement {
  const {
    id,
    fileId,
    x,
    y,
    width = EXCALIDRAW_DEFAULTS.DEFAULT_WIDTH,
    height = EXCALIDRAW_DEFAULTS.DEFAULT_HEIGHT,
    timestamp = createTimestamp(),
  } = options;

  return {
    type: 'image',
    id,
    status: 'saved',
    fileId: fileId as FileId,
    version: 1,
    versionNonce: timestamp,
    x: x - width / 2, // Center horizontally
    y: y - height / 2, // Center vertically
    width,
    height,
    scale: [1, 1],
    isDeleted: false,
    fillStyle: 'solid',
    strokeWidth: EXCALIDRAW_DEFAULTS.DEFAULT_STROKE_WIDTH,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: EXCALIDRAW_DEFAULTS.DEFAULT_OPACITY,
    groupIds: [],
    strokeColor: '#000000',
    backgroundColor: 'transparent',
    seed: timestamp,
    roundness: null,
    angle: 0,
    frameId: null,
    boundElements: null,
    updated: timestamp,
    locked: false,
    link: null,
  };
}

/**
 * Create a file object for Excalidraw's file system
 *
 * @param options - Configuration options for the file
 * @returns A file object that can be added to Excalidraw
 */
export function createExcalidrawFile(options: {
  id: string;
  dataURL: string;
  mimeType: string;
  timestamp?: number;
}) {
  const {
    id,
    dataURL,
    mimeType,
    timestamp = createTimestamp(),
  } = options;

  return {
    mimeType: mimeType as any, // Excalidraw accepts various MIME types
    id: id as FileId,
    dataURL: dataURL as DataURL,
    created: timestamp,
  };
}

/**
 * Export Excalidraw drawing to PNG image
 * 
 * @param excalidrawAPI - The Excalidraw API instance
 * @returns Promise resolving to a data URL of the exported image
 */
export async function exportToPng(excalidrawAPI: any): Promise<string> {
  if (!excalidrawAPI || !excalidrawAPI.exportToBlob) {
    throw new Error('Excalidraw API not available or missing exportToBlob method');
  }
  
  try {
    const blob = await excalidrawAPI.exportToBlob({
      mimeType: 'image/png',
      quality: 0.92,
      exportWithDarkMode: false,
      exportEmbedScene: false,
      exportBackground: true,
      exportPadding: 10,
    });
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error exporting drawing to PNG:', error);
    throw error;
  }
}

/**
 * Calculate drawing time based on element timestamps
 * 
 * @param elements - Array of Excalidraw elements
 * @returns Drawing time in seconds
 */
export function calculateDrawingTime(elements: any[]): number {
  if (!elements || elements.length === 0) {
    return 0;
  }
  
  // Find earliest and latest timestamps
  let earliestTimestamp = Number.MAX_SAFE_INTEGER;
  let latestTimestamp = 0;
  
  elements.forEach(element => {
    if (element.timestamp && element.timestamp < earliestTimestamp) {
      earliestTimestamp = element.timestamp;
    }
    if (element.updated && element.updated > latestTimestamp) {
      latestTimestamp = element.updated;
    }
  });
  
  // If no valid timestamps found, return 0
  if (earliestTimestamp === Number.MAX_SAFE_INTEGER || latestTimestamp === 0) {
    return 0;
  }
  
  // Calculate time difference in seconds
  const timeDiffMs = latestTimestamp - earliestTimestamp;
  return Math.round(timeDiffMs / 1000);
}