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
    case status.code when 'A' then 3 when 'R' then 1 when 'S' then 2 else 0 end  as statusCriticality : Integer,
    case riskTier when 'L' then 3 when 'M' then 2 when 'H' then 1 else 0 end     as riskCriticality   : Integer,
    case riskTier when 'L' then 'Low' when 'M' then 'Medium' when 'H' then 'High' end as riskTierText : String(10)
  } actions {
    action approve(note : String(255))                  returns ChangeRequests;
    action rejectRequest(note : String(255) @mandatory) returns ChangeRequests;
  };

  @readonly entity ChangeItems   as projection on mdcr.ChangeItems;
  @readonly entity Suppliers     as projection on mdcr.Suppliers excluding { requests };
  @readonly entity Addresses     as projection on mdcr.Addresses;
  @readonly entity RequestStatus as projection on mdcr.RequestStatus;
}
