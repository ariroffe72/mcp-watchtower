import { createHash, createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { spawn } from 'node:child_process'

type PublishFileName = 'semantic.hnsw' | 'semantic-meta.json'

interface PublishManifest {
  version: string
  generatedAt: string
  files: Record<PublishFileName, { size: number; sha256: string }>
}

interface R2Credentials {
  accessKeyId: string
  secretAccessKey: string
}

async function main(): Promise<void> {
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  const bucketName = requireEnv('R2_BUCKET_NAME')
  const credentials = resolveR2Credentials()
  const endpoint = process.env.R2_ENDPOINT_URL ?? `https://${accountId}.r2.cloudflarestorage.com`

  if (process.env.PUBLISH_INDEX_SKIP_PIPELINE !== 'true') {
    await runNpmScript('crawl')
    await runNpmScript('embed')
    await runNpmScript('build-index')
  }

  const files = await readPublishFiles()
  const manifest: PublishManifest = {
    version: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    files: {
      'semantic.hnsw': toManifestEntry(files['semantic.hnsw']),
      'semantic-meta.json': toManifestEntry(files['semantic-meta.json']),
    },
  }

  await putObject(endpoint, bucketName, credentials, 'semantic.hnsw', files['semantic.hnsw'].content, 'application/octet-stream')
  await putObject(
    endpoint,
    bucketName,
    credentials,
    'semantic-meta.json',
    files['semantic-meta.json'].content,
    'application/json',
  )
  await putObject(
    endpoint,
    bucketName,
    credentials,
    'manifest.json',
    Buffer.from(JSON.stringify(manifest, null, 2) + '\n'),
    'application/json',
  )
}

async function runNpmScript(scriptName: string): Promise<void> {
  const npmExecPath = process.env.npm_execpath
  if (!npmExecPath) {
    throw new Error('npm_execpath is not available; cannot run nested npm scripts')
  }

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [npmExecPath, 'run', scriptName], {
      stdio: 'inherit',
      shell: false,
    })

    child.on('exit', code => {
      if (code === 0) {
        resolvePromise()
      } else {
        reject(new Error(`npm run ${scriptName} failed with exit code ${code ?? 'unknown'}`))
      }
    })
    child.on('error', reject)
  })
}

async function readPublishFiles(): Promise<Record<PublishFileName, { content: Buffer; size: number; sha256: string }>> {
  const semanticHnsw = await readFile(resolve(process.cwd(), 'src', 'data', 'semantic.hnsw'))
  const semanticMeta = await readFile(resolve(process.cwd(), 'src', 'data', 'semantic-meta.json'))

  return {
    'semantic.hnsw': {
      content: semanticHnsw,
      size: semanticHnsw.byteLength,
      sha256: sha256Hex(semanticHnsw),
    },
    'semantic-meta.json': {
      content: semanticMeta,
      size: semanticMeta.byteLength,
      sha256: sha256Hex(semanticMeta),
    },
  }
}

function toManifestEntry(file: { size: number; sha256: string }): { size: number; sha256: string } {
  return {
    size: file.size,
    sha256: file.sha256,
  }
}

async function putObject(
  endpoint: string,
  bucketName: string,
  credentials: R2Credentials,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const now = new Date()
  const amzDate = toAmzDate(now)
  const dateStamp = amzDate.slice(0, 8)
  const service = 's3'
  const region = 'auto'
  const payloadHash = sha256Hex(body)
  const host = new URL(endpoint).host
  const canonicalUri = `/${encodeURIComponent(bucketName)}/${key.split('/').map(segment => encodeURIComponent(segment)).join('/')}`
  const contentLength = String(body.byteLength)

  const headers = new Map<string, string>([
    ['content-length', contentLength],
    ['content-type', contentType],
    ['host', host],
    ['x-amz-content-sha256', payloadHash],
    ['x-amz-date', amzDate],
  ])

  const signedHeaderNames = Array.from(headers.keys()).sort()
  const canonicalHeaders = signedHeaderNames.map(name => `${name}:${headers.get(name)!.trim()}\n`).join('')
  const signedHeaders = signedHeaderNames.join(';')
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(Buffer.from(canonicalRequest, 'utf-8')),
  ].join('\n')
  const signature = hmacHex(getSigningKey(credentials.secretAccessKey, dateStamp, region, service), stringToSign)
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ')

  const response = await fetch(`${endpoint}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Length': contentLength,
      'Content-Type': contentType,
      Host: host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
    body: new Uint8Array(body),
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Failed to upload ${basename(key)}: ${response.status} ${response.statusText}\n${details}`)
  }
}

function parseR2Token(token: string): R2Credentials {
  try {
    const parsed = JSON.parse(token) as Partial<R2Credentials>
    if (parsed.accessKeyId && parsed.secretAccessKey) {
      return {
        accessKeyId: parsed.accessKeyId,
        secretAccessKey: parsed.secretAccessKey,
      }
    }
  } catch {
    // Ignore JSON parse failure and try string formats below.
  }

  if (token.includes(':')) {
    const [accessKeyId, ...rest] = token.split(':')
    const secretAccessKey = rest.join(':')
    if (accessKeyId && secretAccessKey) {
      return { accessKeyId, secretAccessKey }
    }
  }

  if (token.includes('\n')) {
    const [accessKeyId, secretAccessKey] = token.split(/\r?\n/, 2)
    if (accessKeyId && secretAccessKey) {
      return { accessKeyId, secretAccessKey }
    }
  }

  throw new Error(
    'CLOUDFLARE_R2_TOKEN must contain R2 credentials as accessKeyId:secretAccessKey, two lines, or JSON with accessKeyId and secretAccessKey.',
  )
}

function resolveR2Credentials(): R2Credentials {
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY

  if (accessKeyId && secretAccessKey) {
    return { accessKeyId, secretAccessKey }
  }

  return parseR2Token(requireEnv('CLOUDFLARE_R2_TOKEN'))
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function sha256Hex(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex')
}

function hmacBuffer(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest()
}

function getSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmacBuffer(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmacBuffer(kDate, region)
  const kService = hmacBuffer(kRegion, service)
  return hmacBuffer(kService, 'aws4_request')
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

main().catch(error => {
  console.error(`[publish-index] fatal error: ${(error as Error).message}`)
  process.exitCode = 1
})
