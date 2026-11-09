// Shared business rules for change requests.
// RequestService (Requester) and ApprovalService (DataSteward) both register these handlers,
// so every rule lives in exactly one place, whichever service a request comes through.
const cds = require('@sap/cds')

// Field names a change item may touch, grouped by the table they live in
const ADDRESS_FIELDS = ['street', 'houseNumber', 'postalCode', 'city', 'country']
const SUPPLIER_FIELDS = ['name', 'taxNumber']
const TIER_RANK = { L: 1, M: 2, H: 3 }
const TIER_NAME = { L: 'low', M: 'medium', H: 'high' }

// The database tables (not the service projections), so rules see the real stored data
const T = {
  Requests: 'mdcr.ChangeRequests',
  Items: 'mdcr.ChangeItems',
  Suppliers: 'mdcr.Suppliers',
  Addresses: 'mdcr.Addresses',
  Rules: 'mdcr.PostalCodeRules',
  RiskRules: 'mdcr.RiskRules',
  Settings: 'mdcr.Settings',
  Holds: 'mdcr.HoldList'
}

// ---------------------------------------------------------------
// Risk assessment: which approval path a request needs.
// Returns { tier: 'L'|'M'|'H', reason: String } and never throws for business reasons.
// ---------------------------------------------------------------
async function assessRisk(supplier, items, excludeID) {
  const rules = Object.fromEntries((await SELECT.from(T.RiskRules)).map(r => [r.field, r.tier]))
  let tier = 'L', reason = 'Only format corrections (street, house number, postal code)'
  for (const i of items) {
    const t = rules[i.field] ?? 'M'                          // a field without a rule needs a steward
    if (TIER_RANK[t] > TIER_RANK[tier]) { tier = t; reason = `Field "${i.field}" is ${TIER_NAME[t]} risk` }
  }
  if (tier !== 'L') return { tier, reason }

  const setting = async (name, fallback) => (await SELECT.one.from(T.Settings).where({ name }))?.value ?? fallback
  const maxFields = await setting('lowRiskMaxFields', 2)
  if (items.length > maxFields)
    return { tier: 'M', reason: `${items.length} fields changed at once (low risk allows ${maxFields}): treated as a relocation` }

  const maxPer30 = await setting('lowRiskMaxPer30Days', 2)
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const recent = (await SELECT.from(T.Requests).columns('ID')
    .where({ supplier_ID: supplier.ID, status_code: 'A', decidedAt: { '>=': since } }))
    .filter(r => r.ID !== excludeID).length
  if (recent >= maxPer30)
    return { tier: 'M', reason: `${recent} changes applied to this supplier in the last 30 days (low risk allows ${maxPer30})` }

  const today = new Date().toISOString().slice(0, 10)
  const hold = await SELECT.one.from(T.Holds).where({ supplierNo: supplier.supplierNo, holdUntil: { '>=': today } })
  if (hold) return { tier: 'M', reason: `Supplier is on payment hold until ${hold.holdUntil}` }

  return { tier, reason }
}

// Current stored value of a field, for "old value" and for the stale check
const currentValue = (field, supplier, address) =>
  ADDRESS_FIELDS.includes(field) ? address?.[field] : supplier?.[field]

async function loadContext(stored) {
  const items = await SELECT.from(T.Items).where({ parent_ID: stored.ID })
  const supplier = await SELECT.one.from(T.Suppliers).where({ ID: stored.supplier_ID })
  const address = stored.address_ID ? await SELECT.one.from(T.Addresses).where({ ID: stored.address_ID }) : null
  return { items, supplier, address }
}

// Stale check: the supplier data must still equal the "old value" captured when the request was saved
function staleItem({ items, supplier, address }) {
  return items.find(i => (currentValue(i.field, supplier, address) ?? null) !== (i.oldValue ?? null))
}

async function applyItems(stored, items) {
  for (const item of items) {
    if (ADDRESS_FIELDS.includes(item.field)) await UPDATE(T.Addresses).set({ [item.field]: item.newValue }).where({ ID: stored.address_ID })
    else if (SUPPLIER_FIELDS.includes(item.field)) await UPDATE(T.Suppliers).set({ [item.field]: item.newValue }).where({ ID: stored.supplier_ID })
  }
}

