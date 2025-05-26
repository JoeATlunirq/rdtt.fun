import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language = 'json' }) => (
  <pre className={`bg-gray-800 p-4 rounded-md overflow-x-auto text-sm whitespace-pre-wrap break-all scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-700 language-${language}`}>
    <code>{code}</code>
  </pre>
);

interface ApiParam {
  name: string;
  type: string;
  required: string;
  description: string;
  defaultValue?: string;
}

// Data derived from uiFormSchema in lib/schema.ts
const apiParams: ApiParam[] = [
  // Hook & Main Content
  { name: 'channelName', type: 'string', required: 'Yes', description: 'Name of the channel to display on the hook card.' },
  { name: 'channelImage', type: 'string (URL)', required: 'Yes', description: 'URL to the channel logo image.' },
  { name: 'hookText', type: 'string', required: 'Yes', description: 'The catchy text for the hook segment. The end of this text determines hook duration based on SRT timings.' },
  { name: 'hook_animation_type', type: "enum ('fall', 'float', 'reveal', 'none')", required: 'No', defaultValue: 'fall', description: 'Animation style for the hook card.' },
  { name: 'audioUrl', type: 'string (URL)', required: 'No', description: 'URL to the main audio file (MP3/WAV) for the entire video.' },
  { name: 'srtFileUrl', type: 'string (URL)', required: 'No', description: 'URL to the SRT subtitle file synced with the main audio.' },
  
  // Subtitle Styling
  { name: 'animatedSubtitleType', type: "enum ('word', 'phrase')", required: 'No', defaultValue: 'word', description: 'How subtitles animate on screen.' },
  { name: 'fontFamily', type: 'string', required: 'No', defaultValue: 'Jellee', description: 'Font family for subtitles.' },
  { name: 'customFontUrl', type: 'string (URL)', required: 'No', description: 'URL to a custom TTF font file if fontFamily is \'custom\'.' },
  { name: 'fontSize', type: 'number', required: 'No', defaultValue: '50', description: 'Font size for subtitles.' },
  { name: 'fontStrokeSize', type: 'number', required: 'No', defaultValue: '3', description: 'Stroke size for subtitle text.' },
  { name: 'textColor', type: 'string (hex)', required: 'No', defaultValue: '#FFFFFF', description: 'Main color for subtitle text.' },
  { name: 'highlightColor', type: 'string (hex)', required: 'No', defaultValue: '#FCA5A5', description: 'Highlight color for animated words in subtitles.' },

  // Background
  { name: 'backgroundVideoStyle', type: "enum ('satisfying', 'makeup', 'parkour', 'gaming', 'nature', 'custom')", required: 'No', defaultValue: 'satisfying', description: 'Style of background video clips to use.' },
  { name: 'backgroundVideoUrl', type: 'string (URL)', required: 'No', description: 'Direct URL to a custom background video, overriding style.' },
  { name: 'backgroundColor', type: 'string (hex)', required: 'No', defaultValue: '#1A1A1A', description: 'Fallback background color if no video/image.' },
  { name: 'backgroundImageUrl', type: 'string (URL)', required: 'No', description: 'URL for a static background image.' },

  // Music
  { name: 'has_background_music', type: 'boolean', required: 'No', defaultValue: 'false', description: 'Enable background music.' },
  { name: 'backgroundMusicUrl', type: 'string (URL)', required: 'No', description: 'URL to background music file if enabled.' },
  { name: 'background_music_volume', type: 'number (0-1)', required: 'No', defaultValue: '0.05', description: 'Volume for background music.' },
  
  // Watermark / Overlays
  { name: 'watermarkImageUrl', type: 'string (URL)', required: 'No', description: 'URL for a custom watermark image overlay.' },
  { name: 'watermarkText', type: 'string', required: 'No', description: 'Custom text for watermark.' },
  { name: 'watermarkOpacity', type: 'number (0-1)', required: 'No', defaultValue: '0.7', description: 'Opacity for the watermark.' },
  { name: 'showChannelWatermark', type: 'boolean', required: 'No', defaultValue: 'true', description: 'Toggle for default channel image watermark.' },

  // Misc
  { name: 'outroText', type: 'string', required: 'No', description: 'Text for an outro segment.' },
  { name: 'showVideoLength', type: 'boolean', required: 'No', defaultValue: 'true', description: 'Display video length information (if applicable in template).' },
];

