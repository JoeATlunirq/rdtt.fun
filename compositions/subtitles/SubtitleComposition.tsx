import React from 'react';
import { AbsoluteFill } from 'remotion';
import { SubtitleCard } from './SubtitleCard';

interface WordTiming {
  text: string;
  startFrame: number;
  endFrame: number;
  color?: string;
}

interface Props {
  text: string;
  wordTimings?: WordTiming[];
  framesPerWord?: number;
  scriptDurationInFrames?: number;
  font?: string;
  fontUrl?: string;
  subtitle_size?: number;
  stroke_size?: number;
}

export const SubtitleComposition: React.FC<Props> = ({
  text,
  wordTimings = [],
  framesPerWord = 30,
  scriptDurationInFrames,
  font,
  fontUrl,
  subtitle_size = 64,
  stroke_size = 8
}) => {
  // If we have word timings, use those
  if (wordTimings.length > 0) {
    return (
      <AbsoluteFill style={{
        background: 'transparent',
      }}>
        {wordTimings.map((word, index) => (
          <SubtitleCard
            key={index}
            text={word.text}
            startFrame={word.startFrame}
            duration={word.endFrame - word.startFrame}
            color={word.color}
            font={font}
            fontUrl={fontUrl}
            subtitle_size={subtitle_size}
            stroke_size={stroke_size}
          />
        ))}
      </AbsoluteFill>
    );
  }

  // Fallback to evenly spaced words
  const words = text.split(' ');
  const duration = scriptDurationInFrames || words.length * framesPerWord;
  const actualFramesPerWord = Math.ceil(duration / words.length);

  return (
    <AbsoluteFill style={{
      background: 'transparent',
    }}>
      {words.map((word, index) => (
        <SubtitleCard
          key={index}
          text={word}
          startFrame={index * actualFramesPerWord}
          duration={actualFramesPerWord}
          font={font}
          fontUrl={fontUrl}
          subtitle_size={subtitle_size}
          stroke_size={stroke_size}
        />
      ))}
    </AbsoluteFill>
  );
}; 