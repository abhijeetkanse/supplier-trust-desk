using MasterDataService as srv from '../srv/mdcr-service';

// ---------- Change requests: work list + object page ----------
annotate srv.ChangeRequests with @(
  UI.HeaderInfo: {
    TypeName: 'Change Request', TypeNamePlural: 'Change Requests',
    Title: { Value: supplier.name }, Description: { Value: reason }
  },
  UI.SelectionFields: [ status_code, supplier_ID, createdBy ],
  UI.LineItem: [
    { Value: supplier.supplierNo, Label: 'Supplier No.' },
    { Value: supplier.name,       Label: 'Supplier' },
    { Value: reason,              Label: 'Reason' },
    { Value: status.name,         Label: 'Status', Criticality: statusCriticality },
    { Value: createdBy,           Label: 'Requested by' },
    { Value: createdAt,           Label: 'Requested at' },
    { $Type: 'UI.DataFieldForAction', Action: 'MasterDataService.submit',  Label: 'Submit' },
    { $Type: 'UI.DataFieldForAction', Action: 'MasterDataService.approve', Label: 'Approve' },
    { $Type: 'UI.DataFieldForAction', Action: 'MasterDataService.rejectRequest',  Label: 'Reject' }
  ],
  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'MasterDataService.submit',  Label: 'Submit' },
    { $Type: 'UI.DataFieldForAction', Action: 'MasterDataService.approve', Label: 'Approve' },
    { $Type: 'UI.DataFieldForAction', Action: 'MasterDataService.rejectRequest',  Label: 'Reject' }
  ],
  UI.FieldGroup #Request: { Data: [
    { Value: supplier_ID, Label: 'Supplier' },
    { Value: address_ID,  Label: 'Address' },
    { Value: reason,      Label: 'Reason' },
    { Value: status_code, Label: 'Status' }
  ]},
  UI.FieldGroup #Decision: { Data: [
    { Value: decidedBy,    Label: 'Decided by' },
    { Value: decidedAt,    Label: 'Decided at' },
    { Value: decisionNote, Label: 'Decision note' }
  ]},
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Request',  Target: '@UI.FieldGroup#Request' },
    { $Type: 'UI.ReferenceFacet', Label: 'Changes (old → new)', Target: 'items/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', Label: 'Decision', Target: '@UI.FieldGroup#Decision' }
  ]
) {
  supplier @Common.Text: supplier.name @Common.TextArrangement: #TextOnly
           @Common.ValueList: { CollectionPath: 'Suppliers', Parameters: [
             { $Type: 'Common.ValueListParameterOut', LocalDataProperty: supplier_ID, ValueListProperty: 'ID' },
             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'supplierNo' },
             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' } ] };
  address  @Common.ValueList: { CollectionPath: 'Addresses', Parameters: [
             { $Type: 'Common.ValueListParameterOut', LocalDataProperty: address_ID, ValueListProperty: 'ID' },
             { $Type: 'Common.ValueListParameterIn',  LocalDataProperty: supplier_ID, ValueListProperty: 'supplier_ID' },
             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'street' },
             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'city' } ] };
  status   @Common.Text: status.name @Common.TextArrangement: #TextOnly;
};

// Status colour in the list: Submitted = amber, Approved = green, Rejected = red
extend projection srv.ChangeRequests with {
  case status.code when 'A' then 3 when 'R' then 1 when 'S' then 2 else 0 end as statusCriticality : Integer
};

annotate srv.ChangeItems with @(
  UI.LineItem: [
    { Value: field,    Label: 'Field' },
    { Value: oldValue, Label: 'Old value' },
    { Value: newValue, Label: 'New value' }
  ]
);

// ---------- Suppliers: read-only list + detail ----------
annotate srv.Suppliers with @(
  UI.HeaderInfo: { TypeName: 'Supplier', TypeNamePlural: 'Suppliers', Title: { Value: name }, Description: { Value: supplierNo } },
  UI.SelectionFields: [ supplierNo, name ],
  UI.LineItem: [
    { Value: supplierNo, Label: 'Supplier No.' },
    { Value: name,       Label: 'Name' },
    { Value: taxNumber,  Label: 'Tax number' }
  ],
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Addresses', Target: 'addresses/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', Label: 'Change history', Target: 'requests/@UI.LineItem' }
  ]
);

annotate srv.Addresses with @(
  UI.LineItem: [
    { Value: street, Label: 'Street' }, { Value: houseNumber, Label: 'No.' },
    { Value: postalCode, Label: 'Postal code' }, { Value: city, Label: 'City' }, { Value: country, Label: 'Country' }
  ]
);
