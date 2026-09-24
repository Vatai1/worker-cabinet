import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import http from 'node:http'
import { HeadBucketCommand } from '@aws-sdk/client-s3'
import { uploadToS3, deleteFromS3, getPresignedUrl, s3Client, S3_BUCKET, S3_ENDPOINT, S3_PUBLIC_URL } from '../config/s3.js'

let s3Available = false
try {
  await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }))
  s3Available = true
} catch {}

const KEY = 'bug-reports/presign-test.txt'
const BODY = 'presign-test'
const testFile = () => ({ buffer: Buffer.from(BODY), mimetype: 'text/plain' })

const getWithHost = (url, host) =>
  new Promise((resolve, reject) => {
    const target = new URL(url)
    const req = http.request(
      { hostname: target.hostname, port: target.port || 80, path: `${target.pathname}${target.search}`, headers: { Host: host } },
      (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => resolve({ status: res.statusCode, body }))
      }
    )
    req.on('error', reject)
    req.end()
  })

describe('S3 presign', { skip: !s3Available && 'S3 unavailable' }, () => {
  afterEach(async () => {
    await deleteFromS3(KEY).catch(() => {})
  })

  it('presigned url works via internal host behind prefix-stripping proxy', async () => {
    await uploadToS3(testFile(), KEY)
    const url = await getPresignedUrl(KEY)
    assert.ok(!url.includes('x-amz-checksum-mode'), `url must not contain x-amz-checksum-mode: ${url}`)
    assert.ok(!url.includes('x-id='), `url must not contain x-id=: ${url}`)
    if (S3_PUBLIC_URL) {
      assert.ok(url.startsWith(S3_PUBLIC_URL), `url must start with S3_PUBLIC_URL: ${url}`)
    }
    const internalUrl = S3_PUBLIC_URL ? url.replace(S3_PUBLIC_URL, S3_ENDPOINT) : url
    const endpoint = new URL(S3_ENDPOINT)
    const res = await getWithHost(internalUrl, endpoint.host)
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body, BODY)
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
