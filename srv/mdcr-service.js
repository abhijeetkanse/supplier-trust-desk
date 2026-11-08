const cds = require('@sap/cds')

// Field names a change item may touch, grouped by the table they live in
const ADDRESS_FIELDS = ['street', 'houseNumber', 'postalCode', 'city', 'country']
const SUPPLIER_FIELDS = ['name', 'taxNumber']

// The database tables (not the service projections), so rules see the real stored data
const T = {
  Requests: 'mdcr.ChangeRequests',
  Items: 'mdcr.ChangeItems',
  Suppliers: 'mdcr.Suppliers',
  Addresses: 'mdcr.Addresses',
  Rules: 'mdcr.PostalCodeRules'
}

module.exports = class MasterDataService extends cds.ApplicationService {
  init() {
    const { ChangeRequests, ChangeItems } = this.entities

    // Items change only together with their request (draft edit + Save).
    // A direct write on a saved item would bypass every rule below, so it is refused.
    this.before(['CREATE', 'UPDATE', 'DELETE'], ChangeItems, req =>
      req.reject(405, 'Change items can only be changed by editing their request.'))

    // ---------------------------------------------------------------
    // Saving a request (Fiori "Save" = draft activation -> CREATE/UPDATE)
    // ---------------------------------------------------------------
    this.before('CREATE', ChangeRequests, req => {
      req.data.status_code = 'N'            // the client never chooses the status
    })

    this.before('UPDATE', ChangeRequests, async req => {
      const stored = await SELECT.one.from(T.Requests).where({ ID: req.data.ID })
      if (!stored) return
      if (stored.createdBy !== req.user.id) return req.reject(403, 'Only the requester who created this request can change it.')
      if (stored.status_code !== 'N') return req.reject(409, `Request is ${stored.status_code === 'S' ? 'already submitted' : 'already decided'} and can no longer be changed.`)
    })

    this.before(['CREATE', 'UPDATE'], ChangeRequests, async req => {
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
        const current = ADDRESS_FIELDS.includes(item.field) ? address[item.field] : supplier[item.field]
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

      // R4 (TODO – your part): only one open request (status N or S) per supplier and field.
      //   Hint: SELECT from T.Items joined to its parent request, where field is one of `seen`,
      //   parent.supplier_ID = supplier.ID, parent.status_code in ('N','S') and parent.ID != cr.ID.
      //   If anything is found: return req.reject(409, '...')
    })

    this.before(['EDIT', 'DELETE'], ChangeRequests, async req => {
      const stored = await SELECT.one.from(T.Requests).where({ ID: keyOf(req) })
      if (!stored) return
      if (stored.createdBy !== req.user.id) return req.reject(403, 'Only the requester who created this request can change it.')
      if (stored.status_code !== 'N') return req.reject(409, 'Only new (not yet submitted) requests can be changed or deleted.')
    })

    // ---------------------------------------------------------------
    // Workflow actions. Each one changes the status with a *conditional*
    // update ("only if it is still in the expected status"), so a repeated
    // or stale click changes nothing and gets 409.
    // ---------------------------------------------------------------
    this.on('submit', ChangeRequests, async req => {
      const ID = keyOf(req)
      const stored = await mustExist(req, ID)
      if (!stored) return
      if (stored.createdBy !== req.user.id) return req.reject(403, 'Only the requester who created this request can submit it.')
      const n = await UPDATE(T.Requests).set({ status_code: 'S' }).where({ ID, status_code: 'N' })
      if (n !== 1) return req.reject(409, `Request cannot be submitted: its status is "${stored.status_code}", not "N".`)
      return SELECT.one.from(T.Requests).where({ ID })
    })

    this.on('approve', ChangeRequests, async req => {
      const ID = keyOf(req)
      const stored = await mustExist(req, ID)
      if (!stored) return
      if (!fourEyesOk(req, stored)) return

      // Stale check: the supplier data must still equal the "old value" captured at request time
      const items = await SELECT.from(T.Items).where({ parent_ID: ID })
      const supplier = await SELECT.one.from(T.Suppliers).where({ ID: stored.supplier_ID })
      const address = stored.address_ID ? await SELECT.one.from(T.Addresses).where({ ID: stored.address_ID }) : null
      for (const item of items) {
        const current = ADDRESS_FIELDS.includes(item.field) ? address?.[item.field] : supplier?.[item.field]
        if ((current ?? null) !== (item.oldValue ?? null))
          return req.reject(409, `Supplier data changed since the request was created ("${item.field}" is now "${current}"). Create a new request.`)
      }

      const n = await UPDATE(T.Requests)
        .set({ status_code: 'A', decidedBy: req.user.id, decidedAt: new Date().toISOString(), decisionNote: req.data.note ?? null })
        .where({ ID, status_code: 'S' })
      if (n !== 1) return req.reject(409, `Request cannot be approved: its status is "${stored.status_code}", not "S".`)

      // Apply the approved values to the supplier record (same transaction: all or nothing)
      for (const item of items) {
        if (ADDRESS_FIELDS.includes(item.field)) await UPDATE(T.Addresses).set({ [item.field]: item.newValue }).where({ ID: stored.address_ID })
        else if (SUPPLIER_FIELDS.includes(item.field)) await UPDATE(T.Suppliers).set({ [item.field]: item.newValue }).where({ ID: stored.supplier_ID })
      }
      return SELECT.one.from(T.Requests).where({ ID })
    })

    this.on('rejectRequest', ChangeRequests, async req => {
      const ID = keyOf(req)
      const stored = await mustExist(req, ID)
      if (!stored) return
      if (!fourEyesOk(req, stored)) return
      if (!String(req.data.note ?? '').trim()) return req.reject(400, 'A rejection needs a reason.')
      const n = await UPDATE(T.Requests)
        .set({ status_code: 'R', decidedBy: req.user.id, decidedAt: new Date().toISOString(), decisionNote: req.data.note })
        .where({ ID, status_code: 'S' })
      if (n !== 1) return req.reject(409, `Request cannot be rejected: its status is "${stored.status_code}", not "S".`)
      return SELECT.one.from(T.Requests).where({ ID })
    })

    return super.init()
  }
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
