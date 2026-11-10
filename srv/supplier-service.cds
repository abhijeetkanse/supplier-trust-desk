using { mdcr } from '../db/schema';

// Everyone with a role: look up suppliers, their addresses and the complete change history.
// Read-only for everybody; supplier data changes only through an approved change request.
@path: '/odata/v4/suppliers'
service SupplierService @(requires: ['Requester', 'DataSteward', 'Auditor', 'RuleAdmin']) {
  @readonly entity Suppliers      as projection on mdcr.Suppliers;
  @readonly entity Addresses      as projection on mdcr.Addresses;
  @readonly entity ChangeRequests as projection on mdcr.ChangeRequests {
    *,
    case when status.code = 'A' then 3 when status.code = 'R' then 1 when status.code = 'S' then 2 else 0 end  as statusCriticality : Integer,
    case when riskTier = 'L' then 'Low' when riskTier = 'M' then 'Medium' when riskTier = 'H' then 'High' end as riskTierText : String(10)
  };
  @readonly entity ChangeItems    as projection on mdcr.ChangeItems;
  @readonly entity RequestStatus  as projection on mdcr.RequestStatus;
}
