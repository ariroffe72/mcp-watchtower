import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildToolGroups, buildOverview } from '../dashboard/report-utils.js'
import {
  closeDashboardServer,
  loadScanReport,
  startDashboardServer,
} from '../cli/dashboard.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const fixtureReportPath = join(ROOT, 'tests', 'fixtures', 'dashboard-report.json')

describe('dashboard utilities', () => {
  it('groups static and semantic findings under each tool', async () => {
    const report = await loadScanReport(fixtureReportPath)
    const groups = buildToolGroups(report)
    const overview = buildOverview(report)

    expect(overview).toEqual({
      staticFindingCount: 1,
      semanticFindingCount: 1,
      totalFindingCount: 2,
    })
    expect(groups).toHaveLength(2)
    expect(groups[0].staticFindings).toHaveLength(1)
    expect(groups[0].semanticFindings).toHaveLength(1)
    expect(groups[1].staticFindings).toHaveLength(1)
    expect(groups[1].semanticFindings).toHaveLength(0)
  })
})

describe('dashboard server', () => {
  it('serves the dashboard shell and report API from a saved report', async () => {
    const { server, url } = await startDashboardServer({
      input: fixtureReportPath,
      host: '127.0.0.1',
      port: 0,
    })

    try {
      const [htmlResponse, scriptResponse, apiResponse] = await Promise.all([
        fetch(url),
        fetch(`${url}/main.js`),
        fetch(`${url}/api/report`),
      ])

      expect(htmlResponse.status).toBe(200)
      expect(await htmlResponse.text()).toContain('<div id="app"></div>')

      expect(scriptResponse.status).toBe(200)
      expect(scriptResponse.headers.get('content-type')).toContain('text/javascript')

      expect(apiResponse.status).toBe(200)
      const report = await apiResponse.json()
      expect(report.server).toBe('demo-server')
      expect(report.tools).toHaveLength(2)
      expect(report.semanticFindings).toHaveLength(1)
    } finally {
      await closeDashboardServer(server)
    }
  })
})
