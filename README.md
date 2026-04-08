# Flipbook E-Book Demo

예시 링크처럼 페이지를 넘기는 형태의 정적 전자책 샘플입니다.

## 파일 구성

- `index.html`: 책이 진열된 라이브러리 메인 화면
- `ebook.html`: 실제 flipbook 전자책 뷰어
- `library.css`: 라이브러리 메인 화면 스타일
- `styles.css`: 전자책 뷰어 레이아웃과 flipbook 스타일
- `script.js`: 페이지 데이터와 넘김 동작

## 실행 방법

브라우저에서 `index.html`을 열면 책장이 보이고, 그 안에서 전자책을 선택하면 `ebook.html` 뷰어가 열립니다.

로컬 서버로 열고 싶다면 아래처럼 실행할 수 있습니다.

```bash
python3 -m http.server 8000
```

그 뒤 브라우저에서 `http://localhost:8000`으로 접속하면 됩니다.

## 내용 바꾸기

전자책 페이지 내용은 `script.js`의 `pageData` 배열에 들어 있습니다.

- `title`, `subtitle`: 페이지 제목과 설명
- `highlights`: 목록형 핵심 항목
- `detailsTitle`, `details`: 오른쪽 카드 영역
- `stats`: 요약 페이지 숫자 카드

페이지를 더 추가하려면 `pageData`에 객체를 계속 넣으면 됩니다.
