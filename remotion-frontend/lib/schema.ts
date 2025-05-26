import { z } from 'zod';

export const wordTimingSchema = z.object({
  text: z.string(),
  startFrame: z.number(),
  endFrame: z.number(),
  color: z.string().optional()
});

export type WordTiming = z.infer<typeof wordTimingSchema>;

export const videoAssetSchema = z.object({
  path: z.string(),
  durationInFrames: z.number(),
  durationInSeconds: z.number().optional()
});

export type VideoAsset = z.infer<typeof videoAssetSchema>;

export const remotionPropsSchema = z.object({
  channelName: z.string().min(1, "Channel name is required"),
  channelImage: z.string().url("Must be a valid S3 URL for channel image"), // Assuming S3 URL
  hookText: z.string().min(1, "Hook text is required"),
  hook_animation_type: z.enum(['fall', 'float']).default('fall'),
  audioUrl: z.string().url("Must be a valid S3 URL for hook audio"),
  audioDurationInSeconds: z.number().positive("Hook audio duration must be positive"),
  scriptAudioUrl: z.string().url("Must be a valid S3 URL for main audio"),
  scriptAudioDurationInSeconds: z.number().positive("Script audio duration must be positive"),
  srtFileUrl: z.string().url("Must be a valid S3 URL for SRT file"), // For SRT file
  subtitleText: z.string(), // Derived from SRT
  wordTimings: z.array(wordTimingSchema), // Derived from SRT
  animatedSubtitleType: z.enum(['word', 'phrase']).default('word'),
  fontFamily: z.string().default('Jellee'), // Can be a name of a pre-installed font or 'custom'
  customFontUrl: z.string().url("Must be a valid S3 URL for TTF font").optional(),
  fontSize: z.number().positive().default(48),
  fontStrokeSize: z.number().positive().default(4),
  backgroundVideoStyle: z.enum(['satisfying', 'makeup', 'parkour']).default('satisfying'),
  backgroundVideoPath: z.union([
    z.string(), // Allow single string path too, though array of VideoAsset is preferred for segments
    z.array(videoAssetSchema)
  ]), // Derived from style
  has_background_music: z.boolean().default(false),
  backgroundMusicUrl: z.string().url().optional(), // If they want specific music
  background_music_volume: z.number().min(0).max(1).default(0.015),
  totalDurationInFrames: z.number().positive("Total duration must be positive"), // Derived
  assetUrls: z.object({
    badge: z.string().url().optional(),
    bubble: z.string().url().optional(),
    share: z.string().url().optional()
  }).optional(),
  bucketName: z.string().optional(),
  bucketRegion: z.string().optional(),
});

export type RemotionFormProps = z.infer<typeof remotionPropsSchema>;

export const uiFormSchema = remotionPropsSchema.omit({
  audioDurationInSeconds: true, 
  scriptAudioDurationInSeconds: true,
  subtitleText: true,
  wordTimings: true,
  totalDurationInFrames: true, 
  backgroundVideoPath: true,
}).extend({
  // These were for hypothetical direct file uploads, not strictly needed if using S3 URLs + backend processing
  // hookAudioFile: z.any().optional(), 
  // mainAudioFile: z.any().optional(), 
  // srtFile: z.any().optional(), 
  // customFontFile: z.any().optional(), 
});

export type UIFormValues = z.infer<typeof uiFormSchema>; 