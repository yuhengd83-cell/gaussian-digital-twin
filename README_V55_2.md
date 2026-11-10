# AGV Viewer v5.5.2 - Model Switch (Stage 1)

## What changed

- Added top-bar `模型替换` button and a scene selector in `agv-test.html`.
- Select the new park2 model from `config/scenes.json`, or load a local PLY/SPZ file at runtime.
- New model IDs isolate: home camera, AGV route draft, scale estimate, and ground reference.
- Camera auto-fit on the new model; old office2 `viewer_config.json` only applies to office2.
- Existing published `index.html` (v5.4) is byte-for-byte unchanged.

## Files

```
index.html                        # unchanged v5.4 official page
agv-test.html                    # new v5.5.2 testing page
config/scenes.json               # scene catalog, first model = park2
models/park2_splat.ply           # 217.3 MiB, separate uploaded file
models/splat.spz                 # optional former office model, not included
viewer_config.json              # optional former office camera config, not included
start_agv_v55_2_local.bat         # 127.0.0.1:8097
start_agv_v55_2_lan.bat           # LAN server, 8097
```

## Windows usage

1. Extract to a NEW directory. Do not overwrite the stable v5.4 directory.
2. If using the LIGHT package, copy your uploaded `splat(2).ply` into `models/park2_splat.ply`.
3. Double click `start_agv_v55_2_local.bat`. Address: http://127.0.0.1:8097/agv-test.html?v=5.5.2
4. Click the model-switch toolbar button. Choose park2 and press switch.
5. The source PLY has 918596 Gaussians and is about 217.3 MiB. Allow enough RAM and load time.
6. Inspect if the scene is upright. The inherited -Z Up and floor-plane height have NOT been verified for park2.
7. Before measuring or drawing real routes, re-check the model orientation and calibration. Previously saved office routes must not be reused.
8. To compress after opening the PLY: Settings -> Export SPZ. Put resulting SPZ inside models and adjust config/scenes.json entry to point to it (and use a new scene ID if the model content changed).

## Local file preview

The button for local PLY/SPZ allows choosing a file without copying into the website directory. This model will NOT persist across browser restarts. To host/share, copy the new file into `models/` and register it in `config/scenes.json`.

## Important: CKPT is not PLY

The training file `step-000030000.ckpt` is a framework checkpoint. The Spark 3DGS browser displays Gaussian PLY/SPZ, not training checkpoints. The uploaded `splat(2).ply` is already valid. The checkpoint path is retained in MODEL_SOURCE.json for traceability.

## Public publishing

Do not publish the 217.3 MiB PLY to GitHub Pages. Keep v5.4 stable on main. First compress to SPZ and test the new scene, then publish only the test page + required data to a separate branch (or project). GitHub standard repository file size limits apply.

## Assumptions / disclaimers

The default -Z Up orientation is inherited from office2 and is ONLY an initial display convention, not a new-scene calibration result. No ROS positioning or meter-scale accuracy is claimed. Avoid using Gaussian as a collision/safety surface.

## Load optimization

A known Content-Length now preallocates a single buffer instead of retaining chunk copies. Local file reads stream to a preallocated buffer and show real byte progress. Large PLY decoding can still require significant CPU, RAM and GPU memory.
