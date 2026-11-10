# v5.5.3 Ackermann CAD import

This version extends the tested v5.5.2 scene/model switcher, leaving index.html (public stable v5.4) unchanged.

## Source and provenance

- User-supplied archive: ackermann_description(2).zip
- Selected detailed CAD URDF: ackermann_description/8.6urdf_18.11/urdf/8.6urdf_18.11.urdf
- All 10 visual URDF links imported and assembled using joint transformations and STL geometry.
- Full static CAD model: assets/ackermann/ackermann_urdf_meters.glb
- Calibration and geometry metadata: assets/ackermann/ackermann_dimensions.json
- GLB SHA256: 7069082c1fab4420e8471258ca3aa5265344a40808c6ccf6a08fcab1dc40369b

## Nominal dimensions based on detailed URDF geometry (not tape-measured physical vehicle)

- Body with sensors bounding box (m): length 1.413, width 0.768, height 1.153584
- Wheelbase (m): 0.802603
- Front track center-to-center (m): 0.688
- Approx tire diameter (m): 0.404
- Number of visual parts: 10
- Total mesh triangles: 292312

IMPORTANT: control file config/carConfig.yaml says carLength=2.076 (metres, unverified), which differs from detailed URDF geometry length 1.413 m. This package does NOT falsely claim independently verified physical car dimensions. Confirm the vehicle's actual dimensions and which URDF corresponds to the physical unit.

## Coordinate conventions

The CAD is imported with native STL/URDF metre units. ROS URDF has X forward, Y left, Z up. glTF output has X forward, Y up, Z right. On viewer insertion, GLB root gets Rx(-90 degrees), giving Viewer X forward, Y right, -Z up (two proper rotations, no reflections). Car yaw is around -Z.

Three distinct layers are preserved:

1. CAD native metres (GLB physical units).
2. Viewer world coordinates (the park2 Gaussian scene currently has unverified metre scale).
3. Per-scene calibration scale viewerUnitsPerMeter, saved independently per scene ID.

Preview automatically estimates a visually manageable size from Gaussian bounds (UNVERIFIED), not a metre calibration. To calibrate: place AGV P1/P2 route waypoints on reference ground, input independent measured P1-P2 distance in metres, click the AGV route scale estimate, then in Ackermann CAD panel click "Adopt route scale". Compare against multiple known distances/physical dimensions before treating spatial fit as metric. No ROS map alignment is implemented yet.

## How to run

1. Extract ZIP to a NEW folder. Do not overwrite deployed v5.4 stable.
2. Full package contains `models/park2_splat.ply`. Lightweight update ZIP expects an EXISTING v5.5.2 folder with its original scene catalog/model.
3. Double click `start_agv_v55_3_local.bat`.
4. Open `http://127.0.0.1:8098/agv-test.html?v=5.5.3`.
5. Select park2 scene via Model Switch if needed, then click **Ackermann CAD** button.
6. Toggle visible. Click "Focus AGV" if it is difficult to find.
7. Click "Place on reference ground" and pick a visually identified position; adjust ground Z and yaw manually.
8. Set viewer-units per metre from independently measured scene reference. Save/export per-scene pose JSON to config/ if you want it portable across devices.

## Current limitations and safety

- park2 scene Up is inherited as -Z and must be checked against its actual geometric orientation.
- Gaussian bounds can include floaters: auto-inferred ground Z is only a guess.
- Without meter-scale calibration, CAD size is preserved but its apparent size within Gaussian imagery is NOT metrically verified.
- No collision, Ackermann wheel steering, physics, ROS TF link, or safe robot navigation yet.
- Geometry occlusion with transparent splats must be visually evaluated: Gaussian is not authoritative collision geometry.
- This is static CAD import and pose-placement stage; the next stage can connect it to simulated trajectory and steering kinematics.

## Rebuilding from the uploaded URDF

Original detailed URDF, all 10 STL assets, simplified xacro and carConfig.yaml are copied into `assets/ackermann/source/`. The helper `tools/rebuild_ackermann_glb.py` rebuilds the GLB from these sources with Python packages `trimesh`, `numpy`, and `scipy`. The GLB shipped in this package is prebuilt; you do not need to run the conversion for normal viewing.
