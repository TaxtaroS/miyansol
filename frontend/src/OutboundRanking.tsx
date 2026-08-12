import {useCallback,useEffect,useState} from 'react';
import {ListOrdered,X} from 'lucide-react';
import './OutboundRanking.css';
import './FullRanking.css';

type Period='today'|'7days'|'30days'|'all';
type RankingRow={id:number;sku:string;name:string;color:string;image_path:string|null;outbound_quantity:number;outbound_count:number;packing_stock:number};
const periods:Array<[Period,string]>=[['today','오늘'],['7days','7일'],['30days','30일'],['all','전체']];

export default function OutboundRanking(){
  const [period,setPeriod]=useState<Period>('30days');
  const [rows,setRows]=useState<RankingRow[]>([]);
  const [updatedAt,setUpdatedAt]=useState('');
  const [fullRows,setFullRows]=useState<RankingRow[]|null>(null);
  const load=useCallback(()=>fetch(`/api/dashboard/outbound-ranking?period=${period}`).then(response=>response.json()).then(data=>{setRows(data);setUpdatedAt(new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}))}),[period]);
  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),15000);return()=>window.clearInterval(timer)},[load]);
  const maximum=rows[0]?.outbound_quantity||1;
  const openFull=()=>fetch(`/api/dashboard/outbound-ranking?period=${period}&limit=1000`).then(response=>response.json()).then(setFullRows);
  return <section className="outbound-ranking panel"><div className="ranking-heading"><div><div className="ranking-title-row"><h2>출고 랭킹 TOP 10</h2><button onClick={()=>void openFull()}><ListOrdered size={16}/> 전체 순위 리스트</button></div><p>패킹 출고 완료 수량 기준 · 15초마다 자동 갱신</p></div><div className="ranking-controls">{periods.map(([value,label])=><button className={period===value?'active':''} onClick={()=>setPeriod(value)} key={value}>{label}</button>)}</div></div>{rows.length?<div className="ranking-list">{rows.map((row,index)=><article className={`ranking-item rank-${index+1}`} key={row.id}><span className="ranking-number">{index+1}</span>{row.image_path?<img src={row.image_path} alt=""/>:<span className="ranking-no-image">-</span>}<div className="ranking-product"><b>{row.name}{row.color?` ${row.color}`:''}</b><small>{row.sku} · 출고 {row.outbound_count.toLocaleString()}회 · 패킹재고 {row.packing_stock.toLocaleString()}개</small><span><i style={{width:`${Math.max(4,row.outbound_quantity/maximum*100)}%`}}/></span></div><strong className="ranking-quantity">{row.outbound_quantity.toLocaleString()}<small>개</small></strong></article>)}</div>:<div className="ranking-empty">선택한 기간에 완료된 패킹 출고가 없습니다.</div>}<div className="ranking-updated">최근 갱신 {updatedAt||'-'}</div>{fullRows&&<div className="ranking-modal-backdrop" onMouseDown={()=>setFullRows(null)}><div className="ranking-modal" onMouseDown={event=>event.stopPropagation()}><div className="ranking-modal-head"><div><h2>전체 출고 순위</h2><p>{periods.find(([value])=>value===period)?.[1]} 기준 · 총 {fullRows.length}개 상품</p></div><button onClick={()=>setFullRows(null)}><X/></button></div><div className="table ranking-full-table"><table><thead><tr><th>순위</th><th>상품코드</th><th>상품명</th><th>출고 횟수</th><th>출고 수량</th><th>패킹재고</th></tr></thead><tbody>{fullRows.map((row,index)=><tr key={row.id}><td><b>{index+1}</b></td><td>{row.sku}</td><td>{row.name}{row.color?` ${row.color}`:''}</td><td>{row.outbound_count.toLocaleString()}회</td><td><strong>{row.outbound_quantity.toLocaleString()}개</strong></td><td>{row.packing_stock.toLocaleString()}개</td></tr>)}</tbody></table></div></div></div>}</section>;
}
