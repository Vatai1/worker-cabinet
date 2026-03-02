import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
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
const folderName = 'templateDocuments/'

async function createFolder() {
  try {
    try {
      await s3Client.send(new HeadObjectCommand({ 
        Bucket: bucketName, 
        Key: folderName 
      }))
      console.log('✓ Folder already exists:', folderName)
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404 || error.$metadata?.httpStatusCode === 403) {
        console.log('Creating folder:', folderName)
        await s3Client.send(new PutObjectCommand({ 
          Bucket: bucketName, 
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
