export interface AnalysisModeOptions {
  semantic?: boolean
  syntactic?: boolean
}

export interface AnalysisMode {
  runStatic: boolean
  runSemantic: boolean
}

export function resolveAnalysisMode(options: AnalysisModeOptions): AnalysisMode {
  return {
    runStatic: !!options.syntactic || !options.semantic,
    runSemantic: !!options.semantic || !options.syntactic,
  }
}
