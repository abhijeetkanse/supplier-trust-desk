using { mdcr } from '../db/schema';

// DataSteward and Auditor: the dashboard (analytical list page) and the meeting report.
// Flat, read-only "fact" views that the UI groups and counts with OData $apply.
@path: '/odata/v4/insights'
service InsightsService @(requires: ['DataSteward', 'Auditor']) {

  @readonly
  entity RequestFacts as projection on mdcr.ChangeRequests {
    key ID,
        supplier.supplierNo as supplierNo   : String(10),
        supplier.name       as supplierName : String(80),
        status.code         as status       : String(1),
        status.name         as statusName   : String(255),
        riskTier,
        case riskTier when 'L' then 'Low' when 'M' then 'Medium' when 'H' then 'High' else 'Not assessed' end as riskTierText : String(15),
        approvalMode,
        case when approvalMode = 'Auto'     then 'One person (low risk)'
             when approvalMode = 'FourEyes' then 'Four-eyes (steward)'
             when status.code = 'N'         then 'Not submitted yet'
             else 'Not recorded (before 9 Nov)' end as approvalModeText : String(30),
        riskReason,
        reason,
        createdBy           as requestedBy,
        requestedOn,
        decidedBy,
        decidedAt
  };

  @readonly
  entity ItemFacts as projection on mdcr.ChangeItems {
    key ID,
        field,
        parent.ID                  as requestID    : UUID,
        parent.status.code         as status       : String(1),
        parent.riskTier            as riskTier     : String(1),
        parent.supplier.name       as supplierName : String(80),
        parent.requestedOn         as requestedOn  : Date
  };

  @readonly entity RequestStatus as projection on mdcr.RequestStatus;
}
