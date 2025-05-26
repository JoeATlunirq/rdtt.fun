import type { NextApiRequest, NextApiResponse } from 'next';
import { ZodError } from 'zod';
import { RemotionFormProps, uiFormSchema, UIFormValues, WordTiming, VideoAsset } from '../../lib/schema';
import { v4 as uuidv4 } from 'uuid'; // For generating unique filenames

import { S3Client, GetObjectCommand, S3ClientConfig, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import SrtParser2 from 'srt-parser-2';

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import https from 'https';
import { URL } from 'url'; // Import URL explicitly
import os from 'os'; // For temporary directory

// Promisify exec for cleaner async/await usage
import util from 'util';
const execPromise = util.promisify(exec);

// Define a type for the items parsed by SrtParser2
interface SrtItem {
  id: string; // Usually a number as a string
  startTime: string; // e.g., "00:00:01,234"
  endTime: string;   // e.g., "00:00:02,345"
  text: string;
}

const s3ClientConfig: S3ClientConfig = {
  region: process.env.AWS_REGION || "eu-north-1",
};

if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  s3ClientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    ...(process.env.AWS_SESSION_TOKEN && { sessionToken: process.env.AWS_SESSION_TOKEN }),
  };
} else {
  // For local development, this allows the SDK to fall back to other credential sources 
  // (e.g. ~/.aws/credentials, IAM roles if running on EC2/ECS, etc.)
  // In a Vercel deployment, environment variables should be set directly.
  console.warn("AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) not explicitly found in environment. SDK will attempt to use default credential chain.");
}

const s3Client = new S3Client(s3ClientConfig);

const FPS = 30;
const MAX_VIDEO_SECONDS = 180; // 3 minutes
const CLIP_DURATION_SECONDS = 3;
const CLIP_DURATION_FRAMES = CLIP_DURATION_SECONDS * FPS;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "remotion-reddit-start";
const S3_VIDEOS_PREFIX = process.env.S3_DONE_VIDEOS_PREFIX || "Videos/"; // From your .env example
const S3_UPLOADED_AUDIO_PREFIX = "UploadedAudio/";

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

async function getAudioDurationFromS3(userS3Url: string): Promise<{ processedAudioUrl: string, duration: number }> {
  if (!userS3Url) return { processedAudioUrl: '', duration: 0 };

  const uniqueId = uuidv4();
  const originalFileName = path.basename(new URL(userS3Url).pathname) || 'audio.tmp';
  const tempLocalPath = path.join(os.tmpdir(), `${uniqueId}_${originalFileName}`);
  const s3KeyForUploadedAudio = `${S3_UPLOADED_AUDIO_PREFIX}${uniqueId}_${originalFileName}`;
  let duration = 0;
  let processedS3UrlInYourBucket = '';

  try {
    // 1. Download audio from user's URL to temp local path
    console.log(`Downloading audio from ${userS3Url} to ${tempLocalPath}...`);
    await new Promise<void>((resolve, reject) => {
      const fileStream = fs.createWriteStream(tempLocalPath);
      https.get(userS3Url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download audio. Status: ${response.statusCode}, Message: ${response.statusMessage}`));
          return;
        }
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          console.log('Audio downloaded successfully.');
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(tempLocalPath, () => {}); // Clean up temp file on error
        reject(new Error(`Error downloading audio: ${err.message}`));
      });
    });

    // 2. Upload the downloaded audio to your S3 bucket
    console.log(`Uploading audio from ${tempLocalPath} to s3://${S3_BUCKET_NAME}/${s3KeyForUploadedAudio}...`);
    const fileContent = fs.readFileSync(tempLocalPath);
    const uploadCommand = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3KeyForUploadedAudio,
      Body: fileContent,
      // ContentType: 'audio/mpeg', // Or determine dynamically if possible/needed
    });
    await s3Client.send(uploadCommand);
    processedS3UrlInYourBucket = `https://${S3_BUCKET_NAME}.s3.${s3ClientConfig.region || 'eu-north-1'}.amazonaws.com/${s3KeyForUploadedAudio}`;
    console.log(`Audio uploaded to your S3: ${processedS3UrlInYourBucket}`);

    // 3. Get duration using ffprobe from the local temp file
    console.log(`Getting duration for ${tempLocalPath} using ffprobe...`);
    const ffprobeCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempLocalPath}"`;
    const { stdout, stderr } = await execPromise(ffprobeCommand);
    if (stderr) {
      console.warn(`ffprobe stderr for ${tempLocalPath}: ${stderr}`); // Log stderr but proceed if stdout has duration
    }
    if (!stdout || isNaN(parseFloat(stdout))){
        throw new Error(`ffprobe failed to get duration or output was not a number for ${tempLocalPath}. Output: ${stdout}`);
    }
    duration = parseFloat(stdout);
    console.log(`Duration determined: ${duration} seconds for ${tempLocalPath}`);

  } catch (error) {
    console.error(`Error in getAudioDurationFromS3 for URL ${userS3Url}:`, error);
    // In case of error, return 0 duration and empty URL, or rethrow/handle as needed
    // The original (simulated) return values were: return userS3Url.toLowerCase().includes("hook") ? 5.0 : 60.0;
    // We should return the structure { processedAudioUrl: string, duration: number }
    return { processedAudioUrl: '', duration: 0 }; // Fallback on error
  } finally {
    // 4. Cleanup: Delete the temporary local audio file
    if (fs.existsSync(tempLocalPath)) {
      fs.unlink(tempLocalPath, (err) => {
        if (err) console.error(`Error deleting temporary file ${tempLocalPath}:`, err);
        else console.log(`Temporary file ${tempLocalPath} deleted.`);
      });
    }
  }
  return { processedAudioUrl: processedS3UrlInYourBucket, duration };
}

