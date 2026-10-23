AGV v5.5.4.2 - GitHub Pages upload-ready patch

TARGET EXISTING REPOSITORY:
https://github.com/yuhengd83-cell/gaussian-digital-twin

TARGET PUBLIC PAGE:
https://yuhengd83-cell.github.io/gaussian-digital-twin/agv-test.html?v=5.5.4.2

WARNING: Keep the existing repository index.html, models/splat.spz, viewer_config.json and assets/share_qr.png UNCHANGED.
This package is a DIFFERENTIAL upload for the existing repository, not a standalone repository.

REQUIRED ADDITIONAL FILE NOT IN THIS ZIP:
models/park2_splat.spz
Convert the original 217.26 MiB park2_splat.ply with v5.5.4.2 Viewer Settings > Export SPZ. The expected export name is park2_splat.spz. Put the SPZ into models/ and upload to GitHub. Never upload the source PLY to regular GitHub.
If the SPZ exceeds 25 MiB, use Git CLI for files up to 100 MiB or use external static object storage. Do not try Git LFS for the model without verifying Pages delivery semantics.

FILES IN THIS PATCH:
agv-test.html                                New AGV page, corrected share URL and QR reference.
config/scenes.json                          Park2 model path now points to models/park2_splat.spz.
config/ackermann_placement_park2_rear_20261019.json   Default metric-scale car placement.
assets/ackermann/ackermann_urdf_meters.glb  CAD vehicle.
assets/agv_share_qr.png                    NEW AGV-specific share QR; existing share_qr.png is unchanged.

OPTIONAL ROUTE/CALIBRATION FILES NOT INCLUDED:
- config/calibration.json
- data/paths.json
The viewer can load both at startup IF both have sceneModelId=scene:park2_rear_20261019.
Use the route editor button 'Export route + calibration JSON' locally and upload those two files to these exact repository paths. Choose a valid road-driving route (>=3 waypoints), not the old 2.26 m measurement segment.
Browser localStorage DOES NOT synchronize between localhost and GitHub Pages.

OPTIONAL PERMANENT HOME VIEW:
Use Settings > Export Home Config while viewing Park2. Upload to config/home_park2_rear_20261019.json if applicable.

INSTALLATION:
1. Extract ZIP locally.
2. In existing GitHub repo, choose Add file > Upload files.
3. Drag agv-test.html and each nested config/assets folder retaining the relative paths shown.
4. Also upload converted models/park2_splat.spz.
5. Commit to main; existing Pages deployment runs automatically.
6. After green check in Actions, open target public page.
7. Confirm Gaussian scene, AGV CAD, scale, driving, route and QR all work.

SIZE LIMITS:
GitHub web upload max 25 MiB per file. Git CLI up to 100 MiB.

Security:
Github Pages is public; do not publish proprietary source robot data, secret URLs or sensitive site maps without permission.
