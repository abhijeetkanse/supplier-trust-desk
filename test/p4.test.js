// Automated tests for the P4 business rules, through the role-based services. Run: npm test
// Each test calls the OData API exactly like the Fiori apps do, as one of the mocked users:
//   rita, raj = Requester · sam = DataSteward · mixa = Requester + DataSteward (only for R2 tests)
//   aud = Auditor · ops = RuleAdmin · nobody = no role
const cds = require('@sap/cds')
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { axios } = cds.test(__dirname + '/..')
axios.defaults.validateStatus = () => true          // we check status codes ourselves

const REQ = '/odata/v4/requests', APR = '/odata/v4/approvals', SUP = '/odata/v4/suppliers'
const INS = '/odata/v4/insights', CFG = '/odata/v4/config', USR = '/odata/v4/user'
const as = user => ({ auth: { username: user, password: user } })

const NORDLICHT = '11111111-0000-4000-8000-000000000001', NORDLICHT_ADDR = '22222222-0000-4000-8000-000000000001' // DE, postal code 6919 (4 digits: wrong)
const ATELIER   = '11111111-0000-4000-8000-000000000002', ATELIER_ADDR   = '22222222-0000-4000-8000-000000000002' // FR
const MOLENWEG  = '11111111-0000-4000-8000-000000000003', MOLENWEG_ADDR  = '22222222-0000-4000-8000-000000000003' // NL
const REDWOOD   = '11111111-0000-4000-8000-000000000004', REDWOOD_ADDR   = '22222222-0000-4000-8000-000000000004' // US, on payment hold (seed)
const QUILLMOOR = '11111111-0000-4000-8000-000000000005', QUILLMOOR_ADDR = '22222222-0000-4000-8000-000000000005' // GB

// Fiori flow in the Requester app: create a draft, then activate it (= "Save")
async function saveRequest(user, body) {
  const draft = await axios.post(`${REQ}/ChangeRequests`, body, as(user))
  if (draft.status !== 201) return draft
  return axios.post(`${REQ}/ChangeRequests(ID=${draft.data.ID},IsActiveEntity=false)/RequestService.draftActivate`, {}, as(user))
}
const submit = (user, ID) => axios.post(`${REQ}/ChangeRequests(ID=${ID},IsActiveEntity=true)/RequestService.submit`, {}, as(user))
const decide = (user, ID, name, body = {}) => axios.post(`${APR}/ChangeRequests(${ID})/ApprovalService.${name}`, body, as(user))
const nameChange = (supplier_ID, newValue, reason = 'Legal name changed') => ({ supplier_ID, reason, items: [{ field: 'name', newValue }] })

// Fiori flow in the Rules app (draft-enabled): create, or edit an existing row, then Save
async function cfgCreate(set, body, user = 'ops') {
  const d = await axios.post(`${CFG}/${set}`, body, as(user))
  if (d.status !== 201) return d
  const key = Object.entries(body).filter(([k]) => ['country', 'field', 'currency', 'name'].includes(k)).map(([k, v]) => `${k}='${v}'`)[0]
  return axios.post(`${CFG}/${set}(${key},IsActiveEntity=false)/ConfigService.draftActivate`, {}, as(user))
}
async function cfgEdit(set, key, patch, user = 'ops') {
  const e = await axios.post(`${CFG}/${set}(${key},IsActiveEntity=true)/ConfigService.draftEdit`, { PreserveChanges: true }, as(user))
  if (e.status !== 201 && e.status !== 200) return e
  const p = await axios.patch(`${CFG}/${set}(${key},IsActiveEntity=false)`, patch, as(user))
  if (p.status >= 300) return p
  return axios.post(`${CFG}/${set}(${key},IsActiveEntity=false)/ConfigService.draftActivate`, {}, as(user))
}

