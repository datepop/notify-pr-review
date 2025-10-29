# PR Review Slack Notifier

GitHub Pull Request 생성 및 코멘트를 Slack 채널에 자동으로 알림을 보내는 GitHub Action입니다. 같은 PR의 모든 알림은 스레드로 관리됩니다.

## ✨ 주요 기능

- 👀 **코드 리뷰 요청 알림**: PR이 생성되면 Slack으로 즉시 알림
- 💬 **코멘트 알림**: PR 코멘트, 리뷰, 승인/변경요청시 멘션된 사람에게 알림
- 🧵 **스레드 관리**: 같은 PR의 모든 알림이 하나의 스레드로 묶여서 관리
- 📧 **이메일 기반 매핑**: GitHub 아이디를 이메일로 매핑하여 Slack 멘션
- 🔄 **자동 매칭**: GitHub 계정 이메일과 Slack 이메일이 동일하면 자동 매핑
- 👥 **기본 리뷰어 설정**: Reviewer가 없어도 지정된 기본 리뷰어에게 알림
- 🎨 **깔끔한 메시지**: Slack Block Kit으로 디자인된 가독성 높은 메시지

## 📋 요구사항

- GitHub Actions 사용 가능한 레포지토리
- Slack 워크스페이스 및 Bot Token
- Node.js 21 (GitHub Actions 런타임)

## 🚀 빠른 시작

### 1. Slack Bot 설정

#### 1-1. Slack App 생성

