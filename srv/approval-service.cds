using { mdcr } from '../db/schema';

// DataSteward (Sam): reviews medium- and high-risk requests of OTHER people and decides them.
// Nothing here can be created or edited; the only writes are the two decision actions.
@path: '/odata/v4/approvals'
service ApprovalService @(requires: 'DataSteward') {

  @readonly
  entity ChangeRequests as projection on mdcr.ChangeRequests {
    *,
    // true only for a submitted request that someone else created: drives the Approve/Reject buttons
    case when status.code = 'S' and createdBy <> $user then true else false end  as canDecide         : Boolean,
    case when status.code = 'A' then 3 when status.code = 'R' then 1 when status.code = 'S' then 2 else 0 end  as statusCriticality : Integer,
    case when riskTier = 'L' then 3 when riskTier = 'M' then 2 when riskTier = 'H' then 1 else 0 end     as riskCriticality   : Integer,
    case when riskTier = 'L' then 'Low' when riskTier = 'M' then 'Medium' when riskTier = 'H' then 'High' end as riskTierText : String(10)
  } actions {
    action approve(note : String(255))                  returns ChangeRequests;
    action rejectRequest(note : String(255) @mandatory) returns ChangeRequests;
  };

  @readonly entity ChangeItems   as projection on mdcr.ChangeItems;
  @readonly entity Suppliers     as projection on mdcr.Suppliers excluding { requests };
  @readonly entity Addresses     as projection on mdcr.Addresses;
  @readonly entity RequestStatus as projection on mdcr.RequestStatus;
}
