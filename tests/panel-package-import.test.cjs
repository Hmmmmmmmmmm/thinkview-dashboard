const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('logic/app.js','utf8');
const start=source.indexOf('  function validImported(pkg) {');
const end=source.indexOf('\n  var loadedPackageIds',start);
assert.ok(start>=0 && end>start);
const valid=vm.runInNewContext('('+source.slice(start,end)+')',{DashboardExpansion:{valid:()=>true}});
function fixture(){return {format:'thinkview-panel-1',manifest:{schemaVersion:1,id:'test-panel',title:'Test',version:'1.0.0',rootClass:'test-panel',colorRole:'primary',entries:{html:'panel.html',css:'panel.css',js:'panel.js'},capabilities:[],assets:['assets/'],defaultEnabled:true},entries:{html:'<div></div>',css:'',js:''}}}
test('import validation covers legacy and complete directory assets',()=>{let p=fixture();assert.equal(valid(p),true);p.assetData={'assets/nested/a.svg':'data:image/svg+xml;base64,PHN2Zy8+','assets/unused.bin':'data:application/octet-stream;base64,AP8='};assert.equal(valid(p),true);});
test('import validation rejects malformed or incomplete assets',()=>{for(const assets of [{'../x':'data:image/png;base64,AA=='},{'other/x':'data:image/png;base64,AA=='},{'assets/x':'data:image/png;base64,@@=='},{'assets/x':'https://example.com/x'},{},{'panel.html':'data:text/html;base64,AA=='}]){const p=fixture();p.assetData=assets;assert.equal(valid(p),false,JSON.stringify(assets));}const p=fixture();p.extra=true;assert.equal(valid(p),false);});
