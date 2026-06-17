import { ChevronDown } from "lucide-react";

import type { FeedAiJudgement } from "@/types/post";

type AiEvidenceSummaryProps = {
  evidence: FeedAiJudgement["evidence"];
};

export function AiEvidenceSummary({ evidence }: AiEvidenceSummaryProps) {
  if (!evidence) {
    return null;
  }

  return (
    <details className="mt-3 rounded-lg border border-[#d8eadf] bg-white/85 p-3 text-xs text-zinc-600 open:bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-black text-[#10674f]">
        <span>AI가 참고한 근거</span>
        <ChevronDown size={14} className="shrink-0" />
      </summary>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-[#e7f8ef] px-2.5 py-1 font-black text-[#10674f]">
          유사 판례 {evidence.usedPrecedentCount}건
        </span>
        <span className="rounded-full bg-[#f3f5fa] px-2.5 py-1 font-black text-zinc-600">
          외부 RAG {evidence.usedExternalRag ? "참고" : "미참고"}
        </span>
        <span className="rounded-full bg-[#fff7d7] px-2.5 py-1 font-black text-[#7a5200]">
          식단 {evidence.usedMealContext ? "참고" : "미참고"}
        </span>
        <span className="rounded-full bg-[#eef0ff] px-2.5 py-1 font-black text-[#4f46a5]">
          투표 {evidence.usedVoteSummary ? "참고" : "미참고"}
        </span>
      </div>

      {evidence.summary.length ? (
        <ul className="mt-3 space-y-1.5 leading-5">
          {evidence.summary.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      {evidence.contextVersion ? (
        <p className="mt-3 font-mono text-[11px] font-semibold text-zinc-400">
          {evidence.contextVersion}
        </p>
      ) : null}
    </details>
  );
}
