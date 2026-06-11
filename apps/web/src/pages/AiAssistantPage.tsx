import { Bot, Clock3, ExternalLink, FileText, MapPin, Megaphone, Phone, Send } from 'lucide-react';
import { useState } from 'react';
import { api, isAuthError, type ExternalSource, type RagSource } from '../api/client.js';

type AiAssistantPageProps = {
  isAuthed: boolean;
  onLogin: () => void;
};

type AiMode = 'rag' | 'post-helper' | 'complaint-helper';

export function AiAssistantPage({ isAuthed, onLogin }: AiAssistantPageProps) {
  const [input, setInput] = useState('근처 야간 약국 어디 있어?');
  const [answer, setAnswer] = useState('오산 게시판에 쌓인 글과 외부 도구를 활용해 답변합니다.');
  const [sources, setSources] = useState<RagSource[]>([]);
  const [externalSources, setExternalSources] = useState<ExternalSource[]>([]);
  const [lastMode, setLastMode] = useState<AiMode>('rag');
  const [isLoading, setIsLoading] = useState(false);

  async function ask() {
    if (!isAuthed) {
      onLogin();
      return;
    }
    setIsLoading(true);
    try {
      const mode = inferAiMode(input);
      setLastMode(mode);
      if (mode === 'rag') {
        const result = await api.ragAsk(input);
        setAnswer(result.answer);
        setSources(result.sources ?? []);
        setExternalSources(result.externalSources ?? []);
      } else {
        const result = await api.agent(mode, input);
        setAnswer(result.answer);
        setSources(result.sources ?? []);
        setExternalSources(result.externalSources ?? []);
      }
    } catch (error) {
      if (isAuthError(error)) {
        setAnswer('로그인이 만료되었습니다. 다시 로그인해주세요.');
        setSources([]);
        setExternalSources([]);
        onLogin();
        return;
      }
      setAnswer(error instanceof Error ? error.message : 'AI 답변을 생성하지 못했습니다.');
      setSources([]);
      setExternalSources([]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="ai-page">
      <div className="page-heading">
        <Bot size={26} />
        <div>
          <h1>AI 동네 도우미</h1>
          <p>오산 게시판 지식과 MCP 도구를 함께 사용합니다.</p>
        </div>
      </div>

      <label className="prompt-box">
        <span>질문 또는 요청</span>
        <textarea value={input} onChange={(event) => setInput(event.target.value)} />
      </label>

      <button className="primary-button" type="button" onClick={ask} disabled={isLoading}>
        <Send size={18} /> {isLoading ? '처리 중' : '보내기'}
      </button>

      <article className="answer-panel">
        <header>
          {lastMode === 'complaint-helper' ? <Megaphone size={18} /> : <FileText size={18} />}
          <strong>답변</strong>
        </header>
        <p>{answer}</p>
        {externalSources.length > 0 && (
          <div className="external-source-list" aria-label="장소 검색 결과">
            <strong>장소 검색</strong>
            {externalSources.slice(0, 4).map((source) => (
              <div className="external-source-item" key={externalSourceKey(source)}>
                <div className="external-source-title">
                  <MapPin size={15} aria-hidden="true" />
                  <span>{source.name}</span>
                </div>
                {source.address && <small>{source.address}</small>}
                {source.openingHours && (
                  <div className="external-source-hours">
                    <Clock3 size={13} aria-hidden="true" />
                    <span>{source.openingHours}</span>
                  </div>
                )}
                <div className="external-source-meta">
                  {source.category && <span>{source.category}</span>}
                  {source.source && <span>{source.source}</span>}
                  {source.phone && (
                    <a href={`tel:${source.phone.replace(/[^\d+]/g, '')}`}>
                      전화 <Phone size={12} aria-hidden="true" />
                    </a>
                  )}
                  {source.hoursSourceUrl && (
                    <a href={source.hoursSourceUrl} target="_blank" rel="noreferrer">
                      시간 출처 <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  )}
                  {source.url && (
                    <a href={source.url} target="_blank" rel="noreferrer">
                      링크 <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {sources.length > 0 && (
          <div className="source-list" aria-label="AI 답변 근거">
            <strong>근거</strong>
            {sources.slice(0, 3).map((source) => (
              <div className="source-item" key={`${source.sourceType ?? 'source'}-${source.sourceId}`}>
                <span>{sourceTitle(source)}</span>
                <small>{source.sourceType ?? 'SOURCE'}</small>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

export function inferAiMode(text: string): AiMode {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (
    /(민원|신고|불편|불법|단속|악취|소음|쓰레기|파손|고장|위험|방치|막혀|개선\s*요청|처리\s*요청|정비\s*요청|주정차|주차|정차)/i.test(
      normalized
    )
  ) {
    return 'complaint-helper';
  }
  if (
    /(게시글|글쓰기|글\s*(작성|써|도와)|초안|문구|태그|중복\s*확인|작성해\s*줘|써\s*줘|작성할래|작성하고)/i.test(
      normalized
    )
  ) {
    return 'post-helper';
  }
  return 'rag';
}

function sourceTitle(source: RagSource) {
  const titleLine = source.content
    .split('\n')
    .find((line) => line.startsWith('제목:'));
  return titleLine?.replace('제목:', '').trim() || source.content.slice(0, 48);
}

function externalSourceKey(source: ExternalSource) {
  return [
    source.source ?? 'place',
    source.name,
    source.address ?? '',
    source.latitude ?? '',
    source.longitude ?? ''
  ].join('-');
}
