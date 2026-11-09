using { mdcr } from '../db/schema';

// RuleAdmin (key user): maintains the rule tables the server checks.
// Every row records who changed it and when (managed aspect), so rule changes are audited too.
// RuleAdmin can neither request nor approve changes (segregation of duties).
@path: '/odata/v4/config'
service ConfigService @(requires: 'RuleAdmin') {
  @odata.draft.enabled entity PostalCodeRules as projection on mdcr.PostalCodeRules;
  @odata.draft.enabled entity RiskRules       as projection on mdcr.RiskRules;
  @odata.draft.enabled entity Thresholds      as projection on mdcr.Thresholds;

  // Only the seeded settings exist: they can be changed, not created or deleted
  @odata.draft.enabled
  @restrict: [{ grant: ['READ', 'UPDATE'], to: 'RuleAdmin' }]
  entity Settings as projection on mdcr.Settings;

  // Payment holds are set by the bank-change process (B3), never by a rule administrator
  @readonly entity HoldList as projection on mdcr.HoldList;
}
