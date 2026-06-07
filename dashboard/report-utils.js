export function buildToolGroups(report) {
  const staticIndexes = createToolIndex(report.tools)
  const groups = report.tools.map(tool => ({
    tool,
    staticFindings: [],
    semanticFindings: [],
  }))

  for (const finding of report.findings) {
    for (const index of resolveFindingIndexes(finding, staticIndexes)) {
      groups[index]?.staticFindings.push(finding)
    }
  }

  for (const finding of report.semanticFindings) {
    for (const index of resolveFindingIndexes(finding, staticIndexes)) {
      groups[index]?.semanticFindings.push(finding)
    }
  }

  return groups
}

export function buildOverview(report) {
  return {
    staticFindingCount: report.findings.length,
    semanticFindingCount: report.semanticFindings.length,
    totalFindingCount: report.findings.length + report.semanticFindings.length,
  }
}

export function formatTimestamp(value) {
  if (!value) {
    return 'Not available'
  }

  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString()
}

function createToolIndex(tools) {
  const index = new Map()

  for (const tool of tools) {
    const indexes = index.get(tool.name) ?? []
    indexes.push(tool.index)
    index.set(tool.name, indexes)
  }

  return index
}

function resolveFindingIndexes(finding, toolIndex) {
  if (Array.isArray(finding.toolIndexes) && finding.toolIndexes.length > 0) {
    return uniqueNumbers(finding.toolIndexes)
  }

  const indexes = []

  if (finding.tool && toolIndex.has(finding.tool)) {
    indexes.push(...toolIndex.get(finding.tool))
  }

  if (finding.relatedTool && toolIndex.has(finding.relatedTool)) {
    indexes.push(...toolIndex.get(finding.relatedTool))
  }

  return uniqueNumbers(indexes)
}

function uniqueNumbers(values) {
  return [...new Set(values.filter(value => Number.isInteger(value) && value >= 0))]
}