describe('P4 change requests: saving and rules', () => {
  let lowID

  it('T01 a requester saves a valid request; status New, old value filled by the server, risk tier shown', async () => {
    const res = await saveRequest('rita', {
      supplier_ID: NORDLICHT, address_ID: NORDLICHT_ADDR, reason: 'Postal code has only 4 digits',
      items: [{ field: 'postalCode', newValue: '69190', oldValue: 'fake' }]
    })
    assert.equal(res.status, 201, JSON.stringify(res.data))
    lowID = res.data.ID
    assert.equal(res.data.status_code, 'N')
    assert.equal(res.data.riskTier, 'L')
    assert.equal(res.data.canSubmit, true)
    const items = await axios.get(`${REQ}/ChangeRequests(ID=${lowID},IsActiveEntity=true)/items`, as('rita'))
    assert.equal(items.data.value[0].oldValue, '6919')
  })

  it('T02 R1: a postal code in the wrong format for the country is rejected with 400', async () => {
    const res = await saveRequest('rita', { supplier_ID: NORDLICHT, address_ID: NORDLICHT_ADDR, reason: 'Fix postal code', items: [{ field: 'postalCode', newValue: '6919X' }] })
    assert.equal(res.status, 400)
    assert.match(res.data.error.message, /does not match the format for DE/)
  })

  it('T03 a request without a reason or without changes is rejected', async () => {
    assert.equal((await saveRequest('rita', { supplier_ID: QUILLMOOR, reason: 'Nothing to change', items: [] })).status, 400)
    assert.equal((await saveRequest('rita', { supplier_ID: QUILLMOOR, items: [{ field: 'name', newValue: 'Quillmoor Packaging Limited' }] })).status, 400)
  })

  it('T04 an auditor, a steward without the Requester role, and a user without role cannot create requests (403)', async () => {
    for (const u of ['aud', 'sam', 'nobody'])
      assert.equal((await axios.post(`${REQ}/ChangeRequests`, { supplier_ID: QUILLMOOR, reason: 'x' }, as(u))).status, 403, u)
  })

  it('T17 a request may only target allowed fields, never control fields (400)', async () => {
    const res = await saveRequest('rita', { supplier_ID: NORDLICHT, reason: 'Sneaky', items: [{ field: 'decidedBy', newValue: 'rita' }] })
    assert.equal(res.status, 400, JSON.stringify(res.data))
  })

  it('T18 low risk: submitting a format correction applies it at once, by one person, with an audit record', async () => {
    const res = await submit('rita', lowID)
    assert.equal(res.status, 200, JSON.stringify(res.data))
    assert.equal(res.data.status_code, 'A')
    assert.equal(res.data.approvalMode, 'Auto')
    assert.equal(res.data.decidedBy, 'rita')
    assert.equal(res.data.canSubmit, false)
    const addr = await axios.get(`${SUP}/Addresses(${NORDLICHT_ADDR})`, as('aud'))
    assert.equal(addr.data.postalCode, '69190')
    assert.equal((await submit('rita', lowID)).status, 409)                 // repeated click changes nothing
  })
})

