using InsightsService as srv from '../../srv/insights-service';

// App "Supplier Change Insights" (DataSteward, Auditor): analytical list page = chart + table + visual filters.
// Pattern from SAP's public sample SAP-samples/cap-sflight (app/travel_analytics), applied to our facts.
annotate srv.RequestFacts with @(
  Aggregation.ApplySupported: {
    Transformations: [ 'aggregate', 'topcount', 'bottomcount', 'identity', 'concat', 'groupby', 'filter', 'search' ],
    GroupableProperties: [ supplierNo, supplierName, status, statusName, riskTier, riskTierText, approvalMode, approvalModeText, requestedBy, decidedBy, requestedOn ],
    AggregatableProperties: [ { Property: ID } ]
  },
  Analytics.AggregatedProperty #countRequests: {
    Name: 'countRequests', AggregationMethod: 'countdistinct', AggregatableProperty: ID,
    @Common.Label: 'Requests'
  },
  Common.SemanticKey: [ ID ]
) {
  ID           @UI.Hidden: false @title: 'Request';
  supplierName @title: 'Supplier';
  supplierNo   @title: 'Supplier No.';
  status       @title: 'Status'      @Common.Text: statusName   @Common.TextArrangement: #TextOnly;
  riskTier     @title: 'Risk tier'   @Common.Text: riskTierText @Common.TextArrangement: #TextOnly;
  approvalMode @title: 'Approval path' @Common.Text: approvalModeText @Common.TextArrangement: #TextOnly;
  riskTierText @title: 'Risk tier';
  approvalModeText @title: 'Approval path';
  statusName @title: 'Status';
  requestedBy  @title: 'Requested by';
  requestedOn  @title: 'Requested on';
  decidedBy    @title: 'Decided by';
  decidedAt    @title: 'Decided at';
  riskReason   @title: 'Why this risk';
  reason       @title: 'Reason';
};

annotate srv.RequestFacts with @(
  UI.Chart: {
    Title: 'Change requests by supplier', ChartType: #Column,
    DynamicMeasures: [ '@Analytics.AggregatedProperty#countRequests' ],
    Dimensions: [ supplierName, riskTierText ],
    MeasureAttributes: [ { DynamicMeasure: '@Analytics.AggregatedProperty#countRequests', Role: #Axis1 } ],
    DimensionAttributes: [ { Dimension: supplierName, Role: #Category }, { Dimension: riskTierText, Role: #Series } ]
  },
  UI.PresentationVariant: {
    SortOrder: [ { Property: requestedOn, Descending: true } ],
    Visualizations: [ '@UI.Chart', '@UI.LineItem' ]
  },
  UI.SelectionFields: [ status, riskTier, approvalMode, supplierName ],
  UI.LineItem: [
    { Value: requestedOn }, { Value: supplierName }, { Value: reason }, { Value: status },
    { Value: riskTier }, { Value: approvalMode }, { Value: requestedBy }, { Value: decidedBy }, { Value: decidedAt }
  ],
  UI.HeaderInfo: { TypeName: 'Change Request', TypeNamePlural: 'Change Requests', Title: { Value: supplierName }, Description: { Value: reason } },
  UI.FieldGroup #Detail: { Data: [
    { Value: supplierNo }, { Value: supplierName }, { Value: reason }, { Value: status }, { Value: riskTier },
    { Value: riskReason }, { Value: approvalMode }, { Value: requestedBy }, { Value: requestedOn }, { Value: decidedBy }, { Value: decidedAt }
  ]},
  UI.Facets: [ { $Type: 'UI.ReferenceFacet', ID: 'Detail', Label: 'Request', Target: '@UI.FieldGroup#Detail' } ]
);

// Visual filters: small bar charts above the table that filter by click
annotate srv.RequestFacts with @(
  UI.PresentationVariant #pvStatus: { Visualizations: [ '@UI.Chart#chartStatus' ] },
  UI.Chart #chartStatus: {
    ChartType: #Bar, DynamicMeasures: [ '@Analytics.AggregatedProperty#countRequests' ], Dimensions: [ status ],
    MeasureAttributes: [ { DynamicMeasure: '@Analytics.AggregatedProperty#countRequests', Role: #Axis1 } ],
    DimensionAttributes: [ { Dimension: status, Role: #Category } ]
  },
  UI.PresentationVariant #pvRisk: { Visualizations: [ '@UI.Chart#chartRisk' ] },
  UI.Chart #chartRisk: {
    ChartType: #Bar, DynamicMeasures: [ '@Analytics.AggregatedProperty#countRequests' ], Dimensions: [ riskTier ],
    MeasureAttributes: [ { DynamicMeasure: '@Analytics.AggregatedProperty#countRequests', Role: #Axis1 } ],
    DimensionAttributes: [ { Dimension: riskTier, Role: #Category } ]
  },
  UI.PresentationVariant #pvMode: { Visualizations: [ '@UI.Chart#chartMode' ] },
  UI.Chart #chartMode: {
    ChartType: #Bar, DynamicMeasures: [ '@Analytics.AggregatedProperty#countRequests' ], Dimensions: [ approvalMode ],
    MeasureAttributes: [ { DynamicMeasure: '@Analytics.AggregatedProperty#countRequests', Role: #Axis1 } ],
    DimensionAttributes: [ { Dimension: approvalMode, Role: #Category } ]
  }
) {
  status @Common.ValueList #vlStatus: { CollectionPath: 'RequestFacts', PresentationVariantQualifier: 'pvStatus',
           Parameters: [ { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: status, ValueListProperty: 'status' } ] };
  riskTier @Common.ValueList #vlRisk: { CollectionPath: 'RequestFacts', PresentationVariantQualifier: 'pvRisk',
           Parameters: [ { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: riskTier, ValueListProperty: 'riskTier' } ] };
  approvalMode @Common.ValueList #vlMode: { CollectionPath: 'RequestFacts', PresentationVariantQualifier: 'pvMode',
           Parameters: [ { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: approvalMode, ValueListProperty: 'approvalMode' } ] };
};
