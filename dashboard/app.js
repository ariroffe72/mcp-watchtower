import React, { useEffect, useMemo, useState } from 'react'
import { buildOverview, buildToolGroups, formatTimestamp } from './report-utils.js'

const h = React.createElement

export function DashboardApp() {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let active = true

    fetch('/api/report')
      .then(async response => {
        if (!response.ok) {
          throw new Error(`Dashboard request failed with ${response.status}`)
        }

        return response.json()
      })
      .then(report => {
        if (active) {
          setState({ status: 'ready', report })
        }
      })
      .catch(error => {
        if (active) {
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
        }
      })

    return () => {
      active = false
    }
  }, [])

  const report = state.status === 'ready' ? state.report : null
  const overview = useMemo(() => (report ? buildOverview(report) : null), [report])
  const toolGroups = useMemo(() => (report ? buildToolGroups(report) : []), [report])
  const sharedFindings = useMemo(
    () =>
      report
        ? {
            static: report.findings.filter(finding => !Array.isArray(finding.toolIndexes) && !finding.tool),
            semantic: report.semanticFindings.filter(finding => !Array.isArray(finding.toolIndexes) && !finding.tool),
          }
        : { static: [], semantic: [] },
    [report],
  )

  if (state.status === 'loading') {
    return h('main', { className: 'page' }, h('p', { className: 'status-card' }, 'Loading dashboard…'))
  }

  if (state.status === 'error') {
    return h(
      'main',
      { className: 'page' },
      h(
        'section',
        { className: 'status-card status-card-error' },
        h('h1', null, 'Could not load report'),
        h('p', null, state.message),
      ),
    )
  }

  if (!report || !overview) {
    return null
  }

  return h(
    'main',
    { className: 'page' },
    h(
      'section',
      { className: 'hero' },
      h('p', { className: 'eyebrow' }, 'Local dashboard'),
      h('h1', null, `MCP Watchtower · ${report.server}`),
      h('p', { className: 'hero-copy' }, 'Simple local view of scanned tools plus static and semantic findings.'),
    ),
    h(
      'section',
      { className: 'card-grid' },
      h(StatCard, { label: 'Tools', value: String(report.toolCount), detail: `Report v${report.reportVersion}` }),
      h(StatCard, {
        label: 'Static / syntactic',
        value: String(overview.staticFindingCount),
        detail: describePhase(report.analysis.static),
      }),
      h(StatCard, {
        label: 'Semantic',
        value: String(overview.semanticFindingCount),
        detail: describePhase(report.analysis.semantic),
      }),
      h(StatCard, {
        label: 'Updated',
        value: formatTimestamp(report.analysis.semantic.completedAt ?? report.analysis.static.completedAt ?? report.passedAt),
        detail: `${overview.totalFindingCount} total findings`,
      }),
    ),
    renderSharedFindings(sharedFindings),
    h(
      'section',
      { className: 'section' },
      h('div', { className: 'section-heading' }, h('h2', null, 'Tools')),
      h(
        'div',
        { className: 'tool-list' },
        ...toolGroups.map(group =>
          h(ToolCard, {
            key: group.tool.index,
            group,
          }),
        ),
      ),
    ),
  )
}

function StatCard({ label, value, detail }) {
  return h(
    'article',
    { className: 'stat-card' },
    h('p', { className: 'stat-label' }, label),
    h('p', { className: 'stat-value' }, value),
    h('p', { className: 'stat-detail' }, detail),
  )
}

function ToolCard({ group }) {
  const parameterNames = Object.keys(group.tool.inputSchema?.properties ?? {})

  return h(
    'article',
    { className: 'tool-card' },
    h(
      'div',
      { className: 'tool-header' },
      h('div', null, h('h3', null, `#${group.tool.index + 1} ${group.tool.name}`), h('p', { className: 'tool-description' }, group.tool.description || 'No description provided.')),
      h(
        'div',
        { className: 'tool-badges' },
        h(Badge, { tone: group.staticFindings.length > 0 ? 'warning' : 'ok', label: `${group.staticFindings.length} static` }),
        h(Badge, { tone: group.semanticFindings.length > 0 ? 'warning' : 'ok', label: `${group.semanticFindings.length} semantic` }),
      ),
    ),
    parameterNames.length > 0
      ? h('p', { className: 'tool-parameters' }, `Parameters: ${parameterNames.join(', ')}`)
      : null,
    h(FindingSection, { title: 'Static / syntactic', findings: group.staticFindings, kind: 'static' }),
    h(FindingSection, { title: 'Semantic', findings: group.semanticFindings, kind: 'semantic' }),
  )
}

function FindingSection({ title, findings, kind }) {
  return h(
    'section',
    { className: 'finding-section' },
    h('h4', null, title),
    findings.length === 0
      ? h('p', { className: 'empty-copy' }, `No ${kind} findings for this tool.`)
      : h(
          'ul',
          { className: 'finding-list' },
          ...findings.map((finding, index) =>
            h(
              'li',
              { key: `${finding.code}-${index}`, className: 'finding-item' },
              h(
                'div',
                { className: 'finding-title' },
                h(SeverityPill, { severity: finding.severity }),
                h('strong', null, finding.code),
              ),
              h('p', null, finding.message),
              renderFindingMeta(finding),
            ),
          ),
        ),
  )
}

function Badge({ label, tone }) {
  return h('span', { className: `badge badge-${tone}` }, label)
}

function SeverityPill({ severity }) {
  return h('span', { className: `severity severity-${severity}` }, severity)
}

function renderFindingMeta(finding) {
  const details = []

  if (finding.relatedTool) {
    details.push(`Related tool: ${finding.relatedTool}`)
  }

  if (finding.matchedTool) {
    details.push(`Matched tool: ${finding.matchedTool}`)
  }

  if (finding.matchedDisplayName) {
    details.push(`Matched server: ${finding.matchedDisplayName}`)
  }

  if (finding.matchedParameter) {
    details.push(`Matched parameter: ${finding.matchedParameter}`)
  }

  if (typeof finding.similarity === 'number') {
    details.push(`Similarity: ${(finding.similarity * 100).toFixed(0)}%`)
  }

  if (details.length === 0) {
    return null
  }

  return h(
    'ul',
    { className: 'finding-meta' },
    ...details.map((detail, index) => h('li', { key: index }, detail)),
  )
}

function renderSharedFindings(sharedFindings) {
  const total = sharedFindings.static.length + sharedFindings.semantic.length

  if (total === 0) {
    return null
  }

  return h(
    'section',
    { className: 'section' },
    h('div', { className: 'section-heading' }, h('h2', null, 'General findings')),
    h(
      'div',
      { className: 'shared-grid' },
      h(FindingSection, { title: 'Static / syntactic', findings: sharedFindings.static, kind: 'static' }),
      h(FindingSection, { title: 'Semantic', findings: sharedFindings.semantic, kind: 'semantic' }),
    ),
  )
}

function describePhase(phase) {
  if (!phase.ran) {
    return 'Skipped'
  }

  return `${phase.findingCount} findings · ${formatTimestamp(phase.completedAt)}`
}