describe('P4 change requests: four-eyes path (medium risk)', () => {
  let midID

  it('T05 only the creator can submit; a medium-risk request waits for a steward; a repeated submit gives 409', async () => {
    const r = await saveRequest('rita', nameChange(ATELIER, 'Atelier Brumevent SAS'))
    assert.equal(r.status, 201, JSON.stringify(r.data)); midID = r.data.ID
    assert.equal(r.data.riskTier, 'M')
    assert.equal((await submit('raj', midID)).status, 403)
    const s = await submit('rita', midID)
    assert.equal(s.status, 200, JSON.stringify(s.data))
    assert.equal(s.data.status_code, 'S'); assert.equal(s.data.approvalMode, 'FourEyes')
    assert.equal((await submit('rita', midID)).status, 409)
  })

  it('T06 a requester cannot open the approval service at all (403: wrong role)', async () => {
    assert.equal((await decide('rita', midID, 'approve')).status, 403)
    assert.equal((await axios.get(`${APR}/ChangeRequests`, as('rita'))).status, 403)
  })

  it('T07 R2 four-eyes: a user with both roles cannot decide their own request (403), and sees canDecide = false', async () => {
    const own = await saveRequest('mixa', nameChange(QUILLMOOR, 'Quillmoor Packaging Limited'))
    assert.equal(own.status, 201, JSON.stringify(own.data))
    assert.equal((await submit('mixa', own.data.ID)).status, 200)
    const flag = await axios.get(`${APR}/ChangeRequests(${own.data.ID})?$select=canDecide`, as('mixa'))
    assert.equal(flag.data.canDecide, false)
    const res = await decide('mixa', own.data.ID, 'approve')
    assert.equal(res.status, 403)
    assert.match(res.data.error.message, /Four-eyes/)
  })

  it('T08 a steward sees canDecide = true, approves, and the new value is applied to the supplier record', async () => {
    const flag = await axios.get(`${APR}/ChangeRequests(${midID})?$select=canDecide`, as('sam'))
    assert.equal(flag.data.canDecide, true)
    const res = await decide('sam', midID, 'approve', { note: 'Checked against the commercial register extract' })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    assert.equal(res.data.status_code, 'A'); assert.equal(res.data.decidedBy, 'sam'); assert.equal(res.data.canDecide, false)
    const sup = await axios.get(`${SUP}/Suppliers(${ATELIER})`, as('aud'))
    assert.equal(sup.data.name, 'Atelier Brumevent SAS')
  })

  it('T09 a decided request cannot be approved or rejected again (409)', async () => {
    assert.equal((await decide('sam', midID, 'approve')).status, 409)
    assert.equal((await decide('sam', midID, 'rejectRequest', { note: 'late' })).status, 409)
  })

  it('T10 a rejection needs a reason (400), then works with one', async () => {
    const r = await saveRequest('raj', { supplier_ID: QUILLMOOR, reason: 'New tax number', items: [{ field: 'taxNumber', newValue: 'GB999999999' }] })
    assert.equal(r.status, 201, JSON.stringify(r.data))
    await submit('raj', r.data.ID)
    assert.equal((await decide('sam', r.data.ID, 'rejectRequest', { note: '  ' })).status, 400)
    const ok = await decide('sam', r.data.ID, 'rejectRequest', { note: 'No proof attached' })
    assert.equal(ok.status, 200); assert.equal(ok.data.status_code, 'R')
  })

  it('T11 stale approval: the stored value changed after the request was saved -> 409, nothing applied', async () => {
    const a = await saveRequest('rita', { supplier_ID: QUILLMOOR, reason: 'Typo', items: [{ field: 'taxNumber', newValue: 'GB123456780' }] })
    assert.equal(a.status, 201)
    assert.equal((await submit('rita', a.data.ID)).status, 200)
    // the value changes outside this request, as a data sync or a database fix would do
    await UPDATE('mdcr.Suppliers').set({ taxNumber: 'GB000000000' }).where({ ID: QUILLMOOR })
    const stale = await decide('sam', a.data.ID, 'approve')
    assert.equal(stale.status, 409)
    assert.match(stale.data.error.message, /changed since the request was created/)
    assert.equal((await SELECT.one.from('mdcr.Suppliers').where({ ID: QUILLMOOR })).taxNumber, 'GB000000000')
    assert.equal((await decide('sam', a.data.ID, 'rejectRequest', { note: 'Data changed meanwhile' })).status, 200)
  })
})

describe('P4 risk escalation: when "low" is not low', () => {
  it('T19 more than 2 fields at once counts as a relocation: medium, needs a steward', async () => {
    const r = await saveRequest('rita', { supplier_ID: ATELIER, address_ID: ATELIER_ADDR, reason: 'Moved',
      items: [{ field: 'street', newValue: 'Rue Neuve' }, { field: 'houseNumber', newValue: '10' }, { field: 'postalCode', newValue: '69003' }] })
    assert.equal(r.status, 201, JSON.stringify(r.data))
    assert.equal(r.data.riskTier, 'M'); assert.match(r.data.riskReason, /relocation/)
    assert.equal((await submit('rita', r.data.ID)).data.status_code, 'S')
  })

  it('T20 frequency: after 2 applied changes in 30 days, the next low-risk change for that supplier needs a steward', async () => {
    for (const [i, street] of ['Molenweg-Oost', 'Molenweg Oost'].entries()) {
      const r = await saveRequest(i ? 'raj' : 'rita', { supplier_ID: MOLENWEG, address_ID: MOLENWEG_ADDR, reason: 'Street spelling', items: [{ field: 'street', newValue: street }] })
      assert.equal(r.data.riskTier, 'L', JSON.stringify(r.data))
      assert.equal((await submit(i ? 'raj' : 'rita', r.data.ID)).data.status_code, 'A')
    }
    const third = await saveRequest('rita', { supplier_ID: MOLENWEG, address_ID: MOLENWEG_ADDR, reason: 'House number format', items: [{ field: 'houseNumber', newValue: '41A' }] })
    assert.equal(third.data.riskTier, 'M'); assert.match(third.data.riskReason, /last 30 days/)
    assert.equal((await submit('rita', third.data.ID)).data.status_code, 'S')
  })

  it('T21 a supplier on payment hold: even a format correction needs a steward', async () => {
    const r = await saveRequest('rita', { supplier_ID: REDWOOD, address_ID: REDWOOD_ADDR, reason: 'US ZIP has a state prefix', items: [{ field: 'postalCode', newValue: '95814' }] })
    assert.equal(r.status, 201, JSON.stringify(r.data))
    assert.equal(r.data.riskTier, 'M'); assert.match(r.data.riskReason, /payment hold/)
  })
})

