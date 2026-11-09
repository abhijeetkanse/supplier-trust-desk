using RequestService as srv from '../../srv/request-service';

// App "My Supplier Change Requests" (Requester). List -> object page (draft: Edit / Save / Discard).
annotate srv.ChangeRequests with @(
  UI.HeaderInfo: {
    TypeName: 'Change Request', TypeNamePlural: 'My Change Requests',
    Title: { Value: supplier.name }, Description: { Value: reason }
  },
  UI.SelectionFields: [ status_code, supplier_ID, riskTier ],
  UI.LineItem: [
    { Value: supplier.supplierNo, Label: 'Supplier No.' },
    { Value: supplier.name,       Label: 'Supplier' },
    { Value: reason,              Label: 'Reason' },
    { Value: status_code,         Label: 'Status', Criticality: statusCriticality },
    { Value: riskTier,            Label: 'Risk', Criticality: riskCriticality },
    { Value: requestedOn,         Label: 'Requested on' },
    { $Type: 'UI.DataFieldForAction', Action: 'RequestService.submit', Label: 'Submit' }
  ],
  UI.HeaderFacets: [
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#status' },
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#risk' }
  ],
  UI.DataPoint #status: { Value: status_code, Title: 'Status', Criticality: statusCriticality },
  UI.DataPoint #risk:   { Value: riskTier,    Title: 'Risk',   Criticality: riskCriticality },
  // Submit only in display mode; Fiori shows it enabled only while canSubmit is true (status New)
  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'RequestService.submit', Label: 'Submit',
      ![@UI.Hidden]: { $edmJson: { $Not: { $Path: 'IsActiveEntity' } } } }
  ],
  UI.FieldGroup #Request: { Data: [
    { Value: supplier_ID, Label: 'Supplier' },
    { Value: address_ID,  Label: 'Address' },
    { Value: reason,      Label: 'Reason' }
  ]},
  UI.FieldGroup #Risk: { Data: [
    { Value: riskTier,     Label: 'Risk tier' },
    { Value: riskReason,   Label: 'Why' },
    { Value: approvalMode, Label: 'Approval path' }
  ]},
  UI.FieldGroup #Decision: { Data: [
    { Value: decidedBy,    Label: 'Decided by' },
    { Value: decidedAt,    Label: 'Decided at' },
    { Value: decisionNote, Label: 'Decision note' }
  ]},
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', ID: 'Request', Label: 'Request', Target: '@UI.FieldGroup#Request' },
    { $Type: 'UI.ReferenceFacet', ID: 'Changes', Label: 'Changes (old → new)', Target: 'items/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'Risk', Label: 'Risk and approval path', Target: '@UI.FieldGroup#Risk' },
    { $Type: 'UI.ReferenceFacet', ID: 'Decision', Label: 'Decision', Target: '@UI.FieldGroup#Decision' }
  ]
) {
  supplier @Common.Label: 'Supplier' @Common.Text: supplier.name @Common.TextArrangement: #TextOnly
           @Common.ValueList: { CollectionPath: 'Suppliers', Parameters: [
             { $Type: 'Common.ValueListParameterOut', LocalDataProperty: supplier_ID, ValueListProperty: 'ID' },
             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'supplierNo' },
             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' } ] };
  address  @Common.Label: 'Address' @Common.Text: address.street @Common.TextArrangement: #TextOnly
           @Common.ValueList: { CollectionPath: 'Addresses', Parameters: [
             { $Type: 'Common.ValueListParameterOut', LocalDataProperty: address_ID, ValueListProperty: 'ID' },
             { $Type: 'Common.ValueListParameterIn',  LocalDataProperty: supplier_ID, ValueListProperty: 'supplier_ID' },
             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'street' },
             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'city' } ] };
  status   @Common.Label: 'Status' @Common.Text: status.name @Common.TextArrangement: #TextOnly @Common.ValueListWithFixedValues
           @Common.ValueList: { CollectionPath: 'RequestStatus', Parameters: [
             { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: status_code, ValueListProperty: 'code' },
             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' } ] };
  riskTier @title: 'Risk' @Common.Text: riskTierText @Common.TextArrangement: #TextOnly;
  reason   @title: 'Reason' @UI.MultiLineText;
  createdBy @title: 'Requested by';
  requestedOn @title: 'Requested on';
};

annotate srv.ChangeRequests with actions {
  submit @Core.OperationAvailable: { $edmJson: { $Path: 'in/canSubmit' } }
         @Common.SideEffects: { TargetProperties: ['in/status_code', 'in/approvalMode', 'in/decidedBy', 'in/decidedAt', 'in/decisionNote', 'in/riskTier', 'in/riskReason', 'in/canSubmit'] };
};

annotate srv.ChangeItems with @(
  UI.LineItem: [
    { Value: field,    Label: 'Field' },
    { Value: oldValue, Label: 'Old value (set by the server)' },
    { Value: newValue, Label: 'New value' }
  ]
) {
  field @Common.ValueListWithFixedValues @Common.ValueList: { CollectionPath: 'ChangeableFields', Parameters: [
          { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: field, ValueListProperty: 'field' },
          { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'note' } ] };
};
