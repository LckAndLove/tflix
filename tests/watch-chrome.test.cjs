const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const html=require('node:fs').readFileSync('stream/index.html','utf8');
function chrome(){
 const classes=new Set(),elements={'watch-drawer':{hidden:true}};
 const context={$:id=>elements[id],window:{addEventListener:(name,fn)=>context.receive=fn},document:{body:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}},documentElement:{classList:{contains:()=>false}},querySelector:()=>null,addEventListener(){}},isCurrentPlayerFrame:()=>true,clearTimeout(){},setTimeout(fn){context.idle=fn;return 1;}};
 vm.createContext(context);vm.runInContext(html.slice(html.indexOf('let chromeTimer='),html.indexOf('/* Watch settings float')),context);
 return {context,elements,classes};
}
test('watch controls hide while playing and reappear on interaction or pause',()=>{
 const {context,classes}=chrome();
 context.receive({data:{type:'tflix:media-playing'}});context.idle();assert.ok(classes.has('controls-idle'));
 context.receive({data:{type:'tflix:interaction'}});assert.ok(!classes.has('controls-idle'));
 context.receive({data:{type:'tflix:media-paused'}});context.idle();assert.ok(!classes.has('controls-idle'));
});
test('open settings keep watch controls visible',()=>{
 const {context,elements,classes}=chrome();elements['watch-drawer'].hidden=false;
 context.receive({data:{type:'tflix:media-playing'}});context.idle();assert.ok(!classes.has('controls-idle'));
});

test('a new media load cancels idle chrome inherited from the previous video',()=>{
 const {context,classes}=chrome();
 context.receive({data:{type:'tflix:media-playing'}});context.idle();assert.ok(classes.has('controls-idle'));
 context.resetWatchPlaybackState();assert.ok(!classes.has('controls-idle'));
 context.receive({data:{type:'tflix:interaction'}});context.idle();assert.ok(!classes.has('controls-idle'));
 context.receive({data:{type:'tflix:media-playing'}});context.idle();assert.ok(classes.has('controls-idle'));
});
