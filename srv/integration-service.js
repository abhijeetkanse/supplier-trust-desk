const cds = require('@sap/cds')

// Rules P4 enforces for every caller, so the central data stays consistent
// even if a calling app has a bug. P2/P3 keep their own process rules
// (roles of their users, S/4 checks) in their own code.
module.exports = class IntegrationService extends cds.ApplicationService {
  init() {
    const { InvoiceDecisions, Issues } = this.entities

    // ---- P2: InvoiceDecisions ------------------------------------------------
    this.before(['CREATE', 'UPDATE'], InvoiceDecisions, async req => {
      if (req.event === 'CREATE') {
        const { source, SupplierInvoice, FiscalYear } = req.data
        if (await SELECT.one.from(InvoiceDecisions).columns('source').where({ source, SupplierInvoice, FiscalYear }))
          return req.reject(409, 'A decision for this invoice already exists. Change it with PUT or PATCH.')
      }
      const merged = { ...(await existing(req)), ...req.data }
      if (merged.decision === 'Escalate' && !merged.note?.trim())
        return req.reject(400, 'An escalation needs a note.', 'note')
      if (req.event === 'CREATE' && !req.data.decidedAt) req.data.decidedAt = new Date().toISOString()
      if (req.event === 'UPDATE' && 'decision' in req.data && !req.data.decidedAt) req.data.decidedAt = new Date().toISOString()
    })

    // ---- P3: Issues ------------------------------------------------------------
    this.before(['CREATE', 'UPDATE'], Issues, async req => {
      if (req.event === 'CREATE') {
        const { partnerId, addressId, field, rule } = req.data
        const dup = await SELECT.one.from(Issues).columns('ID').where({ partnerId, addressId, field, rule })
        if (dup) return req.reject(409, `This finding already exists as issue ${dup.ID}. Update that issue or use importFindings.`)
      }
      const merged = { ...(await existing(req)), ...req.data }
      if (merged.status === 'InProgress' && !merged.owner?.trim())
        return req.reject(409, 'Assign an owner before starting work on this issue.', 'owner')
      if (merged.status === 'FalseAlarm' && !merged.falseAlarmReason?.trim())
        return req.reject(400, 'A false alarm needs a reason.', 'falseAlarmReason')
    })

    // P3 imports P1's findings: one issue per partner + address + field + rule.
    // New finding -> new Open issue. Known finding -> current value and check time
    // are refreshed; its status, owner and notes are left alone.
    this.on('importFindings', async req => {
      const report = { created: 0, merged: 0, rejected: 0, errors: [] }
      const FIELDS = ['StreetName', 'HouseNumber', 'PostalCode', 'CityName', 'Country']
      const SEVERITIES = ['High', 'Medium', 'Low']
      const now = new Date().toISOString()

      for (const [i, f] of (req.data.findings ?? []).entries()) {
        const row = `Row ${i + 1}`
        if (!f?.partnerId || !f.addressId || !f.field || !f.rule) {
          report.rejected++; report.errors.push(`${row}: partnerId, addressId, field and rule are required`); continue
        }
        if (!FIELDS.includes(f.field)) {
          report.rejected++; report.errors.push(`${row}: unknown field "${f.field}"`); continue
        }
        if (f.severity && !SEVERITIES.includes(f.severity)) {
          report.rejected++; report.errors.push(`${row}: unknown severity "${f.severity}"`); continue
        }
        const key = { partnerId: f.partnerId, addressId: f.addressId, field: f.field, rule: f.rule }
        const found = await SELECT.one.from(Issues).columns('ID').where(key)
        if (found) {
          await UPDATE(Issues, found.ID).with({
            currentValue: f.currentValue ?? null, lastCheckedAt: now, ...(f.severity && { severity: f.severity })
          })
          report.merged++
        } else {
          await INSERT.into(Issues).entries({
            ...key, severity: f.severity ?? 'Medium', status: 'Open', currentValue: f.currentValue ?? null, lastCheckedAt: now
          })
          report.created++
        }
      }
      return report
    })

    return super.init()
  }
}

// The row as it is stored now (empty for a new row), so rules can look at
// the combination of stored values and the values being changed.
async function existing(req) {
  if (req.event !== 'UPDATE') return {}
  return (await SELECT.one.from(req.subject)) ?? {}
}
