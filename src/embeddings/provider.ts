import { pipeline, type FeatureExtractionPipeline, type Tensor } from '@xenova/transformers'

export const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2'
export const EMBEDDING_DIMENSIONS = 384

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_NAME)
  }

  return extractorPromise
}

export async function embed(text: string): Promise<Float32Array> {
  const normalizedText = text.trim()
  if (normalizedText.length === 0) {
    throw new Error('Cannot embed an empty description')
  }

  const extractor = await getExtractor()
  const output = await extractor(normalizedText, { pooling: 'mean', normalize: true })
  const embedding = toFloat32Array(output.data)

  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${EMBEDDING_DIMENSIONS} embedding values from ${MODEL_NAME}, received ${embedding.length}`,
    )
  }

  return embedding
}

function toFloat32Array(data: Tensor['data']): Float32Array {
  if (data instanceof Float32Array) {
    return new Float32Array(data)
  }

  return Float32Array.from(data, value => Number(value))
}
