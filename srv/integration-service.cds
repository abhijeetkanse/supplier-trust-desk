using { mdcr } from '../db/schema';
using from '../db/integration';

// Machine-to-machine API for P2 and P3 (SAP Build trial). No UI uses it.
// Callers log in with P4's technical client (OAuth client credentials).
// Their token carries the scope "Integration", granted in xs-security.json
// via "authorities". Human users (Rita, Sam, ...) never get this scope.
//
// What callers may do:
//   read   Suppliers, Addresses, open/closed ChangeRequests (P4 master data, read-only)
//   read   HoldList, Thresholds (P2 configuration, read-only)
//   write  InvoiceDecisions (P2) and Issues (P3)
//   never  approve anything: four-eyes approval stays with people in P4's own app.
@title: 'Supplier Trust Desk - P4 integration API'
@Core.Description: 'Central data for P2 (invoice decisions) and P3 (supplier data issues). Technical client only (scope Integration).'
@path: '/odata/v4/integration'
@requires: 'Integration'
service IntegrationService {

  @readonly entity Suppliers as projection on mdcr.Suppliers { ID, supplierNo, name, taxNumber, addresses };
  @readonly entity Addresses as projection on mdcr.Addresses;

  @readonly entity ChangeRequests as projection on mdcr.ChangeRequests {
    ID, supplier.supplierNo as supplierNo, status.code as status, reason, createdAt, modifiedAt,
    riskTier, approvalMode, decidedAt   // P2 counts recent applied changes per supplier (priority signal)
  };

  @readonly entity HoldList   as projection on mdcr.HoldList;
  @readonly entity Thresholds as projection on mdcr.Thresholds;

  entity InvoiceDecisions as projection on mdcr.InvoiceDecisions;
  entity Issues           as projection on mdcr.Issues;

  // P3 import of P1's findings: creates new issues, merges repeats, reports rejected rows.
  type Finding {
    partnerId    : String(10);
    addressId    : String(10);
    field        : String(30);
    rule         : String(40);
    severity     : String(6);
    currentValue : String(255);
  }
  type ImportReport {
    created  : Integer;
    merged   : Integer;
    rejected : Integer;
    errors   : many String;
  }
  action importFindings(findings : many Finding) returns ImportReport;
}
