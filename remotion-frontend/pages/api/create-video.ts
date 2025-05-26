import type { NextApiRequest, NextApiResponse } from 'next';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { uiFormSchema, remotionPropsSchema, RemotionFormProps, UIFormValues, WordTiming, SrtLine as AppSrtLine } from '../../lib/schema';
import { ZodError } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import SrtParser from 'srt-parser-2';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import * as mm from 'music-metadata';

// Define SrtLine interface locally based on srt-parser-2 output
interface SrtLine {
  id: string;
  startTime: string; 
  endTime: string;
  text: string;
}

// ... (S3_BUCKET_NAME etc. declarations remain the same) ...

const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
const S3_REGION = process.env.AWS_S3_REGION;
const S3_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const S3_CLIPS_PREFIX = process.env.AWS_S3_CLIPS_PREFIX || 'Clips/';
const S3_VIDEOS_PREFIX = process.env.AWS_S3_VIDEOS_PREFIX || 'Videos/';
const S3_UPLOADED_AUDIO_PREFIX = 'UploadedAudio/'; // For audio files uploaded by users if needed

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

// Helper to download a stream to a local file
async function streamToFile(stream: NodeJS.ReadableStream, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const fileWriteStream = fs.createWriteStream(filePath);
    stream.pipe(fileWriteStream);
    stream.on('error', (err) => {
      console.error("Stream error during download:", err);
      fileWriteStream.close();
      fs.unlink(filePath, () => {}); // Attempt to clean up
      reject(err);
    });
    fileWriteStream.on('finish', () => {
      fileWriteStream.close();
      resolve();
    });
    fileWriteStream.on('error', (err) => {
      console.error("File write stream error:", err);
      fs.unlink(filePath, () => {}); // Attempt to clean up
      reject(err);
    });
  });
}

// Helper to parse S3 URL
function parseS3Url(s3Url: string): { bucket: string, key: string } {
  const url = new URL(s3Url);
  if (url.protocol !== 's3:') {
    throw new Error(`Invalid S3 URL: ${s3Url}. Must start with s3://`);
  }
  const bucket = url.hostname;
  const key = url.pathname.substring(1); // Remove leading '/'
  return { bucket, key };
}


async function getAudioDurationFromS3(audioUrl: string): Promise<number> {
  const tempFileName = `${uuidv4()}_${path.basename(new URL(audioUrl).pathname)}`;
  const tempFilePath = path.join(os.tmpdir(), tempFileName);
  let s3KeyForUpload: string | null = null;
  let isHttpUrl = false;

  try {
    if (audioUrl.startsWith('s3://')) {
      console.log(`Processing S3 URL: ${audioUrl}`);
      const { bucket, key } = parseS3Url(audioUrl);
      s3KeyForUpload = key; // Original key if it's already in our bucket
      console.log(`Downloading audio from S3: bucket=${bucket}, key=${key} to ${tempFilePath}...`);
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      const { Body } = await s3Client.send(command);
      if (!Body || !(Body instanceof Readable)) {
        throw new Error('S3 Body is not a readable stream or is undefined.');
      }
      await streamToFile(Body, tempFilePath);
      console.log("Audio downloaded successfully from S3.");
    } else if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
      isHttpUrl = true;
      console.log(`Processing HTTP(S) URL: ${audioUrl}`);
      console.log(`Downloading audio from ${audioUrl} to ${tempFilePath}...`);
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to download audio from ${audioUrl}: ${response.statusText}`);
      }
      if (!response.body) {
        throw new Error('Response body is null');
      }
      // Convert web ReadableStream to Node.js Readable stream
      const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream<any>);
      await streamToFile(nodeStream, tempFilePath);
      console.log("Audio downloaded successfully from HTTP(S).");
      
      // For externally hosted audio, upload it to our S3 for consistent access/archival
      // and so Remotion can access it if it needs to.
      if (S3_BUCKET_NAME && S3_UPLOADED_AUDIO_PREFIX) {
        s3KeyForUpload = `${S3_UPLOADED_AUDIO_PREFIX}${tempFileName}`;
        console.log(`Uploading audio from ${tempFilePath} to s3://${S3_BUCKET_NAME}/${s3KeyForUpload}...`);
        const uploadCommand = new PutObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: s3KeyForUpload,
          Body: fs.createReadStream(tempFilePath),
        });
        await s3Client.send(uploadCommand);
        console.log(`Audio uploaded to your S3: https://${S3_BUCKET_NAME}.s3.${S3_REGION}.amazonaws.com/${s3KeyForUpload}`);
      }

    } else {
      throw new Error(`Unsupported audio URL protocol: ${audioUrl}`);
    }

    console.log(`Getting duration for ${tempFilePath} using music-metadata...`);
    const metadata = await mm.parseFile(tempFilePath);
    if (metadata.format.duration) {
      console.log(`Duration found: ${metadata.format.duration} seconds.`);
      return metadata.format.duration;
    } else {
      throw new Error('Could not determine audio duration using music-metadata.');
    }

  } catch (error) {
    console.error(`Error in getAudioDurationFromS3 for URL ${audioUrl}:`, error);
    throw error; // Re-throw the error to be caught by the main handler
  } finally {
    console.log(`Attempting to delete temporary file: ${tempFilePath}`);
    fs.unlink(tempFilePath, (err) => {
      if (err) {
        // Log error but don't throw, as main operation might have succeeded
        console.warn(`Failed to delete temporary file ${tempFilePath}:`, err);
      } else {
        console.log(`Temporary file ${tempFilePath} deleted.`);
      }
    });
  }
}

