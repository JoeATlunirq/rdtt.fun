import { useCurrentFrame, interpolate, Easing, Audio, useVideoConfig, OffthreadVideo } from 'remotion';
import React from 'react';
// Replace Google Fonts loading with a constant
const fontFamily = 'Roboto';

// S3 asset utility function
const getS3AssetUrl = (bucketName: string, region: string, path: string) => {
  return `https://${bucketName}.s3.${region}.amazonaws.com/${path}`;
};

interface Props {
  channelName?: string;
  channelImage?: string;
  hookText?: string;
  audioUrl?: string;
  audioDurationInSeconds?: number;
  // Add asset URLs props
  assetUrls?: {
    badge?: string;
    bubble?: string;
    share?: string;
  };
  // Add bucket info props
  bucketName?: string;
  bucketRegion?: string;
}

// Helper function to get asset URL or fallback to S3 asset
const getAssetUrl = (assetUrls: any, key: string, s3Assets: any, fallbackKey: string) => {
  if (assetUrls && assetUrls[key]) {
    return assetUrls[key];
  }
  return s3Assets[fallbackKey];
};

// Helper function to get video URL
const getVideoUrl = (assetUrls: any, index: number, s3Assets: any) => {
  if (assetUrls && assetUrls.videos && assetUrls.videos[`video${index}`]) {
    return assetUrls.videos[`video${index}`];
  }
  return s3Assets.videos[`video${index}`];
};

// VideoComponent without frame preloading
const VideoComponent: React.FC<{
  src: string;
  style: React.CSSProperties;
  alt?: string;
}> = ({ src, style, alt = 'Video' }) => {
  // Use OffthreadVideo directly without frame preloading
  return (
    <OffthreadVideo
      src={src}
      style={style}
      className="remotion-video"
      muted
      toneMapped={false} // Disable tone mapping for better performance
      pauseWhenBuffering={true} // Pause when buffering (will be default in Remotion 5.0)
    />
  );
};

