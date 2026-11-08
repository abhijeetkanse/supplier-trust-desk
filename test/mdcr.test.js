// Automated tests for the P4 business rules. Run: npm test
// Each test calls the OData API exactly like the Fiori app would,
// as one of the mocked users (rita/raj = Requester, sam = DataSteward, aud = Auditor).
const cds = require('@sap/cds')
const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')

const { axios } = cds.test(__dirname + '/..')
axios.defaults.validateStatus = () => true          // we check status codes ourselves

const API = '/odata/v4/mdcr'
const as = user => ({ auth: { username: user, password: user } })

const NORDLICHT = '11111111-0000-4000-8000-000000000001'   // DE supplier
const NORDLICHT_ADDR = '22222222-0000-4000-8000-000000000001' // postal code 6919 (wrong: 4 digits)
const QUILLMOOR = '11111111-0000-4000-8000-000000000005'     // GB supplier

// Fiori flow: create a draft, then activate it (= "Save")
async function saveRequest(user, body) {
  const draft = await axios.post(`${API}/ChangeRequests`, body, as(user))
  if (draft.status !== 201) return draft
  return axios.post(`${API}/ChangeRequests(ID=${draft.data.ID},IsActiveEntity=false)/MasterDataService.draftActivate`, {}, as(user))
}
const action = (user, ID, name, body = {}) =>
  axios.post(`${API}/ChangeRequests(ID=${ID},IsActiveEntity=true)/MasterDataService.${name}`, body, as(user))