// Renamed from parseSrtFromS3 to parseSrt
async function parseSrt(srtFileUrl: string): Promise<AppSrtLine[]> {
  if (!srtFileUrl) return [];
  const tempFileName = `${uuidv4()}_${path.basename(new URL(srtFileUrl).pathname)}.srt`;
  const tempFilePath = path.join(os.tmpdir(), tempFileName);

  try {
    if (srtFileUrl.startsWith('s3://')) {
      console.log(`Fetching SRT from S3 URL: ${srtFileUrl}`);
      const { bucket, key } = parseS3Url(srtFileUrl);
      const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!Body || !(Body instanceof Readable)) throw new Error('S3 SRT Body error.');
      await streamToFile(Body, tempFilePath);
      console.log("SRT downloaded from S3.");
    } else if (srtFileUrl.startsWith('http://') || srtFileUrl.startsWith('https://')) {
      console.log(`Fetching SRT from HTTPS URL: ${srtFileUrl}`);
      const response = await fetch(srtFileUrl);
      if (!response.ok) throw new Error(`Failed to download SRT: ${response.statusText}`);
      if (!response.body) throw new Error('SRT Response body is null');
      await streamToFile(Readable.fromWeb(response.body as import('stream/web').ReadableStream<any>), tempFilePath);
      console.log("SRT downloaded from HTTPS.");
    } else {
      throw new Error(`Unsupported SRT URL: ${srtFileUrl}`);
    }
    const srtContent = fs.readFileSync(tempFilePath, 'utf-8');
    const parser = new SrtParser();
    const srtResult = parser.fromSrt(srtContent) as AppSrtLine[]; 
    console.log(`SRT parsed. Found ${srtResult.length} lines.`);
    return srtResult;
  } catch (error) {
    console.error(`Error parsing SRT from URL ${srtFileUrl}:`, error);
    throw error;
  } finally {
    fs.unlink(tempFilePath, (err) => {
      if (err) console.warn(`Failed to delete temp SRT file ${tempFilePath}:`, err);
      else console.log(`Temp SRT file ${tempFilePath} deleted.`);
    });
  }
}

function srtLinesToWordTimings(srtLines: AppSrtLine[], fps: number): WordTiming[] {
  if (!srtLines) return [];
  return srtLines.map(line => ({
    text: line.text,
    startFrame: Math.floor(parseFloat(line.startTime.replace(',', '.')) * fps),
    endFrame: Math.floor(parseFloat(line.endTime.replace(',', '.')) * fps),
  }));
}

function srtLinesToSubtitleText(srtLines: AppSrtLine[]): string {
  if (!srtLines) return '';
  return srtLines.map(line => line.text).join('\n'); 
}

// ... (getRandomBackgroundVideoS3, simulateRemotionRender, simulateS3Upload remain the same for now) ...

