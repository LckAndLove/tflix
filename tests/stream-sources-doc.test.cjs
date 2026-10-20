const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

test('local playback source OpenAPI catalog covers all configured providers',()=>{
  const doc=JSON.parse(fs.readFileSync('docs/stream-sources/swagger.json','utf8'));
  assert.equal(doc.openapi,'3.1.0');
  assert.equal(doc['x-providers'].length,6);
  assert.ok(Object.keys(doc.paths).length>=18);
  const parameterNames=new Map(Object.entries(doc.components.parameters).map(([key,value])=>[key,value.name]));
  for(const [path,item] of Object.entries(doc.paths)) {
    const pathParams=[...path.matchAll(/\{([^}]+)\}/g)].map(match=>match[1]);
    for(const [method,operation] of Object.entries(item)) {
      if(method.startsWith('x')) continue;
      const operationParams=(operation.parameters||[]).map(parameter=>parameter.$ref?.split('/').pop() ? parameterNames.get(parameter.$ref.split('/').pop()) : parameter.name).filter(Boolean);
      for(const name of pathParams) assert.ok(operationParams.includes(name),`${method.toUpperCase()} ${path} is missing {${name}}`);
      assert.match(operation['x-upstreamUrl'],/^https:\/\//);
    }
  }
});

test('parallel probes disable provider autoplay and use every configured source',()=>{
  const html=fs.readFileSync('stream/index.html','utf8');
  const start=html.indexOf('const SERVERS = [');
  const end=html.indexOf('/* ─── PLAYER ─── */');
  assert.ok(start>=0 && end>start);
  const context={URL,location:{href:'https://tflix.example/stream/index.html'},window:{addEventListener(){}}};
  vm.runInNewContext(`${html.slice(start,end)}\nstate={type:'tv',id:'1399',season:1,episode:1}; result=SERVERS.map(server=>sourceUrlFor(server.id,true));`,context);
  assert.equal(context.result.length,6);
  for(const raw of context.result){
    const url=new URL(raw);
    assert.equal(url.searchParams.get('tflix_probe'),'1');
    for(const key of ['autoplay','autoPlay']) assert.notEqual(url.searchParams.get(key),'true');
  }
  const probeBlock=html.slice(html.indexOf('function probeAllSources'),html.indexOf('/* ─── PLAYER ─── */'));
  assert.match(probeBlock,/tflix:media-ready/);
  assert.doesNotMatch(probeBlock,/fetch\s*\(/);
});
