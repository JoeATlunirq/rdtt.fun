import type { NextApiRequest, NextApiResponse } from 'next';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { uiFormSchema, remotionPropsSchema, RemotionFormProps, UIFormValues, WordTiming, SrtLine } from '../../lib/schema';
import { ZodError } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import SrtParser from 'srt-parser-2';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import * as mm from 'music-metadata';

const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
const S3_REGION = process.env.AWS_S3_REGION;
const S3_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const S3_CLIPS_PREFIX = process.env.AWS_S3_CLIPS_PREFIX || 'Clips/';
const S3_VIDEOS_PREFIX = process.env.AWS_S3_VIDEOS_PREFIX || 'Videos/';
const S3_UPLOADED_AUDIO_PREFIX = 'UploadedAudio/';

if (!S3_BUCKET_NAME || !S3_REGION) {
  throw new Error("AWS S3 Bucket Name and Region must be configured in environment variables.");
}

const s3Client = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID || '',
    secretAccessKey: S3_SECRET_ACCESS_KEY || '',
  }
});

async function streamToFile(stream: NodeJS.ReadableStream, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const fileWriteStream = fs.createWriteStream(filePath);
    stream.pipe(fileWriteStream);
    stream.on('error', (err) => {
      console.error("Stream error during download:", err);
      fileWriteStream.close();
      fs.unlink(filePath, () => {}); 
      reject(err);
    });
    fileWriteStream.on('finish', () => {
      fileWriteStream.close();
      resolve();
    });
    fileWriteStream.on('error', (err) => {
      console.error("File write stream error:", err);
      fs.unlink(filePath, () => {}); 
      reject(err);
    });
  });
}

function parseS3Url(s3Url: string): { bucket: string, key: string } {
  const url = new URL(s3Url);
  if (url.protocol !== 's3:') {
    throw new Error(`Invalid S3 URL: ${s3Url}. Must start with s3://`);
  }
  const bucket = url.hostname;
  const key = url.pathname.substring(1);
  return { bucket, key };
}

async function getAudioDurationFromS3(audioUrlString: string): Promise<number> {
  if (!audioUrlString) return 0;
  // Validate URL structure before parsing to prevent errors with path.basename
  let audioUrl;
  try {
    audioUrl = new URL(audioUrlString);
  } catch (e) {
    console.error(`Invalid audio URL string: ${audioUrlString}`, e);
    throw new Error(`Invalid audio URL: ${audioUrlString}`);
  }

  const tempFileName = `${uuidv4()}_${path.basename(audioUrl.pathname) || 'audiofile'}`;
  const tempFilePath = path.join(os.tmpdir(), tempFileName);

  try {
    if (audioUrl.protocol === 's3:') {
      console.log(`Processing S3 URL: ${audioUrlString}`);
      const { bucket, key } = parseS3Url(audioUrlString);
      console.log(`Downloading audio from S3: bucket=${bucket}, key=${key} to ${tempFilePath}...`);
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      const { Body } = await s3Client.send(command);
      if (!Body || !(Body instanceof Readable)) {
        throw new Error('S3 Body is not a readable stream or is undefined.');
      }
      await streamToFile(Body, tempFilePath);
      console.log("Audio downloaded successfully from S3.");
    } else if (audioUrl.protocol === 'http:' || audioUrl.protocol === 'https:') {
      console.log(`Processing HTTP(S) URL: ${audioUrlString}`);
      console.log(`Downloading audio from ${audioUrlString} to ${tempFilePath}...`);
      const response = await fetch(audioUrlString);
      if (!response.ok) throw new Error(`Failed to download audio from ${audioUrlString}: ${response.statusText}`);
      if (!response.body) throw new Error('Response body is null');
      const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream<any>);
      await streamToFile(nodeStream, tempFilePath);
      console.log("Audio downloaded successfully from HTTP(S).");
      if (S3_BUCKET_NAME && S3_UPLOADED_AUDIO_PREFIX) {
        const s3KeyForUpload = `${S3_UPLOADED_AUDIO_PREFIX}${tempFileName}`;
        console.log(`Uploading audio from ${tempFilePath} to s3://${S3_BUCKET_NAME}/${s3KeyForUpload}...`);
        await s3Client.send(new PutObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: s3KeyForUpload,
          Body: fs.createReadStream(tempFilePath),
        }));
        console.log(`Audio uploaded to S3.`);
      }
    } else {
      throw new Error(`Unsupported audio URL protocol: ${audioUrl.protocol}`);
    }
    console.log(`Getting duration for ${tempFilePath} using music-metadata...`);
    const metadata = await mm.parseFile(tempFilePath);
    if (metadata && metadata.format && typeof metadata.format.duration === 'number') {
      console.log(`Duration found: ${metadata.format.duration} seconds.`);
      return metadata.format.duration;
    } else {
      throw new Error('Could not determine audio duration using music-metadata.');
    }
  } catch (error) {
    console.error(`Error in getAudioDurationFromS3 for URL ${audioUrlString}:`, error);
    throw error;
  } finally {
    fs.unlink(tempFilePath, (err) => {
      if (err) console.warn(`Failed to delete temporary audio file ${tempFilePath}:`, err);
      else console.log(`Temporary audio file ${tempFilePath} deleted.`);
    });
  }
}

