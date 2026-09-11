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
import { orderMimeType, orderResponse, prepareOrderUpload } from "./order-upload";
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
type DocumentPreview = {name:string;type:string;url:string};
type AnalysisState = {status:"reading"|"done"|"error";message:string};
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

function OrderItemEditor({item,products,disabled,onSaved}:{
  item:{id:number;source_name:string;quantity:number;matched_product_id:number|null};
  products:Product[];disabled:boolean;onSaved:()=>Promise<void>;
}) {
  const [productId,setProductId] = useState(item.matched_product_id || 0);
  const [quantity,setQuantity] = useState(item.quantity);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const save = async () => {
    setSaving(true);setError("");
    try {
      await orderResponse(await fetch(`/api/order-import-items/${item.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId,quantity})}));
      await onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "품목 수정에 실패했습니다."); }
    finally { setSaving(false); }
  };
  return <tr><td>{item.source_name}{error && <p role="alert">{error}</p>}</td><td><select aria-label={`${item.source_name} 등록 상품`} value={productId} disabled={disabled || saving} onChange={event=>setProductId(Number(event.target.value))}><option value={0}>상품 확인 필요</option>{products.map(product=><option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></td><td><input aria-label={`${item.source_name} 수량`} type="number" min={1} step={1} value={quantity} disabled={disabled || saving} onChange={event=>setQuantity(Number(event.target.value))}/></td><td><button disabled={disabled || saving || !productId || !Number.isInteger(quantity) || quantity < 1} onClick={()=>void save()}>{saving ? "저장 중" : "품목 확인·저장"}</button></td></tr>;
}

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
  const [documentPreviews, setDocumentPreviews] = useState<DocumentPreview[]>([]);
  const [analysisStates, setAnalysisStates] = useState<Record<number, AnalysisState>>({});
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewMajor, setReviewMajor] = useState("");
  const [reviewProductId, setReviewProductId] = useState(0);
  const [reviewQuantity, setReviewQuantity] = useState(1);
  const [documentVersion, setDocumentVersion] = useState(0);
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
  const reviewMajors = useMemo(() => majorOrder.filter(value => products.some(product => majorCategory(product) === value)), [products]);
  const reviewProducts = useMemo(() => products.filter(product => !reviewMajor || majorCategory(product) === reviewMajor).sort((a,b)=>`${subCategory(a)} ${a.name}`.localeCompare(`${subCategory(b)} ${b.name}`,"ko-KR",{numeric:true})), [products,reviewMajor]);
  const load = () =>
    fetch("/api/order-imports")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || "출고 목록을 불러오지 못했습니다.");
        return data;
      })
      .then((data) => {
        setImports(Array.isArray(data.imports) ? data.imports : []);
        setSummary(Array.isArray(data.summary) ? data.summary : []);
      })
      .catch((error) => {
        setImports([]);
        setSummary([]);
        setMessage(error instanceof Error ? error.message : "출고 목록을 불러오지 못했습니다.");
      });
  useEffect(() => {
    void load();
    fetch("/api/vendors?type=SALES")
      .then((r) => r.json())
      .then(setVendors);
  }, []);
  useEffect(() => {
    const previews = files.filter(file => orderMimeType(file).startsWith("image/") || orderMimeType(file) === "application/pdf")
      .map(file => ({name:file.name,type:orderMimeType(file),url:URL.createObjectURL(file)}));
    setDocumentPreviews(previews);
    return () => previews.forEach(row => URL.revokeObjectURL(row.url));
  }, [files]);
  const analyze = async (id: number) => {
    setAnalysisStates(current => ({...current, [id]:{status:"reading",message:"상품명·수량 분석 중"}}));
    try {
      const data = await orderResponse<{rows:number;engine:string}>(await fetch(`/api/order-imports/${id}/analyze`, {method:"POST",signal:AbortSignal.timeout(60000)}));
      setAnalysisStates(current => ({...current, [id]:{status:"done",message:`${data.rows}개 품목 분석 완료`}}));
      return data.rows;
    } catch (error) {
      const message = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? "분석 시간이 초과되었습니다. 목록을 새로 확인한 뒤 다시 분석해 주세요."
        : error instanceof Error ? error.message : "문서 분석에 실패했습니다.";
      setAnalysisStates(current => ({...current, [id]:{status:"error",message}}));
      throw new Error(message);
    } finally { await load(); }
  };
  const retryAnalysis = async (id: number) => {
    setBusy(true);
    try { await analyze(id); }
    catch (error) { setMessage(error instanceof Error ? error.message : "문서 분석에 실패했습니다."); }
    finally { setBusy(false); }
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
    const failures: string[] = [];
    const registered: Array<{id:number;filename:string}> = [];
    const remaining = [...files];
    try {
      for (const [index, file] of files.entries()) {
        setMessage(`주문서 저장 중 ${index+1}/${files.length}: ${file.name}`);
        try {
          const prepared = await prepareOrderUpload(file);
          const body = new FormData();
          body.append("vendor", vendor.trim());
          body.append("files", prepared);
          const data = await orderResponse<{imports:Array<{id:number;filename:string}>}>(await fetch("/api/order-imports", {method:"POST",body}));
          registered.push(...data.imports);
          remaining.splice(remaining.indexOf(file),1);
          setFiles([...remaining]);
        } catch (error) { failures.push(`${file.name}: ${error instanceof Error ? error.message : "업로드 실패"}`); }
      }
      if (!remaining.length && inputRef.current) inputRef.current.value = "";
      await load();
      let itemCount = 0;
      for (const [index, row] of registered.entries()) {
        setMessage(`상품명·수량 분석 중 ${index+1}/${registered.length}: ${row.filename}`);
        try { itemCount += await analyze(row.id); }
        catch (error) { failures.push(`${row.filename}: ${error instanceof Error ? error.message : "분석 실패"}`); }
      }
      setMessage(`${registered.length}개 주문서 저장 · ${itemCount}개 품목 분석. ${failures.length ? failures.join(" / ") : "원본과 명세서를 대조해 주세요."}`);
    } finally {
      setBusy(false);
    }
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
  const addReviewItem = async () => {
    if (!preview || !reviewProductId || reviewQuantity < 1) {
      setMessage("확인할 상품과 수량을 선택해 주세요.");
      return;
    }
    const response = await fetch(`/api/order-imports/${preview.row.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({productId:reviewProductId,quantity:reviewQuantity}),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message || "주문 품목을 추가하지 못했습니다.");
      return;
    }
    setReviewProductId(0);
    setReviewQuantity(1);
    await load();
    const refreshed = await fetch(`/api/order-imports/${preview.row.id}/items`).then(r=>r.json());
    setPreview(current=>current?{...current,items:refreshed.items||[]}:current);
    setDocumentVersion(version=>version+1);
    setMessage("주문서에 품목을 추가했습니다.");
  };
  const refreshReview = async () => {
    if (!preview) return;
    const id = preview.row.id;
    const refreshed = await orderResponse<{items:typeof preview.items}>(await fetch(`/api/order-imports/${id}/items`));
    setPreview(current=>current?.row.id === id ? {...current,items:refreshed.items} : current);
    setDocumentVersion(version=>version+1);
    await load();
  };
  const confirmReview = async () => {
    if (!preview) return;
    if (!preview.items.length) {
      setMessage("주문 품목을 한 개 이상 추가한 뒤 확인 완료해 주세요.");
      return;
    }
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
              disabled={busy}
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
              disabled={busy}
              onChange={(event) => setFiles([...(event.target.files || [])])}
            />
            <small>
              {files.length
                ? `${files.length}개 파일 선택됨`
                : "여러 파일을 한 번에 선택할 수 있습니다."}
            </small>
          </label>
          <button className="primary" disabled={busy || !vendors.length || !files.length}>
            <Upload size={18} />
            {busy ? "주문서 처리 중" : "주문서 등록 및 분석"}
          </button>
        </form>
        {documentPreviews.length>0&&<div className="image-pdf-section">
          <div className="image-pdf-heading"><div><h3>선택한 원본 주문서</h3><p>사진·PDF에서 상품명과 수량을 읽어 명세서로 정리합니다.</p></div></div>
          <div className="image-ocr-list">
          {documentPreviews.map((row,index)=><section className="image-ocr-card" key={`${row.name}-${index}`}>
            <div className="image-ocr-preview">{row.type.startsWith("image/") ? <img className="order-source-image" src={row.url} alt={`${row.name} 원본`}/> : <iframe src={row.url} title={`${row.name} 원본 PDF`}/>}<div className="image-pdf-file"><strong>{row.name}</strong><a className="primary" href={row.url} target="_blank" rel="noreferrer">원본 크게 열기</a></div></div>
            <div className="image-analysis-status"><strong>분석 준비 완료</strong><span>등록 및 분석 버튼을 눌러 주세요.</span><small>원본을 저장한 뒤 상품명·수량을 분석합니다. 불분명한 품목은 확인 필요로 표시합니다.</small></div>
          </section>)}
          </div>
        </div>}
        {!vendors.length && (
          <div className="notice">
            먼저 거래처 관리에서 거래처를 등록해 주세요.
          </div>
        )}
        {message && <div className="notice" role="status">{message}</div>}
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
                        {row.reviewed_at ? "확인 완료" : "확인 필요"}
                      </button>
                    </td>
                    <td>
                      {analysisStates[row.id]?.status === "reading" ? <span className="order-review">상품명·수량 분석 중…</span> : row.status === "READY" ? (
                        <span className="order-ready">
                          <CheckCircle2 size={15} />
                          매칭 완료
                        </span>
                      ) : row.status === "COMMITTED" ? (
                        <span>출고 완료</span>
                      ) : row.item_count === 0 ? (
                        <span className="order-review">
                          <AlertTriangle size={15} />
                          분석 대기 · 다시 분석 가능
                        </span>
                      ) : (
                        <span className="order-review">
                          <AlertTriangle size={15} />
                          상품 매칭 필요 {row.unmatched_count}
                        </span>
                      )}
                    </td>
                    <td>
                      {analysisStates[row.id]?.status === "error" && <p className="order-analysis-error" role="alert">{analysisStates[row.id].message}</p>}
                      {row.status !== "COMMITTED" && row.file_type !== "manual" && row.item_count === 0 && <button className="order-preview-button" disabled={busy} onClick={() => void retryAnalysis(row.id)}>다시 분석</button>}
                      {row.status !== "COMMITTED" && (
                        <button
                          className="queue-remove"
                          disabled={busy}
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
                  {preview.row.filename} · {preview.items.length}개 품목 · 총{" "}
                  {preview.items.reduce((sum,item)=>sum+item.quantity,0)}개
                </p>
              </div>
              <button onClick={() => setPreview(null)}>
                <X />
              </button>
            </div>
            {preview.row.file_type === "manual" ? (
              (()=>{const groups=new Map<string,typeof preview.items>();for(const item of preview.items){const matched=products.find(product=>product.id===item.matched_product_id);const category=matched?majorCategory(matched):"매칭 필요";groups.set(category,[...(groups.get(category)||[]),item])}const ordered=[...groups].sort(([a],[b])=>{const ai=majorOrder.indexOf(a),bi=majorOrder.indexOf(b);return(ai<0?999:ai)-(bi<0?999:bi)||a.localeCompare(b,"ko-KR")});return <div className="manual-dashboard-grid">{ordered.map(([category,rows])=><section className="manual-dashboard-card" key={category}><h3>{category}<small>{rows.length}품목</small></h3><div>{rows.map(item=><article key={item.id}><span><b>{item.matched_name||item.source_name}</b><small>{item.sku||"상품코드 없음"}</small></span><strong>{item.quantity.toLocaleString()}</strong></article>)}</div><footer>합계 <b>{rows.reduce((sum,item)=>sum+item.quantity,0).toLocaleString()}개</b></footer></section>)}</div>})()
            ) : (
              <div className="reconstructed-order-view">
                <div className="reconstructed-order-toolbar"><b>{preview.items.length ? "원본과 정리된 명세서를 대조해 주세요" : "원본 주문서를 보면서 품목을 추가하세요"}</b><a href={`/api/order-imports/${preview.row.id}/preview`} target="_blank" rel="noreferrer">원본 크게 보기</a>{preview.items.length > 0 && <a href={`/api/order-imports/${preview.row.id}/document`} target="_blank" rel="noreferrer">명세서 인쇄 / PDF 저장</a>}</div>
                <div className="order-document-comparison">
                  <section><h3>원본 주문서</h3><iframe className="order-pdf-preview" src={`/api/order-imports/${preview.row.id}/preview`} title={`${preview.row.vendor} 원본 주문서`}/></section>
                  {preview.items.length > 0 && <section><h3>정리된 출고 명세서</h3><iframe className="order-pdf-preview" src={`/api/order-imports/${preview.row.id}/document?v=${documentVersion}`} title={`${preview.row.vendor} 출고 명세서`}/></section>}
                </div>
                {preview.items.length > 0 && <div className="order-item-editors"><h3>상품명·수량 검토</h3><table><thead><tr><th>원본 판독 내용</th><th>등록 상품</th><th>수량</th><th>검토</th></tr></thead><tbody>{preview.items.map(item=><OrderItemEditor key={`${item.id}-${item.matched_product_id}-${item.quantity}`} item={item} products={products} disabled={busy || preview.row.status === "COMMITTED"} onSaved={refreshReview}/>)}</tbody></table></div>}
                <div className="review-item-entry">
                  <label>대분류<select value={reviewMajor} onChange={event=>{setReviewMajor(event.target.value);setReviewProductId(0)}}><option value="">전체 대분류</option>{reviewMajors.map(value=><option key={value}>{value}</option>)}</select></label>
                  <label>상품 선택<select value={reviewProductId} onChange={event=>setReviewProductId(Number(event.target.value))}><option value={0}>상품을 선택하세요</option>{reviewProducts.map(product=><option key={product.id} value={product.id}>{subCategory(product)} · {product.name}</option>)}</select></label>
                  <label>수량<input type="number" min={1} value={reviewQuantity} onChange={event=>setReviewQuantity(Number(event.target.value))}/></label>
                  <button className="primary" disabled={busy || preview.row.status === "COMMITTED"} onClick={()=>void addReviewItem()}><Plus size={16}/> 품목 추가</button>
                </div>
              </div>
            )}
            <div className="order-preview-actions">
              <button className="queue-clear" onClick={() => setPreview(null)}>
                닫기
              </button>
              <button className="primary" disabled={busy || !preview.items.length || preview.items.some(item=>!item.matched_product_id) || preview.row.status === "COMMITTED"} onClick={() => void confirmReview()}>
                <CheckCircle2 size={17} /> 내용 확인 완료
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="panel stock-dashboard-panel">
        <h2>주문·재고·패킹 준비 현황</h2>
        <p>여러 업체 주문을 합산하여 대시보드 품목 순서로 표시합니다.</p>
        {summary.length === 0 ? (
          <div className="empty-queue">등록된 출고 대기 품목이 없습니다.</div>
        ) : (
          (() => {
            const groups = new Map<string, Summary[]>();
            for (const row of summary) {
              const product = products.find(
                (item) => item.id === row.matched_product_id,
              );
              const category = product ? majorCategory(product) : "매칭 필요";
              groups.set(category, [...(groups.get(category) || []), row]);
            }
            const ordered = [...groups].sort(([a], [b]) => {
              const ai = majorOrder.indexOf(a);
              const bi = majorOrder.indexOf(b);
              return (
                (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) ||
                a.localeCompare(b, "ko-KR")
              );
            });
            return (
              <div className="packing-stock-dashboard">
                {ordered.map(([category, rows]) => (
                  <section className="packing-stock-card" key={category}>
                    <h3>
                      {category}
                      <small>{rows.length}품목</small>
                    </h3>
                    <div className="packing-stock-card-head">
                      <span>품목</span><span>주문</span><span>패킹</span><span>공장</span>
                    </div>
                    {rows.map((row, index) => (
                      <article key={`${row.matched_product_id}-${index}`}>
                        <div className="packing-stock-name">
                          <b>{row.name || "매칭 필요"}</b>
                          <small>{row.vendors}</small>
                        </div>
                        <strong>{row.quantity}</strong>
                        <span>{row.picking_stock}</span>
                        <span>{row.factory_stock}</span>
                        <div className="packing-stock-state">
                          {row.stock_status === "READY" ? (
                            <span className="stock-ready">출고 가능</span>
                          ) : row.stock_status === "NEEDS_PACKING" ? (
                            <span className="stock-packing">
                              패킹 {row.factory_transfer_needed}개 필요
                            </span>
                          ) : row.stock_status === "SHORTAGE" ? (
                            <span className="stock-shortage">
                              재고 {row.total_shortage}개 부족
                            </span>
                          ) : (
                            <span className="stock-unmatched">매칭 필요</span>
                          )}
                        </div>
                      </article>
                    ))}
                    <footer>
                      주문 합계 <b>{rows.reduce((sum, row) => sum + row.quantity, 0)}개</b>
                    </footer>
                  </section>
                ))}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