async function parseSrtFromS3(s3Url: string): Promise<{ subtitleText: string; wordTimings: WordTiming[] }> {
  if (!s3Url) return { subtitleText: 'No SRT URL provided.', wordTimings: [] };
  
  let bucketName = S3_BUCKET_NAME; // Default to configured bucket
  let key = s3Url;

  try {
    const url = new URL(s3Url);
    if (url.protocol === 's3:') {
      bucketName = url.hostname;
      key = url.pathname.substring(1);
    } else if (url.hostname.includes('s3') && url.hostname.includes('amazonaws.com')){
      // Attempt to parse HTTP S3 URLs e.g. https://bucket-name.s3.region.amazonaws.com/key
      // or https://s3.region.amazonaws.com/bucket-name/key
      const parts = url.hostname.split('.');
      if (parts.length > 1 && parts[1] === 's3') { // bucket-name.s3.region...
        bucketName = parts[0];
      } else if (url.pathname.startsWith('/')) { // s3.region.amazonaws.com/bucket-name/...
        const pathParts = url.pathname.substring(1).split('/');
        bucketName = pathParts.shift() || bucketName;
        key = pathParts.join('/');
      }
    } else {
      // Assuming it might be just a key if not a full S3 URL, use default bucket
      console.warn(`Provided SRT URL "${s3Url}" is not a standard S3 URL format. Assuming it's a key in bucket ${bucketName}.`);
    }
  } catch (e) {
      console.warn(`Could not parse SRT URL "${s3Url}". Assuming it's a key in bucket ${bucketName}. Error: ${(e as Error).message}`);
  }

  console.log(`Fetching and parsing SRT from S3: bucket=${bucketName}, key=${key}`);

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    const { Body } = await s3Client.send(command);

    if (!Body || !(Body instanceof require('stream').Readable)) {
      throw new Error('S3 GetObjectCommand returned no Body or Body is not a ReadableStream');
    }

    const srtContent = await streamToString(Body as NodeJS.ReadableStream);
    const parser = new SrtParser2();
    const parsedTimings: SrtItem[] = parser.fromSrt(srtContent) as SrtItem[];

    const wordTimings: WordTiming[] = parsedTimings.map((item: SrtItem) => {
      const startFrame = Math.floor(parseFloat(item.startTime.replace(',', '.')) * FPS);
      const endFrame = Math.floor(parseFloat(item.endTime.replace(',', '.')) * FPS);
      // Default color, can be overridden by specific logic if needed
      // For example, logic to make first word yellow as in original placeholder
      return { text: item.text, startFrame, endFrame, color: "white" }; 
    });

    // Extract full text
    const subtitleText = parsedTimings.map((item: SrtItem) => item.text).join(' \n'); // Join with newline for readability, or just space

    // Example: make the very first word yellow if that's still desired
    // This would require more complex logic if words within a single subtitle entry need different colors.
    // For now, we'll keep it simple. The `color` field is available.
    // const firstWordTiming = wordTimings.find(wt => wt.text.trim().length > 0);
    // if (firstWordTiming) {
    //   // This needs more robust parsing if a single timing entry can have multiple "words"
    //   // and only the very first actual word of the entire subtitle needs to be yellow.
    //   // For now, assuming each `item.text` is a "word" or phrase for that timing.
    //   // If `item.text` can be "Hello world", and only "Hello" needs to be yellow, this is not enough.
    //   firstWordTiming.color = 'yellow';
    // }

    return { subtitleText, wordTimings };

  } catch (error) {
    console.error(`Error parsing SRT from S3 (bucket: ${bucketName}, key: ${key}):`, error);
    return { subtitleText: 'Error parsing SRT.', wordTimings: [] };
  }
}