async function parseSrt(srtFileUrlString: string): Promise<SrtLine[]> {
  if (!srtFileUrlString) return [];
  let srtUrl;
  try {
    srtUrl = new URL(srtFileUrlString);
  } catch (e) {
    console.error(`Invalid SRT URL string: ${srtFileUrlString}`, e);
    throw new Error(`Invalid SRT URL: ${srtFileUrlString}`);
  }
  const tempFileName = `${uuidv4()}_${path.basename(srtUrl.pathname) || 'subtitle.srt'}.srt`;
  const tempFilePath = path.join(os.tmpdir(), tempFileName);

  try {
    if (srtUrl.protocol === 's3:') {
      console.log(`Fetching SRT from S3 URL: ${srtFileUrlString}`);
      const { bucket, key } = parseS3Url(srtFileUrlString);
      const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!Body || !(Body instanceof Readable)) throw new Error('S3 SRT Body error.');
      await streamToFile(Body, tempFilePath);
      console.log("SRT downloaded from S3.");
    } else if (srtUrl.protocol === 'http:' || srtUrl.protocol === 'https:') {
      console.log(`Fetching SRT from HTTPS URL: ${srtFileUrlString}`);
      const response = await fetch(srtFileUrlString);
      if (!response.ok) throw new Error(`Failed to download SRT: ${response.statusText}`);
      if (!response.body) throw new Error('SRT Response body is null');
      await streamToFile(Readable.fromWeb(response.body as import('stream/web').ReadableStream<any>), tempFilePath);
      console.log("SRT downloaded from HTTPS.");
    } else {
      throw new Error(`Unsupported SRT URL: ${srtUrl.protocol}`);
    }
    const srtContent = fs.readFileSync(tempFilePath, 'utf-8');
    const parser = new SrtParser();
    const srtResult = parser.fromSrt(srtContent) as SrtLine[]; 
    console.log(`SRT parsed. Found ${srtResult.length} lines.`);
    return srtResult;
  } catch (error) {
    console.error(`Error parsing SRT from URL ${srtFileUrlString}:`, error);
    throw error;
  } finally {
    fs.unlink(tempFilePath, (err) => {
      if (err) console.warn(`Failed to delete temp SRT file ${tempFilePath}:`, err);
      else console.log(`Temp SRT file ${tempFilePath} deleted.`);
    });
  }
}

function srtTimeToSeconds(timeString: string): number {
  const parts = timeString.split(':');
  const secondsAndMillis = parts[2].split(',');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseInt(secondsAndMillis[0], 10);
  const milliseconds = parseInt(secondsAndMillis[1], 10);
  return (hours * 3600) + (minutes * 60) + seconds + (milliseconds / 1000);
}

