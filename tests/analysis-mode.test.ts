import { describe, expect, it } from 'vitest'
import { resolveAnalysisMode } from '../cli/analysis.js'

describe('analysis mode selection', () => {
  it('runs both analyzers by default', () => {
    expect(resolveAnalysisMode({})).toEqual({
      runStatic: true,
      runSemantic: true,
    })
  })

  it('runs only static checks with --syntactic', () => {
    expect(resolveAnalysisMode({ syntactic: true })).toEqual({
      runStatic: true,
      runSemantic: false,
    })
  })

  it('runs only semantic checks with --semantic', () => {
    expect(resolveAnalysisMode({ semantic: true })).toEqual({
      runStatic: false,
      runSemantic: true,
    })
  })

  it('runs both when both flags are provided explicitly', () => {
    expect(resolveAnalysisMode({ syntactic: true, semantic: true })).toEqual({
      runStatic: true,
      runSemantic: true,
    })
  })
})
