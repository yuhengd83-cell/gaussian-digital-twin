#!/usr/bin/env python3
"""Reproducible conversion of the detailed SolidWorks URDF to a visually segmented GLB.

Mesh sources are imported as given in METERS (the wheel STL measures about 0.404 m).
No arbitrary normalization, center shift or unit conversion is applied.

ROS (+X forward, +Y left, +Z up) -> glTF (+X forward, +Y up, +Z right)
with Rx(-90 deg). Geometry remains grouped into URDF link objects.
"""
from __future__ import annotations
import json, math, hashlib
import xml.etree.ElementTree as ET
from pathlib import Path
import numpy as np
import trimesh
from scipy.spatial.transform import Rotation

HERE = Path(__file__).resolve().parent.parent / 'assets' / 'ackermann' / 'source'
OUT = HERE.parent
OUT.mkdir(parents=True, exist_ok=True)
URDF=HERE/'8.6urdf_18.11.urdf'
root=ET.parse(URDF).getroot()
ros_to_gltf=np.eye(4)
ros_to_gltf[:3,:3]=Rotation.from_euler('x',-90,degrees=True).as_matrix()

joint_map={}
for j in root.findall('joint'):
    name=j.get('name'); child=j.find('child').get('link'); parent=j.find('parent').get('link')
    org=j.find('origin')
    xyz=np.array([float(x) for x in org.get('xyz','0 0 0').split()]) if org is not None else np.zeros(3)
    rpy=np.array([float(x) for x in org.get('rpy','0 0 0').split()]) if org is not None else np.zeros(3)
    mat=np.eye(4)
    mat[:3,:3]=Rotation.from_euler('xyz',rpy,degrees=False).as_matrix()
    mat[:3,3]=xyz
    joint_map[child]={'parent':parent,'matrix':mat,'name':name,'type':j.get('type'),'xyz':xyz.tolist(),'rpy':rpy.tolist(),'axis':j.find('axis').get('xyz') if j.find('axis') is not None else None}

world_cache={'base_link':np.eye(4)}
def world(name):
    if name in world_cache:return world_cache[name]
    j=joint_map[name]
    val=world(j['parent'])@j['matrix']
    world_cache[name]=val
    return val

palette={
'base_link':[0.25,0.35,0.48,1.0],
'front_left_wheel_link':[0.12,0.14,0.17,1],
'front_right_wheel_link':[0.12,0.14,0.17,1],
'rear_left_wheel_link':[0.12,0.14,0.17,1],
'rear_right_wheel_link':[0.12,0.14,0.17,1],
'lidar_link':[0.55,0.63,0.73,1],
'imu_link':[0.81,0.69,0.29,1],
'gnss_f_link':[0.78,0.82,0.86,1],
'gnss_b_link':[0.78,0.82,0.86,1],
'radar_link':[0.3,0.6,0.72,1]
}
scene=trimesh.Scene(base_frame='world')
ros_low=np.full(3,np.inf);ros_high=np.full(3,-np.inf)
part_metrics=[]
part_names=[]
wheel_centers=[]
for link in root.findall('link'):
    name=link.get('name')
    visual=link.find('visual')
    if visual is None:continue
    geom=visual.find('geometry/mesh')
    if geom is None:continue
    fn=Path(geom.get('filename').split('/')[-1]); meshpath=HERE/fn
    if not meshpath.exists():raise RuntimeError(f'Missing mesh: {meshpath}')
    mesh=trimesh.load(meshpath,force='mesh',process=False)
    if len(mesh.faces)==0:raise RuntimeError(f'Empty mesh {name}')
    # URDF visual origin for all detailed CAD links is (0,0,0); keep this parser generic.
    orig=visual.find('origin')
    vxyz=np.array([float(x) for x in orig.get('xyz','0 0 0').split()]) if orig is not None else np.zeros(3)
    vrpy=np.array([float(x) for x in orig.get('rpy','0 0 0').split()]) if orig is not None else np.zeros(3)
    V=np.eye(4);V[:3,:3]=Rotation.from_euler('xyz',vrpy).as_matrix();V[:3,3]=vxyz
    T=world(name)@V
    vertices=trimesh.transform_points(mesh.vertices,T)
    ros_low=np.minimum(ros_low,np.min(vertices,axis=0))
    ros_high=np.maximum(ros_high,np.max(vertices,axis=0))
    if 'wheel' in name:
        wheel_centers.append((name,world(name)[:3,3].tolist()))
    base=palette.get(name,[.7,.7,.7,1])
    mat=trimesh.visual.material.PBRMaterial(name=f'{name}_paint',baseColorFactor=base,metallicFactor=0.1 if 'wheel' in name else 0.33,roughnessFactor=0.65)
    mesh.visual=trimesh.visual.TextureVisuals(material=mat)
    # Important: the static GLB node carries the CAD link transform. Keep individual parts.
    scene.add_geometry(mesh,geom_name=f'geometry_{name}',node_name=name,transform=ros_to_gltf@T)
    part_names.append(name)
    part_metrics.append({'name':name,'mesh':fn.name,'vertices':len(mesh.vertices),'triangles':len(mesh.faces),'local_bounds_m':np.round(mesh.bounds,6).tolist(),
                         'ros_transform_4x4':np.round(T,9).tolist(),'mesh_sha256':hashlib.sha256(meshpath.read_bytes()).hexdigest()})