describe('P4 change requests', () => {
  let goodID

  it('T01 a requester saves a valid request; status is New and old value is filled by the server', async () => {
    const res = await saveRequest('rita', {
      supplier_ID: NORDLICHT, address_ID: NORDLICHT_ADDR, reason: 'Postal code has only 4 digits',
      items: [{ field: 'postalCode', newValue: '69190', oldValue: 'fake' }]
    })
    assert.equal(res.status, 201, JSON.stringify(res.data))
    goodID = res.data.ID
    assert.equal(res.data.status_code, 'N')
    const items = await axios.get(`${API}/ChangeRequests(ID=${goodID},IsActiveEntity=true)/items`, as('rita'))
    assert.equal(items.data.value[0].oldValue, '6919')
  })

  it('T02 R1: a postal code in the wrong format for the country is rejected with 400', async () => {
    const res = await saveRequest('rita', {
      supplier_ID: NORDLICHT, address_ID: NORDLICHT_ADDR, reason: 'Fix postal code',
      items: [{ field: 'postalCode', newValue: '6919X' }]
    })
    assert.equal(res.status, 400)
    assert.match(res.data.error.message, /does not match the format for DE/)
  })

  it('T03 a request without a reason or without changes is rejected', async () => {
    const noItems = await saveRequest('rita', { supplier_ID: QUILLMOOR, reason: 'Nothing to change', items: [] })
    assert.equal(noItems.status, 400)
    const noReason = await saveRequest('rita', { supplier_ID: QUILLMOOR, items: [{ field: 'name', newValue: 'Quillmoor Packaging Limited' }] })
    assert.equal(noReason.status, 400)
  })

  it('T04 an auditor cannot create requests (403)', async () => {
    const res = await axios.post(`${API}/ChangeRequests`, { supplier_ID: QUILLMOOR, reason: 'x' }, as('aud'))
    assert.equal(res.status, 403)
  })

  it('T05 only the creator can submit; a repeated submit gives 409 and changes nothing', async () => {
    assert.equal((await action('raj', goodID, 'submit')).status, 403)
    assert.equal((await action('rita', goodID, 'submit')).status, 200)
    const again = await action('rita', goodID, 'submit')
    assert.equal(again.status, 409)
  })

  it('T06 a requester cannot approve (403: wrong role)', async () => {
    assert.equal((await action('rita', goodID, 'approve')).status, 403)
  })

  it('T07 R2 four-eyes: a user with both roles cannot decide their own request (403)', async () => {
    const own = await saveRequest('mixa', { supplier_ID: QUILLMOOR, reason: 'Legal form changed', items: [{ field: 'name', newValue: 'Quillmoor Packaging Limited' }] })
    assert.equal(own.status, 201, JSON.stringify(own.data))
    assert.equal((await action('mixa', own.data.ID, 'submit')).status, 200)
    const res = await action('mixa', own.data.ID, 'approve')
    assert.equal(res.status, 403)
    assert.match(res.data.error.message, /Four-eyes/)
  })

  it('T08 a steward approves; the new value is applied to the supplier record', async () => {
    const res = await action('sam', goodID, 'approve', { note: 'Checked against the invoice letterhead' })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    assert.equal(res.data.status_code, 'A')
    assert.equal(res.data.decidedBy, 'sam')
    const addr = await axios.get(`${API}/Addresses(${NORDLICHT_ADDR})`, as('aud'))
    assert.equal(addr.data.postalCode, '69190')
  })

  it('T09 a decided request cannot be approved or rejected again (409)', async () => {
    assert.equal((await action('sam', goodID, 'approve')).status, 409)
    assert.equal((await action('sam', goodID, 'rejectRequest', { note: 'late' })).status, 409)
  })

  it('T10 a rejection needs a reason (400), then works with one', async () => {
    const r = await saveRequest('raj', { supplier_ID: QUILLMOOR, reason: 'New tax number', items: [{ field: 'taxNumber', newValue: 'GB999999999' }] })
    assert.equal(r.status, 201, JSON.stringify(r.data))
    await action('raj', r.data.ID, 'submit')
    assert.equal((await action('sam', r.data.ID, 'rejectRequest', { note: '  ' })).status, 400)
    const ok = await action('sam', r.data.ID, 'rejectRequest', { note: 'No proof attached' })
    assert.equal(ok.status, 200)
    assert.equal(ok.data.status_code, 'R')
  })

  it('T11 stale approval: data changed after the request was made -> 409', async () => {
    // two requests on the same field; the first approval makes the second one stale
    const a = await saveRequest('rita', { supplier_ID: QUILLMOOR, reason: 'Typo', items: [{ field: 'taxNumber', newValue: 'GB123456780' }] })
    const b = await saveRequest('raj',  { supplier_ID: QUILLMOOR, reason: 'Typo too', items: [{ field: 'taxNumber', newValue: 'GB123456781' }] })
    assert.equal(a.status, 201); assert.equal(b.status, 201)
    await action('rita', a.data.ID, 'submit'); await action('raj', b.data.ID, 'submit')
    assert.equal((await action('sam', a.data.ID, 'approve')).status, 200)
    const stale = await action('sam', b.data.ID, 'approve')
    assert.equal(stale.status, 409)
    assert.match(stale.data.error.message, /changed since the request was created/)
  })

  it('T14 a submitted request cannot be opened for editing (409); another requester cannot edit it (403)', async () => {
    const r = await saveRequest('rita', { supplier_ID: QUILLMOOR, reason: 'City spelling', address_ID: '22222222-0000-4000-8000-000000000005', items: [{ field: 'city', newValue: 'Leeds City' }] })
    assert.equal(r.status, 201, JSON.stringify(r.data))
    const edit = ID => axios.post(`${API}/ChangeRequests(ID=${ID},IsActiveEntity=true)/MasterDataService.draftEdit`, { PreserveChanges: true }, as('raj'))
    assert.equal((await edit(r.data.ID)).status, 403)
    await action('rita', r.data.ID, 'submit')
    const own = await axios.post(`${API}/ChangeRequests(ID=${r.data.ID},IsActiveEntity=true)/MasterDataService.draftEdit`, { PreserveChanges: true }, as('rita'))
    assert.equal(own.status, 409)
  })

  it('T15 a saved change item cannot be deleted or changed directly, only via its request (405)', async () => {
    const r = await saveRequest('rita', { supplier_ID: QUILLMOOR, reason: 'Street typo', address_ID: '22222222-0000-4000-8000-000000000005', items: [{ field: 'street', newValue: 'Quillmoor Road' }] })
    assert.equal(r.status, 201, JSON.stringify(r.data))
    await action('rita', r.data.ID, 'submit')
    const items = await axios.get(`${API}/ChangeItems?$filter=parent_ID eq ${r.data.ID}`, as('rita'))
    const itemID = items.data.value[0].ID
    assert.equal((await axios.delete(`${API}/ChangeItems(ID=${itemID},IsActiveEntity=true)`, as('raj'))).status, 405)
    assert.equal((await axios.delete(`${API}/ChangeItems(ID=${itemID},IsActiveEntity=true)`, as('rita'))).status, 405)
    const after = await axios.get(`${API}/ChangeItems?$filter=parent_ID eq ${r.data.ID}`, as('aud'))
    assert.equal(after.data.value.length, 1)                   // the item is still there
  })

  it('T16 supplier records cannot be written directly, even by a steward (405)', async () => {
    assert.equal((await axios.patch(`${API}/Suppliers(${NORDLICHT})`, { name: 'Hijacked GmbH' }, as('sam'))).status, 405)
    assert.equal((await axios.delete(`${API}/Suppliers(${NORDLICHT})`, as('sam'))).status, 405)
    assert.equal((await axios.patch(`${API}/Addresses(${NORDLICHT_ADDR})`, { postalCode: '00000' }, as('sam'))).status, 405)
  })

  it('T17 a request may only target allowed fields, never control fields (400)', async () => {
    const res = await saveRequest('rita', { supplier_ID: NORDLICHT, reason: 'Sneaky', items: [{ field: 'decidedBy', newValue: 'rita' }] })
    assert.equal(res.status, 400, JSON.stringify(res.data))
  })

  it('T12 nobody without a role can read suppliers (403)', async () => {
    assert.equal((await axios.get(`${API}/Suppliers`, as('nobody'))).status, 403)
  })

  // R4 is your part: once implemented, remove { todo: true }
  it('T13 R4: only one open request per supplier and field (409)', { todo: true }, async () => {
    const first = await saveRequest('rita', { supplier_ID: NORDLICHT, reason: 'Rename', items: [{ field: 'name', newValue: 'Nordlicht Office GmbH' }] })
    assert.equal(first.status, 201)
    const second = await saveRequest('raj', { supplier_ID: NORDLICHT, reason: 'Rename too', items: [{ field: 'name', newValue: 'Nordlicht Büro GmbH' }] })
    assert.equal(second.status, 409)
  })
})
