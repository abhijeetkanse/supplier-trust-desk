namespace mdcr;

using { cuid, managed, sap.common.CodeList } from '@sap/cds/common';

// Field names follow the S/4HANA Business Partner API (API_BUSINESS_PARTNER):
//   A_BusinessPartner        -> Suppliers  (BusinessPartner, BusinessPartnerFullName, tax number)
//   A_BusinessPartnerAddress -> Addresses  (StreetName, HouseNumber, PostalCode, CityName, Country)
// All data in this app is fictional.

entity Suppliers : cuid, managed {
  supplierNo : String(10) @mandatory;          // like BusinessPartner
  name       : String(80) @mandatory;          // like BusinessPartnerFullName
  taxNumber  : String(20);                     // like BPTaxNumber
  addresses  : Composition of many Addresses on addresses.supplier = $self;
  requests   : Association to many ChangeRequests on requests.supplier = $self;
}

entity Addresses : cuid {
  supplier    : Association to Suppliers;
  street      : String(60);                    // StreetName
  houseNumber : String(10);                    // HouseNumber
  postalCode  : String(10);                    // PostalCode
  city        : String(40);                    // CityName
  country     : String(2);                     // Country (ISO 3166-1 alpha-2)
}

// One change request = one reason + one or more field changes, decided once.
entity ChangeRequests : cuid, managed {
  supplier     : Association to Suppliers @mandatory;
  address      : Association to Addresses;     // needed when an address field changes
  reason       : String(255) @mandatory;
  status       : Association to RequestStatus default 'N' @readonly;  // only the server's actions change it (fix 9 Nov: was writable in a draft)
  decidedBy    : String(255) @readonly;
  decidedAt    : Timestamp   @readonly;
  decisionNote : String(255) @readonly;
  requestedOn  : Date        @readonly;      // set by the server when the request is first saved
  // Risk-based approval (set by the server on save and again on submit):
  //   L = low: format corrections only -> applied on submit by the requester alone (approvalMode Auto)
  //   M = medium: identity or location changes -> a steward must approve (approvalMode FourEyes)
  //   H = high: bank and contact data (planned with B1/B2/C1) -> approval + call-back + payment hold
  riskTier     : String(1)   @readonly @assert.range enum { L; M; H; };
  riskReason   : String(255) @readonly;
  approvalMode : String(10)  @readonly @assert.range enum { Auto; FourEyes; };
  items        : Composition of many ChangeItems on items.parent = $self;
}

entity ChangeItems : cuid {
  parent   : Association to ChangeRequests;
  field    : String(20) @mandatory @assert.range enum {
               street; houseNumber; postalCode; city; country; name; taxNumber;
             };
  oldValue : String(80) @readonly;             // filled by the server, never by the client
  newValue : String(80) @mandatory;
}

// N = New (saved, not yet submitted) · S = Submitted · A = Approved (applied) · R = Rejected
entity RequestStatus : CodeList {
  key code : String(1) enum { New = 'N'; Submitted = 'S'; Approved = 'A'; Rejected = 'R'; };
}

// Postal-code format per country (regular expression), used by rule R1. Maintained by RuleAdmin.
entity PostalCodeRules : managed {
  key country : String(2);
      pattern : String(100) @mandatory;
      example : String(20);
}

// Risk tier per changeable field. Maintained by RuleAdmin, who may raise a tier but never
// lower name, taxNumber or country below M (floor enforced in the server).
entity RiskRules : managed {
  key field : String(20) @assert.range enum { street; houseNumber; postalCode; city; country; name; taxNumber; };
      tier  : String(1)  @mandatory @assert.range enum { L; M; H; };
      note  : String(255);
}

// Numeric settings of the risk policy. Only the seeded names exist; RuleAdmin may change the values.
entity Settings : managed {
  key name        : String(40);
      value       : Integer @mandatory;
      description : String(255);
}
