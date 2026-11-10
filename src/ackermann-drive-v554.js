/* v5.5.4 Ackermann kinematic driving simulator.
 * All simulated controls are LOCAL to the browser; no ROS commands or collision engine.
 * Convention: CAD X forward, ROS +Y left, Viewer -Z up.
 * yaw=0 -> Viewer +X; positive yaw -> Viewer -Y.
 */
function ackermannWheelAngles(centerRad, wheelbaseM, trackM) {
  if (Math.abs(centerRad) < 1e-8) return {left:0, right:0};
  const signedRadius = wheelbaseM / Math.tan(centerRad);
  return {
    left: Math.atan(wheelbaseM / (signedRadius - trackM/2)),
    right: Math.atan(wheelbaseM / (signedRadius + trackM/2))
  };
}
function ackermannPoseStep(state, speedMps, steerRad, dt, viewerUnitsPerMeter, wheelbaseM) {
  const deltaYaw = speedMps * Math.tan(steerRad) * dt / wheelbaseM;
  const headingMid = state.yawRad + 0.5*deltaYaw;
  return {
    x:state.x + speedMps * viewerUnitsPerMeter * dt * Math.cos(headingMid),
    y:state.y - speedMps * viewerUnitsPerMeter * dt * Math.sin(headingMid),
    yawRad:state.yawRad + deltaYaw
  };
}
function driveApproach(current,target,maxDelta) {
  return current + Math.max(-maxDelta,Math.min(maxDelta,target-current));
}
function createAckermannDriveSim({THREE, scene, camera, orbit, keys,
                                 cad, agvEditor, getViewMode, enterOrbitMode, notify}) {
  const $=id=>document.getElementById(id);
  const panel=$('drivePanel');
  const button=$('driveBtn');
  const status=$('driveStatus');
  const speedEl=$('driveSpeed');
  const steerLimitEl=$('driveSteerLimit');
  const followToggle=$('driveFollow');
  const stateText=$('driveTelemetry');
  const modeText=$('driveModeText');

  let driveMode='idle'; // idle, manual, auto
  let follow=false;
  let activeSceneId=null;
  let startPose=null; // visual placement calibration snapshot. Never auto-overwrite localStorage.
  let v=0, steer=0, totalDistance=0, elapsed=0, autoProgress=0;
  let autoPath=null;
  let pendingAutoPath=null;
  const autoConfirmOverlay=$('driveAutoConfirmOverlay');
  let warning='';
  let trailPositions=[];
  let lastTrailPt=null;
  let frameAccum=0;
  let telemetryAccum=0;
  const FIXED_DT=1/60;
  const MAX_ACCUM=0.1;
  const ACCEL=0.5, BRAKE=0.8, STEER_RATE=THREE.MathUtils.degToRad(90);
  const trailGroup=new THREE.Group();
  trailGroup.name='ACKERMANN_DRIVE_V554_SIM_TRAIL';
  scene.add(trailGroup);
  let trailLine=null;

  function modelReady(){return cad.getDriveState().loaded && cad.getDriveState().sceneReady;}
  function getScale(){return cad.getDriveState().pose.viewerUnitsPerMeter;}
  function currentPose(){return cad.getDriveState().pose;}
  function fmt(n,d=2){return Number(n).toFixed(d);}
  function setStatus(message){warning=message;status.textContent=message;}
  function closeOtherPanels(){
    for(const [panelId,btnId] of [
      ['ackermannPanel','ackermannBtn'],['agvPanel','agvBtn'],
      ['modelSwitchPanel','modelSwitchBtn'],['settings','settingsBtn']
    ]){
      $(panelId)?.classList.remove('open');
      $(btnId)?.classList.remove('active');
    }
  }
  function setPanelOpen(open){
    panel.classList.toggle('open',!!open);
    button.classList.toggle('active',!!open);
    if(open)closeOtherPanels();
    else {
      hideAutoConfirmation();
      if(isActive())stop({exit:true,silent:true});
    } // Closing controls disarms driving.
  }
  function drawTrail(){
    if(trailLine){trailGroup.remove(trailLine);trailLine.geometry.dispose();trailLine.material.dispose();trailLine=null;}
    if(trailPositions.length<2)return;
    const geom=new THREE.BufferGeometry().setFromPoints(trailPositions);
    const mat=new THREE.LineBasicMaterial({color:0x28d8a9,depthTest:false,transparent:true,opacity:.88});
    trailLine=new THREE.Line(geom,mat);
    trailLine.renderOrder=12;
    trailGroup.add(trailLine);
  }
  function clearTrail(){trailPositions=[];lastTrailPt=null;drawTrail();}
  function sampleTrail(){
    const p=currentPose();
    const scale=p.viewerUnitsPerMeter;
    const curr=new THREE.Vector3(p.x,p.y,p.groundZ - .025*scale);
    if(lastTrailPt && curr.distanceTo(lastTrailPt)<Math.max(1e-5,.1*scale))return;
    lastTrailPt=curr;
    trailPositions.push(curr);
    if(trailPositions.length>1800)trailPositions.splice(0,trailPositions.length-1800);
    drawTrail();
  }
  function telemetry(){
    const p=currentPose();
    const leftRight=ackermannWheelAngles(steer,.802603,.688);
    modeText.textContent=driveMode==='manual'?'手动驾驶':driveMode==='auto'?'自动巡航':'待机';
    stateText.textContent=
      `速度 ${fmt(v,3)} m/s | 方向盘 ${fmt(THREE.MathUtils.radToDeg(steer),1)}°\n`+
      `左前轮 ${fmt(THREE.MathUtils.radToDeg(leftRight.left),1)}° / 右前轮 ${fmt(THREE.MathUtils.radToDeg(leftRight.right),1)}°\n`+
      `里程 ${fmt(totalDistance,2)} m | 时间 ${fmt(elapsed,1)} s\n`+
      `X ${fmt(p.x,5)} | Y ${fmt(p.y,5)} | Yaw ${fmt(p.yawDeg,1)}°\n`+
      (warning||'仅浏览器模拟：无碰撞、避障、ROS 指令。');
  }
  function isActive(){return driveMode!=='idle';}
  function hideAutoConfirmation(){
    pendingAutoPath=null;
    autoConfirmOverlay.classList.remove('open');
    autoConfirmOverlay.setAttribute('aria-hidden','true');
  }
  function showAutoConfirmation(path){
    pendingAutoPath=path;
    const km=path.total/getScale();
    $('driveAutoConfirmDetails').textContent=
      `${path.pts.length} \u4e2a\u8def\u70b9\uff0c\u7ebf\u8def\u957f\u5ea6\u7ea6 ${km.toFixed(2)} m\uff0c\u6a21\u62df\u901f\u5ea6 ${Number(speedEl.value).toFixed(2)} m/s`;
    autoConfirmOverlay.classList.add('open');
    autoConfirmOverlay.setAttribute('aria-hidden','false');
    setStatus('\u7b49\u5f85\u7528\u6237\u786e\u8ba4\u6a21\u62df\u8def\u7ebf\uff0c\u5c1a\u672a\u542f\u52a8\u5c0f\u8f66\u3002');
    $('driveAutoConfirmStart').focus();
  }
  function stop({resetSteer=true,exit=false,silent=false}={}){
    v=0;
    if(resetSteer)steer=0;
    cad.animateWheels(steer,0);
    if(exit){driveMode='idle';hideAutoConfirmation();}
    if(follow&&exit)setFollow(false);
    if(exit)keys.clear();
    $('driveStartBtn').textContent='进入手动驾驶';
    $('driveAutoBtn').textContent='启动自动巡航';
    if(!silent)setStatus(exit?'已退出驾驶，车辆已停止。':'车辆已停止。');
    telemetry();
  }
  function reset(){
    stop({exit:true,silent:true});
    clearTrail();
    totalDistance=0;elapsed=0;autoProgress=0;autoPath=null;
    if(startPose&&modelReady()){
      cad.setDrivePose({x:startPose.x,y:startPose.y,yawDeg:startPose.yawDeg,groundZ:startPose.groundZ});
      setStatus('已恢复初始车位（不覆盖保存的标定配置）。');
    }else setStatus('当前场景尚未加载初始小车配置。');
    telemetry();
  }
  function makeReady(){
    if(!modelReady()) {setStatus('先等待 3DGS 场景和 Ackermann GLB 完成加载。');return false;}
    const p=currentPose();
    if(!(p.viewerUnitsPerMeter>0) || !Number.isFinite(p.x) || !Number.isFinite(p.y)){
      setStatus('车辆位置或比例无效；先在 Ackermann CAD 面板校准。');return false;
    }
    return true;
  }
  function beginManual(){
    if(driveMode==='manual') {stop({exit:true});return;}
    if(!makeReady())return;
    stop({exit:true,silent:true});
    if(getViewMode()!=='orbit')enterOrbitMode();
    driveMode='manual';autoPath=null;
    keys.clear();
    $('driveStartBtn').textContent='退出手动驾驶';
    setStatus('驾驶已启用。W/S 前后，A/D 前轮转向；空格紧急停车。');
    notify('驾驶模式：W/S 前进倒车，A/D 转向，空格停车。');
    telemetry();
  }
  function pathFromWaypoints(waypoints){
    if(!Array.isArray(waypoints)||waypoints.length<3)return null;
    const pts=waypoints.map(p=>({x:p.x,y:p.y}));
    const cumulative=[0];
    const lengths=[];
    for(let i=1;i<pts.length;i++){
      const d=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);
      if(d<1e-7)return null;
      lengths.push(d);
      cumulative.push(cumulative.at(-1)+d);
    }
    return {pts,lengths,cumulative,total:cumulative.at(-1)};
  }
  function samplePath(path,offset){
    const u=Math.max(0,Math.min(path.total,offset));
    for(let i=0;i<path.lengths.length;i++){
      if(u<=path.cumulative[i+1]||i===path.lengths.length-1){
        const t=Math.max(0,Math.min(1,(u-path.cumulative[i])/path.lengths[i]));
        const a=path.pts[i],b=path.pts[i+1];
        return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
      }
    }
    return path.pts.at(-1);
  }
  function nearestProgress(path,x,y){
    let bestD2=Infinity,bestArc=0;
    for(let i=0;i<path.lengths.length;i++){
      const a=path.pts[i],b=path.pts[i+1];
      const dx=b.x-a.x,dy=b.y-a.y;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));
      const px=a.x+t*dx,py=a.y+t*dy;
      const d2=(x-px)**2+(y-py)**2;
      if(d2<bestD2){bestD2=d2;bestArc=path.cumulative[i]+t*path.lengths[i];}
    }
    return {arc:bestArc,deviation:Math.sqrt(bestD2)};
  }
  function beginAuto(){
    if(driveMode==='auto'){stop({exit:true});return;}
    if(!makeReady())return;
    const p=currentPose();
    const path=pathFromWaypoints(agvEditor.getWaypoints());
    if(!path){setStatus('\u81ea\u52a8\u5de1\u822a\u9700\u8981\u81f3\u5c11 3 \u4e2a\u4e0d\u91cd\u5408\u7684\u9053\u8def\u8def\u70b9\u3002');return;}
    if(path.total/p.viewerUnitsPerMeter<1){setStatus('\u6f14\u793a\u8def\u7ebf\u603b\u957f\u4e0d\u8db3 1m\uff0c\u8bf7\u91cd\u65b0\u5e03\u7f6e\u9053\u8def\u8def\u70b9\u3002');return;}
    // Do not use window.confirm(): it can asynchronously blur the window,
    // and the existing blur safety handler disarms the simulation immediately.
    // A local DOM overlay does not leave the page or reset keyboard focus.
    if(driveMode==='manual')stop({exit:true,silent:true});
    showAutoConfirmation(path);
  }
  function confirmAutoStart(){
    const path=pendingAutoPath;
    if(!path)return;
    hideAutoConfirmation();
    if(!makeReady())return;
    stop({exit:true,silent:true});
    if(getViewMode()!=='orbit')enterOrbitMode();
    keys.clear(); // no stale Space/keyboard state from the confirmation interaction
    // Start at the first path point with heading aligned to the first segment.
    const first=path.pts[0],second=path.pts[1];
    const theta=Math.atan2(-(second.y-first.y),second.x-first.x);
    cad.setDrivePose({x:first.x,y:first.y,yawDeg:THREE.MathUtils.radToDeg(theta)});
    autoPath=path;autoProgress=0;driveMode='auto';
    frameAccum=0;telemetryAccum=0;
    totalDistance=0;elapsed=0;clearTrail();sampleTrail();
    $('driveAutoBtn').textContent='\u505c\u6b62\u81ea\u52a8\u5de1\u822a';
    setStatus('\u81ea\u52a8\u5de1\u822a\u8fd0\u884c\u4e2d\uff08Pure Pursuit \u89c6\u89c9\u6f14\u793a\uff0c\u65e0\u78b0\u649e\u907f\u969c\uff09\u3002');
    notify('\u81ea\u52a8\u5de1\u822a\u5df2\u542f\u52a8\uff1b\u6309\u7a7a\u683c\u53ef\u4ee5\u7d27\u6025\u505c\u6b62\u3002');
    telemetry();
  }
  function computeAutoDemand(){
    if(!autoPath)return {targetSpeed:0,targetSteer:0};
    const p=currentPose();
    const scale=p.viewerUnitsPerMeter;
    const progress=nearestProgress(autoPath,p.x,p.y);
    autoProgress=Math.max(autoProgress,progress.arc);
    const rest=Math.max(0,(autoPath.total-autoProgress)/scale);
    const maxSpeed=Math.min(1,Math.max(.05,Number(speedEl.value)||.3));
    const lookAheadM=Math.max(.55,Math.min(1.2,.6+Math.abs(v)*.7));
    const look=samplePath(autoPath,autoProgress+lookAheadM*scale);
    const theta=THREE.MathUtils.degToRad(p.yawDeg);
    const dx=(look.x-p.x)/scale,dy=(look.y-p.y)/scale;
    const lateral= -dx*Math.sin(theta) - dy*Math.cos(theta);
    const dist2=Math.max(.02,dx*dx+dy*dy);
    const curvature=2*lateral/dist2;
    const maxAngle=THREE.MathUtils.degToRad(Number(steerLimitEl.value)||25);
    const demand=Math.max(-maxAngle,Math.min(maxAngle,Math.atan(.802603*curvature)));
    if(progress.deviation/scale>1.4){
      stop({exit:true,silent:true});
      setStatus('偏离演示路线超过 1.4m，已终止自动巡航。需重新检查路点和转弯半径。');
      return {targetSpeed:0,targetSteer:0};
    }
    const endpoint=autoPath.pts.at(-1);
    const distanceToEnd=Math.hypot(endpoint.x-p.x,endpoint.y-p.y)/scale;
    if(distanceToEnd<.12 && rest<.18){
      stop({exit:true,silent:true});
      setStatus('已到达演示路线终点，车辆停止。');
      return {targetSpeed:0,targetSteer:0};
    }
    const slowSpeed=Math.sqrt(Math.max(0,2*BRAKE*rest));
    return {targetSpeed:Math.min(maxSpeed,slowSpeed),targetSteer:demand};
  }
  function step(dt){
    if(!makeReadyQuiet())return;
    if(driveMode==='idle')return;
    if(keys.has('Space')){
      stop({exit:true,silent:true});
      setStatus('空格紧急停车：运动已停止，请重新点击开始才能恢复。');
      return;
    }
    const p=currentPose();
    let targetSpeed=0,targetSteer=0;
    const maxSpeed=Math.min(1,Math.max(.05,Number(speedEl.value)||.3));
    const maxSteer=THREE.MathUtils.degToRad(Number(steerLimitEl.value)||25);
    if(driveMode==='manual'){
      const throttle=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
      const steering=Number(keys.has('KeyA'))-Number(keys.has('KeyD'));
      targetSpeed=throttle*maxSpeed;
      targetSteer=steering*maxSteer;
    }else if(driveMode==='auto'){
      const demand=computeAutoDemand();
      if(driveMode!=='auto')return;
      targetSpeed=demand.targetSpeed;
      targetSteer=demand.targetSteer;
    }
    const maxDv=(Math.abs(targetSpeed)<Math.abs(v) ? BRAKE : ACCEL)*dt;
    v=driveApproach(v,targetSpeed,maxDv);
    steer=driveApproach(steer,targetSteer,STEER_RATE*dt);
    const deltaDist=v*dt;
    const next=ackermannPoseStep({x:p.x,y:p.y,yawRad:THREE.MathUtils.degToRad(p.yawDeg)},v,steer,dt,p.viewerUnitsPerMeter,.802603);
    cad.setDrivePose({x:next.x,y:next.y,yawDeg:THREE.MathUtils.radToDeg(next.yawRad)});
    cad.animateWheels(steer,deltaDist);
    totalDistance+=Math.abs(deltaDist);
    elapsed+=dt;
    sampleTrail();
  }
  function makeReadyQuiet(){return modelReady() && Number.isFinite(getScale()) && getScale()>0;}
  function tick(dt){
    if(document.hidden || !makeReadyQuiet())return;
    frameAccum=Math.min(frameAccum+dt,MAX_ACCUM);
    while(frameAccum>=FIXED_DT){step(FIXED_DT);frameAccum-=FIXED_DT;}
    telemetryAccum+=dt;
    if(telemetryAccum>=.15){telemetry();telemetryAccum=0;}
  }
  let viewTarget=new THREE.Vector3();
  let desiredCamera=new THREE.Vector3();
  let currentLook=new THREE.Vector3();
  function updateFollow(dt){
    if(!follow||!makeReadyQuiet())return false;
    if(getViewMode()!=='orbit')return false;
    const p=currentPose(),theta=THREE.MathUtils.degToRad(p.yawDeg),scale=p.viewerUnitsPerMeter;
    const fx=Math.cos(theta),fy=-Math.sin(theta);
    desiredCamera.set(p.x - fx*3.6*scale,p.y - fy*3.6*scale,p.groundZ-1.8*scale);
    viewTarget.set(p.x+fx*.8*scale,p.y+fy*.8*scale,p.groundZ-.4*scale);
    const alpha=1-Math.exp(-4*Math.max(.001,dt));
    camera.position.lerp(desiredCamera,alpha);
    orbit.target.lerp(viewTarget,alpha);
    camera.up.set(0,0,-1);
    camera.lookAt(orbit.target);
    // Updating internal orbit spherical state prevents a jump on exit.
    orbit.update();
    return true;
  }
  function setFollow(on){
    follow=Boolean(on);
    followToggle.checked=follow;
    if(follow){
      if(getViewMode()!=='orbit')enterOrbitMode();
      orbit.enabled=false;
    }else{
      orbit.enabled=true;
    }
  }
  function onSceneLoading(){
    hideAutoConfirmation();
    stop({exit:true,silent:true});
    setFollow(false);startPose=null;activeSceneId=null;
    clearTrail();frameAccum=0;
    totalDistance=0;elapsed=0;autoPath=null;
    setPanelOpen(false);
    setStatus('模型切换中：驾驶已停止，不跨场景复用车位和轨迹。');
  }
  function onSceneLoaded(id){
    activeSceneId=id;
    const p=currentPose();
    startPose={...p};
    stop({exit:true,silent:true});
    clearTrail();frameAccum=0;totalDistance=0;elapsed=0;
    setStatus('已读取本场景小车配置。可进入手动驾驶，或先新建道路演示路线。');
    telemetry();
  }
  button.addEventListener('click',()=>setPanelOpen(!panel.classList.contains('open')));
  $('driveCloseBtn').addEventListener('click',()=>setPanelOpen(false));
  $('driveStartBtn').addEventListener('click',beginManual);
  $('driveAutoBtn').addEventListener('click',beginAuto);
  $('driveEmergencyBtn').addEventListener('click',()=>{stop({exit:true,silent:true});setStatus('紧急停车：运动已停止，需重新点击开始。');telemetry();});
  $('driveResetBtn').addEventListener('click',reset);
  $('driveSaveBtn').addEventListener('click',()=>{
    if(!makeReady())return;
    stop({exit:true,silent:true});
    cad.persistDrivePose();
    startPose={...currentPose()};
    setStatus('已明确保存当前小车位置。此前标定位置已更新，可通过导出 JSON 备份。');
  });
  $('driveClearTrailBtn').addEventListener('click',clearTrail);
  followToggle.addEventListener('change',()=>setFollow(followToggle.checked));
  speedEl.addEventListener('input',()=>{$('driveSpeedRead').textContent=Number(speedEl.value).toFixed(2);});
  steerLimitEl.addEventListener('input',()=>{$('driveSteerRead').textContent=String(Number(steerLimitEl.value));});
  window.addEventListener('ackermann-editor-open',()=>{if(isActive())stop({exit:true,silent:true});});
  window.addEventListener('ackermann-calibration-changed',()=>{
    if(!isActive()&&makeReadyQuiet())startPose={...currentPose()};
  });
  function focusStop(reason){
    if(!isActive())return;
    stop({exit:true,silent:true});
    setStatus(reason);
    telemetry();
  }
  window.addEventListener('blur',()=>focusStop('\u7a97\u53e3\u5931\u53bb\u7126\u70b9\uff0c\u4eff\u771f\u5df2\u505c\u6b62\u3002\u8bf7\u91cd\u65b0\u70b9\u51fb\u542f\u52a8\u3002'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)focusStop('\u5207\u6362\u9875\u9762\u540e\u5df2\u505c\u6b62\u4eff\u771f\uff0c\u8bf7\u91cd\u65b0\u542f\u52a8\u3002');});
  $('driveAutoConfirmStart').addEventListener('click',confirmAutoStart);
  $('driveAutoConfirmCancel').addEventListener('click',()=>{
    hideAutoConfirmation();
    setStatus('\u5df2\u53d6\u6d88\u81ea\u52a8\u5de1\u822a\uff0c\u5c0f\u8f66\u6ca1\u6709\u542f\u52a8\u3002');
    telemetry();
  });
  autoConfirmOverlay.addEventListener('click',event=>{
    if(event.target===autoConfirmOverlay)$('driveAutoConfirmCancel').click();
  });
  window.addEventListener('keydown',event=>{
    if(event.key==='Escape' && pendingAutoPath)$('driveAutoConfirmCancel').click();
  });
  setPanelOpen(false);
  setStatus('等待模型加载；这是虚拟运动演示，不连接 ROS。');
  telemetry();
  return {tick,updateFollow,isActive,onSceneLoading,onSceneLoaded,setPanelOpen,
          stopDrive:()=>stop({exit:true})};
}
