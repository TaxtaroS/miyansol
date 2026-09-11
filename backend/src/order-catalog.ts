import type { AnalysisProduct } from "./order-analysis-service";

type CatalogDb = { prepare(sql: string): { all(): unknown[] | Promise<unknown[]> } };

export async function loadOrderCatalog(db: CatalogDb): Promise<AnalysisProduct[]> {
  const products = await db.prepare("SELECT id,name,catalog_name,sku FROM products WHERE active=1").all() as AnalysisProduct[];
  const aliases = await db.prepare("SELECT product_id,alias FROM product_aliases").all() as Array<{product_id:number;alias:string}>;
  const labels = await db.prepare("SELECT product_id,product_name,barcode,template_data FROM label_templates WHERE product_id IS NOT NULL").all() as Array<{product_id:number;product_name:string;barcode:string|null;template_data:unknown}>;
  const byProduct = new Map<number, Set<string>>();
  const add = (id: number, value: unknown) => {
    if (typeof value !== "string" || !value.trim()) return;
    const values = byProduct.get(id) || new Set<string>();
    values.add(value.trim());
    byProduct.set(id, values);
  };
  for (const row of aliases) add(row.product_id, row.alias);
  for (const row of labels) {
    add(row.product_id, row.product_name);
    add(row.product_id, row.barcode);
    let template = row.template_data;
    if (typeof template === "string") {
      try { template = JSON.parse(template); } catch { template = []; }
    }
    if (Array.isArray(template)) for (const value of template) add(row.product_id, value);
  }
  return products.map(product => ({...product, aliases: [...(byProduct.get(product.id) || [])].join("|||")}));
}
