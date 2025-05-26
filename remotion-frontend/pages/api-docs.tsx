import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language = 'json' }) => (
  <pre className={`bg-gray-800 p-4 rounded-md overflow-x-auto text-sm whitespace-pre-wrap break-all scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-700 language-${language}`}>
    <code>{code}</code>
  </pre>
);

const ApiDocsPage = () => {
  const exampleUiFormValues = {
    channelName: "Example Channel",
    channelImage: "https://rdtt.fun/ChannelLogos/your-logo.png",
    hookText: "This is a catchy hook!",
    hook_animation_type: "fall",
    audioUrl: "https://rdtt.fun/UserMusic/hook-audio.mp3",
    scriptAudioUrl: "https://rdtt.fun/UserMusic/main-audio.mp3",
    srtFileUrl: "https://rdtt.fun/SRTs/captions.srt",
    animatedSubtitleType: "word",
    fontFamily: "Jellee",
    customFontUrl: "https://rdtt.fun/Fonts/custom-font.ttf",
    fontSize: 48,
    fontStrokeSize: 4,
    backgroundVideoStyle: "satisfying",
    has_background_music: true,
    backgroundMusicUrl: "https://rdtt.fun/UserMusic/bg-music.mp3",
    background_music_volume: 0.02,
    assetUrls: {
      badge: "https://rdtt.fun/OtherAssets/badge.png",
      bubble: "https://rdtt.fun/OtherAssets/bubble.png",
    },
    bucketName: "remotion-reddit-start",
    bucketRegion: "eu-north-1"
  };

  const exampleSuccessResponse = {
    message: "Video processing initiated and completed successfully.",
    videoUrl: "https://rdtt.fun/Videos/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.mp4",
    propsUsed: {
      channelName: "Example Channel",
      channelImage: "https://rdtt.fun/ChannelLogos/your-logo.png",
      hookText: "This is a catchy hook!",
      hook_animation_type: "fall",
      audioUrl: "https://rdtt.fun/UserMusic/hook-audio.mp3",
      scriptAudioUrl: "https://rdtt.fun/UserMusic/main-audio.mp3",
      srtFileUrl: "https://rdtt.fun/SRTs/captions.srt",
      animatedSubtitleType: "word",
      fontFamily: "Jellee",
      customFontUrl: "https://rdtt.fun/Fonts/custom-font.ttf",
      fontSize: 48,
      fontStrokeSize: 4,
      backgroundVideoStyle: "satisfying", 
      has_background_music: true,
      backgroundMusicUrl: "https://rdtt.fun/UserMusic/bg-music.mp3",
      background_music_volume: 0.02,
      assetUrls: {
        badge: "https://rdtt.fun/OtherAssets/badge.png",
        bubble: "https://rdtt.fun/OtherAssets/bubble.png",
      },
      bucketName: "remotion-reddit-start",
      bucketRegion: "eu-north-1",
      audioDurationInSeconds: 5.0,
      scriptAudioDurationInSeconds: 60.0,
      subtitleText: "[Placeholder] Full text from https://rdtt.fun/SRTs/captions.srt",
      wordTimings: [
        { text: "[Placeholder]", startFrame: 0, endFrame: 30, color: "yellow" },
        { text: "SRT", startFrame: 31, endFrame: 60 },
      ],
      backgroundVideoPath: [
        { path: "https://rdtt.fun/Clips/Satisfying/placeholder_clip_1.mp4", durationInFrames: 90 },
      ],
      totalDurationInFrames: 1950,
    }
  };

  return (
    <>
      <Head>
        <title>API Documentation - rdtt.fun</title>
        <link rel="icon" href="/logo.png" />
      </Head>
      <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8 font-sans selection:bg-youtube-red selection:text-white">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-brand-gradient-from to-brand-gradient-to">rdtt.fun API</h1>
          <p className="text-gray-400 mt-2">Programmatically create engaging videos with rdtt.fun.</p>
          <Link href="/" legacyBehavior>
            <a className="mt-4 inline-block text-reddit-orangered hover:text-youtube-red transition-colors">&larr; Back to rdtt.fun UI</a>
          </Link>
        </header>

        <section className="max-w-3xl mx-auto bg-gray-800 bg-opacity-70 backdrop-blur-md shadow-xl rounded-lg p-6 md:p-8">
          <h2 className="text-2xl font-semibold text-reddit-orangered border-b border-gray-700 pb-3 mb-6">Create Video via rdtt.fun API</h2>
          
          <div className="mb-6">
            <span className="inline-block bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full mr-2">POST</span>
            <code className="text-lg text-youtube-red">/api/create-video</code>
          </div>

          <p className="text-gray-300 mb-4">
            This endpoint allows you to programmatically generate videos using the rdtt.fun service. Provide your content details (audio, text, channel branding from your <code className="text-youtube-red">https://rdtt.fun/</code> hosted assets) and styling preferences, and the API will orchestrate the video creation process. It handles fetching and processing your assets, assembling them according to your specifications, and returning a link to the final rendered video (also hosted on <code className="text-youtube-red">https://rdtt.fun/</code>).
          </p>
          <p className="text-gray-400 text-sm mb-6">
            <strong className="text-yellow-400">Note:</strong> This API handles fetching audio and SRT files from your provided URLs (ideally <code className="text-youtube-red">https://rdtt.fun/</code> based), uploading audio to the application's S3 bucket (accessible via <code className="text-youtube-red">https://rdtt.fun/</code>), determining audio durations, parsing SRTs, and selecting background clips. The final video rendering and upload are also managed and will be accessible via a <code className="text-youtube-red">https://rdtt.fun/</code> URL.
          </p>

          <h3 className="text-xl font-semibold text-reddit-orangered mb-3 mt-8">Request Body</h3>
          <p className="text-gray-300 mb-2">The request body must be a JSON object with the following fields. These fields correspond to the options available in the UI configurator.</p>
          <CodeBlock code={JSON.stringify(exampleUiFormValues, null, 2)} />
          <p className="text-gray-400 text-xs mt-2">
            Refer to the <code className="text-youtube-red">UIFormValues</code> type in <code className="text-youtube-red">lib/schema.ts</code> for detailed field descriptions and validations. Ensure URLs are correctly formatted.
          </p>

          <h3 className="text-xl font-semibold text-reddit-orangered mb-3 mt-8">Successful Response (200 OK)</h3>
          <p className="text-gray-300 mb-2">
            On success, the API returns a JSON object containing a success message, the S3 URL to the rendered video, and the props that were used for the generation.
          </p>
          <CodeBlock code={JSON.stringify(exampleSuccessResponse, null, 2)} />
           <p className="text-gray-400 text-xs mt-2">
            The <code className="text-youtube-red">videoUrl</code> provides a direct link to the MP4 file on S3. The <code className="text-youtube-red">propsUsed</code> field shows the exact <code className="text-youtube-red">RemotionFormProps</code> that were generated and (notionally) used for rendering, which can be helpful for debugging.
          </p>

          <h3 className="text-xl font-semibold text-reddit-orangered mb-3 mt-8">Error Responses</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
            <li><strong className="text-youtube-red">400 Bad Request:</strong> Sent if the request body fails validation (e.g., missing required fields, invalid URL format). The response body will include an <code className="text-youtube-red">error</code> message and potentially a <code className="text-youtube-red">details</code> array from Zod.</li>
            <li><strong className="text-youtube-red">405 Method Not Allowed:</strong> Sent if any method other than POST is used.</li>
            <li><strong className="text-youtube-red">500 Internal Server Error:</strong> Sent if an unexpected error occurs during server-side processing.</li>
          </ul>

        </section>
        <footer className="text-center mt-10 mb-6 text-xs text-gray-500">
          rdtt.fun API v1.0
        </footer>
      </div>
    </>
  );
};

export default ApiDocsPage; 