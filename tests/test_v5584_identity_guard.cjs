const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'config/scenes.json'),'utf8'));
const park=catalog.models.find(m=>m.id==='park2_rear_20261019');
assert.equal(park.identityStatus,'blocked');
const bytes=fs.readFileSync(path.join(root,park.url));
const hash=crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(hash,park.identityConflict.sha256);
const header=zlib.gunzipSync(bytes);
assert.equal(header.toString('ascii',0,4),'NGSP');
assert.equal(header.readUInt32LE(8),park.identityConflict.observedSplats);
assert.notEqual(header.readUInt32LE(8),park.splats);
const html=fs.readFileSync(path.join(root,'agv-test.html'),'utf8');
const section=(a,b)=>{const x=html.indexOf(a),y=html.indexOf(b,x+a.length);assert(x>=0&&y>x);return html.slice(x,y);};
const messages=[];let downloads=0,loadingState=true,panelOpen=false;
const context=vm.createContext({crypto:crypto.webcrypto,Uint8Array,Array,Number,Error,
  DEFAULT_SCENE_ID:'epoch30_20261015',EXPECTED_DEFAULT_SIZE:29254747,
  EXPECTED_DEFAULT_SHA:park.identityConflict.sha256,EXPECTED_DEFAULT_URL:'models/2026-10-15_10-31-41_3DGS_epoch_30.spz',
  loading:false,setModelSwitchInfo:m=>messages.push(m),setModelProof:m=>messages.push(m),showError:e=>messages.push(e.message),
  setLoading:value=>{loadingState=value;},setModelPanelOpen:value=>{panelOpen=value;},
  urlExists:async()=>{downloads++;return true;}
});
vm.runInContext(section('async function verifyDownloadedModel(bytes,spec){','const MODEL_HINTS=')+
  section('async function switchToScene(entry){','// v5.5.3 - Detailed SolidWorks'),context);
(async()=>{
  await context.switchToScene(park);assert.equal(downloads,0);assert(messages.includes(park.identityError));
  assert.equal(loadingState,false);assert.equal(panelOpen,true);
  await assert.rejects(()=>context.verifyDownloadedModel(bytes,park),/byte-identical/);
  const {identityStatus,identityError,...withoutFlag}=park;
  await assert.rejects(()=>context.verifyDownloadedModel(bytes,withoutFlag),/epoch30 bytes cannot be loaded as park2/);
  await context.verifyDownloadedModel(bytes,{id:'epoch30_20261015',url:context.EXPECTED_DEFAULT_URL});
  const geo=fs.readFileSync(path.join(root,'src/geo-panel.mjs'),'utf8');
  const start=geo.indexOf("    if(id.startsWith('scene:')"),end=geo.indexOf('    const gaussianCount=',start);
  assert(start>=0&&end>start);let warned=false;
  const guard=new Function('id','warn',geo.slice(start,end)+'return true;');
  assert.equal(guard('scene:park2_rear_20261019',()=>{warned=true;}),undefined);assert(warned);
  assert.equal(guard('scene:epoch30_20261015',()=>assert.fail()),true);
  console.log('IDENTITY_GUARD_PASS: real legacy SPZ count/hash; blocked scene; direct load defense; epoch30 verification retained; geo scene isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
