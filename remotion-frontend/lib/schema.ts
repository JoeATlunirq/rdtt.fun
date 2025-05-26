import { z } from 'zod';

// Keep srt-parser-2 SrtLine structure for internal processing if needed
// but Remotion props will use WordTiming.
export interface SrtLine {
  id: string;
  startTime: string; 
  endTime: string;
  text: string;
}

export const wordTimingSchema = z.object({
  text: z.string(),
  startFrame: z.number(),
  endFrame: z.number(),
  // color: z.string().optional() // Color can be handled dynamically in component if needed
});

export type WordTiming = z.infer<typeof wordTimingSchema>;

export const videoAssetSchema = z.object({
  path: z.string(), // Should be an S3 URL for Remotion
  durationInFrames: z.number(),
  // durationInSeconds: z.number().optional() // Not directly used by Remotion component if frames are set
});

export type VideoAsset = z.infer<typeof videoAssetSchema>;

export const remotionPropsSchema = z.object({
  // Channel & Hook
  channelName: z.string().min(1, "Channel name is required"),
  channelImage: z.string().url("Must be a valid URL for channel image"), 
  hookText: z.string().min(1, "Hook text is required"),
  hook_animation_type: z.enum(['fall', 'float', 'reveal', 'none']).default('fall'),

  // Audio sources
  audioUrl: z.string().url("Must be a valid URL for the main audio track").optional(), // Single audio track
  srtFileUrl: z.string().url("Must be a valid URL for SRT file").optional(),

  // Derived audio/subtitle data
  hookDurationInSeconds: z.number().min(0).default(0), // Will be recalculated based on hookText and SRT
  subtitleText: z.string().optional(), // Combined text from SRT
  wordTimings: z.array(wordTimingSchema).optional(), // Parsed and transformed SRT data
  
  // Subtitle Styling
  animatedSubtitleType: z.enum(['word', 'phrase']).default('word'),
  fontFamily: z.string().default('Jellee'), 
  customFontUrl: z.string().url("Must be a valid URL for TTF font").optional(), // If allowing custom fonts uploaded by user
  fontSize: z.number().positive().default(50),
  fontStrokeSize: z.number().min(0).default(3),
  textColor: z.string().default('#FFFFFF'),
  highlightColor: z.string().default('#FCA5A5'), // Example: Tailwind red-300

  // Background
  backgroundVideoStyle: z.enum(['satisfying', 'makeup', 'parkour', 'gaming', 'nature', 'custom']).default('satisfying'),
  backgroundVideoUrl: z.string().url("Must be a valid URL for a custom background video").optional(), // Direct URL override
  backgroundVideoPath: z.string().url().optional(), // Final S3 path for Remotion, derived from style or direct URL
  backgroundColor: z.string().default('#1A1A1A'), // Fallback if no video
  backgroundImageUrl: z.string().url("Must be a valid URL for a background image").optional(), // Static image background

  // Music
  has_background_music: z.boolean().default(false),
  backgroundMusicUrl: z.string().url().optional(), 
  background_music_volume: z.number().min(0).max(1).default(0.05),

  // Watermark / Overlays
  watermarkImageUrl: z.string().url().optional(),
  watermarkText: z.string().optional(),
  watermarkOpacity: z.number().min(0).max(1).default(0.7),
  showChannelWatermark: z.boolean().default(true), // Toggle for default channel image watermark

  // Misc
  outroText: z.string().optional(),
  showVideoLength: z.boolean().default(true),
  
  // Internal / Derived by API - not directly from UI form usually
  totalDurationInFrames: z.number().positive("Total duration must be positive"), 
  // assetUrls: z.object({ // For pre-signed URLs if needed by Remotion components, not for now
  //   badge: z.string().url().optional(),
  //   bubble: z.string().url().optional(),
  //   share: z.string().url().optional()
  // }).optional(),
  // bucketName: z.string().optional(), // These are server-side config, not props
  // bucketRegion: z.string().optional(),
});

export type RemotionFormProps = z.infer<typeof remotionPropsSchema>;

// UI form schema: fields directly configurable by the user in the frontend form
export const uiFormSchema = z.object({
  channelName: z.string().min(1, "Channel name is required"),
  channelImage: z.string().url("Must be a valid URL for channel image"), 
  hookText: z.string().min(1, "Hook text is required"),
  hook_animation_type: z.enum(['fall', 'float', 'reveal', 'none']).default('fall'),
  
  audioUrl: z.string().url("Main Audio URL (MP3/WAV)").optional().or(z.literal('')), // Updated description
  srtFileUrl: z.string().url("Must be a valid URL for SRT file").optional().or(z.literal('')),

  animatedSubtitleType: z.enum(['word', 'phrase']).default('word'),
  fontFamily: z.string().default('Jellee'),
  customFontUrl: z.string().url("Must be a valid URL for a TTF font (optional)").optional().or(z.literal('')), // Added for UI
  fontSize: z.number({ coerce: true }).positive().default(50),
  fontStrokeSize: z.number({ coerce: true }).min(0).default(3),
  textColor: z.string().default('#FFFFFF'),
  highlightColor: z.string().default('#FCA5A5'),

  backgroundVideoStyle: z.enum(['satisfying', 'makeup', 'parkour', 'gaming', 'nature', 'custom']).default('satisfying'),
  backgroundVideoUrl: z.string().url("Must be a valid URL (or leave empty for style-based)").optional().or(z.literal('')), 
  backgroundColor: z.string().default('#1A1A1A'), 
  backgroundImageUrl: z.string().url("Must be a valid URL for background image (optional)").optional().or(z.literal('')),

  has_background_music: z.boolean().default(false),
  backgroundMusicUrl: z.string().url("Must be a valid URL for music (optional)").optional().or(z.literal('')),
  background_music_volume: z.number({ coerce: true }).min(0).max(1).default(0.05),
  
  watermarkImageUrl: z.string().url("Must be valid URL for watermark image (optional)").optional().or(z.literal('')),
  watermarkText: z.string().optional(),
  watermarkOpacity: z.number({ coerce: true }).min(0).max(1).default(0.7),
  showChannelWatermark: z.boolean().default(true),

  outroText: z.string().optional(),
  showVideoLength: z.boolean().default(true),
});

export type UIFormValues = z.infer<typeof uiFormSchema>; 