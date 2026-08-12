import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import "./InventoryCalendar.css";
import "./SalesReturn.css";

type Movement = {
  id: number;
  sku: string;
  name: string;
  color: string;
  type: string;
  quantity: number;
  memo: string;
  created_at: string;
};
const typeLabel: Record<string, string> = {
  FACTORY_IN: "창고 입고",
  FACTORY_OUT: "공장 출고",
  PICKING_IN: "패킹 입고",
  PICKING_OUT: "패킹 출고",
  PICKING_RETURN: "출고 반품",
};
const tracked = ["FACTORY_IN", "PICKING_IN", "PICKING_OUT", "PICKING_RETURN"];
const dateKey = (value: string) => value.slice(0, 10);

export default function InventoryCalendar() {
  const now = new Date();
  const [month, setMonth] = useState(
    () => new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const [rows, setRows] = useState<Movement[]>([]);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    fetch("/api/movements?limit=5000")
      .then((response) => response.json())
      .then(setRows);
  }, []);
  const byDate = useMemo(() => {
    const map = new Map<string, Movement[]>();
    for (const row of rows) {
      const key = dateKey(row.created_at);
      map.set(key, [...(map.get(key) || []), row]);
    }
    return map;
  }, [rows]);
  const year = month.getFullYear(),
    monthIndex = month.getMonth(),
    firstDay = new Date(year, monthIndex, 1).getDay(),
    lastDate = new Date(year, monthIndex + 1, 0).getDate(),
    previousLast = new Date(year, monthIndex, 0).getDate();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDay + 1;
    const current = day >= 1 && day <= lastDate;
    const value = current ? day : day < 1 ? previousLast + day : day - lastDate;
    const cellDate = new Date(
      year,
      monthIndex + (day < 1 ? -1 : day > lastDate ? 1 : 0),
      value,
    );
    const key = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, "0")}-${String(value).padStart(2, "0")}`;
    return { value, current, key, rows: byDate.get(key) || [] };
  });
  const selectedRows = selected ? byDate.get(selected) || [] : [];
  return (
    <div className="inventory-calendar panel">
      <div className="calendar-toolbar">
        <button onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}>
          <ChevronLeft />
        </button>
        <h2>
          {year}년 {monthIndex + 1}월
        </h2>
        <button onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}>
          <ChevronRight />
        </button>
        <button
          className="calendar-today"
          onClick={() =>
            setMonth(new Date(now.getFullYear(), now.getMonth(), 1))
          }
        >
          오늘
        </button>
      </div>
      <div className="calendar-weekdays">
        {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
          <b key={day}>{day}</b>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((cell) => {
          const totals = Object.fromEntries(
            tracked.map((type) => [
              type,
              cell.rows
                .filter((row) => row.type === type)
                .reduce((sum, row) => sum + row.quantity, 0),
            ]),
          );
          return (
            <button
              key={cell.key}
              className={`calendar-day ${cell.current ? "" : "outside"} ${cell.key === todayKey ? "today" : ""}`}
              onClick={() => cell.rows.length && setSelected(cell.key)}
            >
              <span className="day-number">{cell.value}</span>
              <span className="day-count">
                {cell.rows.length ? `${cell.rows.length}건` : ""}
              </span>
              {totals.FACTORY_IN > 0 && (
                <small className="factory-in">
                  창고 입고 <strong>{totals.FACTORY_IN}</strong>
                </small>
              )}
              {totals.PICKING_IN > 0 && (
                <small className="packing-in">
                  패킹 입고 <strong>{totals.PICKING_IN}</strong>
                </small>
              )}
              {totals.PICKING_OUT > 0 && (
                <small className="packing-out">
                  패킹 출고 <strong>{totals.PICKING_OUT}</strong>
                </small>
              )}
              {totals.PICKING_RETURN > 0 && (
                <small className="sales-return">
                  출고 반품 <strong>{totals.PICKING_RETURN}</strong>
                </small>
              )}
            </button>
          );
        })}
      </div>
      {selected && (
        <div
          className="calendar-modal-backdrop"
          onMouseDown={() => setSelected("")}
        >
          <div
            className="calendar-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="calendar-modal-head">
              <div>
                <h2>{selected} 재고 상세</h2>
                <p>총 {selectedRows.length}건</p>
              </div>
              <button onClick={() => setSelected("")}>
                <X />
              </button>
            </div>
            <div className="calendar-summary">
              {tracked.map((type) => (
                <div key={type}>
                  <span>{typeLabel[type]}</span>
                  <strong>
                    {selectedRows
                      .filter((row) => row.type === type)
                      .reduce((sum, row) => sum + row.quantity, 0)
                      .toLocaleString()}
                    개
                  </strong>
                </div>
              ))}
            </div>
            <div className="table calendar-detail">
              <table>
                <thead>
                  <tr>
                    <th>시간</th>
                    <th>상품코드</th>
                    <th>상품명</th>
                    <th>작업</th>
                    <th>수량</th>
                    <th>메모</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.created_at.slice(11, 16)}</td>
                      <td>{row.sku}</td>
                      <td>
                        {row.name}
                        {row.color ? ` ${row.color}` : ""}
                      </td>
                      <td>{typeLabel[row.type] || row.type}</td>
                      <td>
                        <b>{row.quantity.toLocaleString()}</b>
                      </td>
                      <td>{row.memo || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
