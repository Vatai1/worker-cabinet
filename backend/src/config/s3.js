import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import dotenv from 'dotenv'

dotenv.config()

export const S3_BUCKET = process.env.S3_BUCKET || 'worker-cabinet-docs'
export const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:9000'
export const S3_PUBLIC_URL = (process.env.S3_PUBLIC_URL || '').replace(/\/+$/, '')

export const s3Client = new S3Client({
  region: 'us-east-1',
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
  forcePathStyle: true,
})

export const s3PublicClient = S3_PUBLIC_URL
  ? new S3Client({
      region: 'us-east-1',
      endpoint: S3_PUBLIC_URL,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_KEY || '',
      },
      forcePathStyle: true,
    })
  : null

let bucketEnsured = false
let policyEnsured = false

async function ensurePublicAvatarPolicy() {
  if (policyEnsured) return
  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${S3_BUCKET}/avatars/*`],
      },
    ],
  }
  try {
    await s3Client.send(new PutBucketPolicyCommand({ Bucket: S3_BUCKET, Policy: JSON.stringify(policy) }))
    policyEnsured = true
  } catch (e) {
    console.error('[S3] avatar policy failed:', e)
  }
}

export async function ensureBucket() {
  if (!bucketEnsured) {
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }))
    } catch (e) {
      if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
        await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }))
      } else {
        throw e
      }
    }
    bucketEnsured = true
  }
  await ensurePublicAvatarPolicy()
}

export const uploadToS3 = async (file, key) => {
  await ensureBucket()
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
    ContentDisposition: 'inline',
  }

  await s3Client.send(new PutObjectCommand(params))

  return key
}

export const getS3FileUrl = (key) => {
  const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/')
  return `${S3_PUBLIC_URL || S3_ENDPOINT}/${S3_BUCKET}/${encodedKey}`
}

export const deleteFromS3 = async (key) => {
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
  }

  await s3Client.send(new DeleteObjectCommand(params))
}

export const getFromS3 = async (key) => {
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
  }

  try {
    const response = await s3Client.send(new GetObjectCommand(params))
    return response
  } catch (error) {
    console.error('[S3] Error getting file:', error.message, 'Code:', error.Code)
    throw error
  }
}

export const getPresignedUrl = async (key, expiresIn = 3600) => {
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
  }

  const url = await getSignedUrl(s3PublicClient || s3Client, new GetObjectCommand(params), { expiresIn })
  return url
}
