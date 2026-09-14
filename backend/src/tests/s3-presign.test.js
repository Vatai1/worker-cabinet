import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import { HeadBucketCommand } from '@aws-sdk/client-s3'
import { uploadToS3, deleteFromS3, getPresignedUrl, s3Client, S3_BUCKET } from '../config/s3.js'

let s3Available = false
try {
  await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }))
  s3Available = true
} catch {}

const KEY = 'bug-reports/presign-test.txt'
const BODY = 'presign-test'
const testFile = () => ({ buffer: Buffer.from(BODY), mimetype: 'text/plain' })

describe('S3 presign', { skip: !s3Available && 'S3 unavailable' }, () => {
  afterEach(async () => {
    await deleteFromS3(KEY).catch(() => {})
  })

  it('presigned url works via public client without checksum params', async () => {
    await uploadToS3(testFile(), KEY)
    const url = await getPresignedUrl(KEY)
    assert.ok(!url.includes('x-amz-checksum-mode'), `url must not contain x-amz-checksum-mode: ${url}`)
    assert.ok(!url.includes('x-id='), `url must not contain x-id=: ${url}`)
    const res = await fetch(url)
    assert.strictEqual(res.status, 200)
    assert.strictEqual(await res.text(), BODY)
  })

  it('tampered query param fails signature validation', async () => {
    await uploadToS3(testFile(), KEY)
    const url = await getPresignedUrl(KEY)
    const tampered = url.replace(/X-Amz-Expires=\d+/, 'X-Amz-Expires=9999')
    assert.notStrictEqual(tampered, url)
    const res = await fetch(tampered)
    assert.strictEqual(res.status, 403)
  })
})