const ApiDocsPage = () => {
  const exampleSuccessResponse = {
    message: "Video processing initiated and completed successfully.",
    videoUrl: "https://rdtt.fun/Videos/generated-video-id.mp4",
    propsUsed: { /* Relevant subset of RemotionFormProps */ }
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

        <section className="max-w-4xl mx-auto bg-gray-800 bg-opacity-70 backdrop-blur-md shadow-xl rounded-lg p-6 md:p-8">
          <h2 className="text-2xl font-semibold text-reddit-orangered border-b border-gray-700 pb-3 mb-6">Create Video Endpoint</h2>
          
          <div className="mb-6">
            <span className="inline-block bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full mr-2">POST</span>
            <code className="text-lg text-youtube-red">/api/create-video</code>
          </div>

          <p className="text-gray-300 mb-4">
            This endpoint allows you to programmatically generate videos. Provide your content details and styling preferences, and the API will orchestrate the video creation process. The API handles asset fetching, processing, timing calculations, rendering, and uploading the final video.
          </p>
          <p className="text-gray-400 text-sm mb-6">
            <strong className="text-yellow-400">Authentication:</strong> Ensure your requests are authenticated if session-based auth is implemented for the UI (currently auth is frontend only).
            <br />
            <strong className="text-yellow-400">Asset Hosting:</strong> It is recommended to use URLs from your S3 bucket (e.g., via <code className="text-xs">https://rdtt.fun/YourPrefix/...</code>) for assets like audio, SRTs, images, and fonts for reliable fetching by the API.
          </p>

          <h3 className="text-xl font-semibold text-reddit-orangered mb-4 mt-8">Request Body Parameters</h3>
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-700">
            <table className="min-w-full text-sm text-left text-gray-300 table-fixed">
              <thead className="bg-gray-750 text-xs text-gray-200 uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3 w-1/4">Parameter</th>
                  <th scope="col" className="px-4 py-3 w-1/6">Type</th>
                  <th scope="col" className="px-4 py-3 w-1/12">Required</th>
                  <th scope="col" className="px-4 py-3 w-1/2">Description & Default</th>
                </tr>
              </thead>
              <tbody>
                {apiParams.map((param) => (
                  <tr key={param.name} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-medium text-white break-words"><code className="text-amber-300">{param.name}</code></td>
                    <td className="px-4 py-3 break-words">{param.type}</td>
                    <td className="px-4 py-3 break-words">{param.required}</td>
                    <td className="px-4 py-3 break-words">
                      {param.description}
                      {param.defaultValue && <span className="block mt-1 text-xs text-gray-400">Default: <code className="text-xs text-gray-300">{param.defaultValue}</code></span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-gray-400 text-xs mt-3">
            For enum types, refer to the Remotion UI or the <code className="text-youtube-red">uiFormSchema</code> in <code className="text-youtube-red">lib/schema.ts</code> for all possible values.
          </p>

          <h3 className="text-xl font-semibold text-reddit-orangered mb-3 mt-8">Example Request</h3>
          <p className="text-gray-300 mb-2">A minimal example to create a video:</p>
          <CodeBlock language="json" code={JSON.stringify({
            channelName: "My Test Channel",
            channelImage: "https://rdtt.fun/UserLogos/default-logo.png",
            hookText: "This is a test hook for the video.",
            audioUrl: "https://rdtt.fun/UserMusic/test-audio.mp3",
            srtFileUrl: "https://rdtt.fun/UserSRTs/test-subs.srt",
          }, null, 2)} />

          <h3 className="text-xl font-semibold text-reddit-orangered mb-3 mt-8">Successful Response (200 OK)</h3>
          <p className="text-gray-300 mb-2">
            On success, the API returns a JSON object containing a success message, the S3 URL to the rendered video, and the full props that were used for generation (useful for debugging).
          </p>
          <CodeBlock code={JSON.stringify(exampleSuccessResponse, null, 2)} />

          <h3 className="text-xl font-semibold text-reddit-orangered mb-3 mt-8">Error Responses</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
            <li><strong className="text-youtube-red">400 Bad Request:</strong> Sent if the request body fails validation. The response body will include an <code className="text-xs">error</code> message and potentially <code className="text-xs">details</code> from Zod.</li>
            <li><strong className="text-youtube-red">405 Method Not Allowed:</strong> Sent if any method other than POST is used.</li>
            <li><strong className="text-youtube-red">500 Internal Server Error:</strong> Sent if an unexpected error occurs during server-side processing (e.g., asset fetching failure, Remotion render error). Check Vercel logs for details.</li>
          </ul>

        </section>
        <footer className="text-center mt-10 mb-6 text-xs text-gray-500">
          rdtt.fun API v1.1
        </footer>
      </div>
    </>
  );
};

export default ApiDocsPage; 