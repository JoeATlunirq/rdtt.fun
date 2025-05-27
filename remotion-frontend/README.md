# Remotion Video Generation with Next.js

This project uses Remotion to generate videos based on user inputs through a Next.js frontend and API.

## Important: Rendering on Vercel

**Remotion cannot render videos directly on Vercel Serverless Functions** due to the 50MB function size limit and read-only filesystem. Instead, this project uses **Remotion Lambda** to render videos on AWS Lambda.

## Setup Instructions

### 1. Install Dependencies

```bash
cd remotion-frontend
npm install
```

### 2. Set Up AWS Credentials

Create a `.env.local` file with your AWS credentials:

```env
# AWS S3 Configuration
AWS_S3_BUCKET_NAME=remotion-reddit-start
AWS_S3_REGION=eu-north-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key

# Remotion Lambda Configuration (Required for video rendering)
REMOTION_LAMBDA_FUNCTION_NAME=remotion-render-function
REMOTION_LAMBDA_SERVE_URL=https://your-bucket.s3.region.amazonaws.com/sites/your-site-id/index.html
REMOTION_LAMBDA_REGION=us-east-1
```

### 3. Deploy Remotion Lambda

Before you can render videos, you need to deploy Remotion Lambda to AWS:

```bash
# Install Remotion Lambda CLI globally
npm install -g @remotion/lambda

# Deploy the Lambda function
npx remotion lambda functions deploy

# Deploy your Remotion project to S3
npx remotion lambda sites create --site-name=my-video-app
```

After deployment, update your `.env.local` with:
- `REMOTION_LAMBDA_FUNCTION_NAME`: The name of the deployed function
- `REMOTION_LAMBDA_SERVE_URL`: The S3 URL of your deployed site
- `REMOTION_LAMBDA_REGION`: The AWS region you deployed to

### 4. Deploy to Vercel

```bash
vercel
```

## How It Works

1. **User Input**: Users fill out a form with video parameters
2. **API Endpoint**: `/api/create-video` processes the request
3. **Remotion Lambda**: The API triggers a render on AWS Lambda
4. **Video Generation**: Lambda renders the video and uploads it to S3
5. **Response**: The API returns the S3 URL of the rendered video

## Architecture

- **Frontend**: Next.js with React Hook Form and Tailwind CSS
- **API**: Next.js API routes (deployed on Vercel)
- **Video Rendering**: Remotion Lambda (AWS Lambda)
- **Storage**: AWS S3 for assets and rendered videos
- **Deployment**: Vercel for the web app, AWS for Lambda functions

## API Endpoints

### POST `/api/create-video`

Creates a new video with the specified parameters.

**Request Body:**
```json
{
  "channelName": "TestChannel",
  "channelImage": "https://example.com/image.png",
  "hookText": "Your hook text",
  "audioUrl": "s3://bucket/audio.mp3",
  "srtFileUrl": "s3://bucket/subtitles.srt",
  // ... other parameters
}
```

**Response:**
```json
{
  "message": "Video generated and uploaded successfully!",
  "videoUrl": "https://s3.amazonaws.com/bucket/video.mp4",
  "propsUsed": { /* Remotion props used */ }
}
```

## Troubleshooting

### "REMOTION_LAMBDA_FUNCTION_NAME and REMOTION_LAMBDA_SERVE_URL must be set"

Make sure you've:
1. Deployed Remotion Lambda using the CLI
2. Added the deployment details to your `.env.local`
3. Restarted your development server

### "Cannot find module '@remotion/lambda'"

Run `npm install` to ensure all dependencies are installed.

### AWS Permissions Issues

Ensure your AWS user has the necessary permissions for:
- Lambda function invocation
- S3 bucket read/write access
- CloudWatch logs (for debugging)

## Development

```bash
npm run dev
```

Visit http://localhost:3000

## Production Deployment

1. Deploy Remotion Lambda to AWS (if not already done)
2. Set environment variables in Vercel dashboard
3. Deploy to Vercel: `vercel --prod`

## Cost Considerations

- **Vercel**: Free tier is usually sufficient for the web app
- **AWS Lambda**: Pay per render (typically pennies per video)
- **AWS S3**: Storage and bandwidth costs
- **Remotion License**: Required for commercial use

## Additional Resources

- [Remotion Documentation](https://www.remotion.dev)
- [Remotion Lambda Guide](https://www.remotion.dev/docs/lambda)
- [Vercel Documentation](https://vercel.com/docs) 