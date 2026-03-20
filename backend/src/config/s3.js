import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

export const S3_BUCKET = process.env.S3_BUCKET || 'worker-cabinet-docs'
export const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:9000'

export const s3Client = new S3Client({
  region: 'us-east-1',
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || process.env.S3_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin123',
  },
  forcePathStyle: true,
})

export const uploadToS3 = async (file, key) => {
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  }

  await s3Client.send(new PutObjectCommand(params))

  return key
}

export const getS3FileUrl = (key) => {
  const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/')
  return `${S3_ENDPOINT}/${S3_BUCKET}/${encodedKey}`
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

  const response = await s3Client.send(new GetObjectCommand(params))
  return response
}
