import { registerRoot, Composition, staticFile } from 'remotion';
import { z } from 'zod';
import React from 'react';
import { MainComposition } from './compositions/MainComposition';

const schema = z.object({
  channelName: z.string(),
  channelImage: z.string(),
  hookText: z.string(),
  audioUrl: z.string(),
  audioDurationInSeconds: z.number(),
  hook_animation_type: z.enum(['fall', 'float']).optional(),
  subtitleText: z.string(),
  scriptAudioUrl: z.string(),
  scriptAudioDurationInSeconds: z.number(),
  wordTimings: z.array(z.object({
    text: z.string(),
    startFrame: z.number(),
    endFrame: z.number(),
    color: z.string().optional()
  })),
  totalDurationInFrames: z.number(),
  backgroundVideoPath: z.union([
    z.string(),
    z.array(z.string()),
    z.array(z.object({
      path: z.string(),
      durationInFrames: z.number(),
      durationInSeconds: z.number().optional()
    }))
  ]),
  assetUrls: z.object({
    badge: z.string().optional(),
    bubble: z.string().optional(),
    share: z.string().optional()
  }).optional(),
  bucketName: z.string().optional(),
  bucketRegion: z.string().optional()
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  channelName: "Default Channel",
  channelImage: "",
  hookText: "Default Hook",
  audioUrl: "",
  audioDurationInSeconds: 3,
  hook_animation_type: "fall",
  subtitleText: "Default subtitle",
  scriptAudioUrl: "",
  scriptAudioDurationInSeconds: 3,
  wordTimings: [],
  totalDurationInFrames: 180,
  backgroundVideoPath: ""
};

// Register the root component
const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MainComposition"
        component={MainComposition as React.ComponentType<z.infer<typeof schema>>}
        schema={schema}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
        calculateMetadata={({ props }: { props: Props }) => {
          // Calculate actual duration from the audio durations
          const totalFrames = Math.ceil(30 * (props.audioDurationInSeconds + props.scriptAudioDurationInSeconds));
          return {
            durationInFrames: totalFrames,
            props
          };
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot); 