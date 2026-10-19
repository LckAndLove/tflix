const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function layout(width,height,vw,vh) {
 const props={},events={};
 const video={videoWidth:vw,videoHeight:vh,getBoundingClientRect:()=>({width,height,bottom:height}),addEventListener(){},removeEventListener(){}};
 const controller={querySelector:()=>video,getBoundingClientRect:()=>({bottom:height}),style:{getPropertyValue:k=>props[k],setProperty:(k,v)=>props[k]=v}};
 vm.runInNewContext(fs.readFileSync('src-tauri/src/subtitle_layout.js','utf8'),{location:{hostname:'cinesrc.st'},document:{getElementById:()=>true,querySelector:()=>controller,addEventListener(){}},window:{addEventListener:(k,v)=>events[k]=v},ResizeObserver:class{observe(){}disconnect(){}},MutationObserver:class{observe(){}}});
 return props['--tflix-caption-bottom'];
}
test('positions captions close to the bottom in windowed 16:9 video',()=>assert.equal(layout(800,450,1920,1080),'16px'));
test('accounts for letterboxing instead of lifting captions to the middle',()=>assert.equal(layout(800,450,1920,800),'70px'));
test('scales bottom spacing for fullscreen video',()=>assert.equal(layout(1920,1080,1920,1080),'38px'));
