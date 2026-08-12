export type CategoryProduct={name:string;catalog_name?:string};

export const majorOrder=['기본백','미니백','하트백','피어백','라군 빅백','아코디언백','브릭백','메모리백','퀼팅 파우치','미니 파우치','스퀘어 파우치 A','스퀘어 파우치 B','스퀘어 3파우치','만두백','밍크백','어그백','호피백','멍미참','꽃참','플라워키','하트참','타월참','럭키참','미니참','롱참','로프참','로프 스트랩','핸드폰 스트랩','솔참','털실폼폼','기타'];

export function majorCategory(product:CategoryProduct){
  const name=product.name.replace(/\s/g,'').toLowerCase();
  if(name.includes('기본백'))return '기본백';
  if(name.includes('미니백'))return '미니백';
  if(name.includes('하트백'))return '하트백';
  if(name.includes('피어백'))return '피어백';
  if(name.includes('라군')&&name.includes('빅백'))return '라군 빅백';
  if(name.includes('아코디언백'))return '아코디언백';
  if(name.includes('브릭백'))return '브릭백';
  if(name.includes('메모리백'))return '메모리백';
  if(name.includes('미니파우치'))return '미니 파우치';
  if(name.includes('퀼팅')||name.includes('퀄팅'))return '퀼팅 파우치';
  if(name.includes('스퀘어3'))return '스퀘어 3파우치';
  if(name.includes('스퀘어')&&name.includes('a'))return '스퀘어 파우치 A';
  if(name.includes('스퀘어')&&name.includes('b'))return '스퀘어 파우치 B';
  if(name.includes('만두백'))return '만두백';
  if(name.includes('밍크백'))return '밍크백';
  if(name.includes('어그백'))return '어그백';
  if(name.includes('호피백'))return '호피백';
  if(name.includes('멍미'))return '멍미참';
  if(name.includes('플라워키')||name.includes('꽃키')||name.includes('키모양'))return '플라워키';
  if(name.includes('꽃'))return '꽃참';
  if(name.includes('하트참'))return '하트참';
  if(name.includes('타월참'))return '타월참';
  if(name.includes('럭키참'))return '럭키참';
  if(name.includes('미니구슬')||name.includes('미니참'))return '미니참';
  if(name.includes('롱구슬')||name.includes('롱참')||/^구슬\d+$/.test(name))return '롱참';
  if(name.includes('로프스트랩'))return '로프 스트랩';
  if(name.includes('h·p스트랩')||name.includes('hp스트랩')||name.includes('핸드폰스트랩'))return '핸드폰 스트랩';
  if(name.includes('솔참'))return '솔참';
  if(name.includes('털실'))return '털실폼폼';
  if(name.includes('로프참')||/^로프\d+$/.test(name))return '로프참';
  return '기타';
}

export function subCategory(product:CategoryProduct){
  const major=majorCategory(product);
  const escaped=major.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s/g,'\\s*');
  const cleaned=product.name.replace(new RegExp(escaped,'gi'),'').replace(/\s+(S|L|미니|라지)$/i,'').trim();
  return cleaned||product.catalog_name||product.name;
}
