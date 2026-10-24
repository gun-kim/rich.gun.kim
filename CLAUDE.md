# CLAUDE.md

pnpm 워크스페이스 모노레포. 구조와 실행 방법의 상세는 `README.md` 참고.

- `apps/web` — Vite + React 19 프론트엔드
- `apps/api` — NestJS 12 백엔드 (CommonJS)
- `packages/constants` — 공유 상수 (포트 등)
- `packages/schemas` — 공유 Zod 스키마 + 요청/응답 타입

## 명령

| 명령 | 용도 |
| --- | --- |
| `pnpm check` | lint → typecheck 전체. 작업을 마치기 전에 반드시 실행 |
| `pnpm lint` | oxlint |
| `pnpm typecheck` | 공유 패키지 빌드 후 모든 워크스페이스 `tsc --noEmit` |
| `pnpm test` | 테스트 (현재는 api 의 외부 연동 서비스만). 실제 외부 API 를 호출한다 |
| `pnpm --filter @rich/api typecheck` | 워크스페이스 하나만 실행 (`@rich/web`, `@rich/schemas` 등) |

## 규칙

- **pnpm 10.11.0만 사용한다.** npm / yarn 은 `only-allow` 와 `engine-strict` 로 막혀 있다.
  Node 는 `>=22.22.3` 이 필요하다 (클라우드 세션에서는 SessionStart 훅이 설치한다).
- 내부 패키지는 `"@rich/<name>": "workspace:*"` 로 참조한다.
- 앱은 `packages/*` 의 `dist/` 를 import 한다. `packages/*` 를 수정한 뒤 앱에서 타입 오류가 나면
  먼저 `pnpm build:packages` 를 실행한다.
- `packages/*` 는 ESM(`nodenext`) 이다. 상대 import 에 `.js` 확장자를 붙인다 (`./health.js`).
- web ↔ api 사이의 요청/응답 형태는 `packages/schemas` 에 Zod 스키마로 정의하고,
  타입은 `z.infer` 로 만든다. 앱에서 같은 타입을 따로 선언하지 않는다.
- 공유 상수(포트 등)는 `packages/constants` 에 둔다.
- 테스트는 외부 연동 서비스(`apps/api/src/external-connection/*-connection.service.ts`)에만 두고,
  같은 폴더에 `*.spec.ts` 로 둔다 (vitest). 실제 API 를 호출하며, 키의 허용 IP 가 등록된 osaka
  셀프호스티드 러너에서 PR 마다 돌린다 (`.github/workflows/api-external-connection-test.yml`).
  로컬에서는 키가 없으면 건너뛴다.
- 코드 주석과 문서는 한국어로 작성한다.
- `.env*` 파일은 읽거나 커밋하지 않는다.

## 커밋

제목은 Conventional Commits 형식으로 쓰고, 워크스페이스를 scope 로 쓴다.

```
feat(api): add GET /users endpoint
fix(web): handle non-JSON health response
refactor(schemas): split health schema into its own module
chore(repo): bump oxlint to 1.90
```

- type: `feat` · `fix` · `refactor` · `test` · `docs` · `chore` · `build` · `ci`
- scope: `web` · `api` · `constants` · `schemas` · `repo` (루트, 하네스, 설정)
- 제목은 영어 명령형, 72자 이내, 끝에 마침표를 찍지 않는다.
- 본문은 한국어로 쓴다. "무엇을"보다 "왜"를 쓰고, 바뀐 점이 여러 개면 `-` 불릿으로 나눈다.
- `Co-Authored-By` 등 트레일러는 본문 맨 끝에 둔다.
- 커밋 하나는 하나의 논리적 변경이고, 커밋마다 `pnpm check` 가 통과해야 한다.
- `pnpm-lock.yaml` 은 `pnpm install` 로만 바꾸고, 그 원인이 된 `package.json` 변경과 같은 커밋에 넣는다.

## PR

- main 에는 squash 머지만 한다. PR 제목이 곧 main 의 커밋 제목이므로, PR 제목도 위 Conventional
  형식을 따른다 (예: `feat(api): add users endpoint`).
- PR 설명은 한국어로 쓰고, `.github/pull_request_template.md` 를 따른다. squash 커밋 본문이 PR 설명이 되므로
  PR 안의 개별 커밋이 아니라 PR 전체의 변경 이유를 쓴다.
- 이슈 하나에 PR 하나를 만들고, 본문에 `Closes #N` 을 쓴다.
- 변경은 lockfile 을 빼고 대략 400줄 이내가 목표다. 넘으면 나눈다.
- `packages/schemas` 를 바꾸면 그 스키마를 쓰는 web 과 api 쪽 수정도 같은 PR 에 넣는다.
  main 이 깨지는 중간 상태를 만들지 않기 위해서다.
- 브랜치 이름은 `<type>/<이슈번호>-<짧은-설명>` 이다 (예: `feat/12-users-endpoint`).
  Claude 세션 브랜치(`claude/...`)는 예외다.
- 리뷰 지적은 새 커밋으로 반영하고 force-push 하지 않는다. 리뷰어가 이전 리뷰 이후 바뀐 부분만
  볼 수 있게 하기 위해서다.
- main 이 앞서 나가면 rebase 대신 merge 로 따라간다.

## 하네스

`.claude/settings.json`

- SessionStart 훅 (`.claude/hooks/session-start.sh`, 클라우드 세션에서만 실행): Node 설치,
  `pnpm install`, `pnpm build:packages`
- PostToolUse 훅 (`.claude/hooks/lint-edited-file.sh`): Edit/Write 한 JS/TS 파일에 oxlint 를
  `--deny-warnings` 로 실행한다. 경고가 보고되면 바로 고친다.
