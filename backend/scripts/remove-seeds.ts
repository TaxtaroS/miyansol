import Database from 'better-sqlite3';
const db = new Database(new URL('../data/inventory.db', import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
const skus = ['BH-BLUE', 'YS-PINK'];
db.transaction(() => {
  db.prepare(`DELETE FROM inventory WHERE product_id IN (SELECT id FROM products WHERE sku IN (?,?))`).run(...skus);
  db.prepare(`DELETE FROM movements WHERE product_id IN (SELECT id FROM products WHERE sku IN (?,?))`).run(...skus);
  db.prepare(`DELETE FROM products WHERE sku IN (?,?)`).run(...skus);
})();
console.log(db.prepare('SELECT COUNT(*) count FROM products').get());