1. [Slack API Dashboard](https://api.slack.com/apps)에 접속
2. **"Create New App"** → **"From scratch"** 선택
3. App 이름 입력 (예: `PR Review Notifier`)
4. 워크스페이스 선택 후 생성

#### 1-2. Bot Token Scopes 추가

**OAuth & Permissions** 메뉴에서 다음 권한 추가:

| Scope | 용도 |
|-------|------|
| `chat:write` | Slack 채널에 메시지 전송 |
| `users:read` | 사용자 정보 조회 |
| `users:read.email` | 이메일로 사용자 검색 (매핑용) |

#### 1-3. 워크스페이스에 설치

1. **"Install to Workspace"** 클릭
2. **Bot User OAuth Token** 복사 (형식: `xoxb-...`)
   - ⚠️ 이 토큰은 절대 공개하지 마세요!

#### 1-4. 채널에 Bot 초대

```
/invite @PR Review Notifier
```

### 2. GitHub Secrets 설정

레포지토리 Settings → Secrets and variables → Actions:

```
Name: SLACK_BOT_TOKEN
Value: xoxb-your-token-here
```

### 3. 사용자 매핑 설정

`src/user-mappings.js` 파일에서 GitHub 사용자명과 이메일을 매핑:

```javascript
module.exports = {
  'octocat': 'octocat@company.com',
  'jaewon': 'jaewon@company.com',
};
```

### 4. 설정 파일 생성 (선택사항)

`.github/pr-notify-config.yml` 파일 생성:

```yaml
# 기본 리뷰어 (Reviewer 미지정시 알림)
default_reviewers:
  - lead-dev@company.com
  - tech-lead@company.com

# 자동 이메일 매칭 활성화
auto_match_by_email: true
```

### 5. GitHub Actions 워크플로우 추가

`.github/workflows/pr-notify.yml` 파일 생성:

```yaml
name: PR Review Notification

on:
  pull_request:
    types: [opened, ready_for_review]
  issue_comment:
    types: [created]
  pull_request_review:
    types: [submitted]
  pull_request_review_comment:
    types: [created]

jobs:
  notify-slack:
    runs-on: ubuntu-latest
    if: |
      (github.event_name == 'pull_request') ||
      (github.event_name == 'issue_comment' && github.event.issue.pull_request) ||
      (github.event_name == 'pull_request_review') ||
      (github.event_name == 'pull_request_review_comment')
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Notify Slack
        uses: datepop/notify-pr-review@v1
        with:
          slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
          slack_channel: '#pr-reviews'
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

## 📖 사용 방법

### Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `slack_bot_token` | ✅ | - | Slack Bot User OAuth Token |
| `slack_channel` | ✅ | - | 알림을 받을 Slack 채널 (예: `#pr-reviews`) |
| `github_token` | ❌ | `${{ github.token }}` | GitHub API 토큰 |
| `config_path` | ❌ | `.github/pr-notify-config.yml` | 설정 파일 경로 |

### 사용자 매핑 설정

`src/user-mappings.js` 파일에서 GitHub 사용자명을 이메일로 매핑:

```javascript
module.exports = {
  'github-username': 'email@company.com',
};
```

### 설정 파일 옵션

`.github/pr-notify-config.yml` 파일 (선택사항):

```yaml
# default_reviewers: Reviewer 미지정시 알림받을 이메일 리스트
default_reviewers:
  - reviewer1@company.com
  - reviewer2@company.com

# auto_match_by_email: GitHub 이메일로 자동 매칭 시도 (기본: true)
auto_match_by_email: true
```

## 💬 Slack 메시지 구성

### PR 생성 알림

- **헤더**: 👀 코드 리뷰 요청
- **PR 제목 및 브랜치**: 클릭 가능한 링크
- **작성자**: Slack 멘션으로 표시
- **리뷰어**: 멘션된 리뷰어 목록
- **변경사항**: 추가/삭제된 라인 수 및 파일 개수
- **상태**: 리뷰 대기중 / 초안(Draft)
- **PR 요약**: PR 본문의 첫 3줄
- **액션 버튼**: PR 보기, 변경사항 보기

### 코멘트 알림 (스레드 답장)

- **일반 코멘트**: 💬 멘션된 사람에게만 알림
- **코드 라인 코멘트**: 📝 멘션된 사람에게만 알림
- **승인**: ✅ PR 작성자에게 무조건 알림 (+ 멘션된 사람)
- **변경 요청**: 🔴 PR 작성자에게 무조건 알림 (+ 멘션된 사람)
- **리뷰 코멘트**: 💬 멘션된 사람에게만 알림

모든 코멘트 알림은 원본 PR 메시지의 스레드로 전송됩니다.

## 🔧 고급 설정

### Organization Secrets 사용

여러 레포지토리에서 동일한 Slack Bot을 사용하려면:

1. Organization Settings → Secrets and variables → Actions
2. `SLACK_BOT_TOKEN` Secret 생성
3. 레포지토리 접근 권한 설정

### 특정 브랜치만 알림

```yaml
on:
  pull_request:
    types: [opened, ready_for_review]
    branches:
      - main
      - develop
```

### Draft PR은 제외

```yaml
jobs:
  notify-slack:
    if: ${{ !github.event.pull_request.draft }}
    runs-on: ubuntu-latest
    # ...
```

## 🐛 문제 해결

### 알림이 오지 않음

1. **Bot이 채널에 초대되었는지 확인**
   ```
   /invite @YourBotName
   ```

2. **Slack Bot Token 확인**
   - `xoxb-`로 시작하는지 확인
   - GitHub Secrets에 올바르게 등록되었는지 확인

3. **Action 로그 확인**
   - Actions 탭에서 워크플로우 실행 로그 확인

### 멘션이 안됨

1. **Bot Scopes 확인**
   - `users:read.email` 권한이 있는지 확인
   - 권한 추가 후 앱 재설치 필요

2. **이메일 매핑 확인**
   - `src/user-mappings.js` 파일의 이메일이 정확한지 확인
   - Slack 프로필에 이메일이 설정되어 있는지 확인

3. **자동 매칭 디버깅**
   - Action 로그에서 "Auto-matched" 메시지 확인
   - GitHub 프로필 이메일이 공개되어 있는지 확인

### Permission 에러

```
Error: Resource not accessible by integration
```

**해결**: `github_token`에 적절한 권한 부여:

```yaml
jobs:
  notify-slack:
    permissions:
      pull-requests: read
    # ...
```

## 📁 프로젝트 구조

```
notify-pr-review/
├── action.yml              # Action 정의
├── index.js               # 메인 진입점
├── package.json           # 의존성
└── src/
    ├── config.js         # 설정 파일 로더
    ├── mapper.js         # GitHub ↔ Slack 매핑
    ├── github.js         # PR 데이터 파싱
    ├── slack.js          # Slack API & Block Kit
    └── user-mappings.js  # GitHub username → 이메일 매핑
```

## 🤝 기여

이슈와 PR을 환영합니다!

## 📄 라이센스

MIT License

## 💡 다음 기능 (Coming Soon)

- [ ] PR 업데이트시 메시지 업데이트 (새 메시지 대신)
- [ ] 커스터마이징 가능한 메시지 템플릿
- [ ] 멀티 채널 지원
- [ ] 특정 라벨이 붙은 PR만 알림

## 📞 문의

문제가 있거나 질문이 있다면 이슈를 열어주세요!

---

Made with ❤️ by [tenfingers](https://github.com/tenfingers)
