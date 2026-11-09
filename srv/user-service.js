const cds = require('@sap/cds')
const ROLES = ['Requester', 'DataSteward', 'Auditor', 'RuleAdmin']

module.exports = class UserService extends cds.ApplicationService {
  init() {
    this.on('whoAmI', req => ({ id: req.user.id, roles: ROLES.filter(r => req.user.is(r)) }))
    return super.init()
  }
}
