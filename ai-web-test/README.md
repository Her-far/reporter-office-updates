# 전기신문 Office 구독 대화 테스트판 2

정식판 1.0.12를 기반으로 AI 탭에 **문서 도우미 / 구독 대화**를 추가한 독립 테스트판입니다. 기존 웹뷰 로그인 방식은 제거했습니다.

| 서비스 | 연결 방식 | 계정·비용 |
|---|---|---|
| ChatGPT | 공식 Sign in with ChatGPT → 로컬 채팅 화면 | 지원되는 ChatGPT 구독/크레딧 한도. 별도 API 키로 자동 전환하지 않음 |
| Claude | 수정하지 않은 공식 Claude Code를 패널의 ConPTY에서 실행 | Claude Code를 포함하는 본인 구독으로 공식 화면에서 로그인 |
| Gemini | 수정하지 않은 Google Antigravity CLI를 패널의 ConPTY에서 실행 | 지원되는 개인 Google 계정으로 공식 화면에서 로그인 |

이 대화들은 각 웹사이트의 이전 대화 목록과 동기화되지 않습니다. Claude·Gemini는 일반 웹 채팅 대신 공식 프로그램의 대화 화면을 그대로 사용합니다. API 계정/결제를 직접 선택하면 해당 요금이 적용될 수 있습니다.

## 사용

1. 기존 AI 웹 테스트판을 종료하고 이 테스트판을 설치합니다.
2. AI → 구독 대화 → 서비스를 선택합니다.
3. ChatGPT는 Continue with ChatGPT를 누르고 브라우저에서 동의합니다. 패널로 돌아오면 모델과 질문 입력칸이 활성화됩니다.
4. Claude·Gemini는 공식 프로그램 설치(처음 한 번) → 시작을 누릅니다. 이미 기본 경로에 설치돼 있으면 재사용합니다. 패널 안 공식 화면에서 화살표/Enter로 초기 설정과 구독 계정 로그인을 선택합니다. 로그인은 외부 브라우저에서 완료한 후 같은 공식 프로그램으로 복귀합니다.
5. 긴 질문은 아래 입력칸에서 작성 → 입력칸에 넣기 → Enter로 전송할 수 있습니다. 답변을 복사한 뒤 상단 문서에 붙여넣기를 사용합니다.

공식 프로그램은 자체적으로 파일 작업 기능이 있으므로 사용자 확인을 포함한 원래 권한 화면을 유지합니다. Office는 문서를 자동 전달하지 않고 별도의 빈 작업 폴더에서 시작합니다. Office가 CLI의 인증 정보나 쿠키를 읽거나 다른 서버로 중계하지 않습니다.

## 설치와 격리

- Compact 설치판은 정식판 **1.0.12**의 공통 파일을 검증한 후 별도 폴더로 복사합니다. 정식판이 없거나 파일 검사에 실패하면 Full 설치판을 사용합니다.
- 설치 폴더/프로필/자동 업데이트는 정식판과 분리됩니다. 기존 AI 웹 테스트판 프로필을 재사용합니다.
- Claude·Gemini 공식 실행 파일은 선택한 서비스를 처음 설치할 때 별도로 내려받습니다. 체크섬과 Windows 게시자 서명을 확인한 뒤 실행합니다. 이 파일은 Office 매회 업데이트에 포함하지 않습니다.
- ChatGPT 계정/대화는 Windows 보안 저장소로 암호화해 보관합니다. CLI 계정/대화는 각 공식 프로그램이 관리합니다. 다른 곳에서 사용 중인 공식 CLI 로그인과 공유될 수 있습니다.

## 검증

`node --test plan.test.cjs`: 실제 로컬 콜백 서버, PKCE, 서명된 ID 토큰, 잘못된 state/nonce/서명 거부, 계정 재인증, 토큰 갱신/폐기, SSE 중단, 계정별 대화 분리.

Windows Actions: Electron/Windows DPAPI/ConPTY를 사용한 합성 OAuth 왕복과 응답 표시, 공식 프로그램 다운로드·서명 확인·초기 화면 실행, 실제 ConPTY 입력, 확대 복귀, HWP 붙여넣기, 앱 재시작 후 계정/대화 복원, 설치/재설치/제거 격리 검증.

실제 개인 계정의 로그인과 유료/구독 답변은 자동 검증에 포함하지 않습니다. Google/Anthropic/OpenAI가 계정별로 허용하는 플랜과 지역/조직 정책에 따라 달라집니다. `ui-windows.json`의 `liveAccountLoginVerified`는 이를 구분합니다.

공식 근거: [OpenAI](https://developers.openai.com/siwc/token-sharing-open-source) · [Claude Code 호스팅](https://code.claude.com/docs/en/legal-and-compliance) · [Google Antigravity](https://antigravity.google/docs/install)
