/* v5.5.7 - pure geometric/geodetic calculations; no web, no renderer dependencies.
 * Coordinates are arrays [x,y,z]. All mesh coordinates are in original Z-up PLY metres.
 * Three.js GLB display-node transforms must NOT be applied here.
 */
export const GEO_SCHEMA = 'agv-geo-registration-v1';
const WGS84_A=6378137.0;
const WGS84_F=1/298.257223563;
const WGS84_E2=WGS84_F*(2-WGS84_F);
const RAD2DEG=180/Math.PI;
const vec=(a)=>Array.isArray(a) && a.length===3 && a.every(v=>typeof v==='number'&&Number.isFinite(v));
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a)=>Math.sqrt(dot(a,a));
const mean=(v)=>v.reduce((s,p)=>add(s,p),[0,0,0]).map(n=>n/v.length);
const mul=(A,x)=>[dot(A[0],x),dot(A[1],x),dot(A[2],x)];

export function validateGeoref(data){
  if(!data || data.schema!=='agv-georeference-v1')throw new Error('Georeference schema invalid');
  const m=data.meshLocalToEcefColumnMajor;
  if(!Array.isArray(m)||m.length!==16||m.some(v=>!Number.isFinite(v)))throw new Error('4x4 ECEF matrix invalid');
  if(data.meshLocalUp!=='Z+' || data.crs!=='WGS84_ECEF')throw new Error('Unexpected reference coordinate system');
  if(Math.abs(m[3])+Math.abs(m[7])+Math.abs(m[11])+Math.abs(m[15]-1)>1e-6)throw new Error('Invalid affine transform');
  return true;
}
export function meshToECEF(mesh,matrix){
  if(!vec(mesh))throw new Error('Mesh XYZ must contain three finite values');
  const [x,y,z]=mesh,m=matrix;
  return [m[0]*x+m[4]*y+m[8]*z+m[12],
          m[1]*x+m[5]*y+m[9]*z+m[13],
          m[2]*x+m[6]*y+m[10]*z+m[14]];
}
export function ecefToWgs84([x,y,z]){
  if(![x,y,z].every(Number.isFinite))throw new Error('Invalid ECEF XYZ');
  const p=Math.hypot(x,y);
  if(p===0 && z===0)throw new Error('ECEF origin is not a valid geodetic position');
  const lon=p===0?0:Math.atan2(y,x);
  if(p<1e-9){return {longitude:lon*RAD2DEG,latitude:(z>0?90:-90),ellipsoidalHeight:Math.abs(z)-WGS84_A*(1-WGS84_F)};}
  let lat=Math.atan2(z,p*(1-WGS84_E2));
  for(let i=0;i<20;i++){
    const sn=Math.sin(lat),N=WGS84_A/Math.sqrt(1-WGS84_E2*sn*sn);
    const h=p/Math.cos(lat)-N;
    const next=Math.atan2(z,p*(1-WGS84_E2*N/(N+h)));
    if(Math.abs(lat-next)<2e-14){lat=next;break;}
    lat=next;
  }
  const sn=Math.sin(lat),N=WGS84_A/Math.sqrt(1-WGS84_E2*sn*sn);
  const h=p/Math.cos(lat)-N;
  return {longitude:lon*RAD2DEG,latitude:lat*RAD2DEG,ellipsoidalHeight:h};
}
export function meshToWgs84(mesh,georef){
  validateGeoref(georef);
  return ecefToWgs84(meshToECEF(mesh,georef.meshLocalToEcefColumnMajor));
}
export function transformViewerToMesh(viewer,solution){
  if(!vec(viewer))throw new Error('Invalid Viewer XYZ');
  if(!solution || !Number.isFinite(solution.scale)||solution.scale<=0 || !Array.isArray(solution.rotation))throw new Error('Registration solution missing');
  return add(mul(solution.rotation,viewer).map(v=>v*solution.scale),solution.translation);
}
function dominantEigenSymmetric4(M){
  const a=M.map(r=>[...r]),V=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>+(i===j)));
  for(let it=0;it<90;it++){
    let p=0,q=1,best=0;
    for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
      const v=Math.abs(a[i][j]);if(v>best){best=v;p=i;q=j;}
    }
    if(best<1e-14)break;
    const angle=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]);
    const c=Math.cos(angle),s=Math.sin(angle);
    // G columns p=(c,-s) and q=(s,c) for tan(2theta)=2a_pq/(a_qq-a_pp).
    const G=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>+(i===j)));
    G[p][p]=c;G[q][q]=c;G[p][q]=s;G[q][p]=-s;
    const tmp=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>a[i].reduce((su,v,k)=>su+v*G[k][j],0)));
    const next=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>G.reduce((su,row,k)=>su+row[i]*tmp[k][j],0)));
    for(let i=0;i<4;i++){for(let j=0;j<4;j++)a[i][j]=next[i][j];}
    for(let i=0;i<4;i++){
      const vp=V[i][p],vq=V[i][q];V[i][p]=vp*c-vq*s;V[i][q]=vp*s+vq*c;
    }
  }
  let imax=0;for(let i=1;i<4;i++)if(a[i][i]>a[imax][imax])imax=i;
  const v=V.map(row=>row[imax]),len=Math.hypot(...v);
  return v.map(n=>n/len);
}
function quaternionRotation([w,x,y,z]){
  const xx=x*x, yy=y*y, zz=z*z, xy=x*y, xz=x*z, yz=y*z, wx=w*x, wy=w*y, wz=w*z;
  return [[1-2*(yy+zz),2*(xy-wz),2*(xz+wy)],
          [2*(xy+wz),1-2*(xx+zz),2*(yz-wx)],
          [2*(xz-wy),2*(yz+wx),1-2*(xx+yy)]];
}
function validatePairs(pairs){
  if(!Array.isArray(pairs)||pairs.length<4)throw new Error('至少需要 4 组控制点');
  for(const p of pairs){if(!vec(p.viewer)||!vec(p.mesh))throw new Error('控制点必须同时有 Viewer XYZ 和 Mesh XYZ');}
}
export function solveSimilarity(controlPairs){
  validatePairs(controlPairs);
  const X=controlPairs.map(p=>p.viewer),Y=controlPairs.map(p=>p.mesh),n=X.length;
  const x0=mean(X),y0=mean(Y);
  const xs=X.map(x=>sub(x,x0)),ys=Y.map(y=>sub(y,y0));
  let spread=xs.reduce((v,x)=>v+dot(x,x),0);
  const diameter=Math.sqrt(spread/n);
  if(!Number.isFinite(diameter)||diameter<1e-5)throw new Error('Viewer 控制点过于集中');
  const anchor=xs.reduce((best,x)=>norm(x)>norm(best)?x:best,xs[0]);
  const area=Math.max(...xs.map(x=>norm(cross(anchor,x))));
  if(area/(diameter*diameter) < .025)throw new Error('控制点近似共线，请分散选择');
  // Cross-dispersion S = sum((X-Xmean) * (Y-Ymean)^T); Horn 1987.
  const S=Array.from({length:3},()=>[0,0,0]);
  for(let i=0;i<n;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)S[j][k]+=xs[i][j]*ys[i][k];
  const [[xx,xy,xz],[yx,yy,yz],[zx,zy,zz]]=S;
  const N=[[xx+yy+zz,yz-zy,zx-xz,xy-yx],
           [yz-zy,xx-yy-zz,xy+yx,zx+xz],
           [zx-xz,xy+yx,-xx+yy-zz,yz+zy],
           [xy-yx,zx+xz,yz+zy,-xx-yy+zz]];
  const q=dominantEigenSymmetric4(N),R=quaternionRotation(q);
  let num=0;for(let i=0;i<n;i++)num+=dot(ys[i],mul(R,xs[i]));
  const scale=num/spread;
  if(!Number.isFinite(scale)||scale<1e-8)throw new Error('配准比例无效或为反射解');
  const t=sub(y0,mul(R,x0).map(v=>v*scale));
  const solution={scale,rotation:R,translation:t};
  const errors=controlPairs.map(p=>norm(sub(transformViewerToMesh(p.viewer,solution),p.mesh)));
  const rms=Math.sqrt(errors.reduce((a,b)=>a+b*b,0)/errors.length);
  return {...solution,fitErrorsMeters:errors,fitRmsMeters:rms,fitMaxMeters:Math.max(...errors),controlCount:n};
}
export function checkRegistration(controlPairs,checkPairs,maxErrorMeters=0.5){
  if(!Array.isArray(checkPairs)||checkPairs.length<1)throw new Error('至少需要 1 组未参与拟合的独立检查点');
  if(!(Number.isFinite(maxErrorMeters)&&maxErrorMeters>=.01&&maxErrorMeters<=20))throw new Error('允许误差需位于 0.01～20 米');
  for(const p of checkPairs){if(!vec(p.viewer)||!vec(p.mesh))throw new Error('检查点必须同时有 Viewer XYZ 和 Mesh XYZ');}
  const sol=solveSimilarity(controlPairs);
  const errors=checkPairs.map(p=>norm(sub(transformViewerToMesh(p.viewer,sol),p.mesh)));
  const max=Math.max(...errors),rms=Math.sqrt(errors.reduce((a,v)=>a+v*v,0)/errors.length);
  const accepted=sol.fitMaxMeters<=maxErrorMeters&&sol.fitRmsMeters<=maxErrorMeters&&max<=maxErrorMeters;
  return {...sol,checkErrorsMeters:errors,checkRmsMeters:rms,checkMaxMeters:max,
          checkCount:checkPairs.length,maxErrorMeters,accepted};
}

export function verifyRegistrationDocument(data,georef){
  if(!data||data.schema!==GEO_SCHEMA)throw new Error('Registration JSON schema invalid');
  if(!data.georefId||data.georefId!==georef.georefId)throw new Error('Georeference ID mismatch');
  const fit=(data.pairs||[]).filter(x=>x.role==='control');
  const check=(data.pairs||[]).filter(x=>x.role==='check');
  const out=checkRegistration(fit,check,data.maxErrorMeters);
  return out;
}
