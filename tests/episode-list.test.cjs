const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('stream/index.html','utf8');
function fixture(){
 const list={rows:[],replaceChildren(){this.rows=[];},appendChild(row){this.rows.push(row);}};
 const selected={disabled:false,value:'1',dispatchEvent(event){this.event=event.type;}};
 let closed=0;
 const context={state:{type:'tv',id:12,season:1,episode:1},currentLang:'zh',seasonCache:{'zh-12-1':{episodes:[{episode_number:1,name:'<Current>',overview:'<summary>',runtime:24,still_path:'/one.jpg'},{episode_number:2,name:'Next',overview:'',runtime:null,still_path:null}]}},$:id=>({'episode-list':list,'episode-select':selected,'season-select':{value:'1'}}[id]),document:{createElement:()=>({attributes:{},handlers:{},setAttribute(k,v){this.attributes[k]=v;},querySelector(){return null;},addEventListener(k,v){this.handlers[k]=v;}})},esc:s=>s.replace(/</g,'&lt;').replace(/>/g,'&gt;'),closeWatchDrawer(){closed++;},Event:class{constructor(type){this.type=type;}}};
 vm.createContext(context);vm.runInContext(html.slice(html.indexOf('function renderEpisodeList('),html.indexOf('function updateNextBtn(')),context);
 return{context,list,selected,closed:()=>closed};
}
test('episode cards mark the current episode, escape metadata, and omit missing runtime',()=>{
 const f=fixture();f.context.renderEpisodeList();assert.equal(f.list.rows.length,2);
 assert.equal(f.list.rows[0].attributes['aria-current'],'true');
 assert.match(f.list.rows[0].innerHTML,/&lt;Current&gt;/);assert.match(f.list.rows[0].innerHTML,/24 分钟/);
 assert.doesNotMatch(f.list.rows[1].innerHTML,/null|undefined/);
});
test('episode cards use the existing selection handler; current episode never reloads',()=>{
 const f=fixture();f.context.renderEpisodeList();f.list.rows[0].handlers.click();assert.equal(f.closed(),1);assert.equal(f.selected.event,undefined);
 f.list.rows[1].handlers.click();assert.equal(f.selected.value,'2');assert.equal(f.selected.event,'change');
});
test('episode list does not render stale rows while selection is disabled',()=>{
 const f=fixture();f.selected.disabled=true;f.context.renderEpisodeList();assert.equal(f.list.rows.length,0);
});
