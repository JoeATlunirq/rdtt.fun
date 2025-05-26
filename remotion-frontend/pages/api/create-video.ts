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
// This is already in schema.ts as AppSrtLine, but if schema.ts is not read first, this is a fallback.
// However, the import from schema.ts (AppSrtLine) should be preferred.
interface LocalSrtLine {
  id: string;
  startTime: string; 
  endTime: string;
  text: string;
}

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

async function parseSrt(srtFileUrlString: string): Promise<AppSrtLine[]> {
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
    const srtResult = parser.fromSrt(srtContent) as AppSrtLine[]; 
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

function srtLinesToWordTimings(srtLines: AppSrtLine[], fps: number): WordTiming[] {
  if (!srtLines || srtLines.length === 0) return [];
  return srtLines.map(line => ({
    text: line.text,
    startFrame: Math.floor(parseFloat(line.startTime.replace(',', '.')) * fps),
    endFrame: Math.floor(parseFloat(line.endTime.replace(',', '.')) * fps),
  }));
}

function srtLinesToSubtitleText(srtLines: AppSrtLine[]): string {
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
  const projectRoot = path.resolve(process.cwd(), '../..'); 
  const remotionProjectDir = path.resolve(projectRoot);
  const remotionExecutable = `npx remotion`;
  const compositionId = 'MainComposition'; 
  const outputLocation = path.join(os.tmpdir(), outputFileName);
  const propsString = JSON.stringify(props);
  const command = `cd "${remotionProjectDir}" && ${remotionExecutable} render ${compositionId} "${outputLocation}" --props='${propsString}' --log=verbose`;
  console.log(`Executing Remotion CLI: ${command}`);
  try {
    execSync(command, { stdio: 'inherit', timeout: 600000 }); 
    console.log(`Remotion render successful: ${outputLocation}`);
    return outputLocation;
  } catch (error) {
    console.error("Error during Remotion CLI execution:", error);
    throw new Error(`Remotion render failed: ${ (error as Error).message }`);
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
    const hookAudioDuration = uiData.audioUrl ? await getAudioDurationFromS3(uiData.audioUrl) : 0;
    let scriptAudioDuration = uiData.scriptAudioUrl ? await getAudioDurationFromS3(uiData.scriptAudioUrl) : 0;
    
    let srtLines: AppSrtLine[] = [];
    let finalWordTimings: WordTiming[] | undefined = undefined;
    let finalSubtitleText: string | undefined = undefined;

    if (uiData.srtFileUrl) {
      srtLines = await parseSrt(uiData.srtFileUrl);
      if (srtLines.length > 0) {
        finalWordTimings = srtLinesToWordTimings(srtLines, FPS);
        finalSubtitleText = srtLinesToSubtitleText(srtLines);
        if (scriptAudioDuration <= 0) { 
          const lastSubtitle = srtLines[srtLines.length - 1];
          if (lastSubtitle && lastSubtitle.endTime) { 
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
        if (lastTiming && typeof lastTiming.endFrame === 'number') finalVideoDurationSeconds = lastTiming.endFrame / FPS; 
    }

    if (finalVideoDurationSeconds <= 0) {
      if (!finalWordTimings || finalWordTimings.length === 0) {
          console.error("Could not determine final video duration from audio or SRT.");
          return res.status(400).json({ error: 'Could not determine final video duration.'});
      } 
      console.log("Audio duration is zero, video duration will be based on SRT timings.");
    }

    let finalBackgroundVideoPath: string | undefined = undefined;
    if (uiData.backgroundVideoUrl) {
      finalBackgroundVideoPath = uiData.backgroundVideoUrl;
      console.log(`Using user-provided background video URL: ${finalBackgroundVideoPath}`);
    } else if (uiData.backgroundVideoStyle && uiData.backgroundVideoStyle !== 'custom' && S3_BUCKET_NAME && S3_CLIPS_PREFIX) {
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
      wordTimings: finalWordTimings, 
      subtitleText: finalSubtitleText,
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
      // videoUrl: finalVideoUrl 
    });

  } catch (error: any) {
    console.error("Error in API handler:", error);
    const errorMessage = error.message || 'An unknown error occurred during video generation.';
    res.status(500).json({ error: "Video generation failed.", details: errorMessage });
  }
}