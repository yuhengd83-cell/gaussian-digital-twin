const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const s=fs.readFileSync(path.join(root,'agv-test.html'),'utf8');
const groups=['navigation','view','vehicle','application'];
const buttons=['projectBtn','homeTopBtn','orbitBtn','fpsBtn','fullBtn','modelSwitchBtn','agvBtn','ackermannBtn','driveBtn','geoBtn','agvMapOpenToolbar','shareBtn','settingsBtn'];
for(const id of buttons)assert.equal((s.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,'original button ID '+id);
for(const key of groups){
 assert.equal((s.match(new RegExp(`data-nav-group="${key}"`,'g'))||[]).length,1);
 assert.equal((s.match(new RegExp(`data-nav-toggle="${key}"`,'g'))||[]).length,1);
 assert.equal((s.match(new RegExp(`id="navButtons-${key}"`,'g'))||[]).length,1);
}
assert(s.includes('width:max-content!important'));
assert(s.includes('var(--brand-right)'));
assert(s.includes("const storageKey='agv-toolbar-v5582-collapsed'"));
assert(s.includes('const closeMenus=()=>'));
assert(s.includes('state[other]=true'));
assert(s.includes("document.documentElement.style.setProperty('--brand-right'"));
const controller=s.match(/<script id="nav-v5581-controller">([\s\S]*?)<\/script>/);
assert(controller);new vm.Script(controller[1]);
assert(s.includes('id="modelProofTitle">v5.5.8.4 | ROS2 接收 | epoch_30 | port 8108'));
const cfg=JSON.parse(fs.readFileSync(path.join(root,'config/ui_toolbar.json')));
assert.equal(cfg.uiVersion,'5.5.8.4');
for(const key of groups)assert.equal(cfg.defaultExpanded[key],false);
assert.equal(cfg.dropdownMode,'single-open');
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'config/scenes.json'))).defaultModel,'epoch30_20261015');
console.log('V5582_TOOLBAR_PASS: four groups, same row, 13 original button IDs, popup controller');
