import React from 'react';
import { AbsoluteFill, Series, Audio, useVideoConfig } from 'remotion';
import { HookVideo } from './hooks/HookVideo';
import { FloatingHookVideo } from './hooks/FloatingHookVideo';
import { SubtitleComposition } from './subtitles/SubtitleComposition';
import { BackgroundVideo } from './BackgroundVideo';
import backgroundMusic from '../assets/music/music.mp3';

interface WordTiming {
  text: string;
  startFrame: number;
  endFrame: number;
  color?: string;
}

interface VideoInfo {
  path: string;
  durationInFrames: number;
  durationInSeconds?: number;
}

interface Props {
  // Hook props
  channelName?: string;
  channelImage?: string;
  hookText?: string;
  audioUrl?: string;
  audioDurationInSeconds?: number;
  hook_animation_type?: 'fall' | 'float';
  
  // Subtitle props
  subtitleText: string;
  scriptAudioUrl: string;
  scriptAudioDurationInSeconds: number;
  wordTimings?: WordTiming[];
  framesPerWord?: number;
  totalDurationInFrames: number;
  subtitle_size?: number;
  stroke_size?: number;
  
  // Font props
  font?: string;
  fontUrl?: string;
  
  // Background video props
  backgroundVideoPath: string[] | VideoInfo[] | string;
  has_background_music?: boolean;
  backgroundMusicUrl?: string;
  background_music_volume?: number;
  
  // Asset URLs for HookVideo
  assetUrls?: {
    badge?: string;
    bubble?: string;
    share?: string;
  };

  // Bucket information for S3 assets
  bucketName?: string;
  bucketRegion?: string;
}

export const MainComposition: React.FC<Props> = ({
  // Hook props
  channelName = "Default Channel",
  channelImage = "",
  hookText = "Default Hook",
  audioUrl = "",
  audioDurationInSeconds = 3,
  hook_animation_type = 'fall',
  
  // Subtitle props
  subtitleText,
  scriptAudioUrl,
  scriptAudioDurationInSeconds,
  wordTimings = [],
  framesPerWord = 30,
  totalDurationInFrames,
  subtitle_size = 64,
  stroke_size = 8,
  
  // Font props
  font = "Jellee",
  fontUrl,
  
  // Background video props
  backgroundVideoPath,
  has_background_music = false,
  backgroundMusicUrl = "",
  background_music_volume = 0.015,
  
  // Asset URLs
  assetUrls = {},

  // Bucket information for S3 assets
  bucketName,
  bucketRegion,
}) => {
  const { fps } = useVideoConfig();
  const scriptDurationInFrames = Math.ceil(scriptAudioDurationInSeconds * fps);
  const hookDurationInFrames = Math.ceil(audioDurationInSeconds * fps);

  // Verify our durations match what we expect
  const calculatedTotalFrames = hookDurationInFrames + scriptDurationInFrames;
  if (calculatedTotalFrames !== totalDurationInFrames) {
    console.warn(`Duration mismatch: expected ${totalDurationInFrames} frames but calculated ${calculatedTotalFrames} frames`);
  }

  // Choose the correct Hook Video component based on animation type
  const HookVideoComponent = hook_animation_type === 'float' ? FloatingHookVideo : HookVideo;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {/* Background video layer */}
      <BackgroundVideo 
        backgroundVideoPath={backgroundVideoPath}
        totalDurationInFrames={totalDurationInFrames}
        volume={-100}
      />
      
      {/* Background music that spans entire video */}
      {has_background_music && (
        <Audio 
          src={backgroundMusic} 
          volume={background_music_volume}
          loop
        />
      )}
      
      {/* Content layers */}
      <Series>
        <Series.Sequence durationInFrames={hookDurationInFrames}>
          <HookVideoComponent
            channelName={channelName}
            channelImage={channelImage}
            hookText={hookText}
            audioUrl={audioUrl}
            audioDurationInSeconds={audioDurationInSeconds}
            assetUrls={assetUrls}
            bucketName={bucketName}
            bucketRegion={bucketRegion}
          />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scriptDurationInFrames}>
          <SubtitleComposition
            text={subtitleText}
            wordTimings={wordTimings}
            framesPerWord={Math.ceil(scriptDurationInFrames / subtitleText.split(' ').length)}
            scriptDurationInFrames={scriptDurationInFrames}
            font={font}
            fontUrl={fontUrl}
            subtitle_size={subtitle_size}
            stroke_size={stroke_size}
          />
          <Audio src={scriptAudioUrl} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
}; 