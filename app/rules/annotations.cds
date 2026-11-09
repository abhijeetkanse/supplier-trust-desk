using ConfigService as srv from '../../srv/config-service';

// App "Rules and Settings" (RuleAdmin): one list page with a tab per rule table; each row opens a detail page.
annotate srv.PostalCodeRules with @(
  UI.HeaderInfo: { TypeName: 'Postal-code rule', TypeNamePlural: 'Postal-code rules', Title: { Value: country }, Description: { Value: example } },
  UI.LineItem: [ { Value: country, Label: 'Country' }, { Value: pattern, Label: 'Pattern (regular expression)' },
                 { Value: example, Label: 'Example' }, { Value: modifiedBy, Label: 'Changed by' }, { Value: modifiedAt, Label: 'Changed at' } ],
  UI.SelectionPresentationVariant #postal: { Text: 'Postal-code rules', SelectionVariant: { SelectOptions: [] }, PresentationVariant: { Visualizations: [ '@UI.LineItem' ] } },
  UI.FieldGroup #Main: { Data: [ { Value: country, Label: 'Country' }, { Value: pattern, Label: 'Pattern' }, { Value: example, Label: 'Example' } ] },
  UI.FieldGroup #Audit: { Data: [ { Value: createdBy }, { Value: createdAt }, { Value: modifiedBy }, { Value: modifiedAt } ] },
  UI.Facets: [ { $Type: 'UI.ReferenceFacet', ID: 'Main', Label: 'Rule', Target: '@UI.FieldGroup#Main' },
               { $Type: 'UI.ReferenceFacet', ID: 'Audit', Label: 'Change log', Target: '@UI.FieldGroup#Audit' } ]
);

annotate srv.RiskRules with @(
  UI.HeaderInfo: { TypeName: 'Risk rule', TypeNamePlural: 'Risk rules', Title: { Value: field }, Description: { Value: note } },
  UI.LineItem: [ { Value: field, Label: 'Field' }, { Value: tier, Label: 'Tier (L/M/H)' }, { Value: note, Label: 'Why' },
                 { Value: modifiedBy, Label: 'Changed by' }, { Value: modifiedAt, Label: 'Changed at' } ],
  UI.SelectionPresentationVariant #risk: { Text: 'Risk tiers', SelectionVariant: { SelectOptions: [] }, PresentationVariant: { Visualizations: [ '@UI.LineItem' ] } },
  UI.FieldGroup #Main: { Data: [ { Value: field, Label: 'Field' }, { Value: tier, Label: 'Tier (L/M/H)' }, { Value: note, Label: 'Why' } ] },
  UI.FieldGroup #Audit: { Data: [ { Value: createdBy }, { Value: createdAt }, { Value: modifiedBy }, { Value: modifiedAt } ] },
  UI.Facets: [ { $Type: 'UI.ReferenceFacet', ID: 'Main', Label: 'Rule', Target: '@UI.FieldGroup#Main' },
               { $Type: 'UI.ReferenceFacet', ID: 'Audit', Label: 'Change log', Target: '@UI.FieldGroup#Audit' } ]
);

annotate srv.Settings with @(
  UI.CreateHidden: true, UI.DeleteHidden: true,      // only the seeded settings exist (the server refuses the rest)
  UI.HeaderInfo: { TypeName: 'Setting', TypeNamePlural: 'Settings', Title: { Value: name }, Description: { Value: description } },
  UI.LineItem: [ { Value: name, Label: 'Setting' }, { Value: value, Label: 'Value' }, { Value: description, Label: 'Meaning' },
                 { Value: modifiedBy, Label: 'Changed by' }, { Value: modifiedAt, Label: 'Changed at' } ],
  UI.SelectionPresentationVariant #settings: { Text: 'Settings', SelectionVariant: { SelectOptions: [] }, PresentationVariant: { Visualizations: [ '@UI.LineItem' ] } },
  UI.FieldGroup #Main: { Data: [ { Value: name, Label: 'Setting' }, { Value: value, Label: 'Value' }, { Value: description, Label: 'Meaning' } ] },
  UI.Facets: [ { $Type: 'UI.ReferenceFacet', ID: 'Main', Label: 'Setting', Target: '@UI.FieldGroup#Main' } ]
) { name @Core.Immutable; description @readonly; };

annotate srv.Thresholds with @(
  UI.HeaderInfo: { TypeName: 'Approval threshold', TypeNamePlural: 'Approval thresholds (P2)', Title: { Value: currency }, Description: { Value: amount } },
  UI.LineItem: [ { Value: currency, Label: 'Currency' }, { Value: amount, Label: 'Invoices above this need the AP manager' } ],
  UI.SelectionPresentationVariant #thresholds: { Text: 'P2 thresholds', SelectionVariant: { SelectOptions: [] }, PresentationVariant: { Visualizations: [ '@UI.LineItem' ] } },
  UI.FieldGroup #Main: { Data: [ { Value: currency, Label: 'Currency' }, { Value: amount, Label: 'Threshold amount' } ] },
  UI.Facets: [ { $Type: 'UI.ReferenceFacet', ID: 'Main', Label: 'Threshold', Target: '@UI.FieldGroup#Main' } ]
);

annotate srv.HoldList with @(
  UI.HeaderInfo: { TypeName: 'Payment hold', TypeNamePlural: 'Payment holds (read-only)', Title: { Value: supplierNo }, Description: { Value: reason } },
  UI.LineItem: [ { Value: supplierNo, Label: 'Supplier No.' }, { Value: holdUntil, Label: 'Hold until' }, { Value: reason, Label: 'Reason' } ],
  UI.SelectionPresentationVariant #holds: { Text: 'Payment holds', SelectionVariant: { SelectOptions: [] }, PresentationVariant: { Visualizations: [ '@UI.LineItem' ] } },
  UI.FieldGroup #Main: { Data: [ { Value: supplierNo }, { Value: holdUntil }, { Value: reason } ] },
  UI.Facets: [ { $Type: 'UI.ReferenceFacet', ID: 'Main', Label: 'Hold', Target: '@UI.FieldGroup#Main' } ]
);

// Field labels (also used by the "New Object" dialog that asks for the key first)
annotate srv.PostalCodeRules with { country @Common.Label: 'Country (ISO code)'; pattern @Common.Label: 'Pattern'; example @Common.Label: 'Example'; };
annotate srv.RiskRules       with { field @Common.Label: 'Field'; tier @Common.Label: 'Tier (L/M/H)'; note @Common.Label: 'Why'; };
annotate srv.Settings        with { name @Common.Label: 'Setting'; value @Common.Label: 'Value'; description @Common.Label: 'Meaning'; };
annotate srv.Thresholds      with { currency @Common.Label: 'Currency'; amount @Common.Label: 'Threshold amount'; };
annotate srv.HoldList        with { supplierNo @Common.Label: 'Supplier No.'; holdUntil @Common.Label: 'Hold until'; reason @Common.Label: 'Reason'; };
