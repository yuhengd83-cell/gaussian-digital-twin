const fs=require('fs'),assert=require('assert'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const config=JSON.parse(fs.readFileSync(path.join(root,'config','scenes.json')));
assert.equal(config.defaultModel,'epoch30_20261015');
const entry=config.models.find(m=>m.id===config.defaultModel);
assert.equal(entry.url,'models/2026-10-15_10-31-41_3DGS_epoch_30.spz');
// Explicit private fixture input does not make the deployment self-contained.
const bytes=fs.readFileSync(path.join(process.env.AGV_TEST_DATA_ROOT||root,entry.url));
assert.equal(bytes.length,29254747);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256);
const html=fs.readFileSync(path.join(root,'agv-test.html'),'utf8');
assert(html.includes('v5.5.8.4 | ROS2 接收 | epoch_30 | port 8108'));
assert(html.includes('No fallback model was loaded'));
assert(html.includes('await verifyDownloadedModel(bytes,activeSceneSpec)'));
assert(html.includes('const targetId=sceneOverride||DEFAULT_SCENE_ID'));
assert(!html.includes('for(const entry of sceneCatalog){\n    if(await urlExists(entry.url))'));
assert(fs.existsSync(path.join(root,'tools','serve_epoch30_v5584.py')));
console.log('PASS: epoch30 scene pinning, SPZ hash, explicit failure, unique launcher');