describe('P4 access: each role sees only its own work', () => {
  it('T22 a requester sees only her own requests; another requester gets 404 on a direct link', async () => {
    const r = await saveRequest('rita', nameChange(NORDLICHT, 'Nordlicht Office GmbH'))
    assert.equal(r.status, 201, JSON.stringify(r.data))
    const raj = await axios.get(`${REQ}/ChangeRequests`, as('raj'))
    assert.ok(raj.data.value.every(x => x.createdBy === 'raj'))
    assert.equal((await axios.get(`${REQ}/ChangeRequests(ID=${r.data.ID},IsActiveEntity=true)`, as('raj'))).status, 404)
    const items = await axios.get(`${REQ}/ChangeItems`, as('raj'))
    assert.ok(items.data.value.every(i => i.parent_ID !== r.data.ID))       // nor her change items
  })

  it('T14 a submitted request cannot be opened for editing (409); another requester cannot edit it (403)', async () => {
    const r = await saveRequest('rita', { supplier_ID: QUILLMOOR, reason: 'City spelling', address_ID: QUILLMOOR_ADDR, items: [{ field: 'city', newValue: 'Leeds City' }] })
    assert.equal(r.status, 201, JSON.stringify(r.data))
    const edit = (u, ID) => axios.post(`${REQ}/ChangeRequests(ID=${ID},IsActiveEntity=true)/RequestService.draftEdit`, { PreserveChanges: true }, as(u))
    assert.equal((await edit('raj', r.data.ID)).status, 403)
    await submit('rita', r.data.ID)
    assert.equal((await edit('rita', r.data.ID)).status, 409)
  })

  it('T15 a saved change item cannot be deleted or changed directly, only via its request (405)', async () => {
    const r = await saveRequest('raj', { supplier_ID: QUILLMOOR, reason: 'Street typo', address_ID: QUILLMOOR_ADDR, items: [{ field: 'street', newValue: 'Quillmoor Road' }] })
    assert.equal(r.status, 201, JSON.stringify(r.data))
    const items = await axios.get(`${REQ}/ChangeRequests(ID=${r.data.ID},IsActiveEntity=true)/items`, as('raj'))
    const itemID = items.data.value[0].ID
    assert.equal((await axios.delete(`${REQ}/ChangeItems(ID=${itemID},IsActiveEntity=true)`, as('raj'))).status, 405)
    const patch = await axios.patch(`${REQ}/ChangeItems(ID=${itemID},IsActiveEntity=true)`, { newValue: 'x' }, as('raj'))
    assert.equal(patch.status, 422)                                       // CAP: draft children change only via their root
    assert.equal(patch.data.error.code, 'DRAFT_MODIFICATION_ONLY_VIA_ROOT')
    const after = await axios.get(`${SUP}/ChangeItems?$filter=parent_ID eq ${r.data.ID}`, as('aud'))
    assert.equal(after.data.value.length, 1)
  })

  it('T16 supplier records cannot be written directly, even by a steward (405)', async () => {
    assert.equal((await axios.patch(`${SUP}/Suppliers(${NORDLICHT})`, { name: 'Hijacked GmbH' }, as('sam'))).status, 405)
    assert.equal((await axios.delete(`${SUP}/Suppliers(${NORDLICHT})`, as('sam'))).status, 405)
    assert.equal((await axios.patch(`${SUP}/Addresses(${NORDLICHT_ADDR})`, { postalCode: '00000' }, as('sam'))).status, 405)
  })

  it('T12 nobody without a role can read suppliers (403)', async () => {
    assert.equal((await axios.get(`${SUP}/Suppliers`, as('nobody'))).status, 403)
  })

  it('T31 a requester cannot set the status, risk tier or decision fields herself (fix 9 Nov)', async () => {
    const r = await saveRequest('raj', nameChange(MOLENWEG, 'Molenweg Logistics B.V.'))
    assert.equal(r.status, 201, JSON.stringify(r.data))
    await axios.post(`${REQ}/ChangeRequests(ID=${r.data.ID},IsActiveEntity=true)/RequestService.draftEdit`, { PreserveChanges: true }, as('raj'))
    await axios.patch(`${REQ}/ChangeRequests(ID=${r.data.ID},IsActiveEntity=false)`,
      { status_code: 'A', riskTier: 'L', approvalMode: 'Auto', decidedBy: 'sam', reason: 'Legal name changed (edited)' }, as('raj'))
    const saved = await axios.post(`${REQ}/ChangeRequests(ID=${r.data.ID},IsActiveEntity=false)/RequestService.draftActivate`, {}, as('raj'))
    assert.equal(saved.status, 200, JSON.stringify(saved.data))
    assert.equal(saved.data.reason, 'Legal name changed (edited)')        // the allowed edit is kept
    assert.equal(saved.data.status_code, 'N'); assert.equal(saved.data.riskTier, 'M')
    assert.equal(saved.data.approvalMode, null); assert.equal(saved.data.decidedBy, null)
  })

  it('T23 who am I: the launch page gets exactly the roles of the logged-in user', async () => {
    const rita = await axios.get(`${USR}/whoAmI()`, as('rita'))
    assert.deepEqual(rita.data.roles, ['Requester'])
    const mixa = await axios.get(`${USR}/whoAmI()`, as('mixa'))
    assert.deepEqual(mixa.data.roles, ['Requester', 'DataSteward'])
    assert.deepEqual((await axios.get(`${USR}/whoAmI()`, as('nobody'))).data.roles, [])
  })

  // R4 is your part: once implemented, remove { todo: true }
  it('T13 R4: only one submitted request per supplier and field (409 on the second submit)', { todo: true }, async () => {
    const first = await saveRequest('rita', nameChange(MOLENWEG, 'Molenweg Logistics B.V.', 'Rename'))
    assert.equal(first.status, 201)
    assert.equal((await submit('rita', first.data.ID)).status, 200)       // medium: Submitted, lock held
    const second = await saveRequest('raj', nameChange(MOLENWEG, 'Molenweg Logistiek N.V.', 'Rename too'))
    assert.equal(second.status, 201)                                        // saving is allowed
    assert.equal((await submit('raj', second.data.ID)).status, 409)        // submitting is not
  })
})

