const cds = require('@sap/cds')

// Fields whose risk tier must never drop below medium: they change identity or legal location.
const FLOOR_MEDIUM = ['name', 'taxNumber', 'country']
const SETTING_BOUNDS = { lowRiskMaxFields: [1, 5], lowRiskMaxPer30Days: [0, 10] }

module.exports = class ConfigService extends cds.ApplicationService {
  init() {
    const { PostalCodeRules, RiskRules, Settings, Thresholds } = this.entities

    // A merged view of stored row + incoming change, so PATCH-style updates are checked whole
    const merged = async req => {
      const stored = req.event === 'UPDATE' ? await SELECT.one.from(req.subject) : null
      return { ...(stored ?? {}), ...req.data }
    }

    this.before(['CREATE', 'UPDATE'], PostalCodeRules, async req => {
      const r = await merged(req)
      if (!/^[A-Z]{2}$/.test(r.country ?? '')) return req.reject(400, 'Country must be a two-letter ISO code in capitals, e.g. DE.', 'country')
      let re
      try { re = new RegExp(r.pattern) } catch { return req.reject(400, `"${r.pattern}" is not a valid regular expression.`, 'pattern') }
      if (!String(r.pattern).startsWith('^') || !String(r.pattern).endsWith('$'))
        return req.reject(400, 'The pattern must start with ^ and end with $, so it checks the whole postal code.', 'pattern')
      if (!r.example || !re.test(r.example)) return req.reject(400, `The example "${r.example ?? ''}" must match the pattern.`, 'example')
    })

    this.before(['CREATE', 'UPDATE'], RiskRules, async req => {
      const r = await merged(req)
      if (FLOOR_MEDIUM.includes(r.field) && r.tier === 'L')
        return req.reject(400, `"${r.field}" changes the supplier's identity or legal location; its tier cannot be lower than M.`, 'tier')
    })

    this.before('UPDATE', Settings, async req => {
      const r = await merged(req)
      const bounds = SETTING_BOUNDS[r.name]
      if (!bounds) return req.reject(400, `Unknown setting "${r.name}".`)
      if (!Number.isInteger(r.value) || r.value < bounds[0] || r.value > bounds[1])
        return req.reject(400, `${r.name} must be a whole number from ${bounds[0]} to ${bounds[1]}.`, 'value')
    })

    this.before(['CREATE', 'UPDATE'], Thresholds, async req => {
      const r = await merged(req)
      if (!/^[A-Z]{3}$/.test(r.currency ?? '')) return req.reject(400, 'Currency must be a three-letter ISO code in capitals, e.g. EUR.', 'currency')
      if (!(Number(r.amount) > 0)) return req.reject(400, 'The threshold amount must be greater than zero.', 'amount')
    })

    return super.init()
  }
}

