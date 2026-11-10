# v5.5.4.2 - Gradient / Thick Route and Travel Trail

Based on the user-validated v5.5.4.1 AUTO-START FIXED baseline.

## What's new
- Planned route uses a world-space thick gradient TubeGeometry mesh.
- Driven history trail uses a contrasting thick gradient tube.
- Four palettes: rainbow (default), neon, warm, classic blue/green.
- Shared width slider in both AGV route editor and driving control panel: 2 to 20 cm; default 8 cm.
- Visual preferences are saved independently per 3DGS scene in localStorage.
- Dynamic history line mesh is rebuilt at most once every 180ms; at most 350 samples are displayed to reduce load.
- The line is visual only and does NOT represent an obstacle-free safe road width.

## Recommended update for your existing 8099 server
1. Back up agv-test.html in your currently working v5.5.4.1 project folder.
2. Replace ONLY agv-test.html with this package's patched file.
3. Keep the current 8099 Python server. Open:
   http://127.0.0.1:8099/agv-test.html?v=5.5.4.2
4. Open AGV editor or Driving panel; choose rainbow/other palette and visual width.
5. Verify existing waypoints persist and auto cruise still starts/stops.

## Independent full test
- Run start_agv_v55_4_2_local.bat in this directory.
- URL: http://127.0.0.1:8101/agv-test.html?v=5.5.4.2
- Browser localStorage is origin scoped. Old 8099 waypoints do NOT auto-appear on 8101.

Do not overwrite index.html (v5.4 stable homepage). Do not modify GitHub main.
The actual 3DGS model PLY may take a long time to load.