describe('P4 rule administration (CRUD with checks)', () => {
  it('T24 RuleAdmin creates, changes and deletes a postal-code rule; bad rules are refused (400)', async () => {
    assert.equal((await cfgCreate('PostalCodeRules', { country: 'PT', pattern: '^[0-9]{4}-[0-9]{3}$', example: '1000-001' })).status, 201)
    assert.equal((await cfgCreate('PostalCodeRules', { country: 'BE', pattern: '^[0-9{4}$', example: '1000' })).status, 400)   // broken regex
    assert.equal((await cfgCreate('PostalCodeRules', { country: 'DK', pattern: '[0-9]{4}', example: '1000' })).status, 400)    // not anchored
    assert.equal((await cfgCreate('PostalCodeRules', { country: 'SE', pattern: '^[0-9]{3} ?[0-9]{2}$', example: '1234' })).status, 400) // example does not match
    const changed = await cfgEdit('PostalCodeRules', "country='PT'", { example: '4000-123' })
    assert.equal(changed.status, 200, JSON.stringify(changed.data))
    assert.equal(changed.data.modifiedBy, 'ops')                          // rule changes are audited
    assert.equal((await axios.delete(`${CFG}/PostalCodeRules(country='PT',IsActiveEntity=true)`, as('ops'))).status, 204)
  })

  it('T25 risk tiers can be tightened, but name, tax number and country never go below medium (400)', async () => {
    assert.equal((await cfgEdit('RiskRules', "field='name'", { tier: 'L' })).status, 400)
    const tighter = await cfgEdit('RiskRules', "field='street'", { tier: 'M' })
    assert.equal(tighter.status, 200, JSON.stringify(tighter.data))
    const r = await saveRequest('rita', { supplier_ID: QUILLMOOR, address_ID: QUILLMOOR_ADDR, reason: 'Street name', items: [{ field: 'street', newValue: 'Quillmoor Park Road' }] })
    assert.equal(r.data.riskTier, 'M')                                    // the server uses the new rule at once
    assert.equal((await cfgEdit('RiskRules', "field='street'", { tier: 'L' })).status, 200)
  })

  it('T26 settings can be changed within bounds only (400, then correct and retry), and never created (403)', async () => {
    const K = "name='lowRiskMaxFields'"
    assert.equal((await cfgEdit('Settings', K, { value: 9 })).status, 400)
    // the draft keeps the user's input; correcting it and saving again works (US-03 pattern)
    await axios.patch(`${CFG}/Settings(${K},IsActiveEntity=false)`, { value: 3 }, as('ops'))
    const retry = await axios.post(`${CFG}/Settings(${K},IsActiveEntity=false)/ConfigService.draftActivate`, {}, as('ops'))
    assert.equal(retry.status, 200, JSON.stringify(retry.data))
    assert.equal((await cfgEdit('Settings', K, { value: 2 })).status, 200)
    // CAP lets anyone with a grant open a scratch draft, but saving it as a new row is refused, and so is delete
    assert.equal((await cfgCreate('Settings', { name: 'anything', value: 1 })).status, 403)
    assert.equal((await axios.delete(`${CFG}/Settings(${K},IsActiveEntity=true)`, as('ops'))).status, 403)
  })

  it('T27 payment holds are read-only here; requesters and stewards cannot open the rules service (403)', async () => {
    assert.equal((await axios.post(`${CFG}/HoldList`, { supplierNo: '1000101', holdUntil: '2099-01-01' }, as('ops'))).status, 405)
    assert.equal((await axios.get(`${CFG}/RiskRules`, as('rita'))).status, 403)
    assert.equal((await axios.get(`${CFG}/RiskRules`, as('sam'))).status, 403)
  })

  it('T28 RuleAdmin cannot request or approve changes (segregation of duties, 403)', async () => {
    assert.equal((await axios.post(`${REQ}/ChangeRequests`, { supplier_ID: QUILLMOOR, reason: 'x' }, as('ops'))).status, 403)
    assert.equal((await axios.get(`${APR}/ChangeRequests`, as('ops'))).status, 403)
  })
})

