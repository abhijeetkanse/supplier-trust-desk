using { mdcr } from '../db/schema';

// Requester (Rita, AP clerk): create, edit, delete and submit HER OWN change requests.
// Other people's requests are invisible here (instance-based restriction on createdBy).
@path: '/odata/v4/requests'
service RequestService @(requires: 'Requester') {

  @odata.draft.enabled
  @restrict: [{ grant: '*', to: 'Requester', where: 'createdBy = $user' }]
  entity ChangeRequests as projection on mdcr.ChangeRequests {
    *,
    // UI helpers, computed by the database on every read (never stored, never sent by the client)
    case when status.code = 'N' then true else false end                         as canSubmit         : Boolean,
    case status.code when 'A' then 3 when 'R' then 1 when 'S' then 2 else 0 end  as statusCriticality : Integer,
    case riskTier when 'L' then 3 when 'M' then 2 when 'H' then 1 else 0 end     as riskCriticality   : Integer,
    case riskTier when 'L' then 'Low' when 'M' then 'Medium' when 'H' then 'High' end as riskTierText : String(10)
  } actions {
    action submit() returns ChangeRequests;
  };

  @restrict: [{ grant: '*', to: 'Requester', where: 'parent.createdBy = $user' }]
  entity ChangeItems as projection on mdcr.ChangeItems;

  @readonly entity Suppliers     as projection on mdcr.Suppliers excluding { requests };
  @readonly entity Addresses     as projection on mdcr.Addresses;
  @readonly entity RequestStatus as projection on mdcr.RequestStatus;
  // Drop-down of fields a requester may change, with their risk tier (from the rules table)
  @readonly entity ChangeableFields as projection on mdcr.RiskRules { key field, tier, note };
}
