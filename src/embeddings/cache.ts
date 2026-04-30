import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import Database from 'better-sqlite3'

export const EMBEDDINGS_DB_PATH = join(homedir(), '.mcp-watchtower', 'embeddings.db')

interface EmbeddingRow {
  embedding: Buffer
}

export class EmbeddingCache {
  private readonly db: Database.Database
  private readonly getStatement: Database.Statement<[string], EmbeddingRow>
  private readonly setStatement: Database.Statement<[string, string, Buffer]>

  constructor(dbPath = EMBEDDINGS_DB_PATH) {
    mkdirSync(dirname(dbPath), { recursive: true })

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        hash TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        embedding BLOB NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    this.getStatement = this.db.prepare<[string], EmbeddingRow>(
      'SELECT embedding FROM embeddings WHERE hash = ?',
    )
    this.setStatement = this.db.prepare<[string, string, Buffer]>(`
      INSERT INTO embeddings (hash, model, embedding, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(hash) DO UPDATE SET
        model = excluded.model,
        embedding = excluded.embedding,
        updated_at = CURRENT_TIMESTAMP
    `)
  }

  hash(text: string): string {
    return createHash('sha256').update(text).digest('hex')
  }

  get(hash: string): Float32Array | null {
    const row = this.getStatement.get(hash)
    if (!row) {
      return null
    }

    return bufferToFloat32Array(row.embedding)
  }

  set(hash: string, embedding: Float32Array, model: string): void {
    this.setStatement.run(hash, model, float32ArrayToBuffer(embedding))
  }

  close(): void {
    this.db.close()
  }
}

function float32ArrayToBuffer(value: Float32Array): Buffer {
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
}

function bufferToFloat32Array(buffer: Buffer): Float32Array {
  if (buffer.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error(`Invalid embedding blob length: ${buffer.byteLength}`)
  }

  const bytes = Uint8Array.from(buffer)
  return new Float32Array(bytes.buffer)
}
