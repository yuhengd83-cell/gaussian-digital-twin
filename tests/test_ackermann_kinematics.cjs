const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'../src/ackermann-drive-v554.js'),'utf8');
const sandbox={Math,console,Number,Boolean,Array,Set};
vm.createContext(sandbox);
vm.runInContext(src+'; globalThis.exports={ackermannPoseStep,ackermannWheelAngles,driveApproach,createAckermannDriveSim};',sandbox);
const {ackermannPoseStep,ackermannWheelAngles,driveApproach,createAckermannDriveSim}=sandbox.exports;
const L=.802603,s=.0738821;
let checks=0;
function check(msg,fn){fn();checks++;process.stdout.write('PASS '+msg+'\n');}
function near(actual,expect,tol=1e-6){assert.ok(Math.abs(actual-expect)<tol,`${actual} != ${expect}`);}
check('forward +X 1m at yaw=0',()=>{const p=ackermannPoseStep({x:0,y:0,yawRad:0},1,0,1,s,L);near(p.x,s);near(p.y,0);near(p.yawRad,0);});
check('reverse toward -X at yaw=0',()=>{const p=ackermannPoseStep({x:0,y:0,yawRad:0},-.3,0,1,s,L);near(p.x,-.3*s);});
check('positive turn goes to viewer -Y and yaw positive',()=>{const p=ackermannPoseStep({x:0,y:0,yawRad:0},.3,.2,1,s,L);assert.ok(p.y<0&&p.yawRad>0);});
check('negative turn goes to viewer +Y and yaw negative',()=>{const p=ackermannPoseStep({x:0,y:0,yawRad:0},.3,-.2,1,s,L);assert.ok(p.y>0&&p.yawRad<0);});
check('steering without linear motion does not move',()=>{const p=ackermannPoseStep({x:1,y:2,yawRad:.2},0,.4,1,s,L);near(p.x,1);near(p.y,2);near(p.yawRad,.2);});
check('Ackermann left has more left-inner steer',()=>{const a=ackermannWheelAngles(.3,L,.688);assert.ok(a.left>a.right&&a.right>0);});
check('Ackermann right has more right-inner steer',()=>{const a=ackermannWheelAngles(-.3,L,.688);assert.ok(a.right<a.left&&a.left<0);});
check('straight wheels remain straight',()=>{const a=ackermannWheelAngles(0,L,.688);near(a.left,0);near(a.right,0);});
check('max steer radius about 1.72m',()=>near(L/Math.tan(25*Math.PI/180),1.7213,.005));
check('2.26m calibration matches 0.167 viewer units',()=>near(2.26*s,.16697,.0001));
check('bounded approach',()=>{near(driveApproach(0,1,.1),.1);near(driveApproach(.8,0,.2),.6);});

// Dynamic controller test with a minimal, headless Three.js/DOM simulator.
class FakeElement{
  constructor(){
    this.value='';this.checked=false;this.textContent='';this.listeners={};this.attrs={};
    this.classes=new Set();
    this.classList={toggle:(n,on)=>on?this.classes.add(n):this.classes.delete(n),
      add:n=>this.classes.add(n),remove:n=>this.classes.delete(n),contains:n=>this.classes.has(n)};
  }
  addEventListener(name,cb){(this.listeners[name]??=[]).push(cb);}
  setAttribute(name,value){this.attrs[name]=value;}
  focus(){}
  click(){this.fire('click');}
  fire(name){for(const f of (this.listeners[name]||[]))f({target:this});}
}
class V3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  distanceTo(other){return Math.hypot(this.x-other.x,this.y-other.y,this.z-other.z);}
  lerp(other,a){this.x+=(other.x-this.x)*a;this.y+=(other.y-this.y)*a;this.z+=(other.z-this.z)*a;return this;}
}
class Group {constructor(){this.children=[];this.name='';}add(o){this.children.push(o);}remove(o){this.children=this.children.filter(x=>x!==o);}}
class BufferGeometry {setFromPoints(x){this.pts=x;return this;}dispose(){}}
class Material{dispose(){}}
class Line{constructor(geometry,material){this.geometry=geometry;this.material=material;}}
const THREE={Group,Vector3:V3,BufferGeometry,LineBasicMaterial:Material,Line,MathUtils:{degToRad:d=>d*Math.PI/180,radToDeg:r=>r*180/Math.PI}};
const ids=new Map();
function el(id){if(!ids.has(id))ids.set(id,new FakeElement());return ids.get(id);}
el('driveSpeed').value='0.3';el('driveSteerLimit').value='25';
const document={getElementById:el,hidden:false,addEventListener(){}};
const events=new Map();
const window={addEventListener(n,fn){(events.get(n)??(events.set(n,[]),events.get(n))).push(fn);}};
const cad={
  state:{loaded:true,sceneReady:true,pose:{x:.10827,y:-.34869,groundZ:.006,yawDeg:0,viewerUnitsPerMeter:s}},
  wheelRecords:[],
  getDriveState(){return {...this.state,pose:{...this.state.pose}};},
  setDrivePose(p){Object.assign(this.state.pose,p);},
  animateWheels(a,dist){this.wheelRecords.push({a,dist});},
  persistDrivePose(){}
};
const keys=new Set();
const orbit={target:new V3(),enabled:true,update(){}};
const camera={position:new V3(),up:{set(){}},lookAt(){}};
const scene=new Group();
const route={getWaypoints(){return[{x:0,y:0,z:0},{x:.15,y:0,z:0},{x:.3,y:0,z:0}]}};
let mode='orbit';
Object.assign(sandbox,{THREE,document,window,confirm:()=>{throw new Error("Native confirm() must not execute");},Event:class Event{constructor(type){this.type=type;}}});
const controller=createAckermannDriveSim({THREE,scene,camera,orbit,keys,cad,agvEditor:route,
  getViewMode:()=>mode,enterOrbitMode:()=>{mode='orbit';},notify(){} });
