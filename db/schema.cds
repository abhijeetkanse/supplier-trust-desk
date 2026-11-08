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
  status       : Association to RequestStatus default 'N';
  decidedBy    : String(255) @readonly;
  decidedAt    : Timestamp   @readonly;
  decisionNote : String(255) @readonly;
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

// Postal-code format per country (regular expression), used by rule R1.
entity PostalCodeRules {
  key country : String(2);
      pattern : String(100) @mandatory;
      example : String(20);
}
