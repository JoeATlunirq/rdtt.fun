import { useCurrentFrame, interpolate, Easing } from 'remotion';
import React, { useEffect } from 'react';

// S3 asset utility function
const getS3AssetUrl = (path: string) => {
  const bucketName = 'reddit-clipper-assets';
  return `https://${bucketName}.s3.us-east-1.amazonaws.com/${path}`;
};

// S3 asset paths
const s3Assets = {
  jelleeFont: getS3AssetUrl('fonts/Jellee-Roman.ttf'),
  robotoFont: getS3AssetUrl('fonts/Roboto-Bold.ttf')
};

interface Props {
  text: string;
  startFrame: number;
  duration: number;
  color?: string;
  font?: string;
  fontUrl?: string;
  subtitle_size?: number;
  stroke_size?: number;
}

const colorMap = {
  white: '#ffffff',
  yellow: '#ffff00',
  red: '#ff0000',
  green: '#00ff00',
  purple: '#ff00ff'
};

export const SubtitleCard: React.FC<Props> = ({ 
  text, 
  startFrame, 
  duration, 
  color = 'white',
  font = 'Jellee',
  fontUrl,
  subtitle_size = 64,
  stroke_size = 8
}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - startFrame;

  // Load custom font if provided
  useEffect(() => {
    if (font && fontUrl) {
      const customFontFace = new FontFace(font, `url(${fontUrl})`);
      customFontFace.load().then((loadedFace) => {
        (document.fonts as any).add(loadedFace);
      }).catch((error) => {
        console.error(`Error loading font ${font}:`, error);
      });
    }
  }, [font, fontUrl]);

  // Load default Jellee font from S3 as fallback
  useEffect(() => {
    const defaultFontFace = new FontFace('Jellee', `url(${s3Assets.jelleeFont})`);
    defaultFontFace.load().then((loadedFace) => {
      (document.fonts as any).add(loadedFace);
    }).catch((error) => {
      console.error('Error loading Jellee font from S3:', error);
    });
  }, []);
  
  // Load Roboto font from S3 as another fallback
  useEffect(() => {
    const robotoFontFace = new FontFace('Roboto', `url(${s3Assets.robotoFont})`);
    robotoFontFace.load().then((loadedFace) => {
      (document.fonts as any).add(loadedFace);
      console.log('Roboto font loaded from S3 in SubtitleCard');
    }).catch((error) => {
      console.error('Error loading Roboto font from S3:', error);
    });
  }, []);

  // Pop animation timing
  const popInDuration = 6; // frames

  const scale = interpolate(
    relativeFrame,
    [0, popInDuration/2, popInDuration],
    [0.95, 1.05, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    }
  );

  // Only show if within the duration window
  if (relativeFrame < 0 || relativeFrame >= duration) {
    return null;
  }

  // Get the color from our map or default to white
  const textColor = colorMap[color as keyof typeof colorMap] || colorMap.white;

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '100%',
      textAlign: 'center',
    }}>
      {/* Stroke layer (rendered behind) */}
      <h1 style={{
        fontFamily: font,
        fontSize: `${subtitle_size}px`,
        fontWeight: 700,
        color: '#000000',
        margin: 0,
        WebkitTextStroke: `${stroke_size}px black`,
        position: 'absolute',
        width: '100%',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scale(${scale})`,
      }}>
        {text}
      </h1>
      {/* Main text layer */}
      <h1 style={{
        fontFamily: font,
        fontSize: `${subtitle_size}px`,
        fontWeight: 700,
        color: textColor,
        margin: 0,
        position: 'relative',
        transform: `scale(${scale})`,
      }}>
        {text}
      </h1>
    </div>
  );
}; 