async function getBackgroundVideosFromS3(
  style: string, // e.g., "satisfying", "parkour"
  totalVideoDurationSeconds: number
): Promise<VideoAsset[]> {
  const s3VideoClipsPrefix = process.env[`S3_CLIPS_${style.toUpperCase()}_PREFIX`] || `Clips/${style}/`;
  console.log(`Listing background clips from s3://${S3_BUCKET_NAME}/${s3VideoClipsPrefix}`);

  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET_NAME,
      Prefix: s3VideoClipsPrefix,
    });
    const listedObjects = await s3Client.send(listCommand);

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
      console.warn(`No background clips found in ${s3VideoClipsPrefix}`);
      return [{ path: `s3://${S3_BUCKET_NAME}/Clips/default_placeholder.mp4`, durationInFrames: Math.ceil(totalVideoDurationSeconds * FPS) }];
    }

    // Filter out any potential non-video files or "directory" markers if Prefix itself is listed
    const videoFiles = listedObjects.Contents.filter(obj => obj.Key && obj.Key !== s3VideoClipsPrefix && (obj.Size || 0) > 0);

    if (videoFiles.length === 0) {
        console.warn(`No actual video files found in ${s3VideoClipsPrefix} after filtering.`);
        return [{ path: `s3://${S3_BUCKET_NAME}/Clips/default_placeholder.mp4`, durationInFrames: Math.ceil(totalVideoDurationSeconds * FPS) }];
    }

    const selectedClips: VideoAsset[] = [];
    let accumulatedDurationFrames = 0;
    const totalVideoDurationFrames = Math.ceil(totalVideoDurationSeconds * FPS);

    console.log(`Assembling background clips for total duration: ${totalVideoDurationSeconds}s (${totalVideoDurationFrames} frames)`);

    while (accumulatedDurationFrames < totalVideoDurationFrames) {
      if (videoFiles.length === 0) {
          console.warn("Ran out of unique video files to pick for background. Looping last clip to fill remaining duration.");
          if(selectedClips.length > 0) {
            const lastClip = selectedClips[selectedClips.length - 1];
            lastClip.durationInFrames += (totalVideoDurationFrames - accumulatedDurationFrames); 
            accumulatedDurationFrames = totalVideoDurationFrames; // Mark as filled
          } else {
             // Should not happen if we have a placeholder, but as a fallback
             console.error("No clips selected and no video files available to fill duration. This may result in missing background.");
             break; 
          }
          break;
      }
      
      const randomIndex = Math.floor(Math.random() * videoFiles.length);
      const randomVideo = videoFiles[randomIndex]; // Select a random video
      // videoFiles.splice(randomIndex, 1); // Remove to avoid re-selection if we want unique clips each time - this might lead to running out of clips for long videos

      const clipPath = `s3://${S3_BUCKET_NAME}/${randomVideo.Key}`;
      let clipDurationFrames = CLIP_DURATION_FRAMES; // Assume fixed duration for now

      if (accumulatedDurationFrames + clipDurationFrames > totalVideoDurationFrames) {
        clipDurationFrames = totalVideoDurationFrames - accumulatedDurationFrames;
      }
      
      selectedClips.push({ path: clipPath, durationInFrames: clipDurationFrames });
      accumulatedDurationFrames += clipDurationFrames;
      console.log(`Selected clip: ${clipPath}, duration: ${clipDurationFrames} frames. Accumulated: ${accumulatedDurationFrames} frames.`);
    }
    
    // Ensure the last clip's duration is adjusted if it overshot and we want exact total
    if (accumulatedDurationFrames > totalVideoDurationFrames && selectedClips.length > 0) {
        const overshotBy = accumulatedDurationFrames - totalVideoDurationFrames;
        const lastClip = selectedClips[selectedClips.length - 1];
        lastClip.durationInFrames -= overshotBy;
        accumulatedDurationFrames -= overshotBy;
        console.log(`Adjusted last clip duration. New total accumulated: ${accumulatedDurationFrames} frames.`);
    }
    // If it undershot and the loop condition somehow allowed it (e.g. float precision)
    else if (accumulatedDurationFrames < totalVideoDurationFrames && selectedClips.length > 0){
        const undershotBy = totalVideoDurationFrames - accumulatedDurationFrames;
        const lastClip = selectedClips[selectedClips.length - 1];
        lastClip.durationInFrames += undershotBy;
        accumulatedDurationFrames += undershotBy;
        console.log(`Adjusted last clip duration for undershot. New total accumulated: ${accumulatedDurationFrames} frames.`);
    }


    console.log("Final selected background clips:", selectedClips);
    return selectedClips;

  } catch (error) {
    console.error("Error listing or processing background videos from S3:", error);
    return [{ path: `s3://${S3_BUCKET_NAME}/Clips/default_placeholder.mp4`, durationInFrames: Math.ceil(totalVideoDurationSeconds * FPS) }];
  }
}

