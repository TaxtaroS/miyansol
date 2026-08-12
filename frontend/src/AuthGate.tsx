import { createContext, FormEvent, ReactNode, useContext, useEffect, useState } from 'react';
import { LockKeyhole } from 'lucide-react';

type User={userId:number;email:string;name:string;role:'ADMIN'|'STAFF'|'VIEWER'};
const AuthContext=createContext<{user:User;logout:()=>Promise<void>;updateUser:(user:User)=>void}|null>(null);
export function useAuth(){const value=useContext(AuthContext);if(!value)throw new Error('로그인 정보가 없습니다.');return value}

export default function AuthGate({children}:{children:ReactNode}){
  const [user,setUser]=useState<User|null>(null);
  const [setupRequired,setSetupRequired]=useState(false);
  const [loading,setLoading]=useState(true);
  const [email,setEmail]=useState('');
  const [name,setName]=useState('관리자');
  const [password,setPassword]=useState('');
  const [message,setMessage]=useState('');

  useEffect(()=>{fetch('/api/auth/status').then(async response=>{const data=await response.json();setUser(data.user||null);setSetupRequired(Boolean(data.setupRequired))}).catch(()=>setMessage('서버에 연결할 수 없습니다.')).finally(()=>setLoading(false))},[]);
  const submit=async(event:FormEvent)=>{event.preventDefault();setMessage('');const response=await fetch(setupRequired?'/api/auth/setup':'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(setupRequired?{email,name,password}:{email,password})});const data=await response.json();if(response.ok)setUser(data.user);else setMessage(data.message||'로그인 처리에 실패했습니다.')};
  const logout=async()=>{await fetch('/api/auth/logout',{method:'POST'});setUser(null);setPassword('')};

  if(loading)return <div className="auth-screen"><div className="auth-card">MIYANSOL을 불러오는 중입니다.</div></div>;
  if(!user)return <div className="auth-screen"><form className="auth-card" onSubmit={submit}><div className="auth-logo"><LockKeyhole size={28}/></div><h1>MIYANSOL</h1><p>{setupRequired?'처음 사용할 관리자 계정을 만들어 주세요.':'재고관리 시스템에 로그인하세요.'}</p>{setupRequired&&<label>관리자 이름<input value={name} onChange={event=>setName(event.target.value)} required minLength={2}/></label>}<label>이메일<input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="name@example.com" required/></label><label>비밀번호<input type="password" value={password} onChange={event=>setPassword(event.target.value)} minLength={8} required/></label><button className="primary">{setupRequired?'관리자 계정 만들기':'로그인'}</button>{message&&<div className="notice">{message}</div>}</form></div>;
  return <AuthContext.Provider value={{user,logout,updateUser:setUser}}><div className="authenticated-app">{children}</div></AuthContext.Provider>;
}
