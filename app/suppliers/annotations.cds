using SupplierService as srv from '../../srv/supplier-service';

// App "Supplier Master Data" (all roles, read-only). Supplier -> addresses + full change history.
annotate srv.Suppliers with @(
  UI.HeaderInfo: { TypeName: 'Supplier', TypeNamePlural: 'Suppliers', Title: { Value: name }, Description: { Value: supplierNo } },
  UI.SelectionFields: [ supplierNo, name ],
  UI.LineItem: [
    { Value: supplierNo, Label: 'Supplier No.' },
    { Value: name,       Label: 'Name' },
    { Value: taxNumber,  Label: 'Tax number' },
    { Value: modifiedAt, Label: 'Last changed' }
  ],
  UI.FieldGroup #General: { Data: [
    { Value: supplierNo, Label: 'Supplier No.' },
    { Value: name,       Label: 'Name' },
    { Value: taxNumber,  Label: 'Tax number' }
  ]},
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', ID: 'General',   Label: 'General',        Target: '@UI.FieldGroup#General' },
    { $Type: 'UI.ReferenceFacet', ID: 'Addresses', Label: 'Addresses',      Target: 'addresses/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'History',   Label: 'Change history', Target: 'requests/@UI.LineItem' }
  ]
);

annotate srv.Addresses with @(
  UI.LineItem: [
    { Value: street, Label: 'Street' }, { Value: houseNumber, Label: 'No.' },
    { Value: postalCode, Label: 'Postal code' }, { Value: city, Label: 'City' }, { Value: country, Label: 'Country' }
  ]
);

annotate srv.ChangeRequests with @(
  UI.HeaderInfo: { TypeName: 'Change', TypeNamePlural: 'Changes', Title: { Value: reason }, Description: { Value: status.name } },
  UI.PresentationVariant: { SortOrder: [ { Property: createdAt, Descending: true } ], Visualizations: [ '@UI.LineItem' ] },
  UI.LineItem: [
    { Value: requestedOn,  Label: 'Requested on' },
    { Value: reason,       Label: 'Reason' },
    { Value: status_code,  Label: 'Status', Criticality: statusCriticality },
    { Value: riskTier,     Label: 'Risk' },
    { Value: approvalMode, Label: 'Approval path' },
    { Value: createdBy,    Label: 'Requested by' },
    { Value: decidedBy,    Label: 'Decided by' },
    { Value: decidedAt,    Label: 'Decided at' }
  ],
  UI.FieldGroup #Decision: { Data: [
    { Value: createdBy, Label: 'Requested by' }, { Value: decidedBy, Label: 'Decided by' },
    { Value: decidedAt, Label: 'Decided at' }, { Value: decisionNote, Label: 'Decision note' }
  ]},
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', ID: 'Changes',  Label: 'Changes (old → new)', Target: 'items/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'Decision', Label: 'Decision', Target: '@UI.FieldGroup#Decision' }
  ]
) {
  status   @Common.Text: status.name @Common.TextArrangement: #TextOnly;
  riskTier @Common.Text: riskTierText @Common.TextArrangement: #TextOnly;
};

annotate srv.ChangeItems with @(
  UI.LineItem: [ { Value: field, Label: 'Field' }, { Value: oldValue, Label: 'Old value' }, { Value: newValue, Label: 'New value' } ]
);
