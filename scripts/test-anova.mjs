import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeAnova, fSurvival, holmAdjust, parseAnovaCsv, parseAnovaProject, anovaReportCsv } from '../src/lib/anova.js';

const close = (a,b,tolerance=1e-11) => assert.ok(Math.abs(a-b)<tolerance, `${a} != ${b}`);
const groups = values => values.map((rows,i)=>({label:`Group ${i+1}`, observations:rows.map((value,j)=>({chipId:`Chip${j+1}`,value}))}));
const run = (values, method='welch') => analyzeAnova(groups(values),{method,independent:true});
const fixture = [[1,2,3,4],[3,5,7],[2,4,6,8,10]];

test('classical ANOVA matches the published SciPy mussel-shell reference example',()=>{
  // scipy.stats.f_oneway documentation: five independent populations.
  const r=run([
    [.0571,.0813,.0831,.0976,.0817,.0859,.0735,.0659,.0923,.0836],
    [.0873,.0662,.0672,.0819,.0749,.0649,.0835,.0725],
    [.0974,.1352,.0817,.1016,.0968,.1064,.105],
    [.1033,.0915,.0781,.0685,.0677,.0697,.0764,.0689],
    [.0703,.1026,.0956,.0973,.1039,.1045]
  ],'classical');
  assert.deepEqual(r.errors,[]); close(r.omnibus.f,7.121019471642447);
  close(r.omnibus.p,.0002812242314534544,1e-14);
  assert.equal(r.omnibus.df1,4); assert.equal(r.omnibus.df2,34);
});

test('Welch handles unequal group sizes and variances with adjusted degrees of freedom',()=>{
  const r=run(fixture); const o=r.omnibus;
  // Independent hand calculation: n=(4,3,5), means=(5/2,5,6), variances=(5/3,4,10).
  const weights=[12/5,3/4,1/2]; const total=73/20;
  const mean=255/73; const correction=weights.reduce((s,w,i)=>s+(1-w/total)**2/([4,3,5][i]-1),0);
  const numerator=weights.reduce((s,w,i)=>s+w*([2.5,5,6][i]-mean)**2,0)/2;
  close(o.f,numerator/(1+correction/4)); close(o.df2,8/(3*correction));
  // For numerator df=2 the F survival function has this closed form.
  close(o.p,(o.df2/(o.df2+2*o.f))**(o.df2/2));
  close(o.f,3.1765909161348973); close(o.df2,4.929837240900811);
  assert.equal(o.etaSquared,undefined);
});

test('F survival agrees with analytic distributions, including small tails',()=>{
  for(const f of [.0001,.1,1,10,1e10]) close(fSurvival(f,2,2),1/(1+f),1e-13);
  for(const f of [.1,1,10]) close(fSurvival(f,1,1),1-2/Math.PI*Math.atan(Math.sqrt(f)));
  close(fSurvival(1e20,2,4),(4/(4+2e20))**2,1e-48);
  assert.equal(fSurvival(0,3,5),1); assert.equal(fSurvival(Infinity,3,5),0);
  assert.equal(fSurvival(-1,3,5),null); assert.equal(fSurvival(1,0,5),null);
});

test('two-group Welch ANOVA equals the squared Welch t comparison',()=>{
  const r=run(fixture.slice(0,2)); close(r.omnibus.f,r.pairs[0].t**2);
  close(r.omnibus.df2,r.pairs[0].df); close(r.omnibus.p,r.pairs[0].p);
  close(r.pairs[0].adjustedP,r.pairs[0].p);
});

test('classical SS partition, effect sizes, pooled pairwise and median Levene are correct',()=>{
  const r=run(fixture,'classical'); const o=r.omnibus;
  close(o.betweenSs,335/12); close(o.withinSs,53); close(o.totalSs,971/12);
  close(o.etaSquared,335/971); close(o.omegaSquared,.18592);
  close(r.pairs[0].t,-2.5/Math.sqrt((53/9)*(1/4+1/3)));
  assert.equal(r.pairs[0].df,9);
  close(r.varianceCheck.f,(4.8/2)/( (223/15)/9));
  const v=r.varianceCheck; close(v.p,(v.df2/(v.df2+2*v.f))**(v.df2/2));
});

test('Holm adjusts the full comparison family and restores original order',()=>{
  assert.deepEqual(holmAdjust([.01,.04,.03]),[.03,.06,.06]);
  assert.deepEqual(holmAdjust([.6,.001,.02,.02]),[.6,.004,.06,.06]);
  assert.deepEqual(holmAdjust([]),[]);
});

test('F upper tails match analytic distributions including small probabilities',()=>{
  for(const f of [0,.01,1,10,100,1e12]) {
    close(fSurvival(f,2,2),1/(1+f),1e-13);
    close(fSurvival(f,1,1),2/Math.PI*Math.atan(1/Math.sqrt(f)),1e-13);
  }
  assert.equal(fSurvival(Infinity,2,8),0);assert.equal(fSurvival(-1,2,8),null);
  assert.equal(fSurvival(1,0,8),null);
});

test('inference is invariant to common shifts and positive unit scaling',()=>{
  for(const method of ['classical','welch']){
    const a=run(fixture,method),b=run(fixture.map(rows=>rows.map(v=>v*10+100)),method);
    close(a.omnibus.f,b.omnibus.f); close(a.omnibus.p,b.omnibus.p);
    close(a.pairs[0].adjustedP,b.pairs[0].adjustedP);
  }
});

