import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import { HeadBucketCommand } from '@aws-sdk/client-s3'
import { ensureBucket, uploadToS3, deleteFromS3, s3Client, S3_BUCKET, S3_ENDPOINT } from '../config/s3.js'

let s3Available = false
try {
  await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }))
  s3Available = true
} catch {}

const AVATAR_KEY = 'avatars/init-test.txt'
const PRIVATE_KEY = 'bug-reports/init-test.txt'
const testFile = () => ({ buffer: Buffer.from('s3-init-test'), mimetype: 'text/plain' })

describe('S3 init', { skip: !s3Available && 'S3 unavailable' }, () => {
  afterEach(async () => {
    await deleteFromS3(AVATAR_KEY).catch(() => {})
    await deleteFromS3(PRIVATE_KEY).catch(() => {})
  })

  it('bucket and avatar policy are initialized by backend, avatar is served anonymously', async () => {
    await ensureBucket()
    await uploadToS3(testFile(), AVATAR_KEY)
    const res = await fetch(`${S3_ENDPOINT}/${S3_BUCKET}/${AVATAR_KEY}`)
    assert.strictEqual(res.status, 200)
    assert.strictEqual(await res.text(), 's3-init-test')
  })

  it('private prefixes stay private, bug-reports is not anonymously readable', async () => {
    await ensureBucket()
    await uploadToS3(testFile(), PRIVATE_KEY)
    const res = await fetch(`${S3_ENDPOINT}/${S3_BUCKET}/${PRIVATE_KEY}`)
    assert.strictEqual(res.status, 403)
  })
})
