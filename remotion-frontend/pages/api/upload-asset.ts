import { NextApiRequest, NextApiResponse } from 'next';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import multiparty from 'multiparty';
import fs from 'fs';
import path from 'path';

// Configure S3 client (ensure AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY are in env)
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "eu-north-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    ...(process.env.AWS_SESSION_TOKEN && { sessionToken: process.env.AWS_SESSION_TOKEN }),
  }
});

const S3_BUCKET_NAME = process.env.S3_ASSETS_BUCKET || "remotion-reddit-start";

// Define allowed S3 prefixes based on your .env structure
const S3_PREFIXES = {
  logo: process.env.S3_CHANNEL_PFP_FONTS || "ChannelLogos/", // Matched S3_CHANNEL_PFP_FONTS from your .env
  font: process.env.S3_UPLOADED_FONTS || "Fonts/",
  // Add other types if needed, e.g., srt for temporary per-video uploads if you change that flow
};

export const config = {
  api: {
    bodyParser: false, // Disable Next.js body parsing, multiparty will handle it
  },
};

// Types for multiparty callback (can be refined if needed based on @types/multiparty specifics)
interface MultipartyFields { [key: string]: string[]; }
interface MultipartyFiles { [key: string]: multiparty.File[]; }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const form = new multiparty.Form();

  try {
    const { fields, files } = await new Promise<{ fields: MultipartyFields, files: MultipartyFiles }>((resolve, reject) => {
      form.parse(req, (err: Error | null, fields: MultipartyFields, files: MultipartyFiles) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    });

    const assetType = fields.assetType?.[0] as 'logo' | 'font' | 'music';
    const file = files.file?.[0];

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }
    if (!assetType || !['logo', 'font', 'music'].includes(assetType)) {
      return res.status(400).json({ error: 'Invalid asset type specified.' });
    }

    const S3_ASSETS_BUCKET = process.env.S3_ASSETS_BUCKET || "remotion-reddit-start";
    let s3Prefix = '';
    let contentType = file.headers['content-type'];

    switch (assetType) {
      case 'logo':
        s3Prefix = process.env.S3_CHANNEL_LOGOS_PREFIX || 'ChannelLogos/';
        break;
      case 'font':
        s3Prefix = process.env.S3_FONTS_PREFIX || 'Fonts/';
        if (!['font/ttf', 'font/otf', 'font/woff', 'font/woff2', 'application/font-sfnt', 'application/x-font-opentype', 'application/x-font-truetype'].includes(contentType)) {
            const ext = path.extname(file.originalFilename || '').toLowerCase();
            if (ext === '.ttf') contentType = 'font/ttf';
            else if (ext === '.otf') contentType = 'font/otf';
            else if (ext === '.woff') contentType = 'font/woff';
            else if (ext === '.woff2') contentType = 'font/woff2';
            else contentType = 'application/octet-stream';
        }
        break;
      case 'music':
        s3Prefix = process.env.S3_USER_MUSIC_PREFIX || 'UserMusic/';
        if (!['audio/mpeg', 'audio/wav', 'audio/x-wav'].includes(contentType)) {
            const ext = path.extname(file.originalFilename || '').toLowerCase();
            if (ext === '.mp3') contentType = 'audio/mpeg';
            else if (ext === '.wav') contentType = 'audio/wav';
            else contentType = 'application/octet-stream';
        }
        break;
      default:
        return res.status(400).json({ error: 'Invalid asset type for S3 prefix.' });
    }

    const fileContent = fs.readFileSync(file.path);
    const originalFileName = file.originalFilename;
    
    // Sanitize filename or use UUID for S3 key to prevent issues
    const safeFileName = path.basename(originalFileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `${s3Prefix}${uuidv4()}-${safeFileName}`;

    const putObjectCommand = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileContent,
      ContentType: contentType,
      // ACL: 'public-read', // Optional: if you want files to be publicly readable by default
    });

    await s3Client.send(putObjectCommand);

    // Construct the S3 URL using the custom domain
    const customDomain = "rdtt.fun"; // Your new domain
    const s3Url = `https://${customDomain}/${s3Key}`;
    
    // Clean up the temporarily uploaded file
    fs.unlinkSync(file.path);

    return res.status(200).json({ message: 'File uploaded successfully', s3Url, assetType });

  } catch (error) {
    console.error('Error uploading asset:', error);
    let message = 'Internal Server Error during file upload.';
    if (error instanceof Error) {
        message = error.message;
    }
    // If it's a multiparty error, it might have a specific statusCode
    // @ts-ignore
    if (error.statusCode) {
    // @ts-ignore
        return res.status(error.statusCode).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
} 