// New function to calculate hook end frame
function calculateHookEndFrame(hookText: string, srtLines: SrtLine[], fps: number, hookEndDelaySeconds: number = 0.25): number {
  if (!hookText || srtLines.length === 0) {
    console.warn("Hook text or SRT lines are empty, cannot calculate hook end frame.");
    return 0;
  }

  const normalizeWord = (word: string): string => {
    if (!word) return '';
    return word.trim().toLowerCase().replace(/[.,!?;:]$/, '');
  };

  const normalizedHookWords = hookText.trim().split(/\s+/).map(normalizeWord).filter(w => w.length > 0);

  if (normalizedHookWords.length === 0) {
    console.warn("Hook text is empty after normalization, cannot calculate hook end frame.");
    return 0;
  }

  // Attempt 1: Match the full hook text (normalized)
  for (let i = 0; i <= srtLines.length - normalizedHookWords.length; i++) {
    let segmentMatches = true;
    for (let j = 0; j < normalizedHookWords.length; j++) {
      const srtWordNormalized = normalizeWord(srtLines[i + j].text);
      if (srtWordNormalized !== normalizedHookWords[j]) {
        segmentMatches = false;
        break;
      }
    }

    if (segmentMatches) {
      const endSrtLine = srtLines[i + normalizedHookWords.length - 1];
      const endTimeSeconds = srtTimeToSeconds(endSrtLine.endTime);
      const endFrame = Math.floor((endTimeSeconds + hookEndDelaySeconds) * fps);
      console.log(`Found full hook text match (normalized) ending at SRT line ${endSrtLine.id}. End time: ${endTimeSeconds}s. Original hook: "${hookText}". Normalized hook: "${normalizedHookWords.join(' ')}". End frame: ${endFrame}.`);
      return endFrame;
    }
  }
  console.log(`Full hook text (normalized) "${normalizedHookWords.join(' ')}" (original: "${hookText}") not found in SRT lines. Trying last word match.`);

  // Attempt 2: Match the last word of the hook text (normalized)
  if (normalizedHookWords.length > 0) {
    const lastHookWordNormalized = normalizedHookWords[normalizedHookWords.length - 1];
    for (let i = srtLines.length - 1; i >= 0; i--) {
      const srtWordNormalized = normalizeWord(srtLines[i].text);
      if (srtWordNormalized === lastHookWordNormalized) {
        const endSrtLine = srtLines[i];
        const endTimeSeconds = srtTimeToSeconds(endSrtLine.endTime);
        const endFrame = Math.floor((endTimeSeconds + hookEndDelaySeconds) * fps);
        console.log(`Found last word of hook text match (normalized) at SRT line ${endSrtLine.id}. End time: ${endTimeSeconds}s. Normalized word: "${lastHookWordNormalized}". End frame: ${endFrame}.`);
        return endFrame;
      }
    }
    console.log(`Last word of hook (normalized) "${lastHookWordNormalized}" not found in SRT lines.`);
  } else {
    console.log("No words in hook text after normalization to attempt last word match.");
  }

  console.warn(`Could not find hook text (normalized: "${normalizedHookWords.join(' ')}") or its last word in SRT lines to determine hook end frame. Original hook text: "${hookText}". Hook duration might be incorrect or zero.`);
  return 0;
}

function srtLinesToWordTimings(srtLines: SrtLine[], fps: number): WordTiming[] {
  if (!srtLines || srtLines.length === 0) return [];
  return srtLines.map(line => ({
    text: line.text,
    startFrame: Math.floor(srtTimeToSeconds(line.startTime) * fps),
    endFrame: Math.floor(srtTimeToSeconds(line.endTime) * fps),
  }));
}

function srtLinesToSubtitleText(srtLines: SrtLine[]): string {
  if (!srtLines || srtLines.length === 0) return '';
  return srtLines.map(line => line.text).join('\n'); 
}

async function getRandomBackgroundVideoS3(s3ClientInstance: S3Client, bucket: string, prefix: string): Promise<string | null> {
  console.log(`Listing background videos from S3: bucket=${bucket}, prefix=${prefix}`);
  try {
    const command = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix });
    const response = await s3ClientInstance.send(command);
    if (!response.Contents || response.Contents.length === 0) {
      console.warn(`No background videos found in s3://${bucket}/${prefix}`);
      return null;
    }
    const videoFiles = response.Contents.filter(obj => obj.Key && !obj.Key.endsWith('/'));
    if (videoFiles.length === 0) {
      console.warn(`No actual video files found after filtering.`);
      return null;
    }
    const randomIndex = Math.floor(Math.random() * videoFiles.length);
    const randomVideoKey = videoFiles[randomIndex]?.Key;
    if (!randomVideoKey) return null;
    return `s3://${bucket}/${randomVideoKey}`;
  } catch (error) {
    console.error("Error listing background videos from S3:", error);
    return null;
  }
}

