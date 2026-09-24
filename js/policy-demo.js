(function attachPolicyDemo(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeDemo = api;
})(typeof globalThis === 'object' ? globalThis : this, function createPolicyDemo() {
  'use strict';

  const AMBIGUITY_FIXTURE = deepFreeze({
    fixtureId:'semantic-ambiguous',
    requestText:'Rút thời hạn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng ban hành.',
    change:{ ruleId:'R-PK-01', oldValue:'7 ngày', newValue:'5 ngày', issuerTier:2 },
    document:{ id:'AMBIG-01', tier:2, lines:['Sinh viên phúc khảo trong 7 ngày.'] },
    semanticOutput:{
      schemaVersion:1,
      candidates:[{
        ruleId:'R-PK-01', documentId:'AMBIG-01', lineIndex:0,
        quote:'phúc khảo', start:10, end:19, relation:'possibly_related',
        explanation:'May refer to this policy.',
        evidence:[{ quote:'phúc khảo', start:10, end:19 }]
      }]
    }
  });
  const SAFE_DATE_SCENARIO = deepFreeze({
    requestText:'Rút thời hạn sinh viên nộp đơn phúc khảo từ 7 ngày xuống 5 ngày, do Trưởng phòng Đào tạo ban hành.',
    ruleId:'R-PK-01', newValue:'5 ngày', issuerTier:2,
    document:{
      id:'DEMO-7D', title:'Phụ lục minh họa hạn phúc khảo', owner:'Phòng Đào tạo',
      tier:2, version:'1.0', lines:[
        'Nộp đơn phúc khảo trong 7 ngày kể từ ngày công bố điểm; ngày minh họa trên mẫu: 17/07/2025.'
      ]
    }
  });

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function copy(value) { return JSON.parse(JSON.stringify(value)); }

  function getAmbiguityScenario() { return copy(AMBIGUITY_FIXTURE); }
  function getSafeDateScenario() { return copy(SAFE_DATE_SCENARIO); }
  function proofForDisplay(proposal, prove) {
    if (proposal && proposal.applied === true && proposal.proof && proposal.proof.allowed === true) {
      return proposal.proof;
    }
    return typeof prove === 'function' ? prove(proposal) : null;
  }

  function createAmbiguityFixtureAdapter() {
    const output = copy(AMBIGUITY_FIXTURE.semanticOutput);
    return Object.freeze({
      async discover() { return { available:true, output:copy(output) }; }
    });
  }

  return Object.freeze({ getAmbiguityScenario, getSafeDateScenario, createAmbiguityFixtureAdapter, proofForDisplay });
});
