const fs=require('fs');
const assert=require('assert');
const text=fs.readFileSync(require('path').join(__dirname,'..','agv-test.html'),'utf8');
const checks=[
 ['small circular map', 'id="agvMiniDock"'],
 ['large interactive canvas','id="agvMapCanvas"'],
 ['edit waypoints','function addWaypointFromMap('],
 ['edit shared coordinates','function moveWaypointFromMap('],
 ['delete route points','function removeWaypoint('],
 ['save route in original editor','saveWaypointMap:()=>persist()'],
 ['separate map camera', 'new THREE.OrthographicCamera('],
 ['fallback projection', 'fallbackPointProjection('],
 ['car position icon',"ackermannCad.getDriveState()"],
 ['map controller in scene-load flow', 'void agvMiniMap.onModelLoaded(id,currentModel,agvBoundsPromise);'],
 ['keyboard isolation', "document.body.classList.contains('agv-map-open')"],
 ['SPZ length fix preserved', 'return received===total ? direct : direct.slice(0,received);']
];
checks.forEach(([name,needle])=>{assert(text.includes(needle),name+' missing');console.log('PASS '+name);});
console.log('PASS '+checks.length+'/'+checks.length+' static checks');
