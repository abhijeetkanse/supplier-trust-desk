const cds = require('@sap/cds')
const { backfillRequestedOn } = require('./lib/backfill')

module.exports = class InsightsService extends cds.ApplicationService {
  init() {
    // After all services are up (database connected), fill dates of requests saved before 9 Nov
    cds.once('served', () => backfillRequestedOn().catch(e => cds.log('backfill').error(e)))
    return super.init()
  }
}
