import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "Namukeu Blog 개인정보처리방침",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold text-[var(--text-secondary)] mb-8">개인정보처리방침</h1>
      <div className="prose bg-[var(--bg-card)] rounded-xl border border-[var(--border)]/50 p-8">
        <p>
          본 개인정보처리방침은 Namukeu Blog(이하 &ldquo;사이트&rdquo;)가 수집하는
          정보와 그 활용 방법에 대해 설명합니다.
        </p>
        <h2>1. 수집하는 정보</h2>
        <p>본 사이트는 Google Analytics를 통해 방문자의 이용 패턴을 분석합니다.</p>
        <ul>
          <li>페이지 방문 기록</li>
          <li>방문 시간 및 체류 시간</li>
          <li>사용 기기 및 브라우저 정보</li>
          <li>유입 경로</li>
        </ul>
        <h2>2. 쿠키 사용</h2>
        <p>본 사이트는 Google Analytics 및 Google AdSense를 위한 쿠키를 사용합니다.</p>
        <h2>3. 광고</h2>
        <p>본 사이트는 Google AdSense를 통해 광고를 게재합니다.</p>
        <h2>4. 제3자 서비스</h2>
        <ul>
          <li><strong>Google Analytics</strong> — 웹사이트 트래픽 분석</li>
          <li><strong>Google AdSense</strong> — 광고 서비스</li>
        </ul>
        <h2>5. 문의</h2>
        <p>개인정보 관련 문의사항은 <a href="mailto:cnw@kakao.com">cnw@kakao.com</a>으로 연락해 주시기 바랍니다.</p>
        <p className="text-sm text-[var(--text-muted)] mt-8">최종 수정일: 2026년 2월 14일</p>
      </div>
    </div>
  );
}