outfile=OUT/'ackermann_urdf_meters.glb'
scene.export(outfile)
# Roundtrip parse to ensure export retained whole package.
returned=trimesh.load(outfile,force='scene')
bounds_glb=returned.bounds
# Using current axis convention: viewer = Rx(-90 gltf). Thus world ROS -> Viewer is Rx(-180).
ros_min=ros_low.tolist();ros_max=ros_high.tolist();ros_dims=(ros_high-ros_low).tolist()
wheel_centers=dict(wheel_centers)
track=abs(wheel_centers['front_left_wheel_link'][1]-wheel_centers['front_right_wheel_link'][1])
wb=abs(wheel_centers['front_left_wheel_link'][0]-wheel_centers['rear_left_wheel_link'][0])
lowest=float(ros_low[2]);highest=float(ros_high[2])
meta={
  'schema':'ackermann-urdf-geometry-v1',
  'source_archive':'ackermann_description(2).zip',
  'source_urdf':'8.6urdf_18.11/urdf/8.6urdf_18.11.urdf',
  'source_model':'SolidWorks exported detailed CAD URDF (NOT simple primitive xacro)',
  'model_gltf':'assets/ackermann/ackermann_urdf_meters.glb',
  'glb_sha256':hashlib.sha256(outfile.read_bytes()).hexdigest(),
  'source_units':'metres verified by wheel STL diameter ~0.404 m and URDF wheel coordinates',
  'frames':{
    'urdf':'ROS X forward, Y left, Z up (metres)',
    'glb':'glTF X forward, Y up, Z right (metres)',
    'viewer':'Existing viewer X forward, -Z up. GLB root must be rotated -90 degrees around X. No extra scale before scene calibration.',
    'ros_to_glb_matrix':np.round(ros_to_gltf,8).tolist(),
    'glb_to_viewer_rotation_euler_xyz_rad':[-math.pi/2,0,0],
  },
  'dimensions_from_detailed_urdf_m':{
    'length_x':round(float(ros_dims[0]),6),'width_y':round(float(ros_dims[1]),6),'height_z':round(float(ros_dims[2]),6),
    'bounds_min_xyz':np.round(ros_low,6).tolist(),'bounds_max_xyz':np.round(ros_high,6).tolist(),
    'front_rear_axle_m':round(wb,6),'front_track_wheel_center_m':round(track,6),
    'tyre_diameter_approx_m':0.404,
    'wheel_center_above_contact_m':round(-lowest,6),
    'wheel_centers_ros_m':wheel_centers
  },
  'mass_data_in_urdf_not_equivalent_to_verified_real_vehicle_weight':True,
  'included_visual_links':part_names,
  'link_count':len(part_names),
  'total_triangles':sum(p['triangles'] for p in part_metrics),
  'part_metrics':part_metrics,
  'metric_alignment_status':'NEEDS_REAL_SCENE_SCALE_CALIBRATION',
  'caveats':[
     'SolidWorks detailed URDF and simpler ackermann.xacro have different visual footprints and geometry; this asset uses detailed CAD URDF.',
     'These values are CAD/URDF model nominal dimensions, not independent physical tape-measure verification.',
     'Web viewer Gaussian park2 reconstruction is not currently metre-calibrated. Default 1 viewer unit / metre is only a preview.',
     'Detailed SolidWorks URDF has wheel spin joints but no steer-link joints; dynamic Ackermann steering animation is a separate future task.'
  ]
}
(OUT/'ackermann_dimensions.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
print('glb bytes',outfile.stat().st_size,'sha',meta['glb_sha256'])
print('raw URDF ROS bounds',np.round(ros_low,6),np.round(ros_high,6),'dimensions',np.round(ros_dims,6))
print('width',meta['dimensions_from_detailed_urdf_m']['width_y'],'axle',wb,'track',track,'wheelContactHeight',-lowest)
print('roundtrip glb bounds',np.round(bounds_glb,6),'roundtrip sizes',np.round(returned.extents,6))
print('input links',len(part_names),'roundtrip geometries',len(returned.geometry),'nodes',len(returned.graph.nodes_geometry))
print('parts',part_names)