test('independence acknowledgement, group counts and distinct identities are required',()=>{
  const g=groups(fixture);
  assert.match(analyzeAnova(g).errors.join(' '),/Confirm/);
  assert.match(run([[1,2]]).errors.join(' '),/two groups/);
  assert.match(run([[1],[2,3]]).errors.join(' '),/two chip/);
  assert.match(analyzeAnova(g,{independent:true,alpha:0}).errors.join(' '),/Significance/);
  g[1].label=g[0].label; assert.match(analyzeAnova(g,{independent:true}).errors.join(' '),/distinct/);
});

test('nonfinite, malformed and duplicate-chip input never produces a p-value',()=>{
  for(const value of [NaN,Infinity,null,'2']){
    const g=groups(fixture); g[0].observations[0].value=value;
    const r=analyzeAnova(g,{independent:true}); assert.equal(r.omnibus,null); assert.match(r.errors.join(' '),/finite/);
  }
  const g=groups(fixture); g[0].observations[1].chipId='Chip1';
  assert.match(analyzeAnova(g,{independent:true}).errors.join(' '),/unique/);
  assert.match(analyzeAnova([{label:'bad',observations:null}]).errors.join(' '),/observations/);
});

test('same dataset and same identified wafer/chip are blocked across groups',()=>{
  const g=groups(fixture); g[0].sourceKey='same';g[1].sourceKey='same';
  assert.match(analyzeAnova(g,{independent:true}).errors.join(' '),/dataset/);
  delete g[1].sourceKey;g[0].cohortId='wafer';g[1].cohortId='wafer';
  assert.match(analyzeAnova(g,{independent:true}).errors.join(' '),/paired/);
  g[1].cohortId='different'; assert.deepEqual(analyzeAnova(g,{independent:true}).errors,[]);
});

test('disabled groups are excluded and constants give explicit estimation errors',()=>{
  const g=groups(fixture);g[2].enabled=false;
  assert.equal(analyzeAnova(g,{independent:true}).groups.length,2);
  assert.equal(run([[1,1],[2,3]]).omnibus,null);
  assert.equal(run([[1,1],[2,2]],'classical').omnibus,null);
  assert.ok(run([[1,1],[2,3]],'classical').omnibus);
  close(run([[1,2,3],[1,2,3]]).omnibus.p,1);
});

test('CSV parses quotes, BOM, scientific notation, negative and true-zero values',()=>{
  const g=parseAnovaCsv('\uFEFFgroup,chip_id,loss_db_per_cm,wafer_id\r\n"Wafer, A",Chip1,0,A\r\n"Wafer, A",Chip2,-2e-1,A\r\n"Wafer ""B""",Chip1,3.2,B');
  assert.equal(g[0].label,'Wafer, A');assert.equal(g[0].observations[0].value,0);
  assert.equal(g[0].observations[1].value,-.2);assert.equal(g[1].label,'Wafer "B"');
});

test('CSV rejects missing/duplicate headers, invalid numbers, duplicates and inconsistent wafers',()=>{
  for(const csv of ['group,chip_id,value\nA,C1,1','group,chip_id,loss_db_per_cm,group\nA,C1,1,A','group,chip_id,loss_db_per_cm\nA,C1,',
    'group,chip_id,loss_db_per_cm\nA,C1,Infinity','group,chip_id,loss_db_per_cm\nA,C1,1\nA,C1,2',
    'group,chip_id,loss_db_per_cm,wafer_id\nA,C1,1,W1\nA,C2,2,W2',
    'group,chip_id,loss_db_per_cm\n"A"junk,C1,1','group,chip_id,loss_db_per_cm\n"A,C1,1']) assert.throws(()=>parseAnovaCsv(csv));
});

test('CSV report preserves inputs, assumptions, notes and Holm results safely',()=>{
  const r=run(fixture); r.independent=true;r.notes='=unsafe spreadsheet formula';
  const csv=anovaReportCsv(r);
  assert.match(csv,/Independence acknowledged/);assert.match(csv,/Holm/);assert.match(csv,/Chip1/);
  assert.match(csv,/adjustedP/);assert.match(csv,/'=unsafe/);assert.match(csv,/selection bias/);
});

test('project JSON round trip keeps groups/settings/provenance but discards imported results and acknowledgements',()=>{
  const original={kind:'cornerstone-propagation-anova',schemaVersion:1,unit:'dB/cm',groups:groups(fixture),method:'classical',alpha:.01,notes:'Study',result:{p:0},independenceAcknowledged:true};
  original.groups[0].context={settings:{mseThreshold:.3}};original.groups[2].enabled=false;
  const restored=parseAnovaProject(JSON.stringify(original));
  assert.equal(restored.method,'classical');assert.equal(restored.alpha,.01);assert.equal(restored.notes,'Study');
  assert.equal(restored.groups[2].enabled,false);assert.equal(restored.groups[0].context.settings.mseThreshold,.3);
  assert.equal(restored.result,undefined);assert.equal(restored.independenceAcknowledged,undefined);
  original.groups[2].observations[0].value=null;
  assert.throws(()=>parseAnovaProject(JSON.stringify(original)),/finite/);
  original.groups[2].observations[0].value=2;original.groups[0].source={unexpected:'object'};
  assert.throws(()=>parseAnovaProject(JSON.stringify(original)),/source/);
  original.unit='dB/mm';assert.throws(()=>parseAnovaProject(JSON.stringify(original)),/dB\/cm/);
});
