# ChatGPT에 붙여넣을 지시문 — 전기신문 Office 업무 패널 ‘웹 AI’ 재구현

아래 ``` 안의 내용을 그대로 붙여넣으세요. 저장소에 접근할 수 있으면 실제 코드를 읽고, 접근할 수 없으면 지시문 안의 규칙과 코드만으로 다시 만들 수 있게 썼습니다.

```text
전기신문 Office(Electron 43.7.6 / Chromium 150 기반 Windows 앱)의 업무 패널에
‘웹 AI’ 기능을 구현하거나, 이미 구현된 것을 이어서 수정한다.
ChatGPT·Claude·Gemini 공식 웹사이트를 패널 안에 띄우고, 사용자가 본인 계정
(무료 계정 포함)으로 로그인해 쓰게 하는 기능이다. 문서와는 사용자가 직접
복사·붙여넣기로만 주고받는다. 기존 문서 AI(구독/API 키 방식)는 건드리지 않는다.

[참고 구현 — 저장소에 접근할 수 있으면 먼저 읽어라]
- 저장소: https://github.com/Her-far/reporter-office-updates
- 브랜치: claude/patch-kg1cyt 최신 커밋 (c661756 웹 AI, 249a4d7·07b89f8 테스트 설치판, 그 뒤 별도 로그인 창)
- 새 파일: electimes-113/workpanel/src/ai-web.cjs (서비스·주소 규칙·UA·권한·Edge 실행)
- 수정: electimes-113/workpanel/src/main.cjs (1.0.10 기반), host-preload.cjs, panel.js,
  policy.cjs, panel.css (1.0.9 기반)
- 빌드: electimes-113/build.cjs (1.0.12 정식 ASAR와 대조 후 교체)
- 테스트: electimes-113/workpanel/tests/ (ai-web.test.cjs, ai-web-app.test.cjs, ai-web-live.cjs, harness.cjs)
- 설치판: electimes-113/package-test.py, smoke-test.ps1, .github/workflows/electimes-113-test.yml
- 시험 결과(1.0.13-test.2, 실제 Windows·실제 계정): Claude는 로그인 성공 — 사이트가 Google 로그인을
  별도 창(window.open 팝업)으로 열었다. ChatGPT와 Gemini는 로그인 화면이 패널 안에 떠서 실패했다.
  → test.3부터 계정 로그인 페이지는 패널 안에서 열지 않고 별도 로그인 창으로 연다(아래 3번).

[이전 시도가 실패한 핵심 원인과 해결 — 반드시 지켜라]
1) 앱 전역 이동 차단 장치
   out/main/index.js의 installNavigationGuard가 모든 webContents에 대해
   "현재 주소와 다른 곳으로 가는 will-navigate는 차단 + window.open은 deny"를 건다.
   예외는 require('./work-panel/main.cjs').isMailContents(contents)가 true인 경우뿐이다.
   → 웹 AI 화면과 그 로그인 팝업의 webContents를 이 집합(mailContents WeakSet)에
     넣지 않으면 로그인 리다이렉트가 전부 막힌다. index.js는 수정하지 말고,
     work-panel/main.cjs 안에서 집합에 추가한 뒤 웹 AI 전용의 더 엄격한
     will-navigate/window.open 정책을 직접 건다.
2) Electron 사용자 에이전트
   기본 UA에는 "electimes-office/x.y.z"와 "Electron/43.7.6"이 들어 있다.
   Google 로그인은 이 UA에 축소판(WebLiteSignIn) 흐름을 주고, 내장 브라우저를
   차단할 수 있다. 서비스 세션마다 Chrome과 같은 축소 UA를 설정한다:
     Mozilla/5.0 (<원래 UA의 플랫폼 괄호 부분>) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/<크롬 주버전>.0.0.0 Safari/537.36
   크롬 주버전은 process.versions.chrome에서 가져온다.
   session.setUserAgent(ua, 'ko-KR,ko,en-US,en')와 webContents.setUserAgent(ua)를 둘 다 적용.
   확인 결과: 이 UA로 Google은 일반 흐름(GlifWebSignIn)을 주고 차단 문구가 없었다.
3) 로그인은 같은 격리 세션의 "별도 로그인 창"에서
   - 로그인 쿠키가 그 서비스 세션에 남아야 하므로 외부 브라우저로 보내면 안 된다
     (그러면 로그인은 외부에만 남고 패널은 계속 로그아웃 상태).
   - 그러나 좁은 패널 뷰(WebContentsView) 안에서 계정 로그인 페이지를 열면 ChatGPT·Gemini
     로그인이 끝나지 않았다. Claude처럼 별도 창에서 하면 성공했다. 이 앱의 네이버웍스 메일도
     원래 같은 이유로 "공식 로그인 창(BrowserWindow, 메일 세션 공유)"을 따로 띄운다.
   - 따라서 패널 뷰에서 계정 로그인 페이지로 가는 will-navigate·will-redirect는 막고,
     openAiLogin(id, url)로 별도 창을 연다:
       new BrowserWindow({parent:메인창, title:'<서비스> 로그인', width:1000, height:760,
         minWidth:520, minHeight:600, autoHideMenuBar:true,
         webPreferences:{session:그 서비스 세션, nodeIntegration:false, nodeIntegrationInWorker:false,
           contextIsolation:true, sandbox:true, webSecurity:true, allowRunningInsecureContent:false}})
     창 제목이 페이지 제목으로 바뀌지 않게 page-title-updated를 preventDefault.
     서비스당 창 하나만 쓰고, 이미 있으면 앞으로 가져와 그 주소를 연다.
     did-navigate / did-navigate-in-page에서 signedIn(id,url)이면 창을 닫고,
     닫힌 뒤 패널 뷰를 도착한 주소(없으면 첫 주소)로 다시 연다.
   - 계정 로그인 페이지(isSignIn): AUTH_HOSTS(Cloudflare 제외) + auth.openai.com, auth0.openai.com,
     그리고 chatgpt.com의 /auth/login 경로.
   - 로그인 완료(signedIn): 서비스 대표 호스트(chatgpt.com / claude.ai / gemini.google.com)이고
     경로가 /auth, /login, /api/auth, /magic-link, /sso 로 시작하지 않을 때.
   - 서비스별 로그인 시작 주소: chatgpt https://chatgpt.com/auth/login,
     claude https://claude.ai/login,
     gemini https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fgemini.google.com%2Fapp&hl=ko
   - 로그인 창 안에서는 가로채지 않고 일반 규칙(서비스·로그인 도메인 허용)만 적용한다.
   - 사이트가 스스로 여는 팝업(window.open, Claude의 Google 로그인 등)은 그대로 같은 세션의
     BrowserWindow로 허용한다. 이 방식이 실제로 성공했다.
   - claude.ai/login 은 계정 로그인 페이지로 보지 않는다(로그아웃 상태에서 첫 화면이 이리로
     가므로, 패널을 열 때마다 창이 뜨게 된다). Claude는 이미 성공한 방식 그대로 둔다.

[허용 규칙]
- 서비스별 첫 주소와 도메인
  chatgpt: https://chatgpt.com/  — chatgpt.com, openai.com, oaistatic.com, oaiusercontent.com
  claude:  https://claude.ai/new — claude.ai, claude.com, anthropic.com, claudeusercontent.com
  gemini:  https://gemini.google.com/app — gemini.google.com
- 로그인용 도메인(AUTH_HOSTS)
  accounts.google.com, accounts.google.co.kr, accounts.youtube.com, consent.google.com,
  consent.youtube.com, appleid.apple.com, login.live.com, account.live.com,
  login.microsoftonline.com, challenges.cloudflare.com
- 도메인 일치는 host === d 또는 host.endsWith('.' + d). (chatgpt.com.evil.example,
  evilchatgpt.com은 불일치)
- https만 허용. 사용자 정보(user:pw@)가 있는 주소는 거부.
- will-navigate: 위 서비스·로그인 도메인 또는 about:blank면 패널 안에서 허용.
  그 밖의 https 주소는 막고 shell.openExternal(기본 브라우저)로 넘긴다. file:, javascript: 등은
  아무 데도 넘기지 않는다. about:blank 팝업이 외부로 가려 하면 그 팝업을 닫는다.
- will-redirect: https면 허용(Google의 SetSID 등 도메인 간 쿠키 이동 때문).
- setWindowOpenHandler: about:blank 또는 서비스/로그인 도메인이면
  {action:'allow', overrideBrowserWindowOptions:{width:520,height:720, webPreferences:{session:같은세션,
   nodeIntegration:false, nodeIntegrationInWorker:false, contextIsolation:true, sandbox:true,
   webSecurity:true, allowRunningInsecureContent:false, preload:undefined}}}
  그 밖은 deny + 기본 브라우저(답변의 출처 링크).
  did-create-window로 생긴 팝업에도 같은 정책을 재귀 적용하고 mailContents에 넣는다.
- will-attach-webview는 막는다.

[격리와 권한]
- 서비스마다 WebContentsView 하나, 세션은 session.fromPartition('persist:electimes-workpanel-ai-<id>').
  메일 세션(persist:electimes-workpanel-mail)과도, 서로와도 분리한다. 처음 쓸 때 만든다.
- webPreferences: nodeIntegration:false, nodeIntegrationInWorker:false, contextIsolation:true,
  sandbox:true, webSecurity:true, allowRunningInsecureContent:false, backgroundThrottling:true,
  spellcheck:false, preload 없음.
- 권한: 'clipboard-sanitized-write'(사이트의 복사 단추)와 'fullscreen'만 허용.
  setPermissionRequestHandler와 setPermissionCheckHandler 둘 다 설정. 마이크·위치·알림 등 거부.
- 다운로드는 패널의 기존 download 처리(다운로드 폴더, Zone.Identifier)를 쓰되,
  허용 대상에 웹 AI webContents를 추가한다.
- 금지: 사이트에 스크립트 주입·DOM 읽기·자동 입력, 브라우저 쿠키 가져오기,
  sandbox·contextIsolation·webSecurity 해제. (서비스 약관과 회사 보안 원칙)

[패널 배치]
- 업무 패널 메뉴에 'aiweb' 추가: 툴바 순서 AI, 웹 AI, 메일, 캘린더, 메모.
  host-preload(편집기 preload에 인라인됨)에서 탭을 만들고, aiWebEnabled=false면 탭을 숨긴다.
- 원격 화면 자리는 메일 웹 화면과 같은 방식: 패널 HTML의 slot 사각형을
  wp:mail-layout으로 보고하고, main에서 패널 확대 배율을 곱해 setBounds.
  웹 AI 메뉴일 때 현재 서비스 뷰만 보이게 하고 나머지는 setVisible(false)+음소거.
  패널 대화상자(mailModal)가 열리면 숨긴다. AI 메뉴로 가면 모두 숨긴다.
- 패널 툴바의 ⋯ 메뉴를 열면 툴바 높이를 키워(min-height 252px) 웹 화면이
  메뉴를 가리지 않게 한다(원격 뷰는 HTML 위에 겹치는 네이티브 뷰다).
- 페이지 로딩 이벤트마다 패널을 다시 그리면 열린 메뉴와 입력 중인 링크가 사라진다.
  서비스·켜짐·오류·안내확인·배율·확대 상태가 바뀔 때만 다시 그리고,
  나머지는 뒤로 단추 활성화만 갱신한다.
- Esc로 확대 복귀(watchEscape)에 웹 AI webContents도 포함.
- 창 닫힘·앱 종료 시 웹 AI 뷰와 팝업을 닫는다.

[패널 기능]
- 서비스 탭(ChatGPT/Claude/Gemini), 뒤로, 새로고침, 넓게/분할.
- ⋯ 메뉴: 로그인 창 열기(현재 서비스의 로그인 시작 주소), 처음 화면, Edge 창으로 열기, 기본 브라우저에서 열기,
  "이메일로 받은 로그인 링크 붙여넣기"(그 링크가 속한 서비스로 전환해 패널 안에서 연다;
  세 서비스 도메인 외에는 'ai-link' 오류), 화면 배율, "<서비스> 로그아웃".
- 로그아웃: 확인 후 그 서비스 세션만 clearStorageData/clearCache/closeAllConnections,
  그 세션의 팝업을 닫고 뷰를 다시 만든다.
- Edge 창으로 열기(대비책): Windows에서 %ProgramFiles(x86)%, %ProgramFiles%, %LOCALAPPDATA% 아래
  Microsoft\Edge\Application\msedge.exe, 없으면 Google\Chrome\Application\chrome.exe를 찾아
  spawn(exe, ['--app=<고정된 서비스 첫 주소>', '--window-size=W,H', '--window-position=X,Y'],
  {detached:true, stdio:'ignore'}).unref(). 위치·크기는 패널 화면 좌표(최소 420×560).
  인자로 넘기는 주소는 세 서비스의 고정 첫 주소만 허용한다. 실패하면 기본 브라우저.
  사용자의 평소 브라우저 프로필과 로그인을 그대로 쓰므로 로그인이 막히지 않는다.
- 처음 한 번 안내: "엠바고·미공개 원고, 취재원과 개인정보는 입력하지 마세요.
  무료 계정의 대화는 서비스 회사의 AI 학습에 쓰일 수 있습니다." [확인] → aiWebNoticeSeen.
- 오류: ai-network(주 프레임 로드 실패, 코드 -3 제외), ai-crashed(render-process-gone) + 다시 시도.
- 설정(policy.cjs settingsOf): aiWebEnabled(기본 true), aiWebService(chatgpt|claude|gemini, 기본 chatgpt),
  aiWebZoom(0.65~1.5), aiWebNoticeSeen. MENUS와 기본 표시 메뉴에 'aiweb'. 1.0.12에서 저장한 설정은 그대로 읽혀야 한다.

[빌드 원칙]
- 정식 1.0.12 설치본(SHA-256 8060e3e6e89bf33aed3d3a99fa00d1ea8e85cba22d42c3bc6693b47a38604431,
  app.asar 07a6eaff72dd557c59e18ed67efda7ed96003474ed41b9b883db0aa94ff9b6e8) 위의 overlay로 만든다.
- 교체할 work-panel 파일은 먼저 1.0.12 ASAR 안의 파일과 같은지 대조한 뒤 교체한다
  (main.cjs=1.0.10 소스, panel.js=1.0.9 소스+버전 문자열, policy.cjs·panel.css=1.0.9 소스).
  ai-web.cjs는 새 항목으로 추가한다.
- host-preload는 out/preload/index.js와 resources/modules/*/preload/index.js 9개에 인라인되어 있다.
  각 파일에서 1.0.10 host 원문이 정확히 한 번 나오는지 확인하고 교체한다.
- 나머지 resources 파일은 1.0.12와 바이트 단위로 같아야 한다.

[검증]
- 단위: 주소 분류(허용/차단/유사 도메인/http/file/javascript/계정정보), 리다이렉트,
  로그인 링크의 서비스 판별, UA에 Electron·앱 이름 없음, 권한 허용 목록, Edge 인자(고정 주소만), 설정.
- 앱 실제 실행: 빌드한 stage를 stock Electron 43.7.6 + Playwright _electron으로 띄운다
  (app.isPackaged=true, process.resourcesPath=stage/resources, 새 appData의 "Electimes Office" 프로필에
  app-settings.json {language:'ko', onboardingSeen:true, aiPanelSide:'right'}).
  세 서비스 세션에 protocol.handle('https')로 가짜 페이지를 넣고, shell.openExternal과
  dialog.showMessageBox를 가로채서: 격리 설정, UA, 패널 안 위치, 복사 단추→클립보드,
  로그인 페이지가 패널이 아닌 별도 창(같은 세션·격리)으로 열림, 서비스당 창 하나,
  로그인 완료 시 창이 닫히고 패널이 그 주소로 바뀜, 메뉴의 로그인 창 열기, 같은 세션 팝업, 외부 링크·출처 링크는 기본 브라우저,
  file: 차단, 뒤로, 서비스 전환 시 상태 유지, 세션 분리, 로그인 링크, 로그아웃 범위,
  메뉴 겹침 없음, AI 탭에서 숨김, 끄기/켜기를 확인한다(32항목).
  Linux에서는 네이티브 팝업 창 때문에 headless 대신 xvfb-run을 쓴다.
- 함정: WebContentsView의 webContents도 getType()이 'window'이고 BrowserWindow.fromWebContents가
  부모 창을 돌려준다. 서비스 뷰는 모든 창의 contentView.children에서 session으로 찾고,
  메인 창은 getParentWindow()가 없는 창으로 고른다(로그인 창이 열리면 getAllWindows()[0]이 바뀐다).
  로그인 완료로 창이 닫히면 진행 중이던 loadURL이 ERR_FAILED로 끝나는 것은 정상이다.
  Electron 43은 npm install 때 바이너리를 받지 않으므로 node node_modules/electron/install.js를 실행한다.
- Windows 설치판: NSIS 전체 설치판만(시험판 표시 1.0.13-test.N, build 113), 정식 1.0.12 위에 설치 →
  설치 파일 전체 해시 대조 → 등록 버전 → 설치된 앱 실행 → 정식 1.0.12로 되돌리기.
  정식 피드(electimes-latest.json)와 정식 릴리스는 바꾸지 않고 workflow artifact로만 올린다.

[완료 보고]
변경 내용, 수정 파일, 실행한 테스트와 결과, 확인하지 못한 항목(실제 계정 로그인 등),
브랜치/커밋, 설치판의 버전·크기·SHA-256을 적는다.
```
