# v5.5 Stage 1

New: independent AGV testing page, route editor, -Z-up floor reference grid, click-to-place waypoints, local draft persistence, JSON exports, single-baseline scale estimate, and tests.

Not yet included: AGV animation/model, metric collision geometry, robust multi-point ROS alignment, ROS live bridge, real robot control, spatial measurements.

`index.html` from v5.4 Stable is intentionally unchanged.

## v5.5.1 loading fix
- Embed AGV route editor in test page; remove local module import as startup dependency.
- Add independent boot watchdog; report stalled module initialization after 12s.
- New launcher uses 8096 and v5.5.1 cache buster.
- Stable index.html remains unchanged.
