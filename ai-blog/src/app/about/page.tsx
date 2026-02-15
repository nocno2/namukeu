import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description: "AI Blog 소개 페이지",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold text-[var(--text-secondary)] mb-8">About</h1>
      <div className="prose bg-[var(--bg-card)] rounded-xl border border-[var(--border)]/50 p-8">
        <p>
          AI Blog는 인공지능, 머신러닝, 그리고 차세대 기술 트렌드를 다루는 기술 블로그입니다.
        </p>
        <p>
          복잡한 기술 개념을 이해하기 쉽게 풀어내고, 실무에 바로 적용할 수 있는
          실용적인 가이드를 제공하는 것을 목표로 합니다.
        </p>
        <h2>다루는 주제</h2>
        <ul>
          <li><strong>AI &amp; 머신러닝</strong> — 최신 AI 모델, 프롬프트 엔지니어링, AI 도구 활용법</li>
          <li><strong>Next Gen 기술</strong> — 웹3, 양자컴퓨팅, AR/VR 등 차세대 기술 트렌드</li>
        </ul>
        <h2>연락처</h2>
        <p>블로그에 대한 문의사항이나 제안이 있으시면 이메일로 연락해주세요.</p>
      </div>
    </div>
  );
}
