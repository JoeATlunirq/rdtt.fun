declare module '*.ttf' {
  const content: string;
  export default content;
}

declare module '*.otf' {
  const content: string;
  export default content;
}

declare module '*.woff' {
  const content: string;
  export default content;
}

declare module '*.woff2' {
  const content: string;
  export default content;
}

export interface VideoInfo {
  path: string;
  durationInFrames: number;
  durationInSeconds?: number; 
}

export interface WordTiming {
  text: string;
  startFrame: number;
  endFrame: number;
  color?: string;
} 