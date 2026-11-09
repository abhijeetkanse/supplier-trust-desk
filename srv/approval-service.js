const cds = require('@sap/cds')
const { registerStewardRules } = require('./lib/change-rules')

module.exports = class ApprovalService extends cds.ApplicationService {
  init() {
    registerStewardRules(this)
    return super.init()
  }
}