export const FloatingHookVideo: React.FC<Props> = ({
  channelImage,
  channelName,
  hookText,
  audioUrl,
  audioDurationInSeconds = 3,
  assetUrls = {},
  bucketName = 'reddit-clipper-assets',
  bucketRegion = 'us-east-1'
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  
  // Create S3 asset paths using the provided bucket info
  const s3Assets = React.useMemo(() => ({
    robotoFont: getS3AssetUrl(bucketName, bucketRegion, 'fonts/Roboto-Bold.ttf'),
    verificationBadge: getS3AssetUrl(bucketName, bucketRegion, 'assets/badge.png'),
    bubble: getS3AssetUrl(bucketName, bucketRegion, 'assets/bubble.svg'),
    share: getS3AssetUrl(bucketName, bucketRegion, 'assets/share.svg'),
    videos: {
      video1: getS3AssetUrl(bucketName, bucketRegion, 'assets/videos/11.mp4'),
      video2: getS3AssetUrl(bucketName, bucketRegion, 'assets/videos/22.mp4'),
      video3: getS3AssetUrl(bucketName, bucketRegion, 'assets/videos/33.mp4'),
      video4: getS3AssetUrl(bucketName, bucketRegion, 'assets/videos/44.mp4'),
      video5: getS3AssetUrl(bucketName, bucketRegion, 'assets/videos/55.mp4'),
      video6: getS3AssetUrl(bucketName, bucketRegion, 'assets/videos/66.mp4'),
    }
  }), [bucketName, bucketRegion]);
  
  // Load the Roboto font when the component mounts from S3
  React.useEffect(() => {
    const customFontFace = new FontFace('Roboto', `url(${s3Assets.robotoFont})`);
    customFontFace.load().then((loadedFace) => {
      (document.fonts as any).add(loadedFace);
      console.log('Roboto font loaded from S3');
    }).catch((error) => {
      console.error('Error loading Roboto font from S3:', error);
    });
  }, []);
  
  // Choose a random video based on the hook text (deterministic)
  const getVideoIndex = () => {
    if (!hookText) return 1;
    
    // Use the first character of the hook text to determine the video
    const charCode = hookText.charCodeAt(0);
    return (charCode % 6) + 1;
  };
  
  const videoIndex = getVideoIndex();
  
  // Get video URL based on the index from S3
  let videoSrc = getVideoUrl(assetUrls, videoIndex, s3Assets);
  
  // Get other asset URLs from S3
  const badgeUrl = getAssetUrl(assetUrls, 'badge', s3Assets, 'verificationBadge');
  const bubbleUrl = getAssetUrl(assetUrls, 'bubble', s3Assets, 'bubble');
  const shareUrl = getAssetUrl(assetUrls, 'share', s3Assets, 'share');
  
  // Timing calculations
  const initialGrowthFrames = 12; // 12 frames for initial growth
  const shrinkingDurationFrames = 4; // Exactly 6 frames for shrinking animation (half the time of growth for faster effect)
  
  // Calculate slowGrowthFrames based on audio duration minus initial growth
  const audioFrames = Math.ceil(audioDurationInSeconds * fps);
  
  // Start shrinking animation 6 frames before audio ends
  const startShrinkingFrame = audioFrames - shrinkingDurationFrames;
  
  // Initial quick scale from 70% to 100% in 12 frames (keep the same)
  // Then smooth transition to slow growth (keep the same)
  // Finally shrink to 0 at the end instead of falling
  const scale = interpolate(
    frame,
    [0, initialGrowthFrames, startShrinkingFrame, audioFrames],
    [0.7, 1, 1.05, 0],
    {
      extrapolateRight: 'clamp',
      easing: (t) => {
        if (frame <= initialGrowthFrames) {
          // Fast start and slow down quickly (same as original)
          return Easing.bezier(0.8, 0, 0.2, 1)(t);
        } else if (frame >= startShrinkingFrame) {
          // Exactly opposite of initial growth animation (mirrored control points)
          return Easing.bezier(0.2, 0, 0.8, 1)(t);
        }
        // Linear growth for the middle phase (same as original)
        return t;
      }
    }
  );

  // Create floating animation (gentle oscillation on Y axis)
  // This will create a smooth up-and-down floating movement during the growth phase
  const floatAmplitude = 15; // Maximum pixels to move up/down
  const floatCyclesPerSecond = 1; // How many full oscillations per second

  const floatOffset = frame >= initialGrowthFrames && frame < startShrinkingFrame
    ? floatAmplitude * Math.sin(
        (frame - initialGrowthFrames) * 
        ((2 * Math.PI * floatCyclesPerSecond) / fps)
      )
    : 0;

  // Dynamic rotation that oscillates with vertical movement
  const rotationAmplitude = 0.75; // Maximum degrees to rotate
  const rotation = frame >= initialGrowthFrames && frame < startShrinkingFrame
    ? rotationAmplitude * Math.sin(
        (frame - initialGrowthFrames) * 
        ((2 * Math.PI * floatCyclesPerSecond) / fps)
      )
    : 0;

  // Dynamic blur only at the end when shrinking
  const blurAmount = frame >= startShrinkingFrame 
    ? interpolate(
        frame,
        [startShrinkingFrame, audioFrames],
        [0, 3],
        {
          extrapolateRight: 'clamp',
          easing: Easing.bezier(0.2, 0, 0.8, 1)
        }
      ) 
    : 0;

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: '100%',
  };

  const cardStyle: React.CSSProperties = {
    width: 800,
    minHeight: 275,
    borderRadius: 50,
    backgroundColor: '#ffffff',
    transform: `
      translateY(${floatOffset}px)
      rotate(${rotation}deg)
      scale(${scale})
    `,
    filter: `blur(${blurAmount}px)`,
    position: 'relative',
    padding: '10px 15px',
    border: '1px solid #000000',
    boxShadow: '10px 10px 10px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '15px',
  };

  const titleContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    marginTop: '10px',
  };

  const channelNameStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  };

  const gifContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '0px',
    alignItems: 'center',
    marginTop: '-5px',
  };

  const gifStyle: React.CSSProperties = {
    height: '60px',
    width: 'auto',
    objectFit: 'contain',
  };

  const profileImageStyle: React.CSSProperties = {
    width: '116px',
    height: '116px',
    borderRadius: '50%',
    backgroundColor: channelImage ? 'transparent' : '#FF4500',
    backgroundImage: channelImage ? `url(${channelImage})` : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    flexShrink: 0,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '40px',
    fontWeight: 700,
    color: '#1a1a1a',
    margin: 0,
    fontFamily,
  };

  const postTitleStyle: React.CSSProperties = {
    fontSize: '45px',
    color: '#1a1a1a',
    margin: '3px 0 0 6px',
    fontFamily,
    width: '95%',
    lineHeight: '0.9',
    flex: '1',
    overflow: 'visible',
  };

  const badgeStyle: React.CSSProperties = {
    height: '40px',
    width: 'auto',
    objectFit: 'contain',
  };

  const heartContainerStyle: React.CSSProperties = {
    position: 'relative',
    marginTop: 'auto',
    paddingTop: '10px',
    bottom: '10px',
    left: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  };

  const iconContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  };

  const iconGroupStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  };

  const heartIconStyle: React.CSSProperties = {
    height: '40px',
    width: '40px',
    stroke: '#888888',
    strokeWidth: '2',
    fill: 'none',
  };

  const bubbleIconStyle: React.CSSProperties = {
    height: '40px',
    width: '40px',
    filter: 'invert(55%) sepia(0%) saturate(636%) hue-rotate(155deg) brightness(94%) contrast(89%)',
  };

  const shareIconStyle: React.CSSProperties = {
    height: '40px',
    width: '40px',
    filter: 'invert(55%) sepia(0%) saturate(636%) hue-rotate(155deg) brightness(94%) contrast(89%)',
  };

  const counterStyle: React.CSSProperties = {
    fontSize: '28px',
    fontFamily,
    color: '#888888',
    fontWeight: '500',
  };

  const shareTextStyle: React.CSSProperties = {
    fontSize: '28px',
    fontFamily,
    color: '#888888',
    fontWeight: '500',
  };

  const shareContainerStyle: React.CSSProperties = {
    position: 'relative',
    marginTop: 'auto',
    paddingTop: '10px',
    bottom: '10px',
    right: '100px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginLeft: 'auto',
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div style={profileImageStyle} />
          <div style={titleContainerStyle}>
            <div style={channelNameStyle}>
              <h1 style={titleStyle}>{channelName}</h1>
              <img src={badgeUrl} style={badgeStyle} alt="Verified" />
            </div>
            <div style={gifContainerStyle}>
              {[1, 2, 3, 4, 5, 6].map(idx => (
                <VideoComponent
                  key={idx}
                  src={getVideoUrl(assetUrls, idx, s3Assets)}
                  style={gifStyle}
                  alt={`Video ${idx}`}
                />
              ))}
            </div>
          </div>
        </div>
        <h2 style={postTitleStyle}>
          {hookText}
        </h2>
        <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '10px'}}>
          <div style={heartContainerStyle}>
            <div style={iconContainerStyle}>
              <div style={iconGroupStyle}>
                <svg 
                  viewBox="0 0 24 24" 
                  style={heartIconStyle}
                >
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                <span style={counterStyle}>99+</span>
              </div>
              <div style={iconGroupStyle}>
                <img src={bubbleUrl} style={bubbleIconStyle} alt="Comments" />
                <span style={counterStyle}>99+</span>
              </div>
            </div>
          </div>
          <div style={shareContainerStyle}>
            <div style={iconGroupStyle}>
              <img src={shareUrl} style={shareIconStyle} alt="Share" />
              <span style={shareTextStyle}>Share</span>
            </div>
          </div>
        </div>
      </div>
      {audioUrl && <Audio src={audioUrl} />}
    </div>
  );
}; 