ACKERMANN v5.5.4.1 -- AUTO CRUISE START FIX

WHAT CHANGED:
1. Native confirm() replaced by a nonblocking in-page safety dialog.
2. Keyboard state cleared before automatic driving.
3. Window blur now explicitly reports a safe stop, not stale Running status.
4. Existing manual WASD, Ackermann CAD, park2 and metric calibration untouched.

UPDATE ONLY:
Copy agv-test.html and start_agv_v55_4_1_local.bat to existing v5.5.4 directory.
Overwrite agv-test.html. Launch on port 8100.
If you also use local unit tests, replace src/ackermann-drive-v554.js and tests/test_ackermann_kinematics.cjs.

EXISTING MODEL FILES ARE NOT MODIFIED:
models/park2_splat.ply
assets/ackermann/ackermann_urdf_meters.glb
config/*.json
viewer_config.json

TEST:
Open http://127.0.0.1:8100/agv-test.html?v=5.5.4.1
Click Driving, prepare 3+ distinct road points, press Auto Cruise,
click Confirm in the in-page dialog, then verify Idle -> Auto and speed/time.
If browser loses focus, it will stop by design and explain why.
NO ROS, collision or obstacle avoidance.