async function 실제Remotion랜더링 (props: RemotionFormProps, outputFileName: string): Promise<string> {
  // On Vercel, process.cwd() will be the root of the remotion-frontend deployment.
  // The Remotion project files are in a 'remotion' subdirectory.
  const remotionProjectSourceDir = path.join(process.cwd(), 'remotion'); 
  const compositionId = 'MainComposition'; 
  const outputLocation = path.join(os.tmpdir(), outputFileName);
  const propsString = JSON.stringify(props);

  // Added --log=verbose for more detailed output from Remotion
  // Added --chrome-flags="--no-sandbox --disable-dev-shm-usage" for serverless environments
  const chromeFlags = "--no-sandbox --disable-dev-shm-usage";
  
  // Command now executes from process.cwd() (remotion-frontend)
  // and passes remotionProjectSourceDir as the project path to the Remotion CLI.
  // NPM environment variables are still set to use /tmp.
  // Execute the Remotion CLI using 'npx --package @remotion/cli remotion ...'
  const command = `HOME=/tmp NPM_CONFIG_CACHE=/tmp/.npm-cache NPM_CONFIG_PREFIX=/tmp/.npm-prefix REMOTION_CACHE_DIR=/tmp/.remotion-cache npx --package @remotion/cli remotion render "${remotionProjectSourceDir}" ${compositionId} "${outputLocation}" --props='${propsString}' --log=verbose --chrome-flags="${chromeFlags}"`;  
  console.log(`Executing Remotion CLI from ${process.cwd()}: ${command}`);
  try {
    // Increased timeout to 5 minutes (300,000 ms) as Remotion can be slow.
    // Vercel's max timeout will still apply.
    // Changed stdio to 'pipe' (or omit entirely) to buffer output for error reporting
    execSync(command, { timeout: 300000 }); 
    console.log(`Remotion render successful: ${outputLocation}`);
    return outputLocation;
  } catch (error: any) { 
    console.error("Error during Remotion CLI execution:", error);
    let errorMessage = `Remotion render failed: ${ (error as Error).message }`;
    if (error.stdout) {
      const stdout = error.stdout.toString();
      console.error("Remotion stdout:", stdout);
      errorMessage += `\nSTDOUT: ${stdout}`;
    }
    if (error.stderr) {
      const stderr = error.stderr.toString();
      console.error("Remotion stderr:", stderr);
      errorMessage += `\nSTDERR: ${stderr}`;
    }
    throw new Error(errorMessage);
  }
}

async function 실제S3업로드 (filePath: string, s3Key: string): Promise<string> {
  console.log(`Uploading ${filePath} to S3 bucket ${S3_BUCKET_NAME} with key ${s3Key}`);
  if (!S3_BUCKET_NAME) throw new Error("S3_BUCKET_NAME is not configured.");
  try {
    const fileStream = fs.createReadStream(filePath);
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileStream,
    }));
    const videoUrl = `https://${S3_BUCKET_NAME}.s3.${S3_REGION}.amazonaws.com/${s3Key}`;
    console.log(`File uploaded to S3: ${videoUrl}`);
    return videoUrl;
  } catch (error) {
    console.error("Error uploading file to S3:", error);
    throw error;
  } finally {
    fs.unlink(filePath, err => {
      if (err) console.warn(`Failed to delete temp rendered file ${filePath}:`, err);
      else console.log(`Temp rendered file ${filePath} deleted.`);
    });
  }
}

