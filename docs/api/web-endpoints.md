# 웹 로그인 세션 API 확인 기록

인증·보안 규칙은 [기술 설계](../features/web-session-auth/design.md)가 소유한다.
웹 경로는 비공식이며 인증 방식이 web 일 때만 쓴다. API endpoint 목록 검사는 공개 API 클라이언트만 본다.

| 영역 | 경로·쿼리·공식 응답 변환·실측 |
| --- | --- |
| 프로젝트 | [project.md](web-endpoints/project.md) |
| 멤버 | [member.md](web-endpoints/member.md) |
| 업무 | [post.md](web-endpoints/post.md) |
| 위키 | [wiki.md](web-endpoints/wiki.md) |
| 메신저 | [messenger.md](web-endpoints/messenger.md) |
| 캘린더 | [calendar.md](web-endpoints/calendar.md) |
| 스트림 | [stream.md](web-endpoints/stream.md) |

## 공통 규칙

2026-11-14 로그인된 ego 브라우저의 CDP 로 읽은 SESSION 하나를 메모리에서 Node 요청에 붙여 실측했다.
같은 날 [공식 서비스 API 문서](https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419)를 브라우저로 열어 응답 필드를 대조했다.
쿠키·실제 응답·사내 식별자는 고정 파일에 저장하지 않는다. 테스트 응답은 직접 쓴 가짜 데이터다.

- 프로젝트 id 는 URL 조각으로 인코딩한 뒤 앞에 `!` 를 붙인다.
- contents/content 를 공식 result 모양으로 바꾸고 totalCount 를 최상위에 둔다. 공식 필드 중 웹에서 얻은 값만 낸다.
- 필수 식별자·이름·목록·페이지 수의 구조가 바뀌면 오류로 끝낸다.
- 식별자는 문자열이며 날짜는 오프셋을 단 ISO 8601 로 보존하거나 변환한다. 숫자 시각은 공개 API 의 초 단위 표기에 맞춰 밀리초를 빼고 실행 PC 시간대의 오프셋으로 낸다.
- SESSION 은 허용한 테넌트 origin 에만 붙이며 API 리다이렉트를 따라가지 않는다.

지원 명령·미지원 옵션·빠지는 필드는 [설정 가이드](../guide/setup.md)가 소유한다.

영역 구현은 createXxxWeb(context: WebContext) 함수가 자기 영역 계약을 구현한 객체 리터럴을 반환한다. 클래스 인스턴스의 프로토타입 메서드는 조립 대상이 아니다. 공통 변환은 src/api/web/convert.ts, 고정 응답은 src/api/web/fixtures/<영역>/ 에 둔다.

공용 전송은 src/api/web/http.ts 의 requestBytes(input, options) 와 upload(input, formData, options) 를 쓴다. 요청 옵션의 searchParams 는 쿼리로 붙는다.
requestBytes 는 로그인 응답·오류와 307 호스트를 확인한 Response 를 반환하므로 그 뒤에 바이트를 읽고 저장한다. upload 는 같은 경계의 JSON 응답을 반환한다.
공개 API 주소는 createWebClient·WebContext 가 전달한다. 첨부 307 은 그 주소를 기준으로 같은 클라우드 https 호스트만 한 번 허용하고, 연쇄 리다이렉트는 막는다.
다운로드는 응답 헤더에 시간 제한을 걸고 업로드에는 그 제한을 걸지 않는다. 로그인 HTML 200·로그인 리다이렉트는 세션 만료로 구분하며 첨부로 반환하지 않는다.
