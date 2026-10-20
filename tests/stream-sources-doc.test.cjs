const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');

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