async function getRandomBackgroundVideoS3(s3Client: S3Client, bucket: string, prefix: string): Promise<string | null> {
  // ... (implementation remains the same)
  console.log(`Listing background videos from S3: bucket=${bucket}, prefix=${prefix}`);
  try {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });
    const response = await s3Client.send(command);

    if (!response.Contents || response.Contents.length === 0) {
      console.warn(`No background videos found in s3://${bucket}/${prefix}`);
      return null;
    }

    // Filter out any "directory" objects (though S3 doesn't really have directories)
    const videoFiles = response.Contents.filter(obj => obj.Key && !obj.Key.endsWith('/'));

    if (videoFiles.length === 0) {
      console.warn(`No actual video files found in s3://${bucket}/${prefix} after filtering.`);
      return null;
    }

    const randomIndex = Math.floor(Math.random() * videoFiles.length);
    const randomVideoKey = videoFiles[randomIndex].Key;
    if (!randomVideoKey) {
        console.warn(`Random video key was undefined at index ${randomIndex}.`);
        return null;
    }
    const randomVideoUrl = `s3://${bucket}/${randomVideoKey}`;
    console.log(`Selected random background video: ${randomVideoUrl}`);
    return randomVideoUrl;

  } catch (error) {
    console.error("Error listing background videos from S3:", error);
    return null; // Or handle error as appropriate
  }
}


// Simulate Remotion rendering - replace with actual Remotion CLI call
async function 실제Remotion랜더링 (props: RemotionFormProps, outputFileName: string): Promise<string> {
  const projectRoot = path.resolve(process.cwd(), '../..'); // Assuming API is in remotion-frontend/pages/api
  const remotionProjectDir = path.resolve(projectRoot); // Root of the Remotion project itself
  
  // Ensure this path is correct for your project structure.
  // This assumes your remotion project's package.json is in the root,
  // and that 'remotion' is a script or direct dependency there.
  const remotionExecutable = `npx remotion`;
  const compositionId = 'MainComposition'; // Or make this dynamic if needed
  const outputLocation = path.join(os.tmpdir(), outputFileName);

  const propsString = JSON.stringify(props);

  // cd to the Remotion project directory before running the command
  const command = `cd "${remotionProjectDir}" && ${remotionExecutable} render ${compositionId} "${outputLocation}" --props='${propsString}' --log=verbose`;
  
  console.log(`Executing Remotion CLI: ${command}`);
  
  try {
    // Increased timeout to 10 minutes (600000 ms) for potentially long renders
    // execSync might not be ideal for very long processes in serverless, consider alternatives for production
    execSync(command, { stdio: 'inherit', timeout: 600000 }); 
    console.log(`Remotion render successful: ${outputLocation}`);
    return outputLocation;
  } catch (error) {
    console.error("Error during Remotion CLI execution:", error);
    // @ts-ignore
    // console.error("stdout:", error.stdout?.toString());
    // @ts-ignore
    // console.error("stderr:", error.stderr?.toString());
    throw new Error(`Remotion render failed: ${ (error as Error).message }`);
  }
}


