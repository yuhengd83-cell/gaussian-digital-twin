# V5.5.8.4 verification

Run every `.cjs` and `.mjs` test with Node, and run `python -m pytest tests/test_ros2_receiver_bridge.py` with pytest and websockets installed.

By default, asset-dependent tests require the actual model and geographic files in this candidate. Missing files are failures, never skips.

For local diagnosis only, `AGV_TEST_DATA_ROOT` can point to a private dataset directory containing the same relative model/georeference paths. `AGV_PRIVATE_GEO_EXPECTATIONS` points to the separate private geographic acceptance JSON (`origin`, `first`, `firstMesh` arrays). These are real measured expectations, not generated replacements for missing production data.

Tests still read the scene catalog and execute code from this candidate. Private fixture mode keeps unpublished assets outside the candidate and checks the original size, SHA-256, Gaussian count and numeric assertions. A successful private run does **not** satisfy the public deployment completeness, authorization or browser acceptance gates. Always retain a second run with both variables unset.

The historical `park2_splat.spz` is preserved but blocked as park2: its bytes match epoch30, not the declared park2 model. The identity guard test verifies this conflict using the actual retained SPZ.
