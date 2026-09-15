const {test}=require('node:test');
const assert=require('node:assert/strict');
test('retail lists mirror live Sellmate data without sharing template data or queue IDs',async()=>{
  process.env.NODE_ENV='test';process.env.SQLITE_DATABASE_PATH=':memory:';delete process.env.DATABASE_URL;
  const app=require('../dist/index').default;
  const db=require('../dist/db').db;
  for(const name of ['셀메이트','교보영풍','영풍 이요샵'])db.prepare('INSERT INTO label_vendors(name) VALUES(?)').run(name);
  const insert=db.prepare('INSERT INTO label_templates(vendor,category,product_name,barcode,source_path,template_data) VALUES(?,?,?,?,?,?)');
  insert.run('셀메이트','미니백','Mini bag Black','8800359721661','source-1','["MS1","Mini bag Black"]');
  insert.run('셀메이트','미니백','Mini bag Ivory','8800359721647','source-2','["MS2","Mini bag Ivory"]');
  insert.run('교보영풍','old','retired product','111','old-source','["old"]');
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const setup=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'retail@example.com',name:'테스트 관리자',password:'test-password-123'})});
    const cookie=setup.headers.get('set-cookie').split(';')[0];
    const get=async path=>{const response=await fetch(base+path,{headers:{cookie}});assert.equal(response.status,200);return response.json();};
    const source=await get('/api/labels?vendor='+encodeURIComponent('셀메이트'));
    const signature=rows=>rows.map(x=>[x.category,x.product_name,x.barcode]);
    const ids=new Set(source.map(x=>x.id));
    for(const vendor of ['교보영풍','영풍 이요샵']){
      const rows=await get('/api/labels?vendor='+encodeURIComponent(vendor));
      assert.deepEqual(signature(rows),signature(source));
      for(const row of rows){assert.equal(row.vendor,vendor);assert.equal(row.template_data,null);assert.ok(!ids.has(row.id));ids.add(row.id);}
    }
    const all=await get('/api/labels');assert.equal(all.length,6);assert.ok(all.every(x=>x.product_name!=='retired product'));
    const counts=await get('/api/labels/vendors');assert.ok(counts.every(x=>x.count===2));
    db.prepare("UPDATE label_templates SET barcode='8809999999999' WHERE source_path='source-1'").run();
    const updated=await get('/api/labels?vendor='+encodeURIComponent('교보영풍')+'&search=8809999999999');
    assert.equal(updated.length,1);assert.equal(updated[0].barcode,'8809999999999');
    assert.deepEqual(JSON.parse(db.prepare("SELECT template_data FROM label_templates WHERE source_path='source-1'").get().template_data),['MS1','Mini bag Black']);
  } finally {await new Promise(resolve=>server.close(resolve));db.close();}
});
