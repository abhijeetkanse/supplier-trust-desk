using ApprovalService as srv from '../../srv/approval-service';

// App "Approve Supplier Changes" (DataSteward). Opens on submitted requests; Approve / Reject only.
annotate srv.ChangeRequests with @(
  UI.HeaderInfo: {
    TypeName: 'Change Request', TypeNamePlural: 'Change Requests',
    Title: { Value: supplier.name }, Description: { Value: reason }
  },
  UI.SelectionFields: [ status_code, riskTier, supplier_ID, createdBy ],
  UI.PresentationVariant: {
    SortOrder: [ { Property: riskTier, Descending: true }, { Property: requestedOn } ],
    Visualizations: [ '@UI.LineItem' ]
  },
  UI.LineItem: [
    { Value: supplier.supplierNo, Label: 'Supplier No.' },
    { Value: supplier.name,       Label: 'Supplier' },
    { Value: reason,              Label: 'Reason' },
    { Value: riskTier,            Label: 'Risk', Criticality: riskCriticality },
    { Value: riskReason,          Label: 'Why this risk' },
    { Value: status_code,         Label: 'Status', Criticality: statusCriticality },
    { Value: createdBy,           Label: 'Requested by' },
    { Value: requestedOn,         Label: 'Requested on' },
    { $Type: 'UI.DataFieldForAction', Action: 'ApprovalService.approve',       Label: 'Approve' },
    { $Type: 'UI.DataFieldForAction', Action: 'ApprovalService.rejectRequest', Label: 'Reject' }
  ],
  UI.HeaderFacets: [
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#status' },
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#risk' }
  ],
  UI.DataPoint #status: { Value: status_code, Title: 'Status', Criticality: statusCriticality },
  UI.DataPoint #risk:   { Value: riskTier,    Title: 'Risk',   Criticality: riskCriticality },
  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'ApprovalService.approve',       Label: 'Approve' },
    { $Type: 'UI.DataFieldForAction', Action: 'ApprovalService.rejectRequest', Label: 'Reject' }
  ],
  UI.FieldGroup #Request: { Data: [
    { Value: supplier_ID, Label: 'Supplier' },
    { Value: address_ID,  Label: 'Address' },
    { Value: reason,      Label: 'Reason' },
    { Value: createdBy,   Label: 'Requested by' },
    { Value: requestedOn, Label: 'Requested on' }
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
    { $Type: 'UI.ReferenceFacet', ID: 'Changes', Label: 'Changes (old → new)', Target: 'items/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'Request', Label: 'Request', Target: '@UI.FieldGroup#Request' },
    { $Type: 'UI.ReferenceFacet', ID: 'Risk', Label: 'Risk and approval path', Target: '@UI.FieldGroup#Risk' },
    { $Type: 'UI.ReferenceFacet', ID: 'Decision', Label: 'Decision', Target: '@UI.FieldGroup#Decision' }
  ]
) {
  supplier @Common.Label: 'Supplier' @Common.Text: supplier.name @Common.TextArrangement: #TextOnly
           @Common.ValueList: { CollectionPath: 'Suppliers', Parameters: [
             { $Type: 'Common.ValueListParameterOut', LocalDataProperty: supplier_ID, ValueListProperty: 'ID' },
             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'supplierNo' },
             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' } ] };
  address  @Common.Label: 'Address' @Common.Text: address.street @Common.TextArrangement: #TextOnly;
  // The work list opens on "Submitted": the steward's inbox
  status   @Common.Label: 'Status' @Common.Text: status.name @Common.TextArrangement: #TextOnly @Common.FilterDefaultValue: 'S'
           @Common.ValueListWithFixedValues
           @Common.ValueList: { CollectionPath: 'RequestStatus', Parameters: [
             { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: status_code, ValueListProperty: 'code' },
             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' } ] };
  riskTier @title: 'Risk' @Common.Text: riskTierText @Common.TextArrangement: #TextOnly;
  reason   @title: 'Reason' @UI.MultiLineText;
  createdBy @title: 'Requested by';
  requestedOn @title: 'Requested on';
};

// Buttons are enabled only for a submitted request created by someone else (canDecide);
// the server still checks role (403), four-eyes (403) and status (409) on every call.
annotate srv.ChangeRequests with actions {
  approve       @Core.OperationAvailable: { $edmJson: { $Path: 'in/canDecide' } }
                @Common.SideEffects: { TargetProperties: ['in/status_code', 'in/decidedBy', 'in/decidedAt', 'in/decisionNote', 'in/canDecide'] }
                (note @title: 'Note (optional)');
  rejectRequest @Core.OperationAvailable: { $edmJson: { $Path: 'in/canDecide' } }
                @Common.SideEffects: { TargetProperties: ['in/status_code', 'in/decidedBy', 'in/decidedAt', 'in/decisionNote', 'in/canDecide'] }
                (note @title: 'Reason for rejection');
};

annotate srv.ChangeItems with @(
  UI.LineItem: [
    { Value: field,    Label: 'Field' },
    { Value: oldValue, Label: 'Old value' },
    { Value: newValue, Label: 'New value' }
  ]
);
