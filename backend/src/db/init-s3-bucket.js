import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'

dotenv.config()

const s3Client = new S3Client({
  region: 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin123',
  },
  forcePathStyle: true,
})

const bucketName = process.env.S3_BUCKET || 'worker-cabinet-docs'

async function createBucket() {
  try {
    console.log('Checking bucket:', bucketName)

    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }))
      console.log('✓ Bucket already exists')
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata.httpStatusCode === 404) {
        console.log('Creating bucket:', bucketName)
        await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }))
        console.log('✓ Bucket created successfully')
      } else {
        throw error
      }
    }
  } catch (error) {
    console.error('❌ Error managing bucket:', error)
    throw error
  }
}

createBucket()
  .then(() => {
    console.log('✅ Bucket setup completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Failed to setup bucket')
    process.exit(1)
  })
