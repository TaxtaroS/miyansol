import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  Warehouse,
  History,
  MessageCircle,
  RotateCcw,
  Search,
  Menu,
  Barcode,
  Users,
  Trash2,
} from "lucide-react";
import InventoryDashboard from "./InventoryDashboard";
import InventoryCalendar from "./InventoryCalendar";
import LabelOutput from "./LabelOutput";
import PackingOrders from "./PackingOrders";
import { useAuth } from "./AuthGate";
import { DashboardOperations, FactoryOrderForm } from "./FactoryOperations";
import { majorCategory, majorOrder, subCategory } from "./product-categories";
import VendorManagement from "./VendorManagement";
import "./HistoryPage.css";
import OutboundRanking from "./OutboundRanking";
type Product = {
  id: number;
  sku: string;
  name: string;
  color: string;
  barcode?: string;
  image_path?: string;
  catalog_name?: string;
  factoryStock: number;
  pickingStock: number;
  totalStock: number;
};
const pages = [
  ["대시보드", LayoutDashboard],
  ["상품관리", Package],
  ["거래처 관리", Users],
  ["창고 입고", ArrowDownToLine],
  ["패킹 입고", Warehouse],
  ["패킹 출고", ArrowUpFromLine],
  ["출고 반품", RotateCcw],
  ["재고조회", Search],
  ["출고이력", History],
  ["바코드 출력", Barcode],
  ["챗봇", MessageCircle],
] as const;
const actionTypes: Record<string, string> = {
  "창고 입고": "FACTORY_IN",
  "패킹 입고": "PICKING_IN",
  "출고 반품": "PICKING_RETURN",
};
function BasicBagLogo() {
  return (
    <svg
      className="basic-bag-logo"
      viewBox="0 0 32 32"
      role="img"
      aria-label="MIYANSOL 기본백"
    >
      <path d="M4.5 12.5h23l-1.7 15H6.2l-1.7-15Z" />
      <path d="M10 13V8.8C10 5.6 12.5 3 15.6 3h.8C19.5 3 22 5.6 22 8.8V13" />
      <path d="M8.5 18.5h15M8 23h16" />
    </svg>
  );
}
export default function App() {
  const { user, logout } = useAuth();
  const [page, setPage] = useState("대시보드");
  const [items, setItems] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const load = () =>
    fetch("/api/inventory")
      .then((r) => r.json())
      .then(setItems);
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="app">
      <aside className={open ? "open" : ""}>
        <div className="brand">
          <BasicBagLogo /> MIYANSOL
        </div>
        <nav>
          {pages.map(([n, I]) => (
            <button
              className={page === n ? "active" : ""}
              onClick={() => {
                setPage(n);
                setOpen(false);
              }}
              key={n}
            >
              <I size={18} />
              {n}
            </button>
          ))}
        </nav>
        <div className="user">
          <b>{user.name}</b>
          <small>{user.email}</small>
          <button
            className="sidebar-account"
            onClick={() => {
              setPage("계정 설정");
              setOpen(false);
            }}
          >
            계정 설정
          </button>
          <button className="sidebar-logout" onClick={() => void logout()}>
            로그아웃
          </button>
        </div>
      </aside>
      <main>
        <header>
          <button className="mobile" onClick={() => setOpen(!open)}>
            <Menu />
          </button>
          <div>
            <h1>{page}</h1>
            <p>
              {page === "바코드 출력"
                ? "공급처별 바코드를 인쇄 대기목록에 모아 한 번에 출력하세요."
                : page === "패킹 출고"
                  ? "여러 거래처 주문서를 읽어 상품별 수량을 합산하고 출고하세요."
                  : page === "패킹 입고"
                    ? "공장재고를 패킹재고로 이동합니다. 공장 차감은 자동 처리됩니다."
                    : page === "계정 설정"
                      ? "로그인 아이디와 비밀번호를 안전하게 변경하세요."
                      : "공장과 패킹 재고를 정확하게 관리하세요."}
            </p>
          </div>
          <span className="date">오늘의 재고 현황</span>
        </header>
        <section>
          {page === "대시보드" ? (
            <Dashboard items={items} reload={load} onNavigate={setPage} />
          ) : page === "패킹 출고" ? (
            <PackingOrders products={items} reloadInventory={load} />
          ) : page === "거래처 관리" ? (
            <VendorManagement />
          ) : page === "계정 설정" ? (
            <AccountPage />
          ) : actionTypes[page] ? (
            <Movement
              title={page}
              type={actionTypes[page]}
              items={items}
              reload={load}
            />
          ) : page === "상품관리" ? (
            <Products items={items} reload={load} />
          ) : page === "바코드 출력" ? (
            <LabelOutput />
          ) : page === "챗봇" ? (
            <ChatPanel />
          ) : page === "출고이력" ? (
            <HistoryPage />
          ) : page === "재고조회" ? (
            <InventoryCalendar />
          ) : (
            <Inventory items={items} />
          )}
        </section>
      </main>
      <button className="chat" onClick={() => setPage("챗봇")}>
        <MessageCircle /> 재고 도우미
      </button>
    </div>
  );
}
function printInventory(orientation: "portrait" | "landscape") {
  const root = document.documentElement;
  const style = document.createElement("style");
  style.id = "inventory-page-orientation";
  const pageSize = orientation === "portrait" ? "210mm 297mm" : "297mm 210mm";
  style.textContent = `@media print{@page{size:${pageSize};margin:${orientation === "portrait" ? "3mm" : "7mm"}}}`;
  document.getElementById(style.id)?.remove();
  document.head.appendChild(style);
  root.classList.remove("print-portrait", "print-landscape");
  root.classList.add(`print-${orientation}`);
  const cleanup = () => {
    root.classList.remove("print-portrait", "print-landscape");
    style.remove();
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 1000);
}
function Dashboard({
  items,
  reload,
  onNavigate,
}: {
  items: Product[];
  reload: () => void;
  onNavigate: (page: string) => void;
}) {
  return (
    <>
      <OutboundRanking />
      <DashboardOperations reloadInventory={reload} onNavigate={onNavigate} />
      <div className="dashboard-actions">
        <div>
          <h2>MIYANSOL 품목별 전체재고</h2>
          <p>
            전체재고 = 공장재고 + 패킹재고 · 품목을 누르면 사진과 상세 재고가
            표시됩니다.
          </p>
        </div>
        <div className="inventory-print-buttons">
          <button
            className="primary print-list"
            onClick={() => printInventory("portrait")}
          >
            A4 세로 출력
          </button>
          <button
            className="queue-clear print-list"
            onClick={() => printInventory("landscape")}
          >
            A4 가로 출력
          </button>
        </div>
      </div>
      <CatalogDashboard items={items} />
    </>
  );
}
function CatalogDashboard({ items }: { items: Product[] }) {
  return <InventoryDashboard items={items} />;
}
function Inventory({ items }: { items: Product[] }) {
  return (
    <div className="table">
      <table>
        <thead>
          <tr>
            <th>사진</th>
            <th>상품코드</th>
            <th>상품명</th>
            <th>색상</th>
            <th>공장</th>
            <th>패킹</th>
            <th>전체</th>
          </tr>
        </thead>
        <tbody>
          {items.map((x) => (
            <tr key={x.id}>
              <td>
                {x.image_path ? (
                  <img
                    className="product-thumb"
                    src={x.image_path}
                    alt={x.name}
                  />
                ) : (
                  <span className="no-image">-</span>
                )}
              </td>
              <td>{x.sku}</td>
              <td>
                <b>{x.name}</b>
                {x.catalog_name && (
                  <small className="match-name">품목표: {x.catalog_name}</small>
                )}
              </td>
              <td>{x.color || "-"}</td>
              <td>{x.factoryStock}</td>
              <td>{x.pickingStock}</td>
              <td>
                <b>{x.totalStock}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Movement({
  title,
  type,
  items,
  reload,
}: {
  title: string;
  type: string;
  items: Product[];
  reload: () => void;
}) {
  const [productId, setProduct] = useState(0);
  const [quantity, setQty] = useState(1);
  const [msg, setMsg] = useState("");
  const [major, setMajor] = useState("");
  const [sub, setSub] = useState("");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [salesVendors, setSalesVendors] = useState<Array<{name:string}>>([]);
  const [vendorName, setVendorName] = useState("");
  useEffect(()=>{if(type==="PICKING_RETURN")fetch("/api/vendors?type=SALES").then(response=>response.json()).then(setSalesVendors)},[type]);
  const majors = useMemo(
    () =>
      majorOrder.filter((category) =>
        items.some((item) => majorCategory(item) === category),
      ),
    [items],
  );
  const subs = useMemo(
    () =>
      [
        ...new Set(
          items
            .filter((item) => !major || majorCategory(item) === major)
            .map(subCategory),
        ),
      ].sort((a, b) => a.localeCompare(b, "ko-KR", { numeric: true })),
    [items, major],
  );
  const results = useMemo(() => {
    const keyword = appliedQuery.trim().toLowerCase();
    return items
      .filter(
        (item) =>
          (!major || majorCategory(item) === major) &&
          (!sub || subCategory(item) === sub) &&
          (!keyword ||
            `${item.name} ${item.catalog_name || ""} ${item.sku} ${item.barcode || ""} ${item.color || ""}`
              .toLowerCase()
              .includes(keyword)),
      )
      .slice(0, 100);
  }, [items, major, sub, appliedQuery]);
  const selected = items.find((item) => item.id === productId);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) {
      setMsg("검색 결과에서 상품을 먼저 선택해 주세요.");
      return;
    }
    if(type==="PICKING_RETURN"&&!vendorName){setMsg("반품이 들어온 거래처를 선택해 주세요.");return}
    const r = await fetch("/api/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, quantity, type, vendorName, memo: type==="PICKING_RETURN"?"출고 반품 입고":"화면 입력" }),
    });
    const d = await r.json();
    setMsg(r.ok ? `${title} 처리가 완료되었습니다.` : d.message);
    if (r.ok) reload();
  };
  return (
    <div className="movement-page">
      <div className="panel movement-search">
        <h2>{title} 상품 찾기</h2>
        <p>
          대분류와 상품분류를 선택하거나 상품명·코드·바코드를 한 번에
          검색하세요.
        </p>
        <div className="search-sheet">
          <div className="search-row">
            <strong>상품 분류</strong>
            <select
              value={major}
              onChange={(e) => {
                setMajor(e.target.value);
                setSub("");
              }}
            >
              <option value="">전체 대분류</option>
              {majors.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select value={sub} onChange={(e) => setSub(e.target.value)}>
              <option value="">전체 상품분류</option>
              {subs.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
          <div className="search-row">
            <strong>통합검색</strong>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setAppliedQuery(query);
                }
              }}
              placeholder="상품명, 상품코드, 바코드"
            />
            <button
              type="button"
              className="primary search-button"
              onClick={() => setAppliedQuery(query)}
            >
              <Search size={18} /> 검색
            </button>
          </div>
        </div>
        <div className="movement-results">
          <div className="result-count">검색 결과 {results.length}개</div>
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>이미지</th>
                  <th>대분류</th>
                  <th>상품분류</th>
                  <th>상품명</th>
                  <th>상품코드</th>
                  <th>공장</th>
                  <th>패킹</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item) => (
                  <tr
                    key={item.id}
                    className={productId === item.id ? "selected" : ""}
                    onClick={() => {
                      setProduct(item.id);
                      setMsg("");
                    }}
                  >
                    <td>
                      {item.image_path ? (
                        <img
                          className="search-thumb"
                          src={item.image_path}
                          alt=""
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{majorCategory(item)}</td>
                    <td>{subCategory(item)}</td>
                    <td>{item.name}</td>
                    <td>{item.sku}</td>
                    <td>{item.factoryStock}</td>
                    <td>{item.pickingStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="panel movement-confirm">
        <h2>선택 상품 확인</h2>
        {selected ? (
          <div className="selected-product">
            <div>
              {selected.image_path && (
                <img src={selected.image_path} alt={selected.name} />
              )}
              <span>
                <b>{selected.name}</b>
                <small>
                  {majorCategory(selected)} / {subCategory(selected)} · 공장{" "}
                  {selected.factoryStock} · 패킹 {selected.pickingStock}
                </small>
              </span>
            </div>
            <form onSubmit={submit}>
              {type==="PICKING_RETURN"&&<label>반품 거래처<select value={vendorName} onChange={event=>setVendorName(event.target.value)} required><option value="">거래처 선택</option>{salesVendors.map(vendor=><option value={vendor.name} key={vendor.name}>{vendor.name}</option>)}</select></label>}
              <label>
                수량
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQty(Number(e.target.value))}
                />
              </label>
              <button className="primary">{title} 확정</button>
            </form>
          </div>
        ) : (
          <p className="select-guide">
            위 검색 결과에서 처리할 상품을 눌러주세요.
          </p>
        )}
        {msg && <div className="notice">{msg}</div>}
      </div>
    </div>
  );
}
function Products({ items, reload }: { items: Product[]; reload: () => void }) {
  const [f, setF] = useState({ sku: "", name: "", color: "" });
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    if (r.ok) {
      setF({ sku: "", name: "", color: "" });
      reload();
    }
  };
  return (
    <>
      <FactoryOrderForm products={items} />
      <div className="panel form">
        <h2>상품 등록</h2>
        <form onSubmit={add}>
          <label>
            상품코드
            <input
              required
              value={f.sku}
              onChange={(e) => setF({ ...f, sku: e.target.value })}
            />
          </label>
          <label>
            상품명
            <input
              required
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </label>
          <label>
            색상
            <input
              value={f.color}
              onChange={(e) => setF({ ...f, color: e.target.value })}
            />
          </label>
          <button className="primary">등록</button>
        </form>
      </div>
      <div className="panel">
        <h2>상품 목록</h2>
        <Inventory items={items} />
      </div>
    </>
  );
}
type HistoryRow={id:number;sku:string;name:string;color:string;type:string;quantity:number;worker_id:number|null;worker_name:string|null;vendor_name:string;memo:string;created_at:string};
const historyTypeLabels:Record<string,string>={FACTORY_IN:"창고 입고",FACTORY_OUT:"공장 출고",PICKING_IN:"패킹 입고",PICKING_OUT:"패킹 출고",PICKING_RETURN:"출고 반품"};
function HistoryPage() {
  const today=new Date();
  const localKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  const [rows,setRows]=useState<HistoryRow[]>([]);
  const [date,setDate]=useState(localKey(today));
  const [type,setType]=useState("");
  const [worker,setWorker]=useState("");
  const [vendor,setVendor]=useState("");
  const [sort,setSort]=useState("latest");
  useEffect(()=>{fetch("/api/movements?limit=5000").then(response=>response.json()).then(setRows)},[]);
  const workers=useMemo(()=>{const values=new Map<string,string>();for(const row of rows)values.set(String(row.worker_id||"admin"),row.worker_name||"관리자");return [...values].sort((a,b)=>a[1].localeCompare(b[1],"ko-KR"))},[rows]);
  const vendors=useMemo(()=>[...new Set(rows.map(row=>row.vendor_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ko-KR")),[rows]);
  const filtered=useMemo(()=>rows.filter(row=>(!date||row.created_at.slice(0,10)===date)&&(!type||row.type===type)&&(!worker||String(row.worker_id||"admin")===worker)&&(!vendor||row.vendor_name===vendor)).sort((a,b)=>sort==="quantity-desc"?b.quantity-a.quantity:sort==="quantity-asc"?a.quantity-b.quantity:sort==="oldest"?a.id-b.id:b.id-a.id),[rows,date,type,worker,vendor,sort]);
  const shiftDate=(amount:number)=>{const next=new Date(`${date||localKey(today)}T12:00:00`);next.setDate(next.getDate()+amount);setDate(localKey(next))};
  const total=filtered.reduce((sum,row)=>sum+row.quantity,0);
  return <div className="history-page">
    <div className="panel history-filter-panel"><div className="history-filter-heading"><div><h2>출고이력 조회</h2><p>날짜·작업·작업자를 골라 필요한 기록만 모아보세요.</p></div><div className="history-total"><span>{filtered.length}건</span><strong>총 {total.toLocaleString()}개</strong></div></div><div className="history-filters">
      <label><span>일자</span><div className="history-date"><button onClick={()=>shiftDate(-1)}>‹</button><input type="date" value={date} onChange={event=>setDate(event.target.value)}/><button onClick={()=>shiftDate(1)}>›</button></div></label>
      <label><span>작업 종류</span><select value={type} onChange={event=>setType(event.target.value)}><option value="">전체 작업</option>{Object.entries(historyTypeLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <label><span>작업자</span><select value={worker} onChange={event=>setWorker(event.target.value)}><option value="">전체 작업자</option>{workers.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <label><span>출고·반품 거래처</span><select value={vendor} onChange={event=>setVendor(event.target.value)}><option value="">전체 거래처</option>{vendors.map(value=><option value={value} key={value}>{value}</option>)}</select></label>
      <label><span>정렬</span><select value={sort} onChange={event=>setSort(event.target.value)}><option value="latest">최근 작업순</option><option value="oldest">오래된 작업순</option><option value="quantity-desc">수량 많은순</option><option value="quantity-asc">수량 적은순</option></select></label>
    </div><div className="history-quick"><button onClick={()=>setDate(localKey(today))}>오늘</button><button onClick={()=>setDate("")}>전체 기간</button><button onClick={()=>{setType("");setWorker("");setVendor("");setSort("latest")}}>선택 초기화</button></div></div>
    <div className="panel history-list"><div className="table"><table><thead><tr><th>시간</th><th>거래처</th><th>상품코드</th><th>상품명</th><th>작업</th><th>수량</th><th>작업자</th><th>메모</th></tr></thead><tbody>{filtered.map(row=><tr key={row.id}><td>{row.created_at}</td><td><b>{row.vendor_name||"-"}</b></td><td>{row.sku}</td><td><b>{row.name}</b>{row.color&&<small>{row.color}</small>}</td><td><span className={`history-type ${row.type.toLowerCase()}`}>{historyTypeLabels[row.type]||row.type}</span></td><td className="history-quantity">{row.quantity.toLocaleString()}</td><td>{row.worker_name||"관리자"}</td><td>{row.memo||"-"}</td></tr>)}</tbody></table>{!filtered.length&&<div className="history-empty">선택한 조건에 해당하는 출고이력이 없습니다.</div>}</div></div>
  </div>;
}

type VendorRow = {
  id: number;
  name: string;
  memo: string;
  factory_address: string;
  delivery_address: string;
  created_at: string;
};
function AccountPage() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    const response = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, currentPassword, newPassword }),
    });
    const data = await response.json();
    setMessage(response.ok ? "계정 정보를 변경했습니다." : data.message);
    if (response.ok) {
      updateUser(data.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };
  return (
    <div className="panel account-panel">
      <h2>로그인 정보 수정</h2>
      <p>
        로그인 이메일이나 이름을 변경할 수 있습니다. 비밀번호를 바꾸지 않으려면
        새 비밀번호 칸은 비워두세요.
      </p>
      <form className="account-form" onSubmit={submit}>
        <label>
          관리자 이름
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            required
          />
        </label>
        <label>
          로그인 이메일
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          현재 비밀번호
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </label>
        <div className="account-passwords">
          <label>
            새 비밀번호
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={newPassword ? 8 : undefined}
              placeholder="변경할 때만 입력"
            />
          </label>
          <label>
            새 비밀번호 확인
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="새 비밀번호 다시 입력"
            />
          </label>
        </div>
        <button className="primary">계정 정보 저장</button>
      </form>
      {message && <div className="notice">{message}</div>}
    </div>
  );
}
function VendorsPage() {
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");
  const [factoryAddress, setFactoryAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [message, setMessage] = useState("");
  const load = () =>
    fetch("/api/vendors")
      .then((r) => r.json())
      .then(setRows);
  useEffect(() => {
    void load();
  }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch("/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, memo, factoryAddress, deliveryAddress }),
    });
    const data = await response.json();
    setMessage(response.ok ? "거래처를 등록했습니다." : data.message);
    if (response.ok) {
      setName("");
      setMemo("");
      setFactoryAddress("");
      setDeliveryAddress("");
      await load();
    }
  };
  const remove = async (row: VendorRow) => {
    if (!window.confirm(`${row.name} 거래처를 목록에서 삭제할까요?`)) return;
    const response = await fetch(`/api/vendors/${row.id}`, {
      method: "DELETE",
    });
    setMessage(
      response.ok ? "거래처를 삭제했습니다." : "거래처 삭제에 실패했습니다.",
    );
    if (response.ok) await load();
  };
  return (
    <div className="vendor-page">
      <div className="panel">
        <h2>거래처 등록</h2>
        <p>발주 거래처의 공장 주소와 실제 납품 주소를 나누어 등록하세요.</p>
        <form className="vendor-form" onSubmit={submit}>
          <label>
            거래처명
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: 생산 공장 A"
              required
            />
          </label>
          <label>
            공장 주소
            <input
              value={factoryAddress}
              onChange={(event) => setFactoryAddress(event.target.value)}
              placeholder="상품을 생산하는 공장 주소"
            />
          </label>
          <label>
            납품 주소
            <input
              value={deliveryAddress}
              onChange={(event) => setDeliveryAddress(event.target.value)}
              placeholder="완성품을 받을 회사 또는 창고 주소"
            />
          </label>
          <label>
            메모
            <input
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="담당자, 연락처 등"
            />
          </label>
          <button className="primary">거래처 등록</button>
        </form>
        {message && <div className="notice">{message}</div>}
      </div>
      <div className="panel">
        <h2>등록 거래처</h2>
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>거래처명</th>
                <th>공장 주소</th>
                <th>납품 주소</th>
                <th>메모</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <b>{row.name}</b>
                  </td>
                  <td>{row.factory_address || "-"}</td>
                  <td>{row.delivery_address || "-"}</td>
                  <td>{row.memo || "-"}</td>
                  <td>
                    <button
                      className="queue-remove"
                      onClick={() => void remove(row)}
                      title="삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
function ChatPanel() {
  const [messages, setMessages] = useState<
    Array<{ role: "user" | "bot"; text: string }>
  >([
    {
      role: "bot",
      text: "재고와 출고 대기 주문을 물어보세요. 예: 오늘 주문 합계 알려줘",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const message = input.trim();
    if (!message || busy) return;
    setMessages((current) => [...current, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await response.json();
      setMessages((current) => [
        ...current,
        { role: "bot", text: data.answer || data.message },
      ]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel chatbot-panel">
      <h2>MIYANSOL 재고 도우미</h2>
      <div className="chat-messages">
        {messages.map((message, index) => (
          <div className={`chat-message ${message.role}`} key={index}>
            {message.text}
          </div>
        ))}
      </div>
      <div className="chat-input">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="예: 오늘 주문 합계 알려줘"
        />
        <button className="primary" onClick={() => void send()} disabled={busy}>
          {busy ? "확인 중" : "전송"}
        </button>
      </div>
    </div>
  );
}
