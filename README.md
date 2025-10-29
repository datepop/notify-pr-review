# PR Review Slack Notifier

GitHub Pull Request 생성 및 코멘트를 Slack 채널에 자동으로 알림을 보내는 GitHub Action입니다. 같은 PR의 모든 알림은 스레드로 관리됩니다.

## ✨ 주요 기능

- 👀 **코드 리뷰 요청 알림**: PR이 생성되면 Slack으로 즉시 알림
- 💬 **코멘트 알림**: PR 코멘트, 리뷰, 승인/변경요청시 멘션된 사람에게 알림
- 🧵 **스레드 관리**: 같은 PR의 모든 알림이 하나의 스레드로 묶여서 관리
- 🔄 **동적 상태 업데이트**: PR 상태가 변경되면 Slack 메시지가 자동으로 업데이트
- 📧 **이메일 기반 매핑**: GitHub 아이디를 이메일로 매핑하여 Slack 멘션
- 🔄 **자동 매칭**: GitHub 계정 이메일과 Slack 이메일이 동일하면 자동 매핑
- 👥 **스마트 리뷰어 결정**: Reviewers + CODEOWNERS + Default Reviewers를 모두 합쳐서 알림
- 📁 **CODEOWNERS 지원**: 변경된 파일의 코드 소유자에게 자동 알림 (개인 + 팀)
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

레포지토리 Settings → Secrets and variables → Actions:

```
Name: USER_MAPPINGS
Value: {"octocat":"octocat@company.com","jaewon":"jaewon@company.com"}
```

**중요**: JSON 형식으로 작성 (공백 없이)

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
    types: [opened, ready_for_review, closed]
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
        uses: datepop/notify-pr-review@v1.0.3
        with:
          slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
          user_mappings: ${{ secrets.USER_MAPPINGS }}
```

## 📖 사용 방법

### Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `slack_bot_token` | ✅ | - | Slack Bot User OAuth Token |
| `slack_channel` | ❌ | `#개발-코드리뷰` | 알림을 받을 Slack 채널 |
| `github_token` | ❌ | `${{ github.token }}` | GitHub API 토큰 |
| `user_mappings` | ❌ | `{}` | GitHub username과 이메일 매핑 (JSON) |
| `config_path` | ❌ | `.github/pr-notify-config.yml` | 설정 파일 경로 |

### 사용자 매핑 설정

GitHub Secrets에 USER_MAPPINGS를 JSON 형식으로 설정:

```json
{"github-username":"email@company.com"}
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
- **상태**:
  - 🟡 리뷰 대기중 (초기 상태)
  - 🔵 리뷰 중 (첫 코멘트 후)
  - ✅ 승인됨 (Approve 후)
  - 🔴 변경 요청됨 (Request Changes 후)
  - 🎉 머지됨 (PR 머지 후)
  - ⚫ 닫힘 (PR 닫힘 후)
  - 📝 초안 (Draft PR)
- **PR 요약**: PR 본문의 첫 3줄
- **액션 버튼**: PR 보기, 변경사항 보기

**상태 자동 업데이트**: PR의 진행 상황에 따라 Slack 메시지의 상태가 자동으로 업데이트됩니다.

### 코멘트 알림 (스레드 답장)

- **일반 코멘트**: 💬 멘션된 사람에게만 알림
- **코드 라인 코멘트**: 📝 멘션된 사람에게만 알림
- **승인**: ✅ PR 작성자에게 무조건 알림 (+ 멘션된 사람)
- **변경 요청**: 🔴 PR 작성자에게 무조건 알림 (+ 멘션된 사람)
- **리뷰 코멘트**: 💬 멘션된 사람에게만 알림

모든 코멘트 알림은 원본 PR 메시지의 스레드로 전송됩니다.

## 👥 리뷰어 결정 로직

PR 알림을 받을 사람은 **모든 소스를 합쳐서** 결정됩니다:

### 알림 대상 수집

다음 세 가지 소스를 **모두 수집**합니다:

1. **PR Reviewers**
   - PR에 명시적으로 할당된 리뷰어

2. **CODEOWNERS**
   - 변경된 파일의 코드 소유자 (개인 + 팀)
   - `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS` 순서로 검색

3. **Default Reviewers**
   - `.github/pr-notify-config.yml`의 `default_reviewers`

**최종 알림**: 위 세 가지를 **모두 합쳐서** 알림 (중복 제거)

### 예시

**케이스 1**: 모든 소스가 있는 경우
- Reviewer: `@springkjw`
- CODEOWNERS: `@datepop/frontend` (멤버: Jh-jaehyuk, yeodahui)
- Default: `@ok0035`
- **결과**: `@springkjw`, `@Jh-jaehyuk`, `@yeodahui`, `@ok0035` 모두에게 알림 (4명)

**케이스 2**: CODEOWNERS만 있는 경우
- CODEOWNERS: `@yoon-yoo-sang`
- **결과**: `@yoon-yoo-sang`에게 알림

**케이스 3**: 아무도 없는 경우
- **결과**: 멘션 없이 채널에만 공지

### CODEOWNERS 예시

`.github/CODEOWNERS` 파일:
```
# 개인 사용자
*                    @ok0035 @hemg2

# JavaScript 파일
*.js                 @springkjw @Jh-jaehyuk

# 스타일 파일
*.scss               @yeodahui

# 백엔드 디렉토리
/backend/            @yoon-yoo-sang

# 팀 지정 (팀의 모든 멤버에게 알림)
*                    @datepop/frontend
/api/                @datepop/backend-team
```

**팀 지원**:
- `@organization/team-name` 형식으로 팀 지정 가능
- 팀의 모든 멤버가 자동으로 개인 알림 대상이 됨
- 개인과 팀을 혼합해서 사용 가능

**예시**:
- `Button.scss` 파일 수정 → `@yeodahui`에게 알림
- `Button.js` 파일 수정 → `@springkjw`, `@Jh-jaehyuk` + `@datepop/frontend` 팀 전체에게 알림

**팀 사용을 위한 Fine-grained PAT 설정**:

CODEOWNERS에서 팀을 사용하려면 추가 GitHub Token 설정이 필요합니다:

1. [GitHub Token 생성](https://github.com/settings/tokens?type=beta)
2. **Repository permissions**:
   - Pull requests: Read and write
   - Contents: Read-only
3. **Organization permissions**:
   - Members: Read-only
4. Organization 승인 필요:
   - `https://github.com/organizations/YOUR_ORG/settings/personal-access-tokens/active`로 이동
   - 요청 승인
5. GitHub Secrets에 `GH_PAT` 추가
6. 워크플로우에서 사용:
   ```yaml
   - name: Notify Slack
     uses: datepop/notify-pr-review@v1.4.0
     with:
       slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
       github_token: ${{ secrets.GH_PAT }}  # 팀 지원을 위해 필요
       user_mappings: ${{ secrets.USER_MAPPINGS }}
   ```

**참고**: 팀을 사용하지 않고 개인만 CODEOWNERS에 지정한다면 기본 `${{ github.token }}`으로 충분합니다.

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
    └── slack.js          # Slack API & Block Kit
```

## 🤝 기여

이슈와 PR을 환영합니다!

## 📄 라이센스

MIT License

## 💡 다음 기능 (Coming Soon)

- [ ] 커스터마이징 가능한 메시지 템플릿
- [ ] 멀티 채널 지원
- [ ] 특정 라벨이 붙은 PR만 알림

## 📞 문의

문제가 있거나 질문이 있다면 이슈를 열어주세요!

---

Made with ❤️ by [tenfingers](https://github.com/tenfingers)
