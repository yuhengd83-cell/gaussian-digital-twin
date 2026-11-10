import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {meshToWgs84,solveSimilarity,checkRegistration,transformViewerToMesh,validateGeoref,verifyRegistrationDocument} from '../src/geo-registration.mjs';
const geoPath=process.env.AGV_TEST_DATA_ROOT?path.join(process.env.AGV_TEST_DATA_ROOT,'config/epoch30_georeference.json'):new URL('../config/epoch30_georeference.json',import.meta.url);
const geo=JSON.parse(fs.readFileSync(geoPath,'utf-8'));
validateGeoref(geo);
// Field-derived expectations stay outside the public candidate until redistribution is authorized.
const fieldExpectations=JSON.parse(fs.readFileSync(process.env.AGV_PRIVATE_GEO_EXPECTATIONS || new URL('./private/epoch30_expected.json',import.meta.url),'utf-8'));
const g=meshToWgs84([0,0,0],geo);
assert.ok(Math.abs(g.longitude-fieldExpectations.origin[0])<1e-8,'origin lon');
assert.ok(Math.abs(g.latitude-fieldExpectations.origin[1])<1e-8,'origin lat');
assert.ok(Math.abs(g.ellipsoidalHeight-fieldExpectations.origin[2])<.001,'origin h');
const first=meshToWgs84(fieldExpectations.firstMesh,geo);
assert.ok(Math.abs(first.longitude-fieldExpectations.first[0])<1e-8,'PLY vertex longitude');
assert.ok(Math.abs(first.latitude-fieldExpectations.first[1])<1e-8,'PLY vertex latitude');
assert.ok(Math.abs(first.ellipsoidalHeight-fieldExpectations.first[2])<.001,'PLY vertex height');
const v=[[-.9,-.6,-.05],[.5,-.7,-.1],[.7,.6,.05],[-.8,.7,.1],[.2,.1,-.3],[.28,-.34,.09]];
// Rotate 180deg around X: viewer X unchanged, viewer Y and Z signs flip. Scale 13.54 m/u.
function expected(p){return [13.54*p[0]+4.8,-13.54*p[1]-9.3,-13.54*p[2]+1.23]}
const pairs=v.map(viewer=>({viewer,mesh:expected(viewer)}));
const s=solveSimilarity(pairs.slice(0,5));
assert.ok(Math.abs(s.scale-13.54)<1e-7,'scale accurate');
assert.ok(s.fitRmsMeters<1e-6,'fit accurate');
const result=checkRegistration(pairs.slice(0,4),pairs.slice(4),0.25);
assert.ok(result.accepted,'independent checks pass');
assert.ok(result.checkMaxMeters<1e-6,'check errors');
const p=transformViewerToMesh([.4,.1,-.2],result);
const want=expected([.4,.1,-.2]);
assert.ok(p.every((x,i)=>Math.abs(x-want[i])<1e-6),'viewer to mesh');
const bad=[...pairs.slice(4).map(x=>({...x,mesh:x.mesh.map(v=>v+2)}))];
assert.ok(!checkRegistration(pairs.slice(0,4),bad,.5).accepted,'bad check blocked');
assert.throws(()=>solveSimilarity(Array(4).fill(0).map((_,i)=>({viewer:[i,0,0],mesh:[i,0,0]}))),/共线/);
assert.throws(()=>checkRegistration(pairs.slice(0,4),[],1),/检查点/);
assert.throws(()=>verifyRegistrationDocument({schema:'agv-geo-registration-v1',georefId:'wrong',pairs, maxErrorMeters:.5},geo),/mismatch/);
// A general oblique SO(3) rotation, not just axis flips.
const angle=.61,c=Math.cos(angle),sn=Math.sin(angle);
function expected2(p){let x=p[0],y=p[1],z=p[2];return [8*(c*x-sn*y)+17,8*(sn*x+c*y)-22,8*z+5]}
const ps=v.map(viewer=>({viewer,mesh:expected2(viewer)}));
const q=checkRegistration(ps.slice(0,5),ps.slice(5),.1);
assert.ok(q.accepted&&q.checkMaxMeters<1e-6,'oblique rigid rotation');
// Reflection cannot be used to counterfeit a valid rigid registration in a noncoplanar test.
const mirrored=v.map(viewer=>({viewer,mesh:[-viewer[0]*10+3,viewer[1]*10-2,viewer[2]*10+1]}));
const reflectionResult=checkRegistration(mirrored.slice(0,5),mirrored.slice(5),.05);
assert.ok(!reflectionResult.accepted,'improper reflection rejected');
console.log('GEO_REGRESSION_PASS: origin and PLY vertex geodetic, SO(3) similarity, held-out checks, degeneracy, tamper, reflection rejection');