// Simulate S3 Upload - replace with actual S3 upload
async function 실제S3업로드 (filePath: string, s3Key: string): Promise<string> {
  console.log(`Uploading ${filePath} to S3 bucket ${S3_BUCKET_NAME} with key ${s3Key}`);
  if (!S3_BUCKET_NAME) {
    throw new Error("S3_BUCKET_NAME is not configured for upload.");
  }
  try {
    const fileStream = fs.createReadStream(filePath);
    const uploadCommand = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileStream,
      // ACL: 'public-read', // Optional: if you want the video to be publicly accessible directly
    });
    await s3Client.send(uploadCommand);
    const videoUrl = `https://${S3_BUCKET_NAME}.s3.${S3_REGION}.amazonaws.com/${s3Key}`;
    console.log(`File uploaded to S3: ${videoUrl}`);
    return videoUrl;
  } catch (error) {
    console.error("Error uploading file to S3:", error);
    throw error;
  } finally {
    fs.unlink(filePath, err => { // Clean up local rendered file
      if (err) console.warn(`Failed to delete temporary rendered file ${filePath}:`, err);
      else console.log(`Temporary rendered file ${filePath} deleted.`);
    });
  }
}


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
    const FPS = 30; // Define FPS early, as it's needed for SRT processing

    const hookAudioDuration = uiData.audioUrl ? await getAudioDurationFromS3(uiData.audioUrl) : 0;
    let scriptAudioDuration = uiData.scriptAudioUrl ? await getAudioDurationFromS3(uiData.scriptAudioUrl) : 0;
    
    let srtLines: AppSrtLine[] = []; // Assuming AppSrtLine is the type from your schema.ts for SrtLine
    let finalWordTimings: WordTiming[] | undefined = undefined;
    let finalSubtitleText: string | undefined = undefined;

    if (uiData.srtFileUrl) {
      srtLines = await parseSrt(uiData.srtFileUrl); // parseSrt is the renamed parseSrtFromS3
      if (srtLines.length > 0) {
        finalWordTimings = srtLinesToWordTimings(srtLines, FPS); // Use helper
        finalSubtitleText = srtLinesToSubtitleText(srtLines);   // Use helper
        if (scriptAudioDuration <= 0) { 
          const lastSubtitle = srtLines[srtLines.length - 1];
          if (lastSubtitle) { // Check if lastSubtitle exists
            scriptAudioDuration = parseFloat(lastSubtitle.endTime.replace(',', '.'));
            console.log(`Script audio duration estimated from SRT: ${scriptAudioDuration} seconds`);
          }
        }
      }
    }

    const overallAudioDuration = hookAudioDuration + scriptAudioDuration;
    
    let finalVideoDurationSeconds = overallAudioDuration;
    if (finalVideoDurationSeconds <= 0 && finalWordTimings && finalWordTimings.length > 0) {
        const lastTiming = finalWordTimings[finalWordTimings.length - 1];
        if (lastTiming) finalVideoDurationSeconds = lastTiming.endFrame / FPS; 
    }

    if (finalVideoDurationSeconds <= 0) {
      // Only error if no audio AND no valid subtitles from which duration could be inferred.
      if (!finalWordTimings || finalWordTimings.length === 0) {
          console.error("Could not determine final video duration from audio or SRT.");
          return res.status(400).json({ error: 'Could not determine final video duration.'});
      } 
      // If we reach here, it means overallAudioDuration was <=0, but we have word timings,
      // and finalVideoDurationSeconds was updated from SRT. This is acceptable.
      console.log("Audio duration is zero, video duration will be based on SRT timings.");
    }

    let finalBackgroundVideoPath: string | undefined = undefined;
    if (uiData.backgroundVideoUrl) {
      finalBackgroundVideoPath = uiData.backgroundVideoUrl;
      console.log(`Using user-provided background video URL: ${finalBackgroundVideoPath}`);
    } else if (uiData.backgroundVideoStyle !== 'custom' && S3_BUCKET_NAME && S3_CLIPS_PREFIX) {
      const randomVideoS3Url = await getRandomBackgroundVideoS3(s3Client, S3_BUCKET_NAME, `${S3_CLIPS_PREFIX}${uiData.backgroundVideoStyle}/`);
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
      scriptAudioUrl: uiData.scriptAudioUrl || undefined,
      srtFileUrl: uiData.srtFileUrl || undefined,
      hookDurationInSeconds: hookAudioDuration,
      scriptDurationInSeconds: scriptAudioDuration,
      wordTimings: finalWordTimings,         // Corrected: Use pre-processed variable
      subtitleText: finalSubtitleText,        // Corrected: Use pre-processed variable
      backgroundVideoPath: finalBackgroundVideoPath, 
      totalDurationInFrames: Math.ceil(finalVideoDurationSeconds * FPS),
    };

    const validatedRemotionProps = remotionPropsSchema.parse(remotionPropsInput);
    console.log("Final Remotion props (validated):", validatedRemotionProps);

    const videoFileName = `${uuidv4()}.mp4`;
    // const renderedVideoPath = await 실제Remotion랜더링(validatedRemotionProps, videoFileName);
    // const finalVideoS3Key = `${S3_VIDEOS_PREFIX}${videoFileName}`;
    // const finalVideoUrl = await 실제S3업로드(renderedVideoPath, finalVideoS3Key);

    res.status(200).json({ 
      message: "Props generated successfully (Remotion rendering is still simulated).", 
      propsUsed: validatedRemotionProps,
      // videoUrl: finalVideoUrl // Uncomment when rendering is live
    });

  } catch (error: any) {
    console.error("Error in API handler:", error);
    const errorMessage = error.message || 'An unknown error occurred during video generation.';
    res.status(500).json({ error: "Video generation failed.", details: errorMessage });
  }
}