// ===============================================================
// Requester side: save (draft activation), edit, delete, submit
// ===============================================================
function registerRequesterRules(srv) {
  const { ChangeRequests, ChangeItems } = srv.entities

  // Items change only together with their request (draft edit + Save).
  srv.before(['CREATE', 'UPDATE', 'DELETE'], ChangeItems, req =>
    req.reject(405, 'Change items can only be changed by editing their request.'))

  srv.before('CREATE', ChangeRequests, req => {
    req.data.status_code = 'N'                               // the client never chooses the status
    req.data.requestedOn = new Date().toISOString().slice(0, 10)
  })

  srv.before('UPDATE', ChangeRequests, async req => {
    const stored = await SELECT.one.from(T.Requests).where({ ID: req.data.ID })
    if (!stored) return
    if (stored.createdBy !== req.user.id) return req.reject(403, 'Only the requester who created this request can change it.')
    if (stored.status_code !== 'N') return req.reject(409, `Request is ${stored.status_code === 'S' ? 'already submitted' : 'already decided'} and can no longer be changed.`)
  })

  srv.before(['CREATE', 'UPDATE'], ChangeRequests, async req => {
    const cr = req.data
    const items = cr.items ?? await SELECT.from(T.Items).where({ parent_ID: cr.ID })
    if (!items.length) return req.reject(400, 'Add at least one field change.')

    const supplierID = cr.supplier_ID ?? (await SELECT.one.from(T.Requests).columns('supplier_ID').where({ ID: cr.ID }))?.supplier_ID
    const supplier = await SELECT.one.from(T.Suppliers).where({ ID: supplierID })
    if (!supplier) return req.reject(400, 'Choose an existing supplier.')

    const addressID = 'address_ID' in cr ? cr.address_ID : (await SELECT.one.from(T.Requests).columns('address_ID').where({ ID: cr.ID }))?.address_ID
    const needsAddress = items.some(i => ADDRESS_FIELDS.includes(i.field))
    const address = addressID ? await SELECT.one.from(T.Addresses).where({ ID: addressID }) : null
    if (needsAddress && !address) return req.reject(400, 'Choose the address you want to change.')
    if (address && address.supplier_ID !== supplier.ID) return req.reject(400, 'The address does not belong to this supplier.')

    // R0: one change per field, and the server records the current value as "old value"
    const seen = new Set()
    for (const item of items) {
      if (seen.has(item.field)) return req.reject(400, `Field "${item.field}" appears twice in this request.`)
      seen.add(item.field)
      const current = currentValue(item.field, supplier, address)
      item.oldValue = current ?? null
      if (String(item.newValue ?? '').trim() === String(current ?? '').trim())
        return req.reject(400, `New value for "${item.field}" is the same as the current value.`)
    }

    // R1: the postal code must match the format of the (new or current) country
    if (address && (seen.has('postalCode') || seen.has('country'))) {
      const country = items.find(i => i.field === 'country')?.newValue ?? address.country
      const postalCode = items.find(i => i.field === 'postalCode')?.newValue ?? address.postalCode
      const rule = await SELECT.one.from(T.Rules).where({ country })
      if (!rule) return req.reject(400, `No postal-code rule is defined for country "${country}".`)
      if (!new RegExp(rule.pattern).test(String(postalCode ?? '').trim()))
        return req.reject(400, `Postal code "${postalCode}" does not match the format for ${country} (example: ${rule.example}).`)
    }

    // Risk tier preview, shown to the requester before submitting (recomputed on submit)
    const risk = await assessRisk(supplier, items, cr.ID)
    cr.riskTier = risk.tier
    cr.riskReason = risk.reason
  })

  srv.before(['EDIT', 'DELETE'], ChangeRequests, async req => {
    const stored = await SELECT.one.from(T.Requests).where({ ID: keyOf(req) })
    if (!stored) return
    if (stored.createdBy !== req.user.id) return req.reject(403, 'Only the requester who created this request can change it.')
    if (stored.status_code !== 'N') return req.reject(409, 'Only new (not yet submitted) requests can be changed or deleted.')
  })

  // Submit: low risk is applied at once (one person + system checks); medium waits for a steward.
  // Every status change is a conditional update ("only if still N"), so a repeated click gets 409.
  srv.on('submit', ChangeRequests, async req => {
    const ID = keyOf(req)
    const stored = await mustExist(req, ID)
    if (!stored) return
    if (stored.createdBy !== req.user.id) return req.reject(403, 'Only the requester who created this request can submit it.')
    if (stored.status_code !== 'N') return req.reject(409, `Request cannot be submitted: its status is "${stored.status_code}", not "N".`)

    const ctx = await loadContext(stored)
    const risk = await assessRisk(ctx.supplier, ctx.items, ID)

    // R4 (TODO – your part, design agreed 8 Nov): one SUBMITTED request per supplier and field group.
    //   Field groups: postalCode + country = one group; every other field is its own group.
    //   1. Here, before the tier branch: INSERT one lock row per field group (an entity such as
    //      OpenLocks, key = supplier + group). A duplicate key -> return req.reject(409, '...').
    //      The database refuses the duplicate, so two submits at the same moment cannot both pass.
    //   2. Low branch below: delete this request's locks right after applyItems (same transaction).
    //   3. registerStewardRules: delete the request's locks in approve and rejectRequest.
    //   Test T13 (remove { todo: true } when done); P4 guide, section 3, has the checks.

    if (risk.tier === 'L') {
      const stale = staleItem(ctx)
      if (stale) return req.reject(409, `Supplier data changed since the request was saved ("${stale.field}" is now "${currentValue(stale.field, ctx.supplier, ctx.address)}"). Create a new request.`)
      const n = await UPDATE(T.Requests).set({
        status_code: 'A', riskTier: 'L', riskReason: risk.reason, approvalMode: 'Auto',
        decidedBy: req.user.id, decidedAt: new Date().toISOString(),
        decisionNote: 'Low risk: applied on submit without a second approver; rules R0 and R1 passed.'
      }).where({ ID, status_code: 'N' })
      if (n !== 1) return req.reject(409, 'Request cannot be submitted: its status changed meanwhile.')
      await applyItems(stored, ctx.items)                    // same transaction: all or nothing
    } else {
      const n = await UPDATE(T.Requests).set({ status_code: 'S', riskTier: risk.tier, riskReason: risk.reason, approvalMode: 'FourEyes' })
        .where({ ID, status_code: 'N' })
      if (n !== 1) return req.reject(409, 'Request cannot be submitted: its status changed meanwhile.')
    }
    return SELECT.one.from(req.subject)     // the service view, incl. calculated fields such as canSubmit
  })
}

// ===============================================================
// Steward side: approve and reject (four-eyes path only)
// ===============================================================
function registerStewardRules(srv) {
  const { ChangeRequests } = srv.entities

  srv.on('approve', ChangeRequests, async req => {
    const ID = keyOf(req)
    const stored = await mustExist(req, ID)
    if (!stored) return
    if (!fourEyesOk(req, stored)) return
    if (stored.status_code !== 'S') return req.reject(409, `Request cannot be approved: its status is "${stored.status_code}", not "S".`)

    const ctx = await loadContext(stored)
    const stale = staleItem(ctx)
    if (stale) return req.reject(409, `Supplier data changed since the request was created ("${stale.field}" is now "${currentValue(stale.field, ctx.supplier, ctx.address)}"). Create a new request.`)

    const n = await UPDATE(T.Requests)
      .set({ status_code: 'A', decidedBy: req.user.id, decidedAt: new Date().toISOString(), decisionNote: req.data.note ?? null })
      .where({ ID, status_code: 'S' })
    if (n !== 1) return req.reject(409, 'Request cannot be approved: its status changed meanwhile.')
    await applyItems(stored, ctx.items)                      // same transaction: all or nothing
    return SELECT.one.from(req.subject)
  })

  srv.on('rejectRequest', ChangeRequests, async req => {
    const ID = keyOf(req)
    const stored = await mustExist(req, ID)
    if (!stored) return
    if (!fourEyesOk(req, stored)) return
    if (!String(req.data.note ?? '').trim()) return req.reject(400, 'A rejection needs a reason.')
    const n = await UPDATE(T.Requests)
      .set({ status_code: 'R', decidedBy: req.user.id, decidedAt: new Date().toISOString(), decisionNote: req.data.note })
      .where({ ID, status_code: 'S' })
    if (n !== 1) return req.reject(409, `Request cannot be rejected: its status is "${stored.status_code}", not "S".`)
    return SELECT.one.from(req.subject)
  })
}

// R2 four-eyes: nobody decides their own request
function fourEyesOk(req, stored) {
  if (stored.createdBy === req.user.id) { req.reject(403, 'Four-eyes rule: you cannot decide a request you created yourself.'); return false }
  return true
}

async function mustExist(req, ID) {
  const stored = await SELECT.one.from(T.Requests).where({ ID })
  if (!stored) req.reject(404, `Change request ${ID} not found.`)
  return stored
}

function keyOf(req) {
  const p = req.params?.[0]
  return typeof p === 'object' ? p.ID : p ?? req.data?.ID
}

module.exports = { registerRequesterRules, registerStewardRules, assessRisk, T, ADDRESS_FIELDS, SUPPLIER_FIELDS }
