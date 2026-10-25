# rich.gun.kim

pnpm 워크스페이스 기반 모노레포입니다.

## 요구 사항

- Node.js 22.22.3 이상 (`.nvmrc`, NestJS 12 요구 사항)
- pnpm **10.11.0** (`packageManager` 필드로 고정)

```sh
corepack enable   # 또는 pnpm 10 이상이 설치되어 있으면 자동으로 10.11.0으로 전환됩니다
pnpm install
```

npm / yarn 으로 설치하거나 다른 pnpm 버전을 쓰면 설치가 거부되거나 10.11.0으로 전환됩니다.

## 구조

```
apps/
  web/          # 프론트엔드 웹 앱 (Vite + React)
  api/          # 백엔드 API 서버 (NestJS)
packages/
  constants/    # 앱 간 공유 상수
  schemas/      # 앱 간 공유 스키마 (Zod 검증 스키마 + 요청/응답 타입)
tsconfig.base.json  # 모든 워크스페이스가 extends 하는 공유 tsconfig
```

워크스페이스 내부 패키지는 `"@rich/schemas": "workspace:*"` 처럼 `workspace:` 프로토콜로 참조합니다.
공유 패키지(`packages/*`)는 `tsc`로 `dist/`에 ESM으로 빌드되며, 앱은 빌드 결과물을 import 합니다.

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `pnpm build` | 모든 워크스페이스 빌드 (의존 순서대로) |
| `pnpm dev` | 공유 패키지를 먼저 빌드한 뒤 모든 워크스페이스 dev 서버/watch 실행 |
| `pnpm lint` | 모든 워크스페이스 lint (oxlint) |
| `pnpm typecheck` | 공유 패키지를 먼저 빌드한 뒤 모든 워크스페이스 타입 검사 (`tsc --noEmit`) |
| `pnpm check` | lint → typecheck 를 순서대로 실행 |
| `pnpm test` | 공유 패키지를 먼저 빌드한 뒤 테스트 실행 (vitest). 실제 외부 API 를 호출한다 |

web과 api는 별도 출처(도메인)로 동작합니다.

- web은 `VITE_API_URL`(기본값 `http://localhost:3000`)로 API를 호출합니다.
- api는 `CORS_ORIGIN`(기본값 `http://localhost:5173`)에서 오는 요청을 허용합니다.

## 환경 변수 (api)

| 변수 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `MONGODB_URI` | 필수 | - | MongoDB 접속 URI. DB 이름을 경로에 넣는다 (예: `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/rich?retryWrites=true&w=majority`). 없으면 앱이 시작되지 않는다 |
| `CODEF_ENVIRONMENT` | | `development` | CODEF 환경. `sandbox` · `development` · `production` |
| `CODEF_CLIENT_ID` | CODEF 사용 시 | - | CODEF 키 관리 화면의 clientId |
| `CODEF_CLIENT_SECRET` | CODEF 사용 시 | - | CODEF 키 관리 화면의 clientSecret |
| `CODEF_PUBLIC_KEY` | CODEF 사용 시 | - | CODEF 키 관리 화면의 publicKey. 비밀번호 RSA 암호화에 쓴다 |
| `PORT` | | `3000` | api 서버 포트 |
| `CORS_ORIGIN` | | `http://localhost:5173` | 요청을 허용할 web 출처 |

CODEF 키는 앱 시작 때가 아니라 CODEF 를 호출할 때 검사한다. 업비트 API Key 는 사용자마다 달라 DB 에 저장하므로 환경 변수가 없다.
CODEF 설정의 상세는 `docs/codef/README.md` 를 참고한다.

## 테스트 (api)

`apps/api/src/external-connection` 의 CODEF·업비트 연동 서비스는 실제 API 를 호출해 테스트한다.
PR 에서는 키의 허용 IP 를 등록해 둔 `osaka` 라벨 셀프호스티드 러너에서 돌고
(`.github/workflows/api-external-connection-test.yml`), 아래 값은 저장소 Secrets 로 넣는다.
로컬에서는 값이 없으면 해당 테스트를 건너뛰고, CI(`CI` 가 설정된 환경)에서는 실패한다.

| 변수 | 설명 |
| --- | --- |
| `CODEF_CLIENT_ID` · `CODEF_CLIENT_SECRET` · `CODEF_PUBLIC_KEY` | 앱과 같은 CODEF 키. `CODEF_ENVIRONMENT` 는 저장소 Variables 로 넣고, 없으면 `development` |
| `CODEF_CONNECTED_ID_FOR_TEST` | 조회할 커넥티드 아이디. 등록된 기관별로 은행·증권·카드 조회를 한 번씩 한다 |
| `UPBIT_ACCESS_KEY_FOR_TEST` · `UPBIT_SECRET_KEY_FOR_TEST` | [자산조회] 권한이 있는 업비트 API Key |
