const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const html=read('agv-test.html');
const source=fs.readFileSync(path.join(root,'home_epoch30_20261015.json'));
const home=JSON.parse(source);
const catalog=JSON.parse(read('config/scenes.json'));
const entry=catalog.models.find(m=>m.id==='epoch30_20261015');
assert.equal(catalog.defaultModel,entry.id);
assert.equal(entry.homeConfig,'config/home_epoch30_20261015.json');
assert.equal(entry.url,'models/2026-10-15_10-31-41_3DGS_epoch_30.spz');
assert(source.equals(fs.readFileSync(path.join(root,entry.homeConfig))),'home source bytes changed');
assert.equal(home.modelId,'scene:'+entry.id);
for(const v of [home.homeView.p,home.homeView.t,home.sceneUp]){
  assert.equal(v.length,3);assert(v.every(Number.isFinite));
}
assert.notDeepEqual(home.homeView.p,home.homeView.t);
assert.deepEqual(home.sceneUp,[0,0,-1]);assert.equal(home.upAxis,'-Z');
assert.equal(home.firstPersonPitchLimitDeg,45);assert.equal(home.orbitPitchLimitDeg,55);assert.equal(home.rollLocked,true);
const tags=html.match(/<input\b[^>]*\bid="speed"[^>]*>/g)||[];
assert.equal(tags.length,1);
for(const [key,value] of Object.entries({min:'0.15',max:'6.0',value:'0.90',step:'0.05'}))assert(tags[0].includes(`${key}="${value}"`));
assert(html.includes('<span id="speedValue">0.90</span>'));
assert(html.includes('<input id="driveSpeed" type="range" min="0.05" max="1.0" step="0.05" value="0.30">'));
function section(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert(a>=0&&b>a,'missing source section '+start);return html.slice(a,b);
}
const move=section('function updateFpsMove(dt){','// ========== SPZ');
const actualLoader=section('async function loadPermanentConfig(){','function downloadJson(');
const addModel=section('async function addModel(init,id){','async function loadLocalFile(');
const reset=section('function resetHome(){','// ========== 第一人称控制');
const applied=[];let fetches=0;
const vec=()=>({copy(){return this;},multiplyScalar(){return this;},addScaledVector(){return this;},normalize(){return this;},crossVectors(){return this;}});
const steps=[];
const context=vm.createContext({
  console,Number,Math,Set,activeSceneSpec:entry,currentId:home.modelId,permanentConfig:null,
  fetch:async(url,options)=>{assert.equal(url,entry.homeConfig);assert.equal(options.cache,'no-store');fetches++;return {ok:true,json:async()=>JSON.parse(read(url))};},
  applyView:view=>{assert.equal(JSON.stringify(view),JSON.stringify(home.homeView));applied.push(view);return true;},
  loadLocalHome:()=>{throw Error('permanent home must precede local home');},
  autoFrame:()=>{throw Error('unexpected fallback');},setStatus(){},setLoading(){},setParsingStage(){},toast(){},
  removeModel(){},clearError(){},showError:e=>{throw e;},
  SplatMesh:class{constructor(){this.quaternion={set(){}};this.initialized=Promise.resolve();}},
  scene:{add(){}},currentModel:null,autoView:null,currentBytes:null,
  computeRobustBounds:async()=>({}),dropEl:{classList:{add(){}}},
  agvMiniMap:{onModelLoaded(){}},agvEditor:{onModelLoaded(){}},geoPanel:{onModelLoaded(){}},
  ackermannCad:{onSceneLoaded:async()=>{},getDriveState:()=>({sceneReady:false})},driveSim:{},
  $:id=>id==='speed'?{value:context.speed}:{disabled:true},
  mode:'fps',IS_TOUCH:true,document:{},canvas:{},fpsYaw:0,
  groundForward:vec(),groundRight:vec(),refForward:vec(),refRight:vec(),SCENE_UP:vec(),
  camera:{position:{addScaledVector:(_,amount)=>steps.push(amount)}},
  keys:new Set(['KeyW']),joystickX:0,joystickY:0,mobileVertical:0
});
vm.runInContext(move+actualLoader+addModel+reset,context);
(async()=>{
  for(const speed of [0.15,0.9,6]){
    context.speed=String(speed);steps.length=0;context.updateFpsMove(0.5);
    assert.deepEqual(steps,[speed*0.5],'movement multiplied speed again');
  }
  for(let i=0;i<2;i++){
    context.permanentConfig=null;
    assert.equal(await context.addModel({},home.modelId),true,'startup/reload model path');
    context.resetHome();
  }
  assert.equal(fetches,2);assert.equal(applied.length,4);
  context.currentId='scene:wrong';
  assert.equal(await context.loadPermanentConfig(),null,'reject other scene home');
  assert.equal(context.permanentConfig,null);
  const input=section('$("speed").oninput=()=>{','async function toggleFullscreen');
  const display={},speedEl={value:'6.00'};context.$=id=>id==='speed'?speedEl:display;
  vm.runInContext(input,context);speedEl.oninput();assert.equal(display.textContent,'6.00');
  console.log('V5584_SPEED_HOME_PASS: exact home bytes; slider bounds/display; actual movement; startup/reload/reset with mocked rendering; cross-scene rejection');
})().catch(e=>{console.error(e);process.exitCode=1;});
