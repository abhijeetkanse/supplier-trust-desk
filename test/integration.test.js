// Tests for the integration API that P2 and P3 use (Batch 1). Run: npm test
// Locally, the mocked users p2app / p3app stand in for P4's technical client:
// they hold the role "Integration", like the client-credentials token in the cloud.
const cds = require('@sap/cds')
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { axios } = cds.test(__dirname + '/..')
axios.defaults.validateStatus = () => true

const API = '/odata/v4/integration'
const as = user => ({ auth: { username: user, password: user } })

describe('P4 integration API for P2 and P3', () => {

  it('I01 without login the API answers 401', async () => {
    const res = await axios.get(`${API}/Suppliers`)
    assert.equal(res.status, 401)
  })

  it('I02 a human P4 user (Requester) cannot use it: 403', async () => {
    const res = await axios.get(`${API}/Suppliers`, as('rita'))
    assert.equal(res.status, 403)
  })

  it('I03 the technical client reads suppliers, holds and thresholds', async () => {
    const sup = await axios.get(`${API}/Suppliers?$select=supplierNo,name&$orderby=supplierNo`, as('p2app'))
    assert.equal(sup.status, 200)
    assert.ok(sup.data.value.length >= 4)
    const hold = await axios.get(`${API}/HoldList`, as('p2app'))
    assert.deepEqual(hold.data.value.map(h => h.supplierNo), ['1000104'])
    const thr = await axios.get(`${API}/Thresholds('EUR')`, as('p2app'))
    assert.equal(Number(thr.data.amount), 10000)
  })

  it('I04 master data and configuration are read-only through this API', async () => {
    const res = await axios.post(`${API}/HoldList`, { supplierNo: '1000101', holdUntil: '2026-12-31' }, as('p2app'))
    assert.equal(res.status, 405)
    const cr = await axios.post(`${API}/ChangeRequests`, { reason: 'x' }, as('p3app'))
    assert.equal(cr.status, 405)
  })

  it('I05 P2 stores a decision; P4 fills decidedAt', async () => {
    const res = await axios.post(`${API}/InvoiceDecisions`, {
      source: 'STORY', SupplierInvoice: 'DEMO-9002', FiscalYear: '2026',
      decision: 'KeepBlocked', rootCause: 'SupplierData', note: 'Bank details under review', decidedBy: 'Rita (AP clerk)'
    }, as('p2app'))
    assert.equal(res.status, 201, JSON.stringify(res.data))
    assert.ok(res.data.decidedAt)
    const back = await axios.get(`${API}/InvoiceDecisions(source='STORY',SupplierInvoice='DEMO-9002',FiscalYear='2026')`, as('p2app'))
    assert.equal(back.data.decision, 'KeepBlocked')
  })

  it('I06 an escalation without a note is refused with 400, also when changed later', async () => {
    const res = await axios.post(`${API}/InvoiceDecisions`, {
      source: 'S4', SupplierInvoice: '5105600101', FiscalYear: '2026', decision: 'Escalate', decidedBy: 'Rita (AP clerk)'
    }, as('p2app'))
    assert.equal(res.status, 400)
    assert.match(res.data.error.message, /needs a note/)
    const patch = await axios.patch(`${API}/InvoiceDecisions(source='STORY',SupplierInvoice='DEMO-9002',FiscalYear='2026')`,
      { decision: 'Escalate', note: '' }, as('p2app'))
    assert.equal(patch.status, 400)
  })

  it('I07 an unknown decision value is refused with 400', async () => {
    const res = await axios.post(`${API}/InvoiceDecisions`, {
      source: 'S4', SupplierInvoice: '5105600102', FiscalYear: '2026', decision: 'PayNow', decidedBy: 'Rita (AP clerk)'
    }, as('p2app'))
    assert.equal(res.status, 400)
  })

  let issueID
  it('I08 P3 imports findings: new ones are created, repeats merge, bad rows are reported', async () => {
    const findings = [
      { partnerId: '1000101', addressId: 'A1', field: 'PostalCode', rule: 'POSTAL_FORMAT', severity: 'High', currentValue: '6919' },
      { partnerId: '1000103', addressId: 'A1', field: 'StreetName', rule: 'STREET_MISSING', currentValue: '' }
    ]
    const first = await axios.post(`${API}/importFindings`, { findings }, as('p3app'))
    assert.equal(first.status, 200, JSON.stringify(first.data))
    assert.deepEqual([first.data.created, first.data.merged, first.data.rejected], [2, 0, 0])

    const again = await axios.post(`${API}/importFindings`, {
      findings: [...findings, { partnerId: '1000102', addressId: 'A1', field: 'Phone', rule: 'X' }]
    }, as('p3app'))
    assert.deepEqual([again.data.created, again.data.merged, again.data.rejected], [0, 2, 1])
    assert.match(again.data.errors[0], /unknown field "Phone"/)

    const list = await axios.get(`${API}/Issues?$filter=partnerId eq '1000101'`, as('p3app'))
    assert.equal(list.data.value.length, 1)
    assert.equal(list.data.value[0].status, 'Open')
    issueID = list.data.value[0].ID
  })

  it('I09 the same finding cannot be created twice directly either (unique key)', async () => {
    const res = await axios.post(`${API}/Issues`,
      { partnerId: '1000101', addressId: 'A1', field: 'PostalCode', rule: 'POSTAL_FORMAT' }, as('p3app'))
    assert.equal(res.status, 409)
    assert.match(res.data.error.message, /already exists/)
  })

  it('I10 work cannot start without an owner (409); with an owner it can', async () => {
    const noOwner = await axios.patch(`${API}/Issues(${issueID})`, { status: 'InProgress' }, as('p3app'))
    assert.equal(noOwner.status, 409)
    const ok = await axios.patch(`${API}/Issues(${issueID})`, { status: 'InProgress', owner: 'Sam (data steward)' }, as('p3app'))
    assert.equal(ok.status, 200, JSON.stringify(ok.data))
  })

  it('I11 a false alarm needs a reason (400)', async () => {
    const res = await axios.patch(`${API}/Issues(${issueID})`, { status: 'FalseAlarm' }, as('p3app'))
    assert.equal(res.status, 400)
    assert.match(res.data.error.message, /needs a reason/)
  })

  it('I12 a merge keeps the status and owner a person set', async () => {
    await axios.post(`${API}/importFindings`, { findings: [
      { partnerId: '1000101', addressId: 'A1', field: 'PostalCode', rule: 'POSTAL_FORMAT', currentValue: '6919' }
    ] }, as('p3app'))
    const issue = await axios.get(`${API}/Issues(${issueID})`, as('p3app'))
    assert.equal(issue.data.status, 'InProgress')
    assert.equal(issue.data.owner, 'Sam (data steward)')
  })
})
