import { s3Client, S3_BUCKET } from '../config/s3.js'
import { CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3'

async function createBucket() {
  try {
    console.log('Checking bucket:', S3_BUCKET)

    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }))
      console.log('✓ Bucket already exists')
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata.httpStatusCode === 404) {
        console.log('Creating bucket:', S3_BUCKET)
        await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }))
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