const FPS = 30;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let uiData: UIFormValues;
  try {
    uiData = uiFormSchema.parse(req.body);
    console.log("Received validated UI data:", uiData);
  } catch (error) {
    if (error instanceof ZodError) {
      console.error("Zod validation error:", error.errors);
      return res.status(400).json({ error: 'Invalid form data.', details: error.flatten() });
    }
    console.error("Error parsing request body:", error);
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  try {
    // Single audio duration
    const audioDuration = uiData.audioUrl ? await getAudioDurationFromS3(uiData.audioUrl) : 0;
    
    let srtLines: SrtLine[] = [];
    let finalWordTimings: WordTiming[] | undefined = undefined;
    let finalSubtitleText: string | undefined = undefined;
    let calculatedHookEndFrame = 0;
    let srtDurationSeconds = 0;

    if (uiData.srtFileUrl) {
      srtLines = await parseSrt(uiData.srtFileUrl);
      if (srtLines.length > 0) {
        finalWordTimings = srtLinesToWordTimings(srtLines, FPS);
        finalSubtitleText = srtLinesToSubtitleText(srtLines);
        
        // Calculate hook end frame using the new logic
        calculatedHookEndFrame = calculateHookEndFrame(uiData.hookText, srtLines, FPS);
        if (calculatedHookEndFrame <= 0) {
          // Handle case where hook text wasn't found in SRT:
          // Option 1: Default to a short hook (e.g., 3 seconds)
          // Option 2: Make hook duration effectively zero (visuals might not show)
          // Option 3: Return an error
          console.warn("Hook text not found in SRT. Hook duration might be incorrect or zero.");
          // Defaulting to a small duration if not found, or rely on it being 0.
          // For now, if not found, hookDurationInSeconds will be 0 via validatedRemotionProps.
        }
        
        const lastSubtitle = srtLines[srtLines.length - 1];
        if (lastSubtitle && lastSubtitle.endTime) {
            srtDurationSeconds = srtTimeToSeconds(lastSubtitle.endTime);
            console.log(`Total SRT duration: ${srtDurationSeconds} seconds`);
        }
      }
    }

    const hookDurationFromSRTSeconds = calculatedHookEndFrame / FPS;

    // Determine final video duration:
    // Priority: 1. Audio duration (if available and > 0), 2. SRT duration (if available and > 0)
    let finalVideoDurationSeconds = 0;
    if (audioDuration > 0) {
        finalVideoDurationSeconds = audioDuration;
        console.log(`Using audio duration for final video length: ${finalVideoDurationSeconds}s`);
    } else if (srtDurationSeconds > 0) {
        finalVideoDurationSeconds = srtDurationSeconds;
        console.log(`Using SRT duration for final video length: ${finalVideoDurationSeconds}s`);
    }

    if (finalVideoDurationSeconds <= 0) {
      console.error("Could not determine final video duration from audio or SRT.");
      return res.status(400).json({ error: 'Could not determine final video duration. Ensure audio or SRT is provided and valid.'});
    }
    
    let finalBackgroundVideoPath: string | undefined = undefined;
    if (uiData.backgroundVideoUrl) {
      finalBackgroundVideoPath = uiData.backgroundVideoUrl;
      console.log(`Using user-provided background video URL: ${finalBackgroundVideoPath}`);
    } else if (uiData.backgroundVideoStyle && uiData.backgroundVideoStyle !== 'custom' && S3_BUCKET_NAME && S3_CLIPS_PREFIX) {
      const style = uiData.backgroundVideoStyle.charAt(0).toUpperCase() + uiData.backgroundVideoStyle.slice(1);
      const randomVideoS3Url = await getRandomBackgroundVideoS3(s3Client, S3_BUCKET_NAME, `${S3_CLIPS_PREFIX}${style}/`);
      if (randomVideoS3Url) {
        finalBackgroundVideoPath = randomVideoS3Url;
        console.log(`Using randomly selected background video S3 URL: ${finalBackgroundVideoPath}`);
      } else {
        console.warn(`No background video found for style ${uiData.backgroundVideoStyle}. Will use background color.`);
      }
    }
    
    const remotionPropsInput: Partial<RemotionFormProps> = {
      ...uiData,
      audioUrl: uiData.audioUrl || undefined,
      srtFileUrl: uiData.srtFileUrl || undefined,
      hookDurationInSeconds: hookDurationFromSRTSeconds,
      wordTimings: finalWordTimings, 
      subtitleText: finalSubtitleText,
      backgroundVideoPath: finalBackgroundVideoPath, 
      totalDurationInFrames: Math.ceil(finalVideoDurationSeconds * FPS),
    };

    const validatedRemotionProps = remotionPropsSchema.parse(remotionPropsInput);
    console.log("Final Remotion props (validated):", validatedRemotionProps);

    const videoFileName = `${uuidv4()}.mp4`;
    console.log("Starting Remotion render...");
    const renderedVideoPath = await 실제Remotion랜더링(validatedRemotionProps, videoFileName);
    console.log(`Rendered video path: ${renderedVideoPath}`);

    console.log("Starting S3 upload...");
    const finalVideoS3Key = `${S3_VIDEOS_PREFIX}${videoFileName}`;
    const finalVideoUrl = await 실제S3업로드(renderedVideoPath, finalVideoS3Key);
    console.log(`Final video URL: ${finalVideoUrl}`);

    res.status(200).json({ 
      message: "Video generated and uploaded successfully!", 
      propsUsed: validatedRemotionProps,
      videoUrl: finalVideoUrl 
    });

  } catch (error: any) {
    console.error("Error in API handler:", error);
    const errorMessage = error.message || 'An unknown error occurred during video generation.';
    res.status(500).json({ error: "Video generation failed.", details: errorMessage });
  }
}