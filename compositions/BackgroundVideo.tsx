/// <reference lib="dom" />
import React from 'react';
import { OffthreadVideo, Series } from 'remotion';

interface VideoInfo {
  path: string;
  durationInFrames: number;
  durationInSeconds: number;
}

interface Props {
  backgroundVideoPath: string[] | VideoInfo[] | string;
  volume?: number;
}

export const BackgroundVideo: React.FC<Props> = ({ backgroundVideoPath, volume = 0 }) => {
  // Handle both string and array formats for backward compatibility
  const videoArray = Array.isArray(backgroundVideoPath) 
    ? backgroundVideoPath 
    : [backgroundVideoPath];
  
  // Extract video info if it's in the format we expect
  const videos: Array<{path: string, durationInFrames?: number}> = videoArray.map(item => {
    // Check if the item is a string or an object with path and durationInFrames
    if (typeof item === 'string') {
      // If it's just a string path, we don't have duration info
      return { path: item };
    } else if (typeof item === 'object' && item !== null && 'path' in item) {
      // If it's an object with path and durationInFrames, use those
      return { 
        path: item.path as string,
        durationInFrames: (item as VideoInfo).durationInFrames
      };
    }
    // Fallback to just using the item as a path
    return { path: String(item) };
  });
  
  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    }}>
      <Series>
        {videos.map((video, index) => (
          <Series.Sequence 
            key={`${video.path}-${index}`} 
            durationInFrames={video.durationInFrames || 300} // Default to 10 seconds (at 30fps) if no duration provided
          >
            <OffthreadVideo
              src={video.path}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
              volume={Math.max(0, Math.min(1, (100 - Math.abs(volume)) / 100))}
            />
          </Series.Sequence>
        ))}
      </Series>
    </div>
  );
}; 