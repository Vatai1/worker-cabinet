import { s3Client, S3_BUCKET } from '../config/s3.js'
import { PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'

const folderName = 'templateDocuments/'

async function createFolder() {
  try {
    try {
      await s3Client.send(new HeadObjectCommand({ 
        Bucket: S3_BUCKET, 
        Key: folderName 
      }))
      console.log('✓ Folder already exists:', folderName)
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404 || error.$metadata?.httpStatusCode === 403) {
        console.log('Creating folder:', folderName)
        await s3Client.send(new PutObjectCommand({ 
          Bucket: S3_BUCKET, 
          Key: folderName,
          Body: Buffer.from('')
        }))
        console.log('✓ Folder created successfully:', folderName)
      } else {
        throw error
      }
    }
  } catch (error) {
    console.error('❌ Error creating folder:', error)
    throw error
  }
}

createFolder()
  .then(() => {
    console.log('✅ Template folder setup completed')
    process.exit(0)
  })
  .catch(() => {
    console.error('❌ Failed to setup template folder')
    process.exit(1)
  })
