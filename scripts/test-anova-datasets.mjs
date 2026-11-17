import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
after(()=>server.close());
const {localPropagationAnovaGroup,propagationAnovaGroup}=await server.ssrLoadModule('/src/lib/anovaDatasets.js');

const rows=['Chip1','Chip2','Chip3'].flatMap((chip_id,i)=>[1,2,3,4].flatMap(wg=>[1550,1560].map(wavelength_nm=>({
  __normalized:true,chip_id,waveguide_id:`WG${wg}`,waveguide_index:wg,metric_family:'propagation',relative_length_mm:[0,4,11,19][wg-1],wavelength_nm,
  loss_db:5+[0,4,11,19][wg-1]*(wavelength_nm===1560?.7:.3+i*.1)+(wg===3?12:0)
}))));
const snapshot=()=>({id:'test',label:'Reviewed snapshot',projectName:'MPW1',waferName:'Slot2',rawRows:rows,sourceMeta:{name:'test',propagationMseThreshold:100,propagationTargetWavelengthNm:1560,excludedWaveguideIdsByChip:{Chip1:['WG3'],Chip2:['WG3'],Chip3:['WG3']}},analyticsReview:{excludedChipIds:['Chip3'],excludedWaveguideIdsByChip:{Chip1:['WG3'],Chip2:['WG3'],Chip3:['WG3']},propagationSettings:{propagationTargetWavelengthNm:1550,propagationWindowNm:0,propagationMseThreshold:.01}}});

test('local ANOVA import uses saved fit settings, waveguide selections and chip exclusions',()=>{
  const g=localPropagationAnovaGroup(snapshot());
  assert.deepEqual(g.observations.map(r=>r.chipId),['Chip1','Chip2']);
  assert.ok(Math.abs(g.observations[0].value-3)<1e-10);assert.ok(Math.abs(g.observations[1].value-4)<1e-10);
  assert.equal(g.context.settings.targetWavelengthNm,1550);assert.equal(g.context.settings.mseThreshold,.01);
  assert.deepEqual(g.context.excludedWaveguideIdsByChip.Chip1,['WG3']);assert.equal(g.cohortId,'["mpw1","slot2"]');
  assert.equal(g.context.measuredChipCount,3);assert.equal(g.context.acceptedChipCount,2);
});
test('explicitly cleared exclusions override stale source metadata and failed chips do not enter ANOVA',()=>{
  const d=snapshot();d.analyticsReview.excludedWaveguideIdsByChip={};
  assert.throws(()=>localPropagationAnovaGroup(d),/no included chips/);
  delete d.analyticsReview.excludedWaveguideIdsByChip;
  assert.equal(localPropagationAnovaGroup(d).observations.length,2);
  assert.throws(()=>localPropagationAnovaGroup({rawRows:[]}),/no measurement/);
});
test('remote adapter retains finite passing selected values and provenance without inventing wafer identity',()=>{
  const d={id:'remote1',folder:'public-folder',scope:'remote',label:'Remote'};
  const g=propagationAnovaGroup(d,{settings:{mseThreshold:.4},analyticsReview:{excludedChipIds:['Chip2']},propagation:{byChip:[
    {chipId:'Chip1',lossDbPerCm:0,passMse:true},{chipId:'Chip2',lossDbPerCm:99,passMse:true},
    {chipId:'Chip3',lossDbPerCm:8,passMse:false},{chipId:'Chip4',lossDbPerCm:Infinity,passMse:true}
  ]}});
  assert.deepEqual(g.observations,[{chipId:'Chip1',value:0}]);assert.equal(g.cohortId,null);
  assert.equal(g.sourceKey,'public-folder');assert.equal(g.context.settings.mseThreshold,.4);assert.match(g.source,/GitHub/);
});
