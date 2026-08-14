import express from "express";
import cors from "cors";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./neon-db.js";
import { normalizeAlias } from "./order-reader.js";
import { analyzeOrderFile } from "./order-analysis-service.js";
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
const orderUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 30, fileSize: 20 * 1024 * 1024 },
});
const runtimeDataDir = process.env.VERCEL
  ? path.join(os.tmpdir(), "miyansol-orders")
  : fileURLToPath(new URL("../data/", import.meta.url));
const orderFileDir = path.join(runtimeDataDir, "order-files");
const orderPreviewDir = path.join(runtimeDataDir, "order-previews");
fs.mkdirSync(orderFileDir, { recursive: true });
fs.mkdirSync(orderPreviewDir, { recursive: true });
const previewPython =
  process.env.CODEX_PYTHON ||
  "C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
const previewScript = fileURLToPath(
  new URL("../scripts/order-preview-pdf.py", import.meta.url),
);
function createOrderPreview(file: Express.Multer.File) {
  const extension = path.extname(file.originalname).toLowerCase() || ".bin";
  const key = randomUUID();
  const sourcePath = path.join(orderFileDir, `${key}${extension}`);
  const previewPath = path.join(orderPreviewDir, `${key}.pdf`);
  fs.writeFileSync(sourcePath, file.buffer);
  if (extension === ".pdf" || file.mimetype.startsWith("image/")) {
    fs.writeFileSync(previewPath, file.buffer);
    return { sourcePath, previewPath };
  }
  const result = spawnSync(
    previewPython,
    [previewScript, sourcePath, previewPath],
    { windowsHide: true, encoding: "utf8" },
  );
  if (result.status !== 0 || !fs.existsSync(previewPath)) {
    fs.rmSync(sourcePath, { force: true });
    throw new Error(
      `주문서 확인용 PDF 변환에 실패했습니다: ${file.originalname}`,
    );
  }
  return { sourcePath, previewPath };
}
type LoginToken = {
  userId: number;
  email: string;
  name: string;
  role: "ADMIN" | "STAFF" | "VIEWER";
};
if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET)
  throw new Error("운영 환경에는 AUTH_SECRET 설정이 필요합니다.");
const authSecret =
  process.env.AUTH_SECRET ||
  "miyansol-local-development-secret-change-on-vercel";
const cookieValue = (header: string | undefined, name: string) =>
  header
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
const authCookie = (token: string, maxAge: number) =>
  `miyansol_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
app.get("/api/health", async (_req, res) => res.json({ ok: true }));
app.get("/api/auth/status", async (req, res) => {
  const count = (
    (await db
      .prepare("SELECT COUNT(*) count FROM users WHERE active=1")
      .get()) as {
      count: number;
    }
  ).count;
  let user: LoginToken | null = null;
  const token = cookieValue(req.headers.cookie, "miyansol_session");
  if (token) {
    try {
      user = jwt.verify(token, authSecret) as LoginToken;
    } catch {
      user = null;
    }
  }
  res.json({ setupRequired: count === 0, user });
});
app.post("/api/auth/setup", async (req, res, next) => {
  try {
    const count = (
      (await db.prepare("SELECT COUNT(*) count FROM users").get()) as {
        count: number;
      }
    ).count;
    if (count) throw new Error("관리자 계정이 이미 등록되어 있습니다.");
    const data = z
      .object({
        email: z.string().trim().email(),
        name: z.string().trim().min(2),
        password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
      })
      .parse(req.body);
    const hash = await bcrypt.hash(data.password, 12);
    const result = await db
      .prepare(
        "INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,'ADMIN')",
      )
      .run(data.email.toLowerCase(), data.name, hash);
    const user: LoginToken = {
      userId: Number(result.lastInsertRowid),
      email: data.email.toLowerCase(),
      name: data.name,
      role: "ADMIN",
    };
    const token = jwt.sign(user, authSecret, { expiresIn: "12h" });
    res.setHeader("Set-Cookie", authCookie(token, 60 * 60 * 12));
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});
app.post("/api/auth/login", async (req, res, next) => {
  try {
    const data = z
      .object({ email: z.string().trim().email(), password: z.string().min(1) })
      .parse(req.body);
    const row = (await db
      .prepare(
        "SELECT id,email,name,password_hash,role FROM users WHERE email=? AND active=1",
      )
      .get(data.email.toLowerCase())) as
      | {
          id: number;
          email: string;
          name: string;
          password_hash: string;
          role: LoginToken["role"];
        }
      | undefined;
    if (!row || !(await bcrypt.compare(data.password, row.password_hash)))
      return res
        .status(401)
        .json({ message: "이메일 또는 비밀번호가 올바르지 않습니다." });
    await db
      .prepare("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(row.id);
    const user: LoginToken = {
      userId: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
    };
    const token = jwt.sign(user, authSecret, { expiresIn: "12h" });
    res.setHeader("Set-Cookie", authCookie(token, 60 * 60 * 12));
    res.json({ user });
  } catch (error) {
    next(error);
  }
});
app.post("/api/auth/logout", async (_req, res) => {
  res.setHeader("Set-Cookie", authCookie("", 0));
  res.json({ ok: true });
});
app.use((req, res, next) => {
  const token = cookieValue(req.headers.cookie, "miyansol_session");
  if (!token) return res.status(401).json({ message: "로그인이 필요합니다." });
  try {
    (
      req as express.Request & {
        user: LoginToken;
      }
    ).user = jwt.verify(token, authSecret) as LoginToken;
    next();
  } catch {
    return res
      .status(401)
      .json({ message: "로그인이 만료되었습니다. 다시 로그인해 주세요." });
  }
});
app.use(
  "/uploads",
  express.static(fileURLToPath(new URL("../uploads", import.meta.url))),
);
app.patch("/api/auth/profile", async (req, res, next) => {
  try {
    const current = (
      req as express.Request & {
        user: LoginToken;
      }
    ).user;
    const data = z
      .object({
        name: z.string().trim().min(2),
        email: z.string().trim().email(),
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8).optional().or(z.literal("")),
      })
      .parse(req.body);
    const row = (await db
      .prepare(
        "SELECT id,password_hash,role FROM users WHERE id=? AND active=1",
      )
      .get(current.userId)) as
      | {
          id: number;
          password_hash: string;
          role: LoginToken["role"];
        }
      | undefined;
    if (
      !row ||
      !(await bcrypt.compare(data.currentPassword, row.password_hash))
    )
      return res
        .status(401)
        .json({ message: "현재 비밀번호가 올바르지 않습니다." });
    const duplicate = await db
      .prepare("SELECT id FROM users WHERE email=? AND id!=?")
      .get(data.email.toLowerCase(), row.id);
    if (duplicate) throw new Error("이미 사용 중인 이메일입니다.");
    const passwordHash = data.newPassword
      ? await bcrypt.hash(data.newPassword, 12)
      : row.password_hash;
    await db
      .prepare("UPDATE users SET name=?,email=?,password_hash=? WHERE id=?")
      .run(data.name, data.email.toLowerCase(), passwordHash, row.id);
    const user: LoginToken = {
      userId: row.id,
      email: data.email.toLowerCase(),
      name: data.name,
      role: row.role,
    };
    const token = jwt.sign(user, authSecret, { expiresIn: "12h" });
    res.setHeader("Set-Cookie", authCookie(token, 60 * 60 * 12));
    res.json({ user });
  } catch (error) {
    next(error);
  }
});
const movementMap = {
  FACTORY_IN: { from: null, to: "FACTORY" },
  FACTORY_OUT: { from: "FACTORY", to: null },
  PICKING_IN: { from: "FACTORY", to: "PICKING" },
  PICKING_OUT: { from: "PICKING", to: null },
  PICKING_RETURN: { from: null, to: "PICKING" },
} as const;
app.get("/api/vendors", async (req, res) => {
  const type = String(req.query.type || "");
  res.json(
    await db
      .prepare(
        "SELECT id,name,memo,factory_address,delivery_address,vendor_type,created_at FROM vendors WHERE active=1 AND (?='' OR vendor_type=?) ORDER BY name COLLATE NOCASE",
      )
      .all(type, type),
  );
});
app.post("/api/vendors", async (req, res, next) => {
  try {
    const data = z
      .object({
        name: z.string().trim().min(1, "거래처명을 입력해 주세요."),
        memo: z.string().trim().default(""),
        factoryAddress: z.string().trim().default(""),
        deliveryAddress: z.string().trim().default(""),
        vendorType: z.enum(["FACTORY", "SALES"]).default("SALES"),
      })
      .parse(req.body);
    const existing = (await db
      .prepare("SELECT id FROM vendors WHERE name=?")
      .get(data.name)) as
      | {
          id: number;
        }
      | undefined;
    if (existing) {
      await db
        .prepare(
          "UPDATE vendors SET memo=?,factory_address=?,delivery_address=?,vendor_type=?,active=1 WHERE id=?",
        )
        .run(
          data.memo,
          data.factoryAddress,
          data.deliveryAddress,
          data.vendorType,
          existing.id,
        );
      return res.status(200).json({ id: existing.id, ...data });
    }
    const result = await db
      .prepare(
        "INSERT INTO vendors(name,memo,factory_address,delivery_address,vendor_type) VALUES(?,?,?,?,?)",
      )
      .run(
        data.name,
        data.memo,
        data.factoryAddress,
        data.deliveryAddress,
        data.vendorType,
      );
    res.status(201).json({ id: Number(result.lastInsertRowid), ...data });
  } catch (error) {
    next(error);
  }
});
app.patch("/api/vendors/:id", async (req, res, next) => {
  try {
    const data = z
      .object({
        name: z.string().trim().min(1),
        memo: z.string().trim().default(""),
        factoryAddress: z.string().trim().default(""),
        deliveryAddress: z.string().trim().default(""),
        vendorType: z.enum(["FACTORY", "SALES"]),
      })
      .parse(req.body);
    const current = (await db
      .prepare("SELECT name FROM vendors WHERE id=? AND active=1")
      .get(req.params.id)) as
      | {
          name: string;
        }
      | undefined;
    if (!current) throw new Error("거래처를 찾을 수 없습니다.");
    await db.transaction(async () => {
      await db
        .prepare(
          "UPDATE vendors SET name=?,memo=?,factory_address=?,delivery_address=?,vendor_type=? WHERE id=?",
        )
        .run(
          data.name,
          data.memo,
          data.factoryAddress,
          data.deliveryAddress,
          data.vendorType,
          req.params.id,
        );
      if (current.name !== data.name) {
        await db
          .prepare("UPDATE order_imports SET vendor=? WHERE vendor=?")
          .run(data.name, current.name);
        await db
          .prepare("UPDATE movements SET vendor_name=? WHERE vendor_name=?")
          .run(data.name, current.name);
      }
    })();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
app.delete("/api/vendors/:id", async (req, res, next) => {
  try {
    await db
      .prepare("UPDATE vendors SET active=0 WHERE id=?")
      .run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
app.get("/api/factory-orders", async (req, res) => {
  const status = String(req.query.status || "");
  res.json(
    await db
      .prepare(
        `SELECT o.id,o.status,o.factory_address,o.delivery_address,o.memo,o.ordered_at,o.received_at,v.name vendor_name,i.product_id,i.quantity,p.sku,p.name product_name,p.color FROM factory_orders o JOIN vendors v ON v.id=o.vendor_id JOIN factory_order_items i ON i.order_id=o.id JOIN products p ON p.id=i.product_id WHERE (?='' OR o.status=?) ORDER BY o.id DESC`,
      )
      .all(status, status),
  );
});
app.post("/api/factory-orders", async (req, res, next) => {
  try {
    const data = z
      .object({
        vendorId: z.number().int().positive(),
        productId: z.number().int().positive(),
        quantity: z.number().int().positive(),
        factoryAddress: z.string().trim().min(1, "공장 주소를 입력해 주세요."),
        deliveryAddress: z.string().trim().min(1, "납품 주소를 입력해 주세요."),
        memo: z.string().trim().default(""),
      })
      .parse(req.body);
    if (
      !(await db
        .prepare(
          "SELECT id FROM vendors WHERE id=? AND active=1 AND vendor_type='FACTORY'",
        )
        .get(data.vendorId))
    )
      throw new Error("등록된 공장 거래처를 선택해 주세요.");
    if (
      !(await db
        .prepare("SELECT id FROM products WHERE id=? AND active=1")
        .get(data.productId))
    )
      throw new Error("상품을 찾을 수 없습니다.");
    const user = (
      req as express.Request & {
        user: LoginToken;
      }
    ).user;
    const id = await db.transaction(async () => {
      const result = await db
        .prepare(
          "INSERT INTO factory_orders(vendor_id,factory_address,delivery_address,memo,created_by) VALUES(?,?,?,?,?)",
        )
        .run(
          data.vendorId,
          data.factoryAddress,
          data.deliveryAddress,
          data.memo,
          user.userId,
        );
      await db
        .prepare(
          "INSERT INTO factory_order_items(order_id,product_id,quantity) VALUES(?,?,?)",
        )
        .run(result.lastInsertRowid, data.productId, data.quantity);
      return Number(result.lastInsertRowid);
    })();
    res.status(201).json({ id });
  } catch (error) {
    next(error);
  }
});
app.post("/api/factory-orders/:id/receive", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const order = (await db
      .prepare(
        `SELECT o.status,i.product_id,i.quantity FROM factory_orders o JOIN factory_order_items i ON i.order_id=o.id WHERE o.id=?`,
      )
      .get(id)) as
      | {
          status: string;
          product_id: number;
          quantity: number;
        }
      | undefined;
    if (!order) throw new Error("발주 내역을 찾을 수 없습니다.");
    if (order.status !== "ORDERED")
      throw new Error("이미 완료되었거나 취소된 발주입니다.");
    const user = (
      req as unknown as express.Request & {
        user: LoginToken;
      }
    ).user;
    await db.transaction(async () => {
      await db
        .prepare(
          "UPDATE inventory SET quantity=quantity+? WHERE product_id=? AND location='FACTORY'",
        )
        .run(order.quantity, order.product_id);
      await db
        .prepare(
          "INSERT INTO movements(product_id,type,from_location,to_location,quantity,worker_id,memo) VALUES(?,'FACTORY_IN',NULL,'FACTORY',?,?,?)",
        )
        .run(
          order.product_id,
          order.quantity,
          user.userId,
          `공장 발주 #${id} 입고 완료`,
        );
      await db
        .prepare(
          "UPDATE factory_orders SET status='RECEIVED',received_at=CURRENT_TIMESTAMP WHERE id=? AND status='ORDERED'",
        )
        .run(id);
    })();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
app.post("/api/factory-orders/:id/cancel", async (req, res, next) => {
  try {
    const result = await db
      .prepare(
        "UPDATE factory_orders SET status='CANCELLED' WHERE id=? AND status='ORDERED'",
      )
      .run(req.params.id);
    if (!result.changes)
      throw new Error("취소할 수 있는 발주 내역이 아닙니다.");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
app.get("/api/products", async (_req, res) =>
  res.json(
    await db
      .prepare(
        `SELECT p.*, COALESCE(f.quantity,0) "factoryStock", COALESCE(k.quantity,0) "pickingStock", COALESCE(f.quantity,0)+COALESCE(k.quantity,0) "totalStock" FROM products p LEFT JOIN inventory f ON f.product_id=p.id AND f.location='FACTORY' LEFT JOIN inventory k ON k.product_id=p.id AND k.location='PICKING' WHERE p.active=1 ORDER BY p.id DESC`,
      )
      .all(),
  ),
);
app.get("/api/products/barcode/:barcode", async (req, res) => {
  const product = await db
    .prepare(
      `SELECT p.*, COALESCE(f.quantity,0) "factoryStock", COALESCE(k.quantity,0) "pickingStock" FROM products p LEFT JOIN inventory f ON f.product_id=p.id AND f.location='FACTORY' LEFT JOIN inventory k ON k.product_id=p.id AND k.location='PICKING' WHERE p.barcode=? AND p.active=1`,
    )
    .get(req.params.barcode);
  if (!product)
    return res.status(404).json({ message: "등록되지 않은 바코드입니다." });
  res.json(product);
});
app.post("/api/products", async (req, res, next) => {
  try {
    const d = z
      .object({
        sku: z.string().min(1),
        name: z.string().min(1),
        color: z.string().default(""),
        barcode: z.string().trim().optional(),
      })
      .parse(req.body);
    const result = await db.transaction(async () => {
      const r = await db
        .prepare("INSERT INTO products(sku,name,color,barcode) VALUES(?,?,?,?)")
        .run(d.sku, d.name, d.color, d.barcode || null);
      await db
        .prepare(
          "INSERT INTO inventory VALUES (?, 'FACTORY', 0), (?, 'PICKING', 0)",
        )
        .run(r.lastInsertRowid, r.lastInsertRowid);
      return r;
    })();
    res.status(201).json({ id: Number(result.lastInsertRowid), ...d });
  } catch (e) {
    next(e);
  }
});
app.get("/api/inventory", async (_req, res) =>
  res.json(
    await db
      .prepare(
        `SELECT p.id,p.sku,p.name,p.color,p.barcode,p.image_path,p.catalog_name,COALESCE(f.quantity,0) "factoryStock",COALESCE(k.quantity,0) "pickingStock",COALESCE(f.quantity,0)+COALESCE(k.quantity,0) "totalStock" FROM products p LEFT JOIN inventory f ON f.product_id=p.id AND f.location='FACTORY' LEFT JOIN inventory k ON k.product_id=p.id AND k.location='PICKING' WHERE p.active=1 ORDER BY p.name,p.color`,
      )
      .all(),
  ),
);
app.get("/api/dashboard/outbound-ranking", async (req, res) => {
  const period = ["today", "7days", "30days", "all"].includes(
    String(req.query.period),
  )
    ? String(req.query.period)
    : "30days";
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 1000);
  const condition =
    period === "today"
      ? "AND date(m.created_at,'localtime')=date('now','localtime')"
      : period === "7days"
        ? "AND datetime(m.created_at)>=datetime('now','-7 days')"
        : period === "30days"
          ? "AND datetime(m.created_at)>=datetime('now','-30 days')"
          : "";
  res.json(
    await db
      .prepare(
        `SELECT p.id,p.sku,p.name,p.color,p.image_path,SUM(m.quantity) outbound_quantity,COUNT(m.id) outbound_count,COALESCE(k.quantity,0) packing_stock FROM movements m JOIN products p ON p.id=m.product_id LEFT JOIN inventory k ON k.product_id=p.id AND k.location='PICKING' WHERE m.type='PICKING_OUT' ${condition} GROUP BY p.id,p.sku,p.name,p.color,p.image_path,k.quantity ORDER BY outbound_quantity DESC,p.name COLLATE NOCASE LIMIT ?`,
      )
      .all(limit),
  );
});
app.get("/api/dashboard-inventory", async (_req, res) => {
  const allRows = (await db
    .prepare(
      `SELECT p.id,p.name,p.image_path,p.catalog_name,COALESCE(f.quantity,0) "factoryStock",COALESCE(k.quantity,0) "pickingStock",COALESCE(f.quantity,0)+COALESCE(k.quantity,0) "totalStock" FROM products p LEFT JOIN inventory f ON f.product_id=p.id AND f.location='FACTORY' LEFT JOIN inventory k ON k.product_id=p.id AND k.location='PICKING' WHERE p.active=1`,
    )
    .all()) as Array<Record<string, unknown>>;
  const names = JSON.parse(
    fs.readFileSync(
      fileURLToPath(new URL("../data/inventory-names.json", import.meta.url)),
      "utf8",
    ),
  ) as string[];
  const nameSet = new Set(names);
  const rows = allRows.filter((row) =>
    nameSet.has(String(row.catalog_name || row.name)),
  );
  const present = new Set(
    rows.map((row) => String(row.catalog_name || row.name)),
  );
  let virtualId = -1;
  for (const name of names) {
    if (!present.has(name))
      rows.push({
        id: virtualId--,
        name,
        catalog_name: name,
        image_path: null,
        factoryStock: 0,
        pickingStock: 0,
        totalStock: 0,
      });
  }
  res.json(rows);
});
app.get("/api/movements", async (req, res) =>
  res.json(
    await db
      .prepare(
        `SELECT m.*,p.sku,p.name,p.color,u.name worker_name FROM movements m JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.worker_id ORDER BY m.id DESC LIMIT ?`,
      )
      .all(Math.min(Number(req.query.limit) || 100, 5000)),
  ),
);
app.get("/api/labels", async (req, res) => {
  const search = `%${String(req.query.search || "")}%`;
  const vendor = String(req.query.vendor || "");
  res.json(
    await db
      .prepare(
        `SELECT l.id,l.vendor,l.category,l.product_name,l.barcode,l.template_data,l.product_id,p.image_path,p.name dashboard_name,p.catalog_name FROM label_templates l LEFT JOIN products p ON p.id=l.product_id WHERE (?='' OR l.vendor=?) AND (l.product_name LIKE ? OR l.barcode LIKE ?) ORDER BY l.vendor,l.category,l.product_name LIMIT 5000`,
      )
      .all(vendor, vendor, search, search),
  );
});
app.get("/api/labels/vendors", async (_req, res) =>
  res.json(
    await db
      .prepare(
        "SELECT v.id,v.name vendor,COUNT(l.id) count FROM label_vendors v LEFT JOIN label_templates l ON l.vendor=v.name WHERE v.active=1 GROUP BY v.id,v.name ORDER BY v.name COLLATE NOCASE",
      )
      .all(),
  ),
);
app.post("/api/labels/vendors", async (req, res, next) => {
  try {
    const name = z
      .string()
      .trim()
      .min(1, "라벨 공급처명을 입력해 주세요.")
      .parse(req.body.name);
    const existing = (await db
      .prepare("SELECT id FROM label_vendors WHERE name=?")
      .get(name)) as
      | {
          id: number;
        }
      | undefined;
    if (existing) {
      await db
        .prepare("UPDATE label_vendors SET active=1 WHERE id=?")
        .run(existing.id);
      return res.json({ id: existing.id, vendor: name, count: 0 });
    }
    const result = await db
      .prepare("INSERT INTO label_vendors(name) VALUES(?)")
      .run(name);
    res
      .status(201)
      .json({ id: Number(result.lastInsertRowid), vendor: name, count: 0 });
  } catch (error) {
    next(error);
  }
});
app.patch("/api/labels/vendors/:id", async (req, res, next) => {
  try {
    const name = z
      .string()
      .trim()
      .min(1, "라벨 공급처명을 입력해 주세요.")
      .parse(req.body.name);
    const current = (await db
      .prepare("SELECT name FROM label_vendors WHERE id=? AND active=1")
      .get(req.params.id)) as
      | {
          name: string;
        }
      | undefined;
    if (!current) throw new Error("라벨 공급처를 찾을 수 없습니다.");
    await db.transaction(async () => {
      await db
        .prepare("UPDATE label_vendors SET name=? WHERE id=?")
        .run(name, req.params.id);
      await db
        .prepare("UPDATE label_templates SET vendor=? WHERE vendor=?")
        .run(name, current.name);
    })();
    res.json({ ok: true, vendor: name });
  } catch (error) {
    next(error);
  }
});
app.use("/api/order-imports/manual", async (req, res, next) => {
  if (req.method !== "POST") return next();
  const vendor = String(req.body?.vendor || "");
  if (
    !(await db
      .prepare(
        "SELECT id FROM vendors WHERE name=? AND active=1 AND vendor_type='SALES'",
      )
      .get(vendor))
  )
    return res
      .status(400)
      .json({ message: "등록된 출고 거래처를 선택해 주세요." });
  next();
});
app.post(
  "/api/order-imports",
  orderUpload.array("files", 30),
  async (req, res, next) => {
    try {
      const vendor = z
        .string()
        .trim()
        .min(1, "거래처를 선택해 주세요.")
        .parse(req.body.vendor);
      if (
        !(await db
          .prepare(
            "SELECT id FROM vendors WHERE name=? AND active=1 AND vendor_type='SALES'",
          )
          .get(vendor))
      )
        throw new Error("등록된 출고 거래처를 선택해 주세요.");
      const files = (req.files || []) as Express.Multer.File[];
      if (!files.length) throw new Error("주문서 파일을 선택해 주세요.");
      let browserOcr = new Map<string, string>();
      try {
        const values = JSON.parse(String(req.body.ocrTexts || "[]")) as Array<{name?:string;text?:string}>;
        browserOcr = new Map(values.filter(row=>row.name).map(row=>[String(row.name),String(row.text||"")]));
      } catch {
        throw new Error("사진에서 추출한 문자 형식이 올바르지 않습니다.");
      }
      const products = (await db
        .prepare(
          `SELECT p.id,p.name,p.catalog_name,p.sku,(SELECT STRING_AGG(value,'|||') FROM (SELECT a.alias value FROM product_aliases a WHERE a.product_id=p.id UNION ALL SELECT l.product_name FROM label_templates l WHERE l.product_id=p.id UNION ALL SELECT l.barcode FROM label_templates l WHERE l.product_id=p.id AND l.barcode IS NOT NULL UNION ALL SELECT j.value FROM label_templates l CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(l.template_data)='array' THEN l.template_data ELSE '[]'::jsonb END) j(value) WHERE l.product_id=p.id) alias_values) aliases FROM products p WHERE p.active=TRUE`,
        )
        .all()) as Array<{
        id: number;
        name: string;
        catalog_name: string | null;
        sku: string;
        aliases: string | null;
      }>;
      const insertImport = db.prepare(
        "INSERT INTO order_imports(vendor,filename,file_type,status,raw_text,source_path,preview_pdf_path,file_data) VALUES(?,?,?,?,?,?,?,?)",
      );
      const insertItem = db.prepare(
        "INSERT INTO order_import_items(import_id,source_name,quantity,matched_product_id,confidence) VALUES(?,?,?,?,?)",
      );
      const updateStatus = db.prepare(
        "UPDATE order_imports SET status=? WHERE id=?",
      );
      const imports = [];
      for (const file of files) {
        const preview = createOrderPreview(file);
        const analysis = await analyzeOrderFile(file, products, browserOcr.get(file.originalname));
        const result = await insertImport.run(
          vendor,
          file.originalname,
          file.mimetype,
          analysis.status,
          analysis.rawText.slice(0, 100000),
          preview.sourcePath,
          preview.previewPath,
          file.buffer,
        );
        const importId = Number(result.lastInsertRowid);
        for (const row of analysis.items)
          await insertItem.run(
            importId,
            row.sourceName,
            row.quantity,
            row.productId,
            row.confidence,
          );
        await updateStatus.run(analysis.status, importId);
        imports.push({
          id: importId,
          filename: file.originalname,
          rows: analysis.extractedCount,
          unmatched: analysis.unmatchedCount,
          status: analysis.status,
          engine: analysis.engine,
        });
      }
      res.status(201).json({ imports });
    } catch (error) {
      next(error);
    }
  },
);
app.post("/api/order-imports/manual", async (req, res, next) => {
  try {
    const data = z
      .object({
        vendor: z.string().trim().min(1),
        items: z
          .array(
            z.object({
              productId: z.number().int().positive(),
              quantity: z.number().int().positive(),
            }),
          )
          .min(1),
      })
      .parse(req.body);
    if (
      !(await db
        .prepare("SELECT id FROM vendors WHERE name=? AND active=1")
        .get(data.vendor))
    )
      throw new Error("등록된 거래처를 선택해 주세요.");
    const products = (await db
      .prepare(`SELECT id,name FROM products WHERE active=1`)
      .all()) as Array<{
      id: number;
      name: string;
    }>;
    const names = new Map(
      products.map((product) => [product.id, product.name]),
    );
    if (data.items.some((item) => !names.has(item.productId)))
      throw new Error("목록에 없는 상품이 포함되어 있습니다.");
    const id = await db.transaction(async () => {
      const result = await db
        .prepare(
          "INSERT INTO order_imports(vendor,filename,file_type,status,raw_text) VALUES(?,?,'manual','READY','수동 출고 입력')",
        )
        .run(
          data.vendor,
          `수동입력-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`,
        );
      const insert = db.prepare(
        "INSERT INTO order_import_items(import_id,source_name,quantity,matched_product_id,confidence) VALUES(?,?,?,?,1)",
      );
      for (const item of data.items)
        await insert.run(
          result.lastInsertRowid,
          names.get(item.productId),
          item.quantity,
          item.productId,
        );
      return Number(result.lastInsertRowid);
    })();
    res.status(201).json({
      id,
      items: data.items.length,
      quantity: data.items.reduce((sum, item) => sum + item.quantity, 0),
    });
  } catch (error) {
    next(error);
  }
});
app.get("/api/order-imports", async (_req, res) => {
  const imports = await db
    .prepare(
      `SELECT o.*,COUNT(i.id) item_count,COALESCE(SUM(i.quantity),0) total_quantity,SUM(CASE WHEN i.id IS NOT NULL AND i.matched_product_id IS NULL THEN 1 ELSE 0 END) unmatched_count FROM order_imports o LEFT JOIN order_import_items i ON i.import_id=o.id GROUP BY o.id ORDER BY o.id DESC`,
    )
    .all();
  const items = await db
    .prepare(
      `SELECT i.*,o.vendor,o.filename,p.name matched_name,p.sku FROM order_import_items i JOIN order_imports o ON o.id=i.import_id LEFT JOIN products p ON p.id=i.matched_product_id WHERE o.status!='COMMITTED' ORDER BY o.id DESC,i.id`,
    )
    .all();
  const summary = await db
    .prepare(
      `
    WITH demand AS (
      SELECT i.matched_product_id,COALESCE(p.name,i.source_name) name,p.sku,
        SUM(i.quantity) quantity,COUNT(DISTINCT o.vendor) vendor_count,
        STRING_AGG(DISTINCT o.vendor, ',') vendors
      FROM order_import_items i
      JOIN order_imports o ON o.id=i.import_id
      LEFT JOIN products p ON p.id=i.matched_product_id
      WHERE o.status!='COMMITTED'
      GROUP BY i.matched_product_id,p.name,p.sku,i.source_name
    )
    SELECT d.*,COALESCE(k.quantity,0) picking_stock,COALESCE(f.quantity,0) factory_stock,
      GREATEST(d.quantity-COALESCE(k.quantity,0),0) packing_shortage,
      LEAST(GREATEST(d.quantity-COALESCE(k.quantity,0),0),COALESCE(f.quantity,0)) factory_transfer_needed,
      GREATEST(d.quantity-COALESCE(k.quantity,0)-COALESCE(f.quantity,0),0) total_shortage,
      CASE
        WHEN d.matched_product_id IS NULL THEN 'UNMATCHED'
        WHEN COALESCE(k.quantity,0)>=d.quantity THEN 'READY'
        WHEN COALESCE(k.quantity,0)+COALESCE(f.quantity,0)>=d.quantity THEN 'NEEDS_PACKING'
        ELSE 'SHORTAGE'
      END stock_status
    FROM demand d
    LEFT JOIN inventory k ON k.product_id=d.matched_product_id AND k.location='PICKING'
    LEFT JOIN inventory f ON f.product_id=d.matched_product_id AND f.location='FACTORY'
    ORDER BY d.name
  `,
    )
    .all();
  res.json({ imports, items, summary });
});
app.get("/api/order-imports/:id/preview", async (req, res, next) => {
  try {
    const row = (await db
      .prepare(
        "SELECT filename,file_type,preview_pdf_path,file_data FROM order_imports WHERE id=?",
      )
      .get(req.params.id)) as
      | {
          filename: string;
          file_type: string;
          preview_pdf_path: string;
          file_data: Buffer | null;
        }
      | undefined;
    if (!row) throw new Error("주문서를 찾을 수 없습니다.");
    if (row.file_type === "manual")
      return res
        .status(400)
        .json({ message: "수동 입력은 목록으로 확인해 주세요." });
    if (
      row.file_data &&
      (row.file_type === "application/pdf" || row.file_type.startsWith("image/"))
    ) {
      res.type(row.file_type);
      return res.send(row.file_data);
    }
    if (!row.preview_pdf_path || !fs.existsSync(row.preview_pdf_path))
      return res.status(404).json({
        message: "이 주문서는 변경 이전 자료라 확인용 PDF가 없습니다.",
      });
    res.type("application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="order-${req.params.id}.pdf"`,
    );
    res.sendFile(path.resolve(row.preview_pdf_path));
  } catch (error) {
    next(error);
  }
});
app.get("/api/order-imports/:id/items", async (req, res, next) => {
  try {
    const order = await db
      .prepare(
        "SELECT id,vendor,filename,file_type,status FROM order_imports WHERE id=?",
      )
      .get(req.params.id);
    if (!order) throw new Error("주문서를 찾을 수 없습니다.");
    const rows = await db
      .prepare(
        "SELECT i.id,i.source_name,i.quantity,i.matched_product_id,p.sku,p.name matched_name FROM order_import_items i LEFT JOIN products p ON p.id=i.matched_product_id WHERE i.import_id=? ORDER BY i.id",
      )
      .all(req.params.id);
    res.json({ order, items: rows });
  } catch (error) {
    next(error);
  }
});
app.patch("/api/order-imports/:id/review", async (req, res, next) => {
  try {
    const result = await db
      .prepare(
        "UPDATE order_imports SET reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status!='COMMITTED'",
      )
      .run(req.params.id);
    if (!result.changes) throw new Error("확인할 주문서를 찾을 수 없습니다.");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
app.patch("/api/order-import-items/:id", async (req, res, next) => {
  try {
    const data = z
      .object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive(),
      })
      .parse(req.body);
    const exists = await db
      .prepare("SELECT id FROM products WHERE id=? AND active=1")
      .get(data.productId);
    if (!exists) throw new Error("선택한 상품을 찾을 수 없습니다.");
    const item = (await db
      .prepare(
        "SELECT import_id,source_name FROM order_import_items WHERE id=?",
      )
      .get(req.params.id)) as
      | {
          import_id: number;
          source_name: string;
        }
      | undefined;
    if (!item) throw new Error("주문 품목을 찾을 수 없습니다.");
    await db.transaction(async () => {
      await db
        .prepare(
          "UPDATE order_import_items SET matched_product_id=?,quantity=?,confidence=1 WHERE id=?",
        )
        .run(data.productId, data.quantity, req.params.id);
      const normalized = normalizeAlias(item.source_name);
      if (normalized)
        await db
          .prepare(
            "INSERT INTO product_aliases(product_id,alias,normalized_alias,source) VALUES(?,?,?,'ORDER_CORRECTION') ON CONFLICT(normalized_alias) DO UPDATE SET product_id=excluded.product_id,alias=excluded.alias,source='ORDER_CORRECTION'",
          )
          .run(data.productId, item.source_name, normalized);
      const unmatched = (
        (await db
          .prepare(
            "SELECT COUNT(*) count FROM order_import_items WHERE import_id=? AND matched_product_id IS NULL",
          )
          .get(item.import_id)) as {
          count: number;
        }
      ).count;
      await db
        .prepare("UPDATE order_imports SET status=? WHERE id=?")
        .run(unmatched ? "REVIEW" : "READY", item.import_id);
    })();
    res.json({ ok: true, learned: true });
  } catch (error) {
    next(error);
  }
});
app.delete("/api/order-imports/:id", async (req, res, next) => {
  try {
    const row = (await db
      .prepare("SELECT status FROM order_imports WHERE id=?")
      .get(req.params.id)) as
      | {
          status: string;
          source_path?: string;
          preview_pdf_path?: string;
        }
      | undefined;
    if (!row) throw new Error("주문서를 찾을 수 없습니다.");
    if (row.status === "COMMITTED")
      throw new Error("이미 출고된 주문서는 삭제할 수 없습니다.");
    await db.prepare("DELETE FROM order_imports WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
app.post("/api/order-imports/commit", async (req, res, next) => {
  try {
    const data = z
      .object({ importIds: z.array(z.number().int().positive()).min(1) })
      .parse(req.body);
    const placeholders = data.importIds.map(() => "?").join(",");
    const rows = (await db
      .prepare(
        `SELECT i.*,o.vendor,o.filename FROM order_import_items i JOIN order_imports o ON o.id=i.import_id WHERE o.id IN (${placeholders}) AND o.status!='COMMITTED'`,
      )
      .all(...data.importIds)) as Array<{
      matched_product_id: number | null;
      quantity: number;
      vendor: string;
      filename: string;
    }>;
    if (!rows.length) throw new Error("출고할 주문서가 없습니다.");
    const unreviewed = (
      (await db
        .prepare(
          `SELECT COUNT(*) count FROM order_imports WHERE id IN (${placeholders}) AND reviewed_at IS NULL`,
        )
        .get(...data.importIds)) as {
        count: number;
      }
    ).count;
    if (unreviewed)
      throw new Error(
        `파일 확인이 끝나지 않은 주문서가 ${unreviewed}개 있습니다.`,
      );
    if (rows.some((row) => !row.matched_product_id))
      throw new Error("매칭되지 않은 품목을 먼저 확인해 주세요.");
    const productTotals = new Map<number, number>();
    const vendorTotals = new Map<
      string,
      {
        productId: number;
        vendor: string;
        quantity: number;
      }
    >();
    for (const row of rows) {
      const productId = row.matched_product_id!;
      productTotals.set(
        productId,
        (productTotals.get(productId) || 0) + row.quantity,
      );
      const key = `${row.vendor}\u0000${productId}`;
      const current = vendorTotals.get(key) || {
        productId,
        vendor: row.vendor,
        quantity: 0,
      };
      current.quantity += row.quantity;
      vendorTotals.set(key, current);
    }
    const user = (
      req as express.Request & {
        user: LoginToken;
      }
    ).user;
    await db.transaction(async () => {
      for (const [productId, quantity] of productTotals) {
        const stock = (await db
          .prepare(
            "SELECT quantity FROM inventory WHERE product_id=? AND location='PICKING'",
          )
          .get(productId)) as
          | {
              quantity: number;
            }
          | undefined;
        if (!stock || stock.quantity < quantity)
          throw new Error(
            `패킹 재고가 부족한 상품이 있습니다. 필요 ${quantity}개 / 보유 ${stock?.quantity || 0}개`,
          );
      }
      for (const { productId, vendor, quantity } of vendorTotals.values()) {
        await db
          .prepare(
            "UPDATE inventory SET quantity=quantity-? WHERE product_id=? AND location='PICKING'",
          )
          .run(quantity, productId);
        await db
          .prepare(
            "INSERT INTO movements(product_id,type,from_location,to_location,quantity,worker_id,memo,vendor_name) VALUES(?,'PICKING_OUT','PICKING',NULL,?,?,?,?)",
          )
          .run(productId, quantity, user.userId, "거래처 주문서 출고", vendor);
      }
      await db
        .prepare(
          `UPDATE order_imports SET status='COMMITTED' WHERE id IN (${placeholders})`,
        )
        .run(...data.importIds);
    })();
    res.json({
      ok: true,
      products: productTotals.size,
      quantity: [...productTotals.values()].reduce((a, b) => a + b, 0),
    });
  } catch (error) {
    next(error);
  }
});
app.post("/api/chat", async (req, res, next) => {
  try {
    const message = z
      .object({ message: z.string().trim().min(1) })
      .parse(req.body).message;
    let answer = "";
    if (/주문|오더|출고/.test(message) && /합계|전체|얼마|몇/.test(message)) {
      const row = (await db
        .prepare(
          `SELECT COUNT(DISTINCT o.id) files,COUNT(DISTINCT o.vendor) vendors,COALESCE(SUM(i.quantity),0) quantity FROM order_imports o LEFT JOIN order_import_items i ON i.import_id=o.id WHERE o.status!='COMMITTED'`,
        )
        .get()) as {
        files: number;
        vendors: number;
        quantity: number;
      };
      answer = `현재 출고 대기 주문서는 ${row.files}개 파일, ${row.vendors}개 거래처, 총 ${row.quantity}개입니다.`;
    } else if (/재고/.test(message)) {
      const keyword = message
        .replace(/재고|알려줘|확인|몇개|몇 개/g, "")
        .trim();
      const rows = (await db
        .prepare(
          `SELECT p.name,COALESCE(f.quantity,0)+COALESCE(k.quantity,0) total,COALESCE(k.quantity,0) packing FROM products p LEFT JOIN inventory f ON f.product_id=p.id AND f.location='FACTORY' LEFT JOIN inventory k ON k.product_id=p.id AND k.location='PICKING' WHERE p.active=1 AND p.name LIKE ? LIMIT 10`,
        )
        .all(`%${keyword}%`)) as Array<{
        name: string;
        total: number;
        packing: number;
      }>;
      answer = rows.length
        ? rows
            .map(
              (row) =>
                `${row.name}: 전체 ${row.total}개, 패킹 ${row.packing}개`,
            )
            .join("\n")
        : "해당 상품을 찾지 못했습니다.";
    } else
      answer =
        "상품 재고 또는 출고 대기 주문 합계를 물어보세요. 예: 오늘 주문 합계 알려줘";
    res.json({ answer });
  } catch (error) {
    next(error);
  }
});
app.get("/api/labels/:id/download", async (req, res) => {
  const row = (await db
    .prepare("SELECT source_path,product_name FROM label_templates WHERE id=?")
    .get(req.params.id)) as
    | {
        source_path: string;
        product_name: string;
      }
    | undefined;
  if (!row)
    return res.status(404).json({ message: "라벨을 찾을 수 없습니다." });
  if (!row.source_path.startsWith("C:\\Users\\USER\\Desktop\\유니라벨\\"))
    return res.status(403).json({ message: "허용되지 않은 파일입니다." });
  res.download(row.source_path, `${row.product_name}.uldx`);
});
app.post("/api/labels/batch-open", async (req, res, next) => {
  try {
    const data = z
      .object({
        items: z
          .array(
            z.object({
              id: z.number().int().positive(),
              quantity: z.number().int().min(1).max(100),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(req.body);
    const find = db.prepare(
      "SELECT source_path,product_name FROM label_templates WHERE id=?",
    );
    let opened = 0;
    console.log("[labels/batch-open] request", { items: data.items.length });
    for (const item of data.items) {
      const row = (await find.get(item.id)) as
        | {
            source_path: string;
            product_name: string;
          }
        | undefined;
      if (!row) throw new Error(`라벨 번호 ${item.id}을 찾을 수 없습니다.`);
      if (!row.source_path.startsWith("C:\\Users\\USER\\Desktop\\유니라벨\\"))
        throw new Error("허용되지 않은 라벨 파일입니다.");
      const safePath = row.source_path.replaceAll("'", "''");
      const command = `Start-Process -FilePath '${safePath}'`;
      const encoded = Buffer.from(command, "utf16le").toString("base64");
      const result = spawnSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
        { windowsHide: true, encoding: "utf8" },
      );
      if (result.error || result.status !== 0) {
        console.error("[labels/batch-open] failed", {
          id: item.id,
          product: row.product_name,
          status: result.status,
          error: String(result.error || result.stderr),
        });
        throw new Error(`${row.product_name} 유니라벨 파일을 열지 못했습니다.`);
      }
      opened++;
    }
    console.log("[labels/batch-open] success", { opened });
    res.json({ opened });
  } catch (e) {
    next(e);
  }
});
app.post("/api/movements", async (req, res, next) => {
  try {
    const d = z
      .object({
        productId: z.number().int().positive(),
        type: z.enum([
          "FACTORY_IN",
          "FACTORY_OUT",
          "PICKING_IN",
          "PICKING_OUT",
          "PICKING_RETURN",
        ]),
        quantity: z.number().int().positive(),
        memo: z.string().default(""),
        workerId: z.number().int().positive().nullable().default(null),
        vendorName: z.string().trim().default(""),
      })
      .parse(req.body);
    if (
      (d.type === "PICKING_OUT" || d.type === "PICKING_RETURN") &&
      !d.vendorName
    )
      throw new Error("출고 거래처를 선택해 주세요.");
    if (
      d.vendorName &&
      !(await db
        .prepare(
          "SELECT id FROM vendors WHERE name=? AND active=1 AND vendor_type='SALES'",
        )
        .get(d.vendorName))
    )
      throw new Error("등록된 출고 거래처를 선택해 주세요.");
    const route = movementMap[d.type];
    const id = await db.transaction(async () => {
      if (route.from) {
        const stock = (await db
          .prepare(
            "SELECT quantity FROM inventory WHERE product_id=? AND location=?",
          )
          .get(d.productId, route.from)) as
          | {
              quantity: number;
            }
          | undefined;
        if (!stock || stock.quantity < d.quantity)
          throw new Error(
            `${route.from === "FACTORY" ? "공장" : "패킹"} 재고가 부족합니다.`,
          );
        await db
          .prepare(
            "UPDATE inventory SET quantity=quantity-? WHERE product_id=? AND location=?",
          )
          .run(d.quantity, d.productId, route.from);
      }
      if (route.to)
        await db
          .prepare(
            "UPDATE inventory SET quantity=quantity+? WHERE product_id=? AND location=?",
          )
          .run(d.quantity, d.productId, route.to);
      return (
        await db
          .prepare(
            "INSERT INTO movements(product_id,type,from_location,to_location,quantity,worker_id,memo,vendor_name) VALUES(?,?,?,?,?,?,?,?)",
          )
          .run(
            d.productId,
            d.type,
            route.from,
            route.to,
            d.quantity,
            d.workerId,
            d.memo,
            d.vendorName,
          )
      ).lastInsertRowid;
    })();
    res.status(201).json({ id: Number(id), ...d });
  } catch (e) {
    next(e);
  }
});
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const message =
      err instanceof Error ? err.message : "요청 처리 중 오류가 발생했습니다.";
    res.status(message.includes("UNIQUE") ? 409 : 400).json({ message });
  },
);
if (!process.env.VERCEL)
  app.listen(Number(process.env.PORT) || 4000, async () =>
    console.log(`API: http://localhost:${Number(process.env.PORT) || 4000}/api`),
  );

export default app;