check('controller initializes and remembers scene',()=>{controller.onSceneLoaded('scene:park2_rear_20261019');assert.equal(controller.isActive(),false);});
check('manual W accelerates car in +X',()=>{
  el('driveStartBtn').fire('click');assert.equal(controller.isActive(),true);
  keys.add('KeyW');for(let i=0;i<80;i++)controller.tick(1/60);
  keys.delete('KeyW');assert.ok(cad.state.pose.x>.10827);assert.ok(cad.wheelRecords.length>0);
});
check('manual A turns positive yaw/negative viewer Y',()=>{
  keys.add('KeyW');keys.add('KeyA');const before=cad.state.pose.y;
  for(let i=0;i<100;i++)controller.tick(1/60);
  keys.clear();assert.ok(cad.state.pose.y<before);assert.ok(cad.state.pose.yawDeg>0);
});
check('Space disarms and stops',()=>{
  keys.add('Space');controller.tick(1/60);assert.equal(controller.isActive(),false);keys.clear();
});
check('reset recovers original verified placement',()=>{
  el('driveResetBtn').fire('click');near(cad.state.pose.x,.10827,1e-9);near(cad.state.pose.y,-.34869,1e-9);near(cad.state.pose.yawDeg,0,1e-9);
});
check('automatic route uses in-page confirmation, not browser confirm',()=>{
  el('driveAutoBtn').fire('click');
  assert.equal(controller.isActive(),false);
  assert.equal(el('driveAutoConfirmOverlay').classes.has('open'),true);
  assert.equal(el('driveAutoConfirmOverlay').attrs['aria-hidden'],'false');
});
check('cancelling confirmation leaves car idle',()=>{
  el('driveAutoConfirmCancel').fire('click');
  assert.equal(controller.isActive(),false);
  assert.equal(el('driveAutoConfirmOverlay').classes.has('open'),false);
});
check('automatic route starts and moves after in-page confirmation',()=>{
  el('driveAutoBtn').fire('click');
  el('driveAutoConfirmStart').fire('click');
  assert.equal(controller.isActive(),true);
  assert.equal(el('driveAutoBtn').textContent,'\u505c\u6b62\u81ea\u52a8\u5de1\u822a');
  const x0=cad.state.pose.x;
  for(let i=0;i<70;i++)controller.tick(1/60);
  assert.ok(cad.state.pose.x>x0);
  assert.ok(el('driveTelemetry').textContent.includes('\u65f6\u95f4'));
});
check('loss of focus stops and correctly updates visible status',()=>{
  for(const cb of (events.get('blur')||[]))cb({});
  assert.equal(controller.isActive(),false);
  assert.equal(el('driveAutoBtn').textContent,'\u542f\u52a8\u81ea\u52a8\u5de1\u822a');
  assert.ok(el('driveStatus').textContent.includes('\u5931\u53bb\u7126\u70b9'));
});
check('switching scene cancels pending confirmation and stops driving',()=>{
  el('driveAutoBtn').fire('click');
  controller.onSceneLoading();
  assert.equal(controller.isActive(),false);
  assert.equal(el('driveAutoConfirmOverlay').classes.has('open'),false);
});
console.log('ALL '+checks+' TESTS PASSED');
