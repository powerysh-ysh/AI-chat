# AI 창업 스튜디오

지역문제 해결 아이디어를 사업 한 장과 3분 발표문으로 만드는 팀 워크숍 웹앱입니다.

## 운영 구조

- Next.js + Vercel
- Firebase Firestore
- Firebase Admin SDK (서버에서만 사용)
- OpenAI Responses API (선택)

## Vercel 환경변수

`.env.example`을 참고해 다음 값을 Vercel 프로젝트 설정에 등록합니다.

- `FIREBASE_SERVICE_ACCOUNT_KEY`
- `ADMIN_PIN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

서비스 계정 JSON과 API 키는 GitHub에 올리지 않습니다.
