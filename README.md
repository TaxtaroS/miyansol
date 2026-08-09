# Stockmate 재고관리

공장 재고와 피킹 재고를 분리해 관리하는 셀메이트형 재고관리 기본 프로젝트입니다.

## 실행

```powershell
pnpm install
pnpm --dir client install
pnpm --dir server install
pnpm dev
```

- 웹: http://localhost:5173
- API: http://localhost:4000/api

SQLite 데이터베이스는 최초 실행 시 `server/data/inventory.db`에 생성되며 예시 상품도 함께 등록됩니다.
