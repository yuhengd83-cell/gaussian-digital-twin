const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../agv-test.html'),'utf8');
const from=html.indexOf('const TRACK_GRADIENT_PALETTES =');
const to=html.indexOf('/* AGV trajectory editor, v5.5 Stage 1.');
assert(from>0 && to>from);
const source=html.slice(from,to);
class Vector3 {constructor(x,y,z){this.x=x;this.y=y;this.z=z}distanceToSquared(p){return (this.x-p.x)**2+(this.y-p.y)**2+(this.z-p.z)**2}}
class Color {constructor(n=0){this.set(n)}set(n){this.r=(n>>16&255)/255;this.g=(n>>8&255)/255;this.b=(n&255)/255;return this}copy(p){Object.assign(this,{r:p.r,g:p.g,b:p.b});return this}lerp(p,t){this.r+=(p.r-this.r)*t;this.g+=(p.g-this.g)*t;this.b+=(p.b-this.b)*t;return this}}
class CurvePath{constructor(){this.curves=[]}add(p){this.curves.push(p)}}
class LineCurve3{constructor(a,b){this.a=a;this.b=b}}
class TubeGeometry{constructor(curve,tubularSegments,radius,radialSegments,closed){this.curve=curve;this.tubularSegments=tubularSegments;this.radius=radius;this.radialSegments=radialSegments;this.closed=closed;this.attrs={}}setAttribute(k,v){this.attrs[k]=v}}
class BufferAttribute{constructor(array,itemSize){this.array=array;this.itemSize=itemSize}}
class MeshBasicMaterial{constructor(opts){this.options=opts}}
class Mesh{constructor(geometry,material){this.geometry=geometry;this.material=material}}
const controls={};for(const id of ['tracePaletteAgv','tracePaletteDrive','traceWidthAgv','traceWidthDrive','traceWidthValueAgv','traceWidthValueDrive'])controls[id]={handlers:{},value:'',textContent:'',addEventListener(name,fn){this.handlers[name]=fn}};
const store=new Map();
const context={THREE:{Vector3,Color,CurvePath,LineCurve3,TubeGeometry,BufferAttribute,MeshBasicMaterial,Mesh,DoubleSide:2},document:{getElementById(id){return controls[id]||null}},localStorage:{getItem(k){return store.get(k)||null},setItem(k,v){store.set(k,v)}}};
vm.createContext(context);vm.runInContext(source+'\nthis.HELLO={createColoredTrackMesh,traceAppearance};',context);
const {createColoredTrackMesh,traceAppearance}=context.HELLO;
assert.strictEqual(controls.traceWidthAgv.value,'0.08');
let updates=0;traceAppearance.subscribe(()=>updates++);
traceAppearance.loadScene('park2');
controls.tracePaletteDrive.handlers.change({target:{value:'neon'}});
controls.traceWidthAgv.handlers.input({target:{value:'0.15'}});
assert.strictEqual(traceAppearance.get().palette,'neon');
assert.strictEqual(traceAppearance.get().widthMeters,0.15);
assert.strictEqual(controls.traceWidthValueDrive.textContent,'15 cm');
assert.strictEqual(controls.tracePaletteAgv.value,'neon');
assert(store.has('agv-track-style-v5542:park2'));
traceAppearance.loadScene('office');
assert.strictEqual(traceAppearance.get().palette,'rainbow');
traceAppearance.loadScene('park2');
assert.strictEqual(traceAppearance.get().palette,'neon');
assert(updates>=4);
const input=[new Vector3(0,0,0),new Vector3(2,0,0),new Vector3(2,1,0)];
const m=createColoredTrackMesh(input,0.03,'plan','rainbow');
assert(m instanceof Mesh);assert(Math.abs(m.geometry.radius-0.015)<1e-10);
const c=m.geometry.attrs.color;
assert.strictEqual(c.itemSize,3);
assert.strictEqual(c.array.length,(m.geometry.tubularSegments+1)*(m.geometry.radialSegments+1)*3);
assert(c.array[0]!==c.array.at(-3) || c.array[1]!==c.array.at(-2));
const longPoints=[];for(let i=0;i<1800;i++)longPoints.push(new Vector3(i/100,0,0));
const trail=createColoredTrackMesh(longPoints,0.04,'trail','warm');
assert(trail.geometry.curve.curves.length<=349);
assert(trail.geometry.tubularSegments<=850);
assert.strictEqual(createColoredTrackMesh([input[0]],.04,'plan','rainbow'),null);
console.log('PASS scene-specific palette/width persistence');
console.log('PASS mirrored controls and gradient vertex colors');
console.log('PASS actual mesh tube radius and long trail downsample');
console.log('ALL COLOR TRACKS TESTS PASSED');
