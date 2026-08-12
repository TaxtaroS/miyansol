import Database from 'better-sqlite3';
import path from 'node:path';

const db=new Database(path.resolve(import.meta.dirname,'../data/inventory.db'));
const rows=db.prepare(`SELECT id,product_name FROM label_templates WHERE vendor='신세계_온라인_명동점_인천공항_라벨' AND category='멍미참'`).all() as Array<{id:number;product_name:string}>;
const update=db.prepare('UPDATE label_templates SET template_data=? WHERE id=?');
const result=db.transaction(()=>{
  for(const row of rows){
    const number=Number(row.product_name.match(/\d+/)?.[0]||0);
    if(!number)continue;
    update.run(JSON.stringify([`멍미 참 No ${number}`,`MSMM${String(number).padStart(4,'0')}`]),row.id);
  }
  return db.prepare(`DELETE FROM label_templates WHERE vendor='신세계온라인 샘플라벨' AND category='멍미참'`).run();
})();
const remainingSamples=(db.prepare(`SELECT COUNT(*) count FROM label_templates WHERE vendor='신세계온라인 샘플라벨' AND category='멍미참'`).get() as {count:number}).count;
console.log(JSON.stringify({normalized:rows.length,removedSampleDuplicates:result.changes,remainingSamples}));
