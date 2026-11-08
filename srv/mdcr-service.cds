using { mdcr } from '../db/schema';

// Roles (authorisation concept):
//   Requester   – creates and submits change requests for wrong supplier data
//   DataSteward – reviews submitted requests and approves or rejects them
//   Auditor     – reads everything, changes nothing
@path: '/odata/v4/mdcr'
service MasterDataService @(requires: 'authenticated-user') {

  @readonly
  @restrict: [{ grant: 'READ', to: ['Requester', 'DataSteward', 'Auditor'] }]
  entity Suppliers as projection on mdcr.Suppliers;

  @readonly
  @restrict: [{ grant: 'READ', to: ['Requester', 'DataSteward', 'Auditor'] }]
  entity Addresses as projection on mdcr.Addresses;

  @odata.draft.enabled
  @restrict: [
    { grant: 'READ',                                  to: ['Requester', 'DataSteward', 'Auditor'] },
    { grant: ['CREATE', 'UPDATE', 'DELETE', 'submit'], to: 'Requester' },
    { grant: ['approve', 'rejectRequest'],                   to: 'DataSteward' }
  ]
  entity ChangeRequests as projection on mdcr.ChangeRequests actions {
    action submit()                                    returns ChangeRequests;
    action approve(note : String(255))                 returns ChangeRequests;
    action rejectRequest(note  : String(255) @mandatory)      returns ChangeRequests;
  };

  @restrict: [{ grant: '*', to: 'Requester' }, { grant: 'READ', to: ['DataSteward', 'Auditor'] }]
  entity ChangeItems as projection on mdcr.ChangeItems;

  @readonly entity RequestStatus   as projection on mdcr.RequestStatus;
  @readonly entity PostalCodeRules as projection on mdcr.PostalCodeRules;
}
