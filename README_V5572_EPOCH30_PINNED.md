# AGV v5.5.7.2: Epoch30 Pinned Model / Local Proof Build

- This package is local-only. GitHub is unchanged.
- Double-click start_agv_v55_7_2_local.bat (NOT the old 8102 launcher).
- New dedicated port: 8103. The console prints SERVING_ROOT, PINNED_MODEL, MODEL_BYTES and SHA256_OK before opening the browser.
- The URL must be: http://127.0.0.1:8103/agv-test.html?v=5.5.7.2&scene=epoch30_20261015
- The lower-left proof ribbon must say "Verified source: 2026-10-15_10-31-41_3DGS_epoch_30.spz" and show SHA-256 prefix e332130c5c8a.
- If the SPZ is absent or different, startup FAILS without silently using park2_splat.ply.
- This viewer still supports manual model switching but the original park2 PLY is not the default.
- The old clean minimap image can still represent park2 geometry, not a surveyed orthophoto. Do not use it for GPS registration validation.
- The audited Mesh GPS source applies ONLY to the matching epoch30 SPZ; SHA-256 identity is necessary but is not enough to establish Viewer-to-Mesh XYZ registration.
- The Ackermann saved pose and routes may need manual re-validation in the epoch30 scene.

## Basic checks

1) Run the new launcher and keep the terminal open.
2) Open http://127.0.0.1:8103/config/scenes.json and confirm defaultModel is epoch30_20261015.
3) Open the full viewer URL, check the lower-left model proof ribbon and "Model Switch" panel.
4) Open the geo panel: expect Mesh reference detected; AGV coordinates remain blocked until control-point + held-out-point validation.

## Facts and limits

SPZ byte count: 29,254,747; SHA256: e332130c5c8ae17babcf013d135108e63146f3115ede3509d8d9cb23ea5f1f13.
Splat count from SPZ header: 1,739,253.
Geo origin is internally consistent across metadata.xml and root tileset.json, but independently surveyed GNSS accuracy is unverified.
