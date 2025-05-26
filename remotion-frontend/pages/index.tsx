import React, { useState, useEffect, FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UIFormValues, uiFormSchema } from '../lib/schema';
import Head from 'next/head';
import Image from 'next/image';
import { 
  Upload, 
  Film, 
  Mic, 
  Type, 
  Image as LucideImage, 
  Sparkles, 
  Settings,
  FileText,
  Music,
  Palette,
  AlertCircle,
  CheckCircle,
  Copy,
  ExternalLink,
  FolderKanban,
  Video,
  KeyRound,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';

// Main App Mode Toggle Button
const AppModeButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex-1 sm:flex-none flex items-center justify-center sm:justify-start gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 rounded-md font-medium transition-all text-xs sm:text-sm ${
      active
        ? 'bg-gradient-to-r from-brand-gradient-from to-brand-gradient-to text-white shadow-lg'
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
      active
        ? 'bg-gradient-to-r from-brand-gradient-from to-brand-gradient-to text-white shadow-md'
        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const AssetUploader: React.FC<{
  label: string;
  icon: React.ReactNode;
  accept: string;
  onUpload: (file: File) => Promise<string>;
  uploadedUrl?: string;
  assetType: 'logo' | 'font' | 'music';
  setUploadedLogo?: React.Dispatch<React.SetStateAction<string>>;
  setUploadedFont?: React.Dispatch<React.SetStateAction<string>>;
  setUploadedMusicUrl?: React.Dispatch<React.SetStateAction<string>>;
  notes?: string;
}> = ({ label, icon, accept, onUpload, uploadedUrl: initialUploadedUrl, assetType, setUploadedLogo, setUploadedFont, setUploadedMusicUrl, notes }) => {
  const [uploading, setUploading] = useState(false);
  const [currentUploadedUrl, setCurrentUploadedUrl] = useState(initialUploadedUrl || '');
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      setError(null);
      try {
        const newUrl = await onUpload(file);
        setCurrentUploadedUrl(newUrl);
        if (assetType === 'logo' && setUploadedLogo) setUploadedLogo(newUrl);
        if (assetType === 'font' && setUploadedFont) setUploadedFont(newUrl);
        if (assetType === 'music' && setUploadedMusicUrl) setUploadedMusicUrl(newUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
        setCurrentUploadedUrl('');
      }
      setUploading(false);
    }
  };

  const copyToClipboard = () => {
    if (currentUploadedUrl) {
      navigator.clipboard.writeText(currentUploadedUrl);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex flex-col h-full">
      <div className="flex items-center gap-3 mb-3">
        {icon}
        <h3 className="font-semibold text-white">{label}</h3>
      </div>
      {notes && <p className="text-xs text-gray-400 mb-3">{notes}</p>}
      
      {!currentUploadedUrl ? (
        <label className={`flex flex-col items-center justify-center w-full flex-grow h-32 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer hover:bg-gray-700 transition-colors ${uploading ? 'opacity-50' : ''}`}>
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <Upload className="w-8 h-8 mb-2 text-gray-400" />
            <p className="mb-2 text-sm text-gray-400">
              <span className="font-semibold">{uploading ? 'Uploading...' : 'Click to upload'}</span> or drag and drop
            </p>
            <p className="text-xs text-gray-500">{accept}</p>
          </div>
          <input type="file" className="hidden" accept={accept} onChange={handleFileChange} disabled={uploading}/>
        </label>
      ) : (
        <div className="bg-gray-900 rounded-lg p-3 mt-auto">
          <p className="text-green-400 text-xs mb-1 flex items-center"><CheckCircle className="w-3 h-3 mr-1"/> Uploaded Successfully!</p>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-300 truncate flex-1 mr-2" title={currentUploadedUrl}>{currentUploadedUrl}</p>
            <button onClick={copyToClipboard} className="text-gray-400 hover:text-white transition-colors" title="Copy URL">
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  );
};

const AUTH_TIMESTAMP_KEY = 'rdttFunAuthTimestamp';
const SESSION_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

export default function RedditVideoMakerPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState(Array(12).fill(''));
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true); // To prevent flash of auth screen

  const [appMode, setAppMode] = useState<'creator' | 'assets'>('creator');
  
  // States for Video Creator
  const [activeTab, setActiveTab] = useState('content');
  const [generatedProps, setGeneratedProps] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  
  // States for Asset Manager (passed down to uploader and form)
  const [uploadedLogo, setUploadedLogo] = useState<string>('');
  const [uploadedFont, setUploadedFont] = useState<string>('');
  const [uploadedMusicUrl, setUploadedMusicUrl] = useState<string>('');

  const { register, handleSubmit, formState: { errors: formErrors }, watch } = useForm<UIFormValues>({
    resolver: zodResolver(uiFormSchema),
    defaultValues: {
      fontSize: 48, fontStrokeSize: 4, background_music_volume: 0.02,
      has_background_music: false, animatedSubtitleType: 'word',
      hook_animation_type: 'fall', backgroundVideoStyle: 'satisfying',
      fontFamily: 'Jellee',
    },
  });

  const hasBackgroundMusic = watch('has_background_music');
  const currentFontFamily = watch('fontFamily');
  const customFontUrl = watch('customFontUrl');
  const currentBackgroundStyle = watch('backgroundVideoStyle');

  // Effect to dynamically add @font-face for custom fonts
  useEffect(() => {
    const styleId = 'dynamic-custom-font-face';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement | null;

    if (currentFontFamily === 'custom' && customFontUrl) {
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
      }
      // Use a consistent name for the preview font family to avoid conflicts
      styleElement.innerHTML = `
        @font-face {
          font-family: 'CustomPreviewFont'; 
          src: url('${customFontUrl}');
        }
      `;
    } else {
      if (styleElement) {
        styleElement.innerHTML = ''; // Clear the rule if not custom or no URL
      }
    }
    // Cleanup on component unmount or if dependencies change and rule is removed
    return () => {
      if (currentFontFamily !== 'custom' || !customFontUrl) {
        const el = document.getElementById(styleId);
        if (el) el.innerHTML = ''; // Clear rule if it was the last one active
      }
    };
  }, [currentFontFamily, customFontUrl]);

  const getPreviewFontFamily = () => {
    if (currentFontFamily === 'custom' && customFontUrl) {
      return 'CustomPreviewFont, sans-serif'; // Fallback to sans-serif
    }
    return currentFontFamily || 'sans-serif'; // Default to current selection or sans-serif
  };

  const handleActualUpload = async (file: File, assetType: 'logo' | 'font' | 'music'): Promise<string> => {
    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('assetType', assetType);

    try {
      const response = await fetch('/api/upload-asset', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Failed to upload ${assetType}`);
      }
      
      console.log(`${assetType} uploaded successfully:`, result.s3Url);
      if (assetType === 'logo') setUploadedLogo(result.s3Url);
      if (assetType === 'font') setUploadedFont(result.s3Url);
      if (assetType === 'music') setUploadedMusicUrl(result.s3Url);
      
      return result.s3Url;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `An unexpected error occurred during ${assetType} upload.`;
      setError(errorMessage);
      console.error(`Error uploading ${assetType}:`, err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmitVideoForm = async (data: UIFormValues) => {
    setIsLoading(true); setError(null); setVideoUrl(null); setGeneratedProps(null);

    if (uploadedLogo && !data.channelImage) data.channelImage = uploadedLogo;
    if (uploadedFont && data.fontFamily === 'custom' && !data.customFontUrl) data.customFontUrl = uploadedFont;

    try {
      const response = await fetch('/api/create-video', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to generate video');
      setVideoUrl(result.videoUrl);
      setGeneratedProps(JSON.stringify(result.propsUsed, null, 2));
    } catch (err) { setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally { setIsLoading(false); }
  };

  const videoCreatorTabs = [
    { id: 'content', label: 'Content', icon: <FileText className="w-4 h-4" /> },
    { id: 'style', label: 'Style', icon: <Palette className="w-4 h-4" /> },
    { id: 'branding', label: 'Branding', icon: <LucideImage className="w-4 h-4" /> },
    { id: 'advanced', label: 'Advanced', icon: <Settings className="w-4 h-4" /> },
  ];

  const handleSeedWordChange = (index: number, value: string) => {
    const newPhrase = [...seedPhrase];
    // Allow only letters and spaces, then split by space and take the first word
    // This helps manage pasting multiple words into one field or unwanted characters
    const cleanedWord = value.replace(/[^a-zA-Z\s]/g, '').trim().split(' ')[0] || '';
    newPhrase[index] = cleanedWord;
    setSeedPhrase(newPhrase);
    setAuthError(null); // Clear error on input change
  };

  const handleSeedSubmit = (e: FormEvent) => {
    e.preventDefault();
    const enteredPhrase = seedPhrase.join(' ').toLowerCase().trim();
    const correctPhrase = process.env.NEXT_PUBLIC_SEED_PHRASE_PASSWORD?.toLowerCase().trim();

    if (enteredPhrase === correctPhrase) {
      localStorage.setItem(AUTH_TIMESTAMP_KEY, Date.now().toString());
      setIsAuthenticated(true);
      setAuthError(null);
    } else {
      setAuthError('Invalid seed phrase. Please try again.');
      localStorage.removeItem(AUTH_TIMESTAMP_KEY); // Ensure no stale timestamp on failed attempt
    }
  };

  // Automatically focus next input field
  useEffect(() => {
    const inputs = document.querySelectorAll<HTMLInputElement>('.seed-input');
    inputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.value.length === target.maxLength && index < inputs.length - 1) {
          inputs[index + 1]?.focus();
        }
      });
      // Handle pasting a full phrase
      input.addEventListener('paste', (e: ClipboardEvent) => {
        e.preventDefault();
        const pasteData = e.clipboardData?.getData('text').trim().split(/\s+/);
        if (pasteData) {
          const newPhrase = [...seedPhrase];
          for (let i = 0; i < Math.min(pasteData.length, 12 - index); i++) {
            if (inputs[index + i]) {
              (inputs[index+i] as HTMLInputElement).value = pasteData[i];
               newPhrase[index+i] = pasteData[i];
            }
          }
          setSeedPhrase(newPhrase);
          // Focus the next empty input or the last one filled
          const nextEmpty = newPhrase.findIndex((word, idx) => idx >= index && word === '');
          if (nextEmpty !== -1 && inputs[nextEmpty]){
             inputs[nextEmpty].focus();
          } else if (inputs[Math.min(index + pasteData.length, 11)]) {
             inputs[Math.min(index + pasteData.length, 11)].focus();
          }
        }
      });
    });
  }, [seedPhrase]); // Rerun if seedPhrase changes to correctly assign pasted values

  // Check authentication status on initial load
  useEffect(() => {
    const storedTimestamp = localStorage.getItem(AUTH_TIMESTAMP_KEY);
    if (storedTimestamp) {
      const timestamp = parseInt(storedTimestamp, 10);
      if (Date.now() - timestamp < SESSION_DURATION_MS) {
        setIsAuthenticated(true);
      } else {
        localStorage.removeItem(AUTH_TIMESTAMP_KEY); // Expired session
        setIsAuthenticated(false);
      }
    }
    setIsLoadingAuth(false); // Done checking auth
  }, []);

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-brand-gradient-from"></div>
      </div>
    ); // Or a more styled loading screen
  }

  if (!isAuthenticated) {
    return (
      <>
        <Head>
          <title>Unlock - rdtt.fun</title>
          <link rel="icon" href="/logo.png" />
        </Head>
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 font-sans">
          <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700">
            <div className="flex flex-col items-center mb-6">
              <Image src="/logo.png" alt="rdtt.fun Logo" width={72} height={72} className="rounded-xl mb-4" />
              <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-brand-gradient-from to-brand-gradient-to mb-2">rdtt.fun</h1>
              <p className="text-gray-400">Enter your 12-word seed phrase to continue.</p>
            </div>
            <form onSubmit={handleSeedSubmit} className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {seedPhrase.map((word, index) => (
                  <div key={index} className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">{index + 1}.</span>
                    <input
                      type="text"
                      value={word}
                      onChange={(e) => handleSeedWordChange(index, e.target.value)}
                      // maxLength={20} // Max length for a single word
                      className="seed-input w-full pl-6 pr-2 py-2.5 bg-gray-700 border border-gray-600 rounded-md focus:border-reddit-orangered focus:ring-1 focus:ring-reddit-orangered outline-none transition-colors placeholder-gray-500 text-sm"
                      placeholder={`Word ${index + 1}`}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck="false"
                    />
                  </div>
                ))}
              </div>
              {authError && (
                <div className="flex items-center text-sm text-red-400 bg-red-900/30 border border-red-700/50 p-3 rounded-md">
                  <ShieldX className="w-5 h-5 mr-2 flex-shrink-0" />
                  {authError}
                </div>
              )}
              <button 
                type="submit"
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand-gradient-from to-brand-gradient-to text-white px-6 py-3 rounded-lg font-semibold hover:from-youtube-red/90 hover:to-reddit-orangered/90 transition-all shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-reddit-orangered"
              >
                <KeyRound className="w-5 h-5" />
                Unlock Access
              </button>
            </form>
          </div>
           <footer className="text-center mt-8 text-xs text-gray-600">
            <p>&copy; {new Date().getFullYear()} rdtt.fun - Video Tools. All shenanigans reserved.</p>
          </footer>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>rdtt.fun - Video Creator & Asset Manager</title>
        <link rel="icon" href="/logo.png" />
      </Head>
      <div className="min-h-screen bg-gray-900 text-white font-sans">
        <header className="bg-gray-900 border-b border-gray-700 shadow-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-2 sm:gap-3">
                <Image src="/logo.png" alt="rdtt.fun Logo" width={36} height={36} className="rounded-lg" />
                <h1 className="text-xl sm:text-2xl font-bold text-gray-100">rdtt.fun</h1>
              </div>
              <div className="flex items-center space-x-2 sm:space-x-3">
                <AppModeButton active={appMode === 'creator'} onClick={() => setAppMode('creator')} icon={<Video className="w-5 h-5"/>} label="Video Creator" />
                <AppModeButton active={appMode === 'assets'} onClick={() => setAppMode('assets')} icon={<FolderKanban className="w-5 h-5"/>} label="Asset Manager" />
                <a 
                  href="/api-docs" 
                  target="_blank"
                  title="API Documentation"
                  className="p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-gray-700"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {appMode === 'creator' && (
            <div className="bg-gray-800 bg-opacity-70 backdrop-blur-md rounded-xl shadow-2xl border border-gray-700">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-brand-gradient-from to-brand-gradient-to">
                  Craft Your Masterpiece on rdtt.fun
                </h2>
                <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                  {videoCreatorTabs.map(tab => (
                    <TabButton key={tab.id} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} icon={tab.icon} label={tab.label} />
                  ))}
                </div>
                <form onSubmit={handleSubmit(onSubmitVideoForm)} className="space-y-6">
                  {activeTab === 'content' && (
                    <div className="space-y-6">
                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                      <h3 className="font-semibold mb-4 flex items-center gap-2"><Mic className="w-5 h-5 text-green-400" />Audio Content</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Hook Audio (S3 URL)<span className="text-gray-500 ml-2 text-xs font-normal">~5 seconds</span></label>
                          <input {...register('audioUrl')} type="text" placeholder="s3://your-bucket/hook-audio.mp3" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-reddit-orangered focus:ring-reddit-orangered focus:outline-none transition-colors"/>
                          {formErrors.audioUrl && <p className="text-red-400 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.audioUrl.message}</p>}
                        </div>
                      </div>
                    </div>
                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                      <h3 className="font-semibold mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-blue-400" />Text Content</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Hook Text<span className="text-gray-500 ml-2 text-xs font-normal">Catchy opening text</span></label>
                          <textarea {...register('hookText')} rows={2} placeholder="This will blow your mind..." className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-reddit-orangered focus:ring-reddit-orangered focus:outline-none transition-colors resize-none"/>
                          {formErrors.hookText && <p className="text-red-400 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.hookText.message}</p>}
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Subtitles (SRT S3 URL)<span className="text-gray-500 ml-2 text-xs font-normal">Synced captions</span></label>
                          <input {...register('srtFileUrl')} type="text" placeholder="s3://your-bucket/captions.srt" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-reddit-orangered focus:ring-reddit-orangered focus:outline-none transition-colors"/>
                          {formErrors.srtFileUrl && <p className="text-red-400 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.srtFileUrl.message}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                  )}
                  {activeTab === 'style' && (
                     <div className="space-y-6">
                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                      <h3 className="font-semibold mb-4">Visual Style</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Background Style</label>
                          <select {...register('backgroundVideoStyle')} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-reddit-orangered focus:ring-reddit-orangered focus:outline-none transition-colors">
                            <option value="satisfying">Satisfying</option> <option value="parkour">Parkour</option> <option value="makeup">Makeup</option> <option value="food">Food</option>
                          </select>
                          {currentBackgroundStyle && (
                            <div className="mt-2 text-xs text-gray-400 bg-gray-800 p-2 rounded-md">
                              <p>Clips will be sourced from:</p>
                              <code className="text-gray-300 break-all">https://rdtt.fun/Clips/{currentBackgroundStyle}/</code>
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Hook Animation</label>
                          <select {...register('hook_animation_type')} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-reddit-orangered focus:ring-reddit-orangered focus:outline-none transition-colors">
                            <option value="fall">Fall</option> <option value="float">Float</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Subtitle Animation</label>
                          <select {...register('animatedSubtitleType')} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-reddit-orangered focus:ring-reddit-orangered focus:outline-none transition-colors">
                            <option value="word">Word by Word</option> <option value="couple">Couple Combined</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                      <h3 className="font-semibold mb-4">Typography</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Font Family</label>
                          <select {...register('fontFamily')} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-reddit-orangered focus:ring-reddit-orangered focus:outline-none transition-colors">
                            <option value="Jellee">Jellee</option> <option value="Arial">Arial</option> <option value="Helvetica">Helvetica</option> <option value="custom">Custom (use uploaded or provide URL)</option>
                          </select>
                        </div>
                        {currentFontFamily === 'custom' && (
                          <div>
                            <label className="block text-sm font-medium mb-2">Custom Font URL</label>
                            <input {...register('customFontUrl')} type="text" placeholder={uploadedFont || "https://rdtt.fun/Fonts/font.ttf"} defaultValue={uploadedFont} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-reddit-orangered focus:ring-reddit-orangered focus:outline-none transition-colors"/>
                          </div>
                        )}
                        <div>
                          <label className="block text-sm font-medium mb-2">Font Size (for Remotion)</label>
                          <input {...register('fontSize', { valueAsNumber: true })} type="number" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-reddit-orangered focus:ring-reddit-orangered focus:outline-none transition-colors"/>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Stroke Size (for Remotion)</label>
                          <input {...register('fontStrokeSize', { valueAsNumber: true })} type="number" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-reddit-orangered focus:ring-reddit-orangered focus:outline-none transition-colors"/>
                        </div>
                      </div>
                      {(currentFontFamily || customFontUrl) && (
                        <div className="mt-4 p-4 bg-gray-700 rounded-lg border border-gray-600">
                          <h4 className="text-sm font-medium text-gray-300 mb-2">Font Preview:</h4>
                          <div 
                            style={{ fontFamily: getPreviewFontFamily(), fontSize: '24px', color: 'white' }} 
                            className="truncate p-2 bg-gray-800 rounded"
                          >
                            The quick brown fox jumps over the lazy dog. 1234567890
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  )}
                  {activeTab === 'branding' && (
                    <div className="space-y-6">
                      <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                        <h3 className="font-semibold mb-4">Channel Branding</h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium mb-2">Channel Name</label>
                            <input {...register('channelName')} type="text" placeholder="MyAwesomeChannel" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-reddit-orangered focus:ring-reddit-orangered focus:outline-none transition-colors"/>
                            {formErrors.channelName && <p className="text-red-400 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.channelName.message}</p>}
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">Channel Logo (S3 URL){uploadedLogo && (<span className="text-green-400 ml-2 text-xs"><CheckCircle className="inline w-3 h-3 mr-1" />Using uploaded logo</span>)}</label>
                            <input {...register('channelImage')} type="text" placeholder={uploadedLogo || "s3://your-bucket/logo.png"} defaultValue={uploadedLogo} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-reddit-orangered focus:ring-reddit-orangered focus:outline-none transition-colors"/>
                            {formErrors.channelImage && <p className="text-red-400 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.channelImage.message}</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeTab === 'advanced' && (
                    <div className="space-y-6">
                      <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                        <h3 className="font-semibold mb-4 flex items-center gap-2"><Music className="w-5 h-5 text-purple-400" />Background Music</h3>
                        <div className="space-y-4">
                          <label className="flex items-center gap-3">
                            <input {...register('has_background_music')} type="checkbox" className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-reddit-orangered focus:ring-reddit-orangered focus:ring-offset-0"/>
                            <span>Enable background music</span>
                          </label>
                          {hasBackgroundMusic && (
                            <>
                              <div>
                                <label className="block text-sm font-medium mb-2">Music URL (S3)</label>
                                <input {...register('backgroundMusicUrl')} type="text" placeholder="s3://your-bucket/music.mp3" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-reddit-orangered focus:ring-reddit-orangered focus:outline-none transition-colors"/>
                              </div>
                              <div>
                                <label className="block text-sm font-medium mb-2">Music Volume (0-1)</label>
                                <input {...register('background_music_volume', { valueAsNumber: true })} type="number" step="0.01" min="0" max="1" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-reddit-orangered focus:ring-reddit-orangered focus:outline-none transition-colors"/>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end pt-4">
                    <button type="submit" disabled={isLoading} className={`bg-gradient-to-r from-brand-gradient-from to-brand-gradient-to text-white px-8 py-3 rounded-lg font-semibold hover:from-youtube-red/90 hover:to-reddit-orangered/90 transition-all shadow-lg flex items-center gap-2 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      {isLoading ? (<><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>Creating Video...</>) : (<><Film className="w-5 h-5" />Create Video</>)}
                    </button>
                  </div>
                </form>
                {error && (
                  <div className="mt-4 bg-red-900/70 backdrop-blur-md rounded-lg p-4 border border-youtube-red/80">
                    <p className="text-red-200 flex items-center gap-2"><AlertCircle className="w-5 h-5 text-youtube-red" />{error}</p>
                  </div>
                )}
                {videoUrl && (
                   <div className="mt-8 bg-green-900/70 backdrop-blur-md rounded-xl shadow-2xl border border-green-700/80 p-6">
                    <h3 className="text-xl font-semibold mb-4 text-green-300 flex items-center gap-2"><CheckCircle className="w-6 h-6 text-green-400" />Video Created Successfully!</h3>
                    <div className="bg-gray-900 rounded-lg p-4 mb-4">
                      <p className="text-sm text-gray-400 mb-2">Your video is ready at:</p>
                      <div className="flex items-center gap-2">
                        <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 break-all flex-1">{videoUrl}</a>
                        <button onClick={() => navigator.clipboard.writeText(videoUrl)} className="text-gray-400 hover:text-white transition-colors flex-shrink-0" title="Copy URL"><Copy className="w-4 h-4" /></button>
                      </div>
                    </div>
                    {generatedProps && (<details className="cursor-pointer"><summary className="text-sm text-gray-400 hover:text-gray-300">View generation details</summary><pre className="mt-2 bg-gray-900 p-4 rounded-lg overflow-x-auto text-xs"><code>{generatedProps}</code></pre></details>)}
                  </div>
                )}
              </div>
            </div>
          )}

          {appMode === 'assets' && (
            <div>
              <h2 className="text-3xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-brand-gradient-to to-brand-gradient-from">
                rdtt.fun Asset Manager
              </h2>
              {error && appMode === 'assets' && (
                 <div className="mb-4 bg-red-900/70 backdrop-blur-md rounded-lg p-3 border border-youtube-red/80 text-red-200 text-sm">
                    <AlertCircle className="inline w-4 h-4 mr-2 text-youtube-red" /> {error}
                 </div>
              )}
              <p className="text-gray-400 text-lg mb-8">
                Upload and manage your reusable channel logos, custom fonts, and background music tracks. These will be stored in your S3 bucket.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <AssetUploader
                  label="Upload Channel Logo"
                  icon={<LucideImage className="w-6 h-6 text-blue-400" />}
                  accept="image/png, image/jpeg, image/webp, image/gif"
                  notes="Recommended: Square, transparent PNG for best results."
                  onUpload={(file) => handleActualUpload(file, 'logo')}
                  uploadedUrl={uploadedLogo}
                  assetType="logo"
                  setUploadedLogo={setUploadedLogo}
                />
                <AssetUploader
                  label="Upload Custom Font"
                  icon={<Type className="w-6 h-6 text-purple-400" />}
                  accept=".ttf,.otf,.woff,.woff2"
                  notes="Supported formats: TTF, OTF, WOFF, WOFF2."
                  onUpload={(file) => handleActualUpload(file, 'font')}
                  uploadedUrl={uploadedFont}
                  assetType="font"
                  setUploadedFont={setUploadedFont}
                />
                <AssetUploader
                  label="Upload Background Music"
                  icon={<Music className="w-6 h-6 text-green-400" />}
                  accept=".mp3,.wav"
                  notes="Supported formats: MP3, WAV. This can be used for background music in your videos."
                  onUpload={(file) => handleActualUpload(file, 'music')}
                  uploadedUrl={uploadedMusicUrl}
                  assetType="music"
                  setUploadedMusicUrl={setUploadedMusicUrl}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
} 