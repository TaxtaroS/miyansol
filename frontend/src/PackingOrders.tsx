import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Eye,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { majorCategory, majorOrder, subCategory } from "./product-categories";
import { readOrderImage } from "./browser-ocr";
import "./OrderPreview.css";

type Product = {
  id: number;
  name: string;
  sku: string;
  color?: string;
  catalog_name?: string;
  factoryStock: number;
  pickingStock: number;
};
type Vendor = { id: number; name: string };
type ImageOcr = {name:string;url:string;text:string;progress:number;status:"reading"|"ready"|"error"};
type ImportRow = {
  id: number;
  vendor: string;
  filename: string;
  status: string;
  item_count: number;
  total_quantity: number;
  unmatched_count: number;
  file_type: string;
  reviewed_at: string | null;
};
type Item = {
  id: number;
  import_id: number;
  vendor: string;
  filename: string;
  source_name: string;
  quantity: number;
  matched_product_id: number | null;
  matched_name: string | null;
  confidence: number;
};
type Summary = {
  matched_product_id: number | null;
  name: string | null;
  sku: string | null;
  quantity: number;
  vendor_count: number;
  vendors: string;
  picking_stock: number;
  factory_stock: number;
  packing_shortage: number;
  factory_transfer_needed: number;
  total_shortage: number;
  stock_status: "READY" | "NEEDS_PACKING" | "SHORTAGE" | "UNMATCHED";
};

function ManualOrderEntry({
  products,
  vendors,
  onSaved,
}: {
  products: Product[];
  vendors: Vendor[];
  onSaved: () => void;
}) {
  const [vendor, setVendor] = useState("");
  const [major, setMajor] = useState("");
  const [productId, setProductId] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [queue, setQueue] = useState<
    Array<{ product: Product; quantity: number }>
  >([]);
  const [message, setMessage] = useState("");
  const majors = useMemo(
    () =>
      majorOrder.filter((value) =>
        products.some((product) => majorCategory(product) === value),
      ),
    [products],
  );
  const choices = useMemo(
    () =>
      products
        .filter((product) => !major || majorCategory(product) === major)
        .sort((a, b) =>
          `${subCategory(a)} ${a.name}`.localeCompare(
            `${subCategory(b)} ${b.name}`,
            "ko-KR",
            { numeric: true },
          ),
        ),
    [products, major],
  );
  const add = () => {
    const product = products.find((row) => row.id === productId);
    if (!product || quantity < 1) {
      setMessage("상품과 수량을 확인해 주세요.");
      return;
    }
    setQueue((current) => {
      const existing = current.find((row) => row.product.id === product.id);
      return existing
        ? current.map((row) =>
            row.product.id === product.id
              ? { ...row, quantity: row.quantity + quantity }
              : row,
          )
        : [...current, { product, quantity }];
    });
    setMessage("");
  };
  const save = async () => {
    if (!vendor || !queue.length) {
      setMessage("거래처와 출고 품목을 입력해 주세요.");
      return;
    }
    const response = await fetch("/api/order-imports/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendor,
        items: queue.map((row) => ({
          productId: row.product.id,
          quantity: row.quantity,
        })),
      }),
    });
    const data = await response.json();
    setMessage(
      response.ok
        ? `${data.items}개 품목, 총 ${data.quantity}개를 출고 대기목록에 넣었습니다.`
        : data.message,
    );
    if (response.ok) {
      setQueue([]);
      setVendor("");
      setMajor("");
      setProductId(0);
      setQuantity(1);
      onSaved();
    }
  };
  return (
    <div className="panel manual-order-panel">
      <h2>수동 출고 입력</h2>
      <p>
        거래처 → 대분류 → 소분류 순서로 상품을 찾고 수량을 출고 대기목록에
        담으세요.
      </p>
      <div className="manual-order-fields">
        <label>
          거래처
          <select value={vendor} onChange={(e) => setVendor(e.target.value)}>
            <option value="">거래처 선택</option>
            {vendors.map((row) => (
              <option key={row.id}>{row.name}</option>
            ))}
          </select>
        </label>
        <label>
          대분류
          <select
            value={major}
            onChange={(e) => {
              setMajor(e.target.value);
              setProductId(0);
            }}
          >
            <option value="">전체 대분류</option>
            {majors.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          소분류 · 상품 선택
          <select
            value={productId}
            onChange={(e) => setProductId(Number(e.target.value))}
          >
            <option value="">소분류와 상품을 선택하세요</option>
            {choices.map((product) => (
              <option key={product.id} value={product.id}>
                {subCategory(product)} · {product.name} {product.color || ""} ·
                패킹 {product.pickingStock}
              </option>
            ))}
          </select>
        </label>
        <label>
          수량
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>
        <button type="button" className="primary" onClick={add}>
          <Plus size={17} />
          목록에 추가
        </button>
      </div>
      {queue.length > 0 && (
        <div className="manual-order-queue">
          <table>
            <thead>
              <tr>
                <th>대분류</th>
                <th>소분류</th>
                <th>상품</th>
                <th>수량</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => (
                <tr key={row.product.id}>
                  <td>{majorCategory(row.product)}</td>
                  <td>{subCategory(row.product)}</td>
                  <td>
                    {row.product.name} {row.product.color || ""}
                  </td>
                  <td>
                    <b>{row.quantity}</b>
                  </td>
                  <td>
                    <button
                      className="queue-remove"
                      onClick={() =>
                        setQueue((current) =>
                          current.filter(
                            (item) => item.product.id !== row.product.id,
                          ),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="primary manual-save" onClick={() => void save()}>
            출고 대기목록으로 이동
          </button>
        </div>
      )}
      {message && <div className="notice">{message}</div>}
    </div>
  );
}

export default function PackingOrders({
  products,
  reloadInventory,
}: {
  products: Product[];
  reloadInventory: () => void;
}) {
  const [vendor, setVendor] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [imageOcr, setImageOcr] = useState<ImageOcr[]>([]);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    row: ImportRow;
    items: Array<{
      id: number;
      source_name: string;
      quantity: number;
      matched_product_id: number | null;
      sku: string | null;
      matched_name: string | null;
    }>;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const load = () =>
    fetch("/api/order-imports")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || "출고 목록을 불러오지 못했습니다.");
        return data;
      })
      .then((data) => {
        setImports(Array.isArray(data.imports) ? data.imports : []);
        setItems(Array.isArray(data.items) ? data.items : []);
        setSummary(Array.isArray(data.summary) ? data.summary : []);
      })
      .catch((error) => {
        setImports([]);
        setItems([]);
        setSummary([]);
        setMessage(error instanceof Error ? error.message : "출고 목록을 불러오지 못했습니다.");
      });
  useEffect(() => {
    void load();
    fetch("/api/vendors?type=SALES")
      .then((r) => r.json())
      .then(setVendors);
  }, []);
  const selectFiles = async (selected: File[]) => {
    imageOcr.forEach(row=>URL.revokeObjectURL(row.url));
    setFiles(selected);
    const images=selected.filter(file=>file.type.startsWith("image/"));
    setImageOcr(images.map(file=>({name:file.name,url:URL.createObjectURL(file),text:"",progress:0,status:"reading"})));
    for(const file of images){
      try{
        const text=await readOrderImage(file,progress=>setImageOcr(current=>current.map(row=>row.name===file.name?{...row,progress}:row)));
        setImageOcr(current=>current.map(row=>row.name===file.name?{...row,text,progress:1,status:"ready"}:row));
      }catch(error){
        setImageOcr(current=>current.map(row=>row.name===file.name?{...row,text:error instanceof Error?error.message:"사진에서 문자를 찾지 못했습니다.",status:"error"}:row));
      }
    }
  };
  const readyIds = useMemo(
    () =>
      imports
        .filter((row) => row.status === "READY" && row.reviewed_at)
        .map((row) => row.id),
    [imports],
  );
  const stockReady =
    summary.length > 0 && summary.every((row) => row.stock_status === "READY");
  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!vendor.trim() || !files.length) {
      setMessage("거래처명과 주문서 파일을 선택해 주세요.");
      return;
    }
    setBusy(true);
    setMessage(
      "문서를 읽고 품목을 매칭하고 있습니다. 이미지 파일은 시간이 조금 걸릴 수 있습니다.",
    );
    const body = new FormData();
    body.append("vendor", vendor.trim());
    body.append("ocrTexts",JSON.stringify(imageOcr.map(({name,text})=>({name,text}))));
    files.forEach((file) => body.append("files", file));
    try {
      const response = await fetch("/api/order-imports", {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setMessage(
        `${data.imports.length}개 주문서를 분석했습니다. 확인 필요 품목을 검토해 주세요.`,
      );
      setFiles([]);
      imageOcr.forEach(row=>URL.revokeObjectURL(row.url));
      setImageOcr([]);
      if (inputRef.current) inputRef.current.value = "";
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "문서 분석에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  };
  const updateItem = async (item: Item, productId: number) => {
    if (!productId) return;
    const response = await fetch(`/api/order-import-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, quantity: item.quantity }),
    });
    const data = await response.json();
    setMessage(response.ok ? "품목 매칭을 저장했습니다." : data.message);
    if (response.ok) await load();
  };
  const remove = async (id: number) => {
    const response = await fetch(`/api/order-imports/${id}`, {
      method: "DELETE",
    });
    const data = await response.json();
    setMessage(
      response.ok ? "주문서를 대기목록에서 제거했습니다." : data.message,
    );
    if (response.ok) await load();
  };
  const openPreview = async (row: ImportRow) => {
    const response = await fetch(`/api/order-imports/${row.id}/items`);
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message);
      return;
    }
    setPreview({ row, items: data.items });
  };
  const confirmReview = async () => {
    if (!preview) return;
    const response = await fetch(
      `/api/order-imports/${preview.row.id}/review`,
      { method: "PATCH" },
    );
    const data = await response.json();
    setMessage(
      response.ok
        ? `${preview.row.vendor} 주문서를 확인 완료했습니다.`
        : data.message,
    );
    if (response.ok) {
      setPreview(null);
      await load();
    }
  };
  const commit = async () => {
    if (!readyIds.length) {
      setMessage("매칭 확인이 끝난 주문서가 없습니다.");
      return;
    }
    if (!stockReady) {
      setMessage(
        "패킹 준비가 안 된 품목이 있습니다. 공장 재고를 패킹 입고한 뒤 다시 확인해 주세요.",
      );
      return;
    }
    if (
      !window.confirm(
        `${readyIds.length}개 주문서를 합산하여 패킹 재고에서 출고할까요?`,
      )
    )
      return;
    const response = await fetch("/api/order-imports/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ importIds: readyIds }),
    });
    const data = await response.json();
    setMessage(
      response.ok
        ? `${data.quantity}개 통합 출고를 완료했습니다.`
        : data.message,
    );
    if (response.ok) {
      await load();
      reloadInventory();
    }
  };
  return (
    <div className="packing-orders">
      <div className="panel order-upload-panel">
        <h2>거래처 주문서 통합 업로드</h2>
        <p>
          거래처를 선택하고 PDF, JPG, PNG, Excel 주문서를 여러 개 올리면 상품과
          수량을 합산합니다.
        </p>
        <form onSubmit={upload}>
          <label>
            거래처 선택
            <select
              value={vendor}
              onChange={(event) => setVendor(event.target.value)}
            >
              <option value="">거래처를 선택하세요</option>
              {vendors.map((row) => (
                <option key={row.id} value={row.name}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="order-file-input">
            <span>주문서 파일</span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,.xlsx"
              onChange={(event) => void selectFiles([...(event.target.files || [])])}
            />
            <small>
              {files.length
                ? `${files.length}개 파일 선택됨`
                : "여러 파일을 한 번에 선택할 수 있습니다."}
            </small>
          </label>
          <button className="primary" disabled={busy || !vendors.length || imageOcr.some(row=>row.status==="reading")}>
            <Upload size={18} />
            {busy ? "문서 분석 중" : "주문서 분석하기"}
          </button>
        </form>
        {imageOcr.length>0&&<div className="image-ocr-list">
          {imageOcr.map(row=><section className="image-ocr-card" key={row.name}>
            <div className="image-ocr-preview"><img src={row.url} alt={`${row.name} 주문서 미리보기`}/><strong>{row.name}</strong></div>
            <label><span>사진에서 읽은 문자 · {row.status==="reading"?`${Math.round(row.progress*100)}%`:row.status==="ready"?"완료":"자동 인식 실패"}</span>
              <textarea value={row.text} placeholder="추출된 문자가 여기에 표시됩니다. 잘못 읽은 부분은 직접 수정할 수 있습니다." onChange={event=>setImageOcr(current=>current.map(item=>item.name===row.name?{...item,text:event.target.value}:item))}/>
            </label>
          </section>)}
        </div>}
        {!vendors.length && (
          <div className="notice">
            먼저 거래처 관리에서 거래처를 등록해 주세요.
          </div>
        )}
        {message && <div className="notice">{message}</div>}
      </div>
      <ManualOrderEntry products={products} vendors={vendors} onSaved={load} />
      <div className="panel">
        <div className="order-section-title">
          <div>
            <h2>업체별 주문서</h2>
            <p>
              상품 매칭과 패킹 준비가 모두 끝난 주문서만 출고할 수 있습니다.
            </p>
          </div>
          <button
            className="primary"
            onClick={commit}
            disabled={!readyIds.length || !stockReady}
          >
            <CheckCircle2 size={18} /> 패킹 준비 완료 주문 통합 출고
          </button>
        </div>
        {!imports.length ? (
          <div className="empty-queue">등록된 주문서가 없습니다.</div>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>거래처</th>
                  <th>파일</th>
                  <th>품목</th>
                  <th>총수량</th>
                  <th>상태</th>
                  <th>원본 확인</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {imports.map((row) => (
                  <tr key={row.id}>
                    <td>{row.vendor}</td>
                    <td>
                      <FileText size={15} /> {row.filename}
                    </td>
                    <td>{row.item_count}</td>
                    <td>
                      <b>{row.total_quantity}</b>
                    </td>
                    <td>
                      <button
                        className={`order-preview-button ${row.reviewed_at ? "reviewed" : ""}`}
                        onClick={() => void openPreview(row)}
                      >
                        <Eye size={16} />
                        {row.reviewed_at ? "확인 완료" : "파일 확인"}
                      </button>
                    </td>
                    <td>
                      {row.status === "READY" ? (
                        <span className="order-ready">
                          <CheckCircle2 size={15} />
                          매칭 완료
                        </span>
                      ) : row.status === "COMMITTED" ? (
                        <span>출고 완료</span>
                      ) : row.item_count === 0 ? (
                        <span className="order-review">
                          <AlertTriangle size={15} />
                          품목 인식 실패 · 다시 분석 필요
                        </span>
                      ) : (
                        <span className="order-review">
                          <AlertTriangle size={15} />
                          상품 매칭 필요 {row.unmatched_count}
                        </span>
                      )}
                    </td>
                    <td>
                      {row.status !== "COMMITTED" && (
                        <button
                          className="queue-remove"
                          onClick={() => void remove(row.id)}
                          title="삭제"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {preview && (
        <div
          className="order-preview-overlay"
          onMouseDown={() => setPreview(null)}
        >
          <div
            className="order-preview-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="order-preview-head">
              <div>
                <h2>{preview.row.vendor} 주문서 확인</h2>
                <p>
                  {preview.row.filename} · {preview.row.item_count}개 품목 · 총{" "}
                  {preview.row.total_quantity}개
                </p>
              </div>
              <button onClick={() => setPreview(null)}>
                <X />
              </button>
            </div>
            {preview.row.file_type === "manual" ? (
              (()=>{const groups=new Map<string,typeof preview.items>();for(const item of preview.items){const matched=products.find(product=>product.id===item.matched_product_id);const category=matched?majorCategory(matched):"매칭 필요";groups.set(category,[...(groups.get(category)||[]),item])}const ordered=[...groups].sort(([a],[b])=>{const ai=majorOrder.indexOf(a),bi=majorOrder.indexOf(b);return(ai<0?999:ai)-(bi<0?999:bi)||a.localeCompare(b,"ko-KR")});return <div className="manual-dashboard-grid">{ordered.map(([category,rows])=><section className="manual-dashboard-card" key={category}><h3>{category}<small>{rows.length}품목</small></h3><div>{rows.map(item=><article key={item.id}><span><b>{item.matched_name||item.source_name}</b><small>{item.sku||"상품코드 없음"}</small></span><strong>{item.quantity.toLocaleString()}</strong></article>)}</div><footer>합계 <b>{rows.reduce((sum,item)=>sum+item.quantity,0).toLocaleString()}개</b></footer></section>)}</div>})()
            ) : (
              <iframe
                className="order-pdf-preview"
                src={`/api/order-imports/${preview.row.id}/preview`}
                title={`${preview.row.vendor} 주문서 PDF`}
              />
            )}
            <div className="order-preview-actions">
              <button className="queue-clear" onClick={() => setPreview(null)}>
                닫기
              </button>
              <button className="primary" onClick={() => void confirmReview()}>
                <CheckCircle2 size={17} /> 내용 확인 완료
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="order-two-columns">
        <div className="panel">
          <h2>품목 매칭 확인</h2>
          <p>잘못 읽힌 품목은 실제 MIYANSOL 상품으로 변경하세요.</p>
          <div className="order-match-list">
            {items.map((item) => (
              <div
                className={
                  item.matched_product_id
                    ? "order-match-row"
                    : "order-match-row unmatched"
                }
                key={item.id}
              >
                <div>
                  <b>{item.source_name}</b>
                  <small>
                    {item.vendor} · {item.filename} · 주문 {item.quantity}개
                  </small>
                </div>
                <select
                  value={item.matched_product_id || ""}
                  onChange={(event) =>
                    void updateItem(item, Number(event.target.value))
                  }
                >
                  <option value="">상품 선택 필요</option>
                  {products.map((product) => (
                    <option value={product.id} key={product.id}>
                      {product.name} · 공장 {product.factoryStock} · 패킹{" "}
                      {product.pickingStock}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
        <div className="panel stock-compare-panel">
          <h2>주문·재고·패킹 준비 현황</h2>
          <p>여러 업체 주문을 합산하여 현재 패킹 가능 여부를 표시합니다.</p>
          <div className="table order-summary">
            <table>
              <thead>
                <tr>
                  <th>상품</th>
                  <th>주문</th>
                  <th>패킹재고</th>
                  <th>공장재고</th>
                  <th>준비 상태</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row, index) => (
                  <tr key={`${row.matched_product_id}-${index}`}>
                    <td>
                      {row.name || "매칭 필요"}
                      <small>{row.vendors}</small>
                    </td>
                    <td>
                      <b>{row.quantity}</b>
                    </td>
                    <td>{row.picking_stock}</td>
                    <td>{row.factory_stock}</td>
                    <td>
                      {row.stock_status === "READY" ? (
                        <span className="stock-ready">출고 가능</span>
                      ) : row.stock_status === "NEEDS_PACKING" ? (
                        <span className="stock-packing">
                          패킹 입고 {row.factory_transfer_needed}개 필요
                        </span>
                      ) : row.stock_status === "SHORTAGE" ? (
                        <span className="stock-shortage">
                          전체재고 {row.total_shortage}개 부족
                        </span>
                      ) : (
                        <span className="stock-unmatched">품목 매칭 필요</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
