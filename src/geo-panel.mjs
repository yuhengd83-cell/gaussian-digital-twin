import {GEO_SCHEMA,validateGeoref,meshToWgs84,transformViewerToMesh,checkRegistration} from './geo-registration.mjs';

/* v5.5.7 browser controller: never presents field GNSS fixes. Coordinates remain
 * disabled until a user-supplied, scene-scoped correspondence fit passes a held-out check.
 */
export function createGeoPanel({THREE,canvas,camera,getViewMode,enterOrbitMode,ackermannCad,agvEditor,driveSim,keys,notify}){
  const $=id=>document.getElementById(id);
  const panel=$('geoPanel'),toggle=$('geoBtn'),message=$('geoMessage');
  const $safe=(id)=>document.getElementById(id);
  let georef=null,sceneId='',sceneOk=false,approved=null;
  let pairs=[],pickId=null,rev=0,sceneEpoch=0,lastTick=0,limit=.5;
  let lastVehiclePoseText='';
  let mapHoverText='',mapHoverUntil=0;
  const GEO_KEY=id=>'agv-geo-v557:'+id;
  // This exact source file, not a substring such as "park2", owns the Mesh georeference.
  // The downloaded bytes must match the audited SPZ SHA-256 before coordinates are enabled.
  const EXPECTED_SPZ_SHA256='e332130c5c8ae17babcf013d135108e63146f3115ede3509d8d9cb23ea5f1f13';
  const EXPECTED_SPZ_BYTES=29254747;
  const EXPECTED_SPZ_SPLATS=1739253;
  async function sha256Bytes(bytes){
    if(!globalThis.crypto?.subtle)throw new Error('此浏览器没有安全 SHA-256 接口，不能验证坐标所属模型');
    const data=bytes instanceof Uint8Array ? bytes : bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : null;
    if(!data)throw new Error('模型下载字节不可用，无法进行身份核验');
    const digest=await globalThis.crypto.subtle.digest('SHA-256',data);
    return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  }
  const normalNumber=n=>typeof n==='number'&&Number.isFinite(n);
  const parseNum=s=>{
    if(typeof s==='number')return Number.isFinite(s)?s:NaN;
    const str=String(s??'').trim();if(!str)return NaN;
    return Number(str);
  };
  const stringify=(n,places=4)=>Number.isFinite(n)?n.toFixed(places):'待配准';
  const safeVec=v=>Array.isArray(v)&&v.length===3&&v.every(normalNumber);
  const vecFromInputs=(row,prefix)=>[0,1,2].map(i=>parseNum(row.querySelector(`[data-field="${prefix}${i}"]`)?.value));
  function warn(t,isBad=false){message.textContent=t;message.classList.toggle('geoBad',!!isBad);}
  function downloadJson(doc,name){
    const url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1200);
  }
  function clearOutput(){
    approved=null;$('geoVehicleCoords').textContent='经纬度：未配准';
    $('geoRegistrationState').textContent='未完成控制点配准';
    $('geoPathExportBtn').disabled=true;
    const s=$safe('geoDriveReadout');if(s)s.textContent='地理坐标：未配准 · 非 GNSS 实时定位';
    const map=$safe('agvMapGeoStatus');if(map)map.textContent='地理定位：未配准（路线仍为 Viewer 坐标）';
  }
  function currentState(){return ackermannCad.getDriveState();}
  function available(){return !!georef&&sceneOk&&!!sceneId;}
  function sourceStatus(){
    $('geoFileCRS').textContent=georef?.epsgMeshSource||'尚未读取';
    const origin=georef?.wgs84OriginLonLatEllipsoidalHeight;
    $('geoOrigin').textContent=origin?
      `${origin[0].toFixed(9)}° E / ${origin[1].toFixed(9)}° N / h=${origin[2].toFixed(3)} m`:
      '等待地理参考文件';
    $('geoRefState').textContent=!georef?'尚未加载参考数据':
      sceneOk?'epoch_30 Mesh 地理参考已读取 · SPZ 待配准':'当前模型尚未通过 epoch_30 SHA-256 身份核验';
    $('geoSceneId').textContent=sceneId||'尚未加载模型';
  }
  function getPair(id){return pairs.find(p=>p.id===id)}
  function assignInputPair(row,p){
    const pp=getPair(p.id);if(!pp)return;
    pp.role=row.querySelector('[data-field="role"]').value;
    pp.label=row.querySelector('[data-field="label"]').value.trim().slice(0,50)||'控制点';
    pp.viewer=vecFromInputs(row,'v');pp.mesh=vecFromInputs(row,'m');
    invalidate();
  }
  function invalidate(){approved=null;rev++;$safe('geoPathExportBtn').disabled=true;clearOutput();$('geoQuality').textContent='对应点已变化，待重新求解';warn('控制点已变化。请重新求解、检查独立验证点，确认后才能启用车辆经纬度。');}
  function inputHTML(prefix,vec){return [0,1,2].map((i)=>`<label class="geoCoord"><span>${'XYZ'[i]}</span><input type="number" data-field="${prefix}${i}" step="any" inputmode="decimal" placeholder="${prefix==='v'?'Viewer':'米'}" value="${Number.isFinite(vec?.[i])?vec[i]:''}"></label>`).join('')}
  function drawPairs(){
    const holder=$('geoPairList');holder.replaceChildren();
    pairs.forEach((p,i)=>{
      const row=document.createElement('div');row.className='geoPoint';row.dataset.id=p.id;
      const header=document.createElement('div');header.className='geoPointHeader';
      const title=document.createElement('b');title.textContent=`${i+1}. `;
      const name=document.createElement('input');name.className='geoName';name.value=p.label||'';name.dataset.field='label';name.maxLength=50;name.placeholder='同名地物（例如固定墙角）';
      const role=document.createElement('select');role.className='geoRole';role.dataset.field='role';
      for(const [val,label] of [['control','拟合点'],['check','独立检查点']]){const opt=document.createElement('option');opt.value=val;opt.textContent=label;role.append(opt)}
      role.value=p.role==='check'?'check':'control';
      const del=document.createElement('button');del.className='settingsBtn';del.textContent='删除';del.type='button';del.addEventListener('click',()=>{pairs=pairs.filter(x=>x.id!==p.id);drawPairs();invalidate();});
      header.append(title,name,role,del);
      const viewer=document.createElement('div');viewer.className='geoInputGrid';viewer.innerHTML=`<span>Viewer XYZ</span>${inputHTML('v',p.viewer)}`;
      const mesh=document.createElement('div');mesh.className='geoInputGrid';mesh.innerHTML=`<span>Mesh XYZ (m)</span>${inputHTML('m',p.mesh)}`;
      const tools=document.createElement('div');tools.className='geoPointButtons';
      const useVehicle=document.createElement('button');useVehicle.type='button';useVehicle.className='settingsBtn';useVehicle.textContent='取小车位置';
      useVehicle.addEventListener('click',()=>{
        const s=currentState();if(!s?.sceneReady||s.sceneModelId!==sceneId){warn('请先加载本场景 Ackermann 小车',true);return;}
        p.viewer=[s.pose.x,s.pose.y,s.pose.groundZ];drawPairs();invalidate();warn('已复制车辆 Viewer 坐标；必须确认 Mesh 中是同一个物理位置。');
      });
      const pick=document.createElement('button');pick.type='button';pick.className='settingsBtn';pick.textContent='从三维参考地面取点';
      pick.addEventListener('click',()=>beginPicking(p.id));
      tools.append(useVehicle,pick);
      row.append(header,viewer,mesh,tools);holder.append(row);
      for(const input of row.querySelectorAll('input,select'))input.addEventListener('change',()=>assignInputPair(row,p));
    });
    $('geoPairCount').textContent=`${pairs.filter(p=>p.role==='control').length} 拟合点 + ${pairs.filter(p=>p.role==='check').length} 检查点`;
  }
  function newPair(role){
    if(pairs.length>=50){warn('最多 50 组对应点',true);return;}
    const id='p'+(++rev)+'_'+Math.random().toString(36).slice(2,6);
    pairs.push({id,role,label:role==='check'?'独立检查点':'同名控制点',viewer:[NaN,NaN,NaN],mesh:[NaN,NaN,NaN]});
    drawPairs();invalidate();
  }
  function stopPicking(){
    pickId=null;canvas.style.cursor='';
    $('geoPickHint').textContent='可手动输入三维 Viewer XYZ；“地面取点”只取参考平面的估计坐标。';
    if(getViewMode()==='orbit'){$safe('orbitBtn');}
  }
  function beginPicking(id){
    if(!available()){warn('只有正确加载已验证 epoch_30 SPZ 并读取地理参考时才能取点',true);return;}
    if(driveSim.isActive()){warn('小车正在运动，请先停车再取点',true);return;}
    if(agvEditor.getDiagnostics()?.placing){warn('请先关闭 AGV 原有布点模式',true);return;}
    if(getViewMode()!=='orbit')enterOrbitMode();
    pickId=id;panel.classList.remove('open');toggle.classList.remove('active');
    canvas.style.cursor='crosshair';
    $('geoPickHint').textContent='请在三维场景中单击一个清晰的地面物理特征；该操作只拾取参考平面，不是高斯深度拾取。';
    notify('地理配准取点：点击三维地面同名特征；Esc 取消。');
  }
  function onPointer(e){
    if(!pickId)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(e.pointerType==='mouse'&&e.button!==0)return;
    const rect=canvas.getBoundingClientRect();
    const mx=(e.clientX-rect.left)/rect.width*2-1;
    const my=-(e.clientY-rect.top)/rect.height*2+1;
    const raycaster=new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mx,my),camera);
    const gz=agvEditor.getGroundZ();
    const hit=new THREE.Vector3();
    if(!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-gz),hit)){
      warn('点击未与参考地面相交，请调整视角或手动输入三维 Viewer XYZ。',true);return;
    }
    const p=getPair(pickId);
    if(p){p.viewer=[hit.x,hit.y,hit.z];invalidate();drawPairs();}
    stopPicking();setPanelOpen(true);
    warn(`已记录 Viewer = ${[hit.x,hit.y,hit.z].map(x=>x.toFixed(5)).join(', ')}，请从 Mesh 中取得同一位置的米制坐标。`);
  }
  canvas.addEventListener('pointerdown',onPointer,true);
  addEventListener('keydown',e=>{if(e.key==='Escape'&&pickId){stopPicking();setPanelOpen(true);}});
  function setPanelOpen(on){
    panel.classList.toggle('open',!!on);toggle.classList.toggle('active',!!on);
    document.body.classList.toggle('geo-panel-open',!!on);
    if(on){keys?.clear?.();
      for(const [pid,bid] of [['agvPanel','agvBtn'],['drivePanel','driveBtn'],['ackermannPanel','ackermannBtn'],['modelSwitchPanel','modelSwitchBtn'],['settings','settingsBtn'],['sharePanel','shareBtn']]){
        $(pid)?.classList.remove('open');$(bid)?.classList.remove('active');
      }
      if($('agvMapOverlay')?.classList.contains('open'))$('agvMapClose')?.click();
      sourceStatus();drawPairs();
    }
  }
  function refreshVehicle(){
    if(!approved||!available())return null;
    const state=currentState();
    if(!state||!state.sceneReady||state.sceneModelId!==sceneId)return null;
    const p=state.pose,viewer=[p.x,p.y,p.groundZ];
    const mesh=transformViewerToMesh(viewer,approved);
    const wgs=meshToWgs84(mesh,georef);
    return {viewer,mesh,wgs};
  }
  function setVehicleDisplay(){
    const car=refreshVehicle();
    let str='车辆：未配准 · 不是 GNSS 实时定位';
    if(car){
      const {longitude,latitude,ellipsoidalHeight}=car.wgs;
      str=`经 ${longitude.toFixed(8)}° · 纬 ${latitude.toFixed(8)}° · 椭球高 ${ellipsoidalHeight.toFixed(2)}m`;
      $('geoVehicleCoords').textContent=str;
    }else $('geoVehicleCoords').textContent='经纬度：未配准（禁止推算 AGV 地理位置）';
    const drive=$safe('geoDriveReadout'),map=$safe('agvMapGeoStatus');
    if(drive)drive.textContent=car?`模拟地理坐标 · ${str} · 非 GNSS`:'地理坐标：未配准 · 非 GNSS 实时定位';
    if(map)map.textContent=performance.now()<mapHoverUntil&&mapHoverText?mapHoverText:(car?`模拟车辆地理位置：${str}（模型配准推算）`:'地理定位：未配准（路线仍为 Viewer 坐标）');
  }
  function compute(){
    if(!available()){warn('仅经过 SHA-256 核验的 epoch_30 SPZ 可使用当前地理参考数据',true);return;}
    if(pickId)stopPicking();
    try{
      const valid=pairs.filter(p=>safeVec(p.viewer)&&safeVec(p.mesh));
      if(valid.length!==pairs.length)throw new Error('存在未填写完整的坐标行；请填完或删除');
      const controls=valid.filter(p=>p.role==='control'),checks=valid.filter(p=>p.role==='check');
      const currentLimit=parseNum($('geoMaxError').value);
      const result=checkRegistration(controls,checks,currentLimit);
      limit=currentLimit;
      $('geoQuality').textContent=`拟合 RMS ${result.fitRmsMeters.toFixed(3)} m；拟合最大 ${result.fitMaxMeters.toFixed(3)} m；独立检查 RMS ${result.checkRmsMeters.toFixed(3)} m；检查最大 ${result.checkMaxMeters.toFixed(3)} m；尺度 ${result.scale.toFixed(6)} m/Viewer unit。`;
      if(result.accepted){
        approved=result;$('geoPathExportBtn').disabled=false;
        $('geoRegistrationState').textContent='独立检查通过 · 模型内坐标已配准';
        warn('配准通过：可以显示模型推算的模拟经纬度。未独立验证现场 GNSS 位置与全场精度。');
        setVehicleDisplay();
      }else{
        clearOutput();
        warn('配准未通过：误差超过阈值。请检查控制点是否确为同一物理特征及 XYZ 轴向。',true);
      }
      return result;
    }catch(error){
      clearOutput();$('geoQuality').textContent='无可用解';
      warn('配准阻止：'+(error?.message||String(error)),true);
      return null;
    }
  }
  function docForSave(){
    return {
      schema:GEO_SCHEMA,version:'5.5.7.1',sceneModelId:sceneId,sceneFamily:'epoch30_20261015',georefId:georef?.georefId,
      maxErrorMeters:limit,method:'3D similarity rotation+positive scale+translation (Horn); independent check',
      pairs:pairs.map(({id,role,label,viewer,mesh})=>({id,role,label,viewer,mesh})),
      result:approved?{scale:approved.scale,translation:approved.translation,rotation:approved.rotation,fitRmsMeters:approved.fitRmsMeters,fitMaxMeters:approved.fitMaxMeters,checkRmsMeters:approved.checkRmsMeters,checkMaxMeters:approved.checkMaxMeters}:null,
      status:approved?'MODEL_CORRESPONDENCE_CHECK_PASSED__NOT_GNSS_VERIFIED':'BLOCKED',
      warning:'Estimated simulated position from the Mesh georeference. NOT GNSS, RTK, ROS localization, or surveyed position.'
    };
  }
  function save(){
    if(!available()){warn('当前地理参考未就绪',true);return;}
    if(!approved){warn('必须通过独立检查点后才能保存“已配准”方案；仍可导出草稿。',true);return;}
    try{localStorage.setItem(GEO_KEY(sceneId),JSON.stringify(docForSave()));warn('已保存本机当前场景的配准方案；跨端使用请另行导出 JSON。');}
    catch(e){warn('本地保存失败：'+String(e?.message||e),true);}
  }
  function applyImport(doc,{restore=false}={}){
    if(!georef)throw new Error('地理参考尚未加载');
    if(doc?.schema!==GEO_SCHEMA)throw new Error('文件不是 AGV 地理配准方案');
    if(doc.georefId!==georef.georefId)throw new Error('地理参考版本不匹配');
    if(doc.sceneModelId!==sceneId)throw new Error('场景 ID 不一致，为防止错位拒绝导入。请使用同一场景资源。');
    if(!Array.isArray(doc.pairs)||doc.pairs.length>50)throw new Error('配准点数量不合法');
    pairs=doc.pairs.map((p,i)=>({id:'load'+i,role:p.role==='check'?'check':'control',label:String(p.label||('点'+i)).slice(0,50),viewer:p.viewer,mesh:p.mesh}));
    limit=Number(doc.maxErrorMeters)||.5;
    $('geoMaxError').value=limit;
    drawPairs();invalidate();
    const computed=compute();
    if(!computed?.accepted){if(restore)throw new Error('本地配准数据未能通过重新计算的检查点核验');return;}
    warn(restore?'已恢复当前场景的本机配准数据，并重新核算独立检查点。':'已导入方案，并重新计算通过独立检查；仍非 GNSS 定位。');
  }
  async function onModelLoaded(id,mesh,bytes){
    const token=++sceneEpoch;
    sceneId=id;sceneOk=false;georef=null;pairs=[];limit=.5;
    $('geoMaxError').value=.5;clearOutput();sourceStatus();drawPairs();
    if(id.startsWith('scene:') && id!=='scene:epoch30_20261015'){
      warn('当前场景 ID 不属于 epoch30；即使文件名或字节相同也不得套用其地理参考。',true);
      return;
    }
    const gaussianCount=Number(mesh?.numSplats);
    const byteCount=bytes?.byteLength;
    if(gaussianCount!==EXPECTED_SPZ_SPLATS || byteCount!==EXPECTED_SPZ_BYTES){
      warn(`当前模型不是已登记的 epoch_30 SPZ（高斯数 ${Number.isFinite(gaussianCount)?gaussianCount:'未知'}；文件大小 ${Number.isFinite(byteCount)?byteCount:'未知'}）；已禁用本地参考经纬度。`,true);
      return;
    }
    warn('正在计算并核验 epoch_30 SPZ 的 SHA-256 文件指纹…');
    try{
      const actualSha=await sha256Bytes(bytes);
      if(token!==sceneEpoch)return;
      if(actualSha!==EXPECTED_SPZ_SHA256){
        warn('SPZ 文件 SHA-256 与已核实参考模型不同。已禁止套用地理坐标。',true);return;
      }
      const res=await fetch('config/epoch30_georeference.json',{cache:'no-cache'});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const data=await res.json();validateGeoref(data);
      if(data.sceneFamily!=='epoch30_20261015' || data.sourceSpzSha256!==actualSha ||
         data.sourceSpzBytes!==EXPECTED_SPZ_BYTES || data.sourceSpzGaussianCount!==EXPECTED_SPZ_SPLATS){
        throw new Error('Geo JSON 与当前已核验 SPZ 的身份信息不一致');
      }
      if(token!==sceneEpoch)return;
      sceneOk=true;georef=data;sourceStatus();
      warn('epoch_30 SPZ SHA-256 已通过；Mesh 地理参考文件已读取，但 Viewer→Mesh 尚未配准。需录入同名控制点和独立检查点。');
      try{
        const stored=localStorage.getItem(GEO_KEY(sceneId));
        if(stored)applyImport(JSON.parse(stored),{restore:true});
      }catch(e){clearOutput();warn('已有本地方案因校验失败未自动启用：'+String(e?.message||e),true);}
    }catch(e){if(token===sceneEpoch){georef=null;sceneOk=false;sourceStatus();warn('地理参考身份或文件读取失败：'+String(e?.message||e),true);}}
  }
  function onModelLoading(){
    ++sceneEpoch;sceneId='';sceneOk=false;georef=null;pairs=[];limit=.5;clearOutput();stopPicking();setPanelOpen(false);
    sourceStatus();drawPairs();warn('场景正在切换，旧配准已经失效。');
  }
  function mapCursor(worldXYZ){
    if(!approved||!georef||!sceneOk)return;
    try{
      const point=meshToWgs84(transformViewerToMesh(worldXYZ,approved),georef);
      mapHoverText=`地图光标（参考地面）模型推算：经 ${point.longitude.toFixed(8)}°，纬 ${point.latitude.toFixed(8)}°，椭球高 ${point.ellipsoidalHeight.toFixed(2)}m；非 GNSS`;
      mapHoverUntil=performance.now()+1200;
      const m=$safe('agvMapGeoStatus');if(m)m.textContent=mapHoverText;
    }catch(e){console.warn('Geographic map cursor estimate unavailable',e);}
  }
  function tick(timestamp){
    if(timestamp-lastTick<440)return;lastTick=timestamp;
    if(!approved||!sceneOk){return;}
    const state=currentState();
    if(state.sceneModelId!==sceneId){clearOutput();warn('检测到场景不一致，坐标已停用。',true);return;}
    const p=state.pose;const key=[p.x,p.y,p.groundZ].map(x=>x.toFixed(6)).join(',');
    if(key!==lastVehiclePoseText || (mapHoverText&&timestamp>mapHoverUntil)){lastVehiclePoseText=key;if(timestamp>mapHoverUntil)mapHoverText='';setVehicleDisplay();}
  }
  toggle.addEventListener('click',()=>setPanelOpen(!panel.classList.contains('open')));
  $('geoCloseBtn').addEventListener('click',()=>setPanelOpen(false));
  $('geoAddControl').addEventListener('click',()=>newPair('control'));
  $('geoAddCheck').addEventListener('click',()=>newPair('check'));
  $('geoSolveBtn').addEventListener('click',compute);
  $('geoSaveBtn').addEventListener('click',save);
  $('geoExportBtn').addEventListener('click',()=>{if(!georef){warn('尚无地理参考',true);return;}downloadJson(docForSave(),'epoch30_viewer_mesh_registration_v5571.json');warn('已导出候选与配准状态，未通过检查的方案标记为 BLOCKED。');});
  $('geoImportBtn').addEventListener('click',()=>$('geoImportFile').click());
  $('geoImportFile').addEventListener('change',async e=>{
    const f=e.target.files?.[0];e.target.value='';if(!f)return;
    try{applyImport(JSON.parse(await f.text()));}catch(err){clearOutput();warn('导入失败：'+String(err?.message||err),true);}
  });
  $('geoPathExportBtn').addEventListener('click',()=>{
    if(!approved||!georef||!sceneOk){warn('坐标未配准，不能导出虚拟地理轨迹',true);return;}
    const points=agvEditor.getWaypoints();
    const out={schema:'agv-geographic-route-v1',sceneModelId:sceneId,georefId:georef.georefId,
      simulated:true,notGnss:true,heightType:'WGS84_ellipsoidal',
      registration:{fitRmsMeters:approved.fitRmsMeters,checkRmsMeters:approved.checkRmsMeters,maxErrorMeters:limit},
      waypoints:points.map((p,i)=>{
        const viewer=[p.x,p.y,p.z],mesh=transformViewerToMesh(viewer,approved);
        const wgs=meshToWgs84(mesh,georef);
        return {name:'P'+(i+1),viewer,meshMeters:mesh,longitude:wgs.longitude,latitude:wgs.latitude,ellipsoidalHeightMeters:wgs.ellipsoidalHeight};
      })};
    downloadJson(out,'park2_agv_route_geographic_simulation_v557.json');
    warn('已导出模型配准推算路线；不得用作真实机器人导航或 GNSS 轨迹。');
  });
  sourceStatus();drawPairs();clearOutput();warn('先加载 epoch_30 SPZ，再校验 Mesh 地理参考文件。');
  return {onModelLoading,onModelLoaded,tick,setPanelOpen,mapCursor,
    diagnostics:()=>({sceneId,georefReady:!!georef,pairs:pairs.length,approved:!!approved,fitRms:approved?.fitRmsMeters,checkRms:approved?.checkRmsMeters})};
}
