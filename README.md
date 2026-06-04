# todolist

Google 계정 로그인과 Firebase Firestore 저장을 사용하는 웹 To Do List입니다.

## 기능

- Google 계정 로그인/로그아웃
- 사용자 계정별 할 일 목록 저장 및 불러오기
- 여러 작업 목록 만들기 및 전환
- 할 일 추가, 수정, 삭제
- 설명, 마감일, 반복 설정
- 완료/미완료 변경
- 하위 작업 추가, 삭제, 완료 변경
- 완료율과 마감 상태 시각화

## Firebase 설정

1. Firebase Console에서 프로젝트를 만듭니다.
2. Authentication에서 Google 로그인 제공업체를 활성화합니다.
3. Firestore Database를 생성합니다.
4. 프로젝트 설정에서 Web App을 등록하고 Firebase config 값을 복사합니다.
5. [app.js](app.js)의 `firebaseConfig` 값을 실제 프로젝트 값으로 교체합니다.

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

## Firestore 보안 규칙

사용자 본인의 데이터만 읽고 쓸 수 있게 다음 규칙을 설정합니다.
같은 내용이 [firestore.rules](firestore.rules)에 들어 있습니다.

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 실행 방법

브라우저 보안 정책과 Google OAuth 동작을 위해 파일을 직접 여는 것보다 로컬 서버로 실행하는 방식을 권장합니다.

```bash
python3 -m http.server 8000
```

그 다음 브라우저에서 엽니다.

```text
http://localhost:8000
```

Firebase Authentication의 Authorized domains에 `localhost`가 포함되어 있어야 합니다.

## 저장 구조

Firestore에는 로그인 사용자별로 다음 문서에 저장합니다.

```text
users/{uid}/todoData/main
```

문서 데이터는 앱의 `state` 구조를 유지합니다.

```json
{
  "currentListName": "기본",
  "lists": [],
  "updatedAt": "serverTimestamp"
}
```