describe('P4 insights (dashboard and report data)', () => {
  it('T29 a steward or auditor gets counts per status and risk tier; a requester gets 403', async () => {
    const byStatus = await axios.get(`${INS}/RequestFacts?$apply=groupby((status,riskTier),aggregate(ID with countdistinct as requests))`, as('aud'))
    assert.equal(byStatus.status, 200, JSON.stringify(byStatus.data))
    const total = byStatus.data.value.reduce((n, r) => n + r.requests, 0)
    const all = await axios.get(`${SUP}/ChangeRequests?$count=true&$top=0`, as('aud'))
    assert.equal(total, all.data['@odata.count'])                          // dashboard numbers add up to the stored requests
    const byField = await axios.get(`${INS}/ItemFacts?$apply=groupby((field),aggregate(ID with countdistinct as changes))`, as('sam'))
    assert.equal(byField.status, 200)
    assert.ok(byField.data.value.find(r => r.field === 'street'))
    assert.equal((await axios.get(`${INS}/RequestFacts`, as('rita'))).status, 403)
  })

  it('T32 requests saved before 9 Nov get their date filled in, so the dashboard and report count them', async () => {
    const { backfillRequestedOn } = require('../srv/lib/backfill')
    const ID = cds.utils.uuid()
    await INSERT.into('mdcr.ChangeRequests').entries({ ID, supplier_ID: NORDLICHT, reason: 'Old request', status_code: 'A', createdAt: '2026-11-08T10:00:00.000Z', decidedBy: 'sam', decidedAt: '2026-11-08T11:00:00.000Z' })
    assert.ok(await backfillRequestedOn() >= 1)
    const row = await SELECT.one.from('mdcr.ChangeRequests').where({ ID })
    assert.equal(row.requestedOn, '2026-11-08')
    const facts = await axios.get(`${INS}/RequestFacts(${ID})`, as('aud'))
    assert.equal(facts.data.riskTierText, 'Not assessed'); assert.equal(facts.data.approvalModeText, 'Not recorded (before 9 Nov)')
    assert.equal(await backfillRequestedOn(), 0)                           // safe to repeat
  })

  it('T30 the integration API now tells P2 the risk tier and decision time of each change', async () => {
    const r = await axios.get(`/odata/v4/integration/ChangeRequests?$filter=status eq 'A'&$select=supplierNo,riskTier,approvalMode,decidedAt`, as('p2app'))
    assert.equal(r.status, 200, JSON.stringify(r.data))
    assert.ok(r.data.value.length > 0 && r.data.value.every(x => x.decidedAt))       // every applied change has a time
    // requests decided before 9 Nov have no risk tier (null): P2 must treat null as "unknown", not as low
    assert.ok(r.data.value.filter(x => x.approvalMode).every(x => x.riskTier))
  })
})
