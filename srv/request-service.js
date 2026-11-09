const cds = require('@sap/cds')
const { registerRequesterRules } = require('./lib/change-rules')

module.exports = class RequestService extends cds.ApplicationService {
  init() {
    registerRequesterRules(this)
    return super.init()
  }
}