// --- START ACTUAL REMOTION RENDER --- 
async function actualRemotionRender(props: RemotionFormProps, videoFileName: string): Promise<string> {
  const remotionProjectRoot = path.resolve(process.cwd(), '..'); // Assumes Remotion project is one level up
  const tempRenderDir = path.join(os.tmpdir(), "remotion-actual-renders");
  if (!fs.existsSync(tempRenderDir)) {
    fs.mkdirSync(tempRenderDir, { recursive: true });
  }
  const outputVideoPath = path.join(tempRenderDir, videoFileName);

  // Ensure props are stringified and escaped for CLI usage
  const propsString = JSON.stringify(props);
  // For command line arguments, especially on Windows, quotes within JSON can be tricky.
  // A common way for npx/node CLI tools is to pass it as a single block.
  // On Linux/macOS, single quotes around the JSON string are usually robust.
  // Let's use a simple approach first, may need refinement based on OS compatibility if issues arise.
  const escapedPropsString = propsString.replace(/'/g, "'\''"); // Escape single quotes for shell

  const compositionId = 'MainComposition'; // As per your project structure
  const entryPoint = 'index.tsx'; // Assuming Remotion entry point at root of remotion project

  // Construct the command. Using absolute path for output is safer.
  const renderCommand = `npx remotion render ${entryPoint} ${compositionId} "${outputVideoPath}" --props='${escapedPropsString}' --log=verbose`;
  
  console.log(`Executing Remotion render command in ${remotionProjectRoot}:`);
  console.log(renderCommand);

  try {
    // Execute the command in the Remotion project's root directory
    const { stdout, stderr } = await execPromise(renderCommand, { cwd: remotionProjectRoot });
    
    console.log('Remotion render stdout:', stdout);
    if (stderr) {
      console.warn('Remotion render stderr:', stderr); // Log stderr, but proceed if file exists
    }

    if (!fs.existsSync(outputVideoPath)) {
      throw new Error(`Remotion render failed: Output file not found at ${outputVideoPath}. Stdout: ${stdout}, Stderr: ${stderr}`);
    }
    
    console.log(`Remotion render successful. Video saved to: ${outputVideoPath}`);
    return outputVideoPath;
  } catch (error: any) {
    console.error('Error during Remotion render:', error);
    let errorMessage = 'Remotion render process failed.';
    if (error.stdout) errorMessage += `\nStdout: ${error.stdout}`;
    if (error.stderr) errorMessage += `\nStderr: ${error.stderr}`;
    if (error.message && !error.stdout && !error.stderr) errorMessage += `\nMessage: ${error.message}`;
    // Ensure the full error is logged for debugging if it's not a simple string
    if (typeof error === 'object' && error !== null && error.message) {
        console.error("Full error object:", JSON.stringify(error, null, 2));
    }
    throw new Error(errorMessage);
  }
}
// --- END ACTUAL REMOTION RENDER --- 

// --- START ACTUAL S3 UPLOAD --- 
async function actualS3Upload(localVideoPath: string, videoFileName: string): Promise<string> {
  console.log(`Starting actual S3 upload for ${localVideoPath} as ${videoFileName}...`);
  
  try {
    const fileContent = fs.readFileSync(localVideoPath);
    const s3Key = `${S3_VIDEOS_PREFIX}${videoFileName}`;

    const uploadCommand = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileContent,
      ContentType: 'video/mp4',
      // ACL: 'public-read', // Uncomment if you want videos to be publicly accessible by default via S3 URL (before CDN/custom domain)
    });

    await s3Client.send(uploadCommand);
    console.log(`Successfully uploaded ${s3Key} to bucket ${S3_BUCKET_NAME}.`);

    // Construct the final URL using your custom domain
    const customDomain = "rdtt.fun"; 
    const finalVideoUrl = `https://${customDomain}/${s3Key}`;
    console.log(`Video accessible at: ${finalVideoUrl}`);

    return finalVideoUrl;
  } catch (error) {
    console.error(`Error uploading video ${videoFileName} to S3:`, error);
    throw new Error(`S3 upload failed for ${videoFileName}.`);
  } finally {
    // Clean up the local rendered video file
    if (fs.existsSync(localVideoPath)) {
      fs.unlink(localVideoPath, (err) => {
        if (err) console.error(`Error deleting temporary local video ${localVideoPath}:`, err);
        else console.log(`Temporary local video ${localVideoPath} deleted.`);
      });
    }
  }
}
// --- END ACTUAL S3 UPLOAD --- 

