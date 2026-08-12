"""PaddleOCR 좌표 결과를 MIYANSOL 주문 행으로 변환합니다."""
import contextlib, json, os, re, sys
os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("FLAGS_enable_onednn", "0")
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

def center_y(box): return (float(box[1]) + float(box[3])) / 2
def clean(text): return re.sub(r"\s+", " ", str(text or "")).strip(" |[]")
def quantity(text):
    value=clean(text).replace(",", "")
    if not re.fullmatch(r"\d{1,5}", value): return 0
    number=int(value); return number if 0 < number <= 100000 else 0

def rows_from_result(payload):
    texts=payload.get("rec_texts") or []; boxes=payload.get("rec_boxes") or []; scores=payload.get("rec_scores") or []
    if not boxes: return []
    tokens=[{"text":clean(text),"box":box,"score":float(scores[i] if i < len(scores) else 0)} for i,(text,box) in enumerate(zip(texts,boxes)) if clean(text)]
    rows=[]; seen=set(); right_edge=max(box[2] for box in boxes)
    for token in tokens:
        x1=token["box"][0]; qty=quantity(token["text"])
        if qty <= 0 or x1 < 0.78 * right_edge: continue
        y=center_y(token["box"])
        same=sorted([item for item in tokens if item is not token and abs(center_y(item["box"])-y)<=4.5 and item["box"][0]<x1-3],key=lambda item:item["box"][0])
        source=clean(" ".join(item["text"] for item in same if item["score"]>=0.52))
        if not source or not re.search(r"(?:MIYANSOL|MS[A-Z0-9-]{3,}|BG[-A-Z0-9]{4,}|MI[-A-Z0-9]{4,}|\d{10,14})",source,re.I): continue
        key=re.sub(r"\W+","",source).lower()
        if key in seen: continue
        seen.add(key); rows.append({"name":source,"quantity":qty,"confidence":round(token["score"],4)})
    return rows

def main():
    if len(sys.argv)!=2: raise SystemExit("image path required")
    with contextlib.redirect_stdout(sys.stderr):
        from paddleocr import PaddleOCR
        ocr=PaddleOCR(lang="korean",use_doc_orientation_classify=False,use_doc_unwarping=False,use_textline_orientation=False,enable_mkldnn=False)
        results=ocr.predict(sys.argv[1])
    rows=[]; raw=[]
    for result in results:
        payload=result.json.get("res",result.json); raw.extend(payload.get("rec_texts") or []); rows.extend(rows_from_result(payload))
    print(json.dumps({"rows":rows,"raw":"\n".join(raw),"engine":"paddleocr"},ensure_ascii=False))
if __name__=="__main__": main()
