# 기자오피스 Windows 업데이트

기자오피스 설치 파일과 자동 업데이트 정보를 제공하는 배포 전용 저장소입니다.

## 업데이트하기

**0.12.5.36부터 공식 업데이트 주소가 기본으로 설정됩니다.** 설정 → 정보 → **업데이트 확인**을 누르면 됩니다. 별도 주소 입력이나 저장은 필요하지 않습니다. 직접 저장한 유효한 배포 주소는 유지합니다.

현재 공개 버전은 **0.12.5.36**입니다.

- 이미 공식 주소를 연결한 0.12.5.35: 프로그램에서 **업데이트 확인 → 다운로드 및 업데이트**를 누르세요.
- 주소를 연결하지 않은 0.12.5.34~35: [소형 패치](https://github.com/Her-far/reporter-office-updates/releases/download/v0.12.5.36/ReporterOffice-Update-0.12.5.36.exe)를 한 번 실행하면 됩니다(약 7.4MB).
- 더 오래된 기자오피스 설치본: [전체 누적 업데이트](https://github.com/Her-far/reporter-office-updates/releases/download/v0.12.5.36/ReporterOffice-FullUpdate-0.12.5.36.exe)를 기존 설치 폴더에 적용하세요. 새 PC용 신규 설치 파일은 아닙니다.

설치 전에 작업 문서를 저장하고 프로그램을 종료하세요. 프로그램에서 업데이트하면 저장 확인 후 재시작합니다. 중간 버전을 순서대로 설치할 필요는 없습니다.

[전체 릴리스와 변경 사항](https://github.com/Her-far/reporter-office-updates/releases/latest)

## 배포 주소

```text
https://raw.githubusercontent.com/Her-far/reporter-office-updates/main/reporter-latest.json
```

설치 파일의 크기와 SHA-256은 `reporter-latest.json`에 기록됩니다. 설치 파일을 먼저 업로드하고 검증한 다음 배포 정보를 갱신합니다.

이 저장소에는 개발 프로젝트 소스나 사용자 문서를 게시하지 않습니다. GitHub의 Source code ZIP/TAR는 이 배포 저장소의 내용입니다. 포함 구성 요소의 라이선스와 고지는 설치 파일에 유지됩니다.