interface SuccessResponse {
  message: string;
  videoUrl: string;
  propsUsed: RemotionFormProps;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | { error: string; details?: any }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const rawFormData: UIFormValues = req.body;
    const validationResult = uiFormSchema.safeParse(rawFormData);

    if (!validationResult.success) {
      console.error("Form data validation failed:", validationResult.error.flatten());
      return res.status(400).json({ 
        error: 'Invalid form data.', 
        details: validationResult.error.flatten()
      });
    }

    const uiData = validationResult.data;
    console.log("Received validated UI data:", uiData);

    // Derive Remotion props from UI data
    // This involves fetching actual data from S3 URLs, calculating durations, etc.

    const { processedAudioUrl: hookAudioActualS3Url, duration: hookAudioDuration } = await getAudioDurationFromS3(uiData.audioUrl);
    const { processedAudioUrl: mainAudioActualS3Url, duration: scriptAudioDuration } = await getAudioDurationFromS3(uiData.scriptAudioUrl);
    const { subtitleText, wordTimings } = await parseSrtFromS3(uiData.srtFileUrl);

    const totalAudioDurationSeconds = hookAudioDuration + scriptAudioDuration;
    if (totalAudioDurationSeconds <=0) {
      // This might happen if both audio files failed to process or had zero duration.
      console.error("Total audio duration is zero or negative. Cannot determine video length.");
      return res.status(400).json({ error: 'Failed to process audio files or audio duration is zero. Cannot create video.' });
    }
    if (totalAudioDurationSeconds > MAX_VIDEO_SECONDS) {
        console.warn(`Total audio duration (${totalAudioDurationSeconds}s) exceeds max video duration (${MAX_VIDEO_SECONDS}s). Video may be truncated or generation may fail depending on Remotion setup.`);
        // Potentially cap this or let Remotion handle it. For now, just log.
    }

    const backgroundVideoPath = await getBackgroundVideosFromS3(uiData.backgroundVideoStyle, totalAudioDurationSeconds);
    
    const defaultRegion = "eu-north-1"; // Define a clear default string
    const region = typeof s3ClientConfig.region === 'function' 
                   ? await s3ClientConfig.region() // If it's a provider function, call it
                   : s3ClientConfig.region; // Otherwise, use it directly

    const remotionProps: RemotionFormProps = {
      ...uiData, // Spread validated UI data
      audioUrl: hookAudioActualS3Url || uiData.audioUrl, // Use processed URL if available
      scriptAudioUrl: mainAudioActualS3Url || uiData.scriptAudioUrl, // Use processed URL if available
      audioDurationInSeconds: hookAudioDuration,
      scriptAudioDurationInSeconds: scriptAudioDuration,
      subtitleText,
      wordTimings,
      backgroundVideoPath,
      totalDurationInFrames: Math.ceil(totalAudioDurationSeconds * FPS),
      bucketName: uiData.bucketName || S3_BUCKET_NAME,
      bucketRegion: uiData.bucketRegion || region || defaultRegion, // Ensure a string is passed
    };

    console.log("Derived Remotion props:", JSON.stringify(remotionProps, null, 2));

    // Unique filename for the video
    const videoFileName = `${uuidv4()}.mp4`;

    // Call actual Remotion render
    const localRenderedVideoPath = await actualRemotionRender(remotionProps, videoFileName);
    
    // Call actual S3 upload
    const finalVideoS3Url = await actualS3Upload(localRenderedVideoPath, videoFileName);

    res.status(200).json({
      message: 'Video processing initiated and completed successfully.', // Or 'Video processing initiated.' if async
      videoUrl: finalVideoS3Url,
      propsUsed: remotionProps,
    });

  } catch (error) {
    console.error('Error in /api/create-video:', error); // Updated error log path
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.errors });
    }
    // General error
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    res.status(500).json({ error: errorMessage });
  }
} 