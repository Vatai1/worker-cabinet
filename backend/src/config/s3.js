import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

const s3Client = new S3Client({
  region: 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin123',
  },
  forcePathStyle: true,
})

export const uploadToS3 = async (file, key) => {
  const params = {
    Bucket: process.env.S3_BUCKET || 'worker-cabinet-docs',
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  }

  await s3Client.send(new PutObjectCommand(params))

  return key
}

export const getS3FileUrl = (key) => {
  const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/')
  return `${process.env.S3_ENDPOINT || 'http://localhost:9000'}/${process.env.S3_BUCKET || 'worker-cabinet-docs'}/${encodedKey}`
}

export const deleteFromS3 = async (key) => {
  const params = {
    Bucket: process.env.S3_BUCKET || 'worker-cabinet-docs',
    Key: key,
  }

  await s3Client.send(new DeleteObjectCommand(params))
}

export const getFromS3 = async (key) => {
  const params = {
    Bucket: process.env.S3_BUCKET || 'worker-cabinet-docs',
    Key: key,
  }

  const response = await s3Client.send(new GetObjectCommand(params))
  return response
}
