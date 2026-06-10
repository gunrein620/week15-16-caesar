import { Bot, ExternalLink, FileText, MapPin, Megaphone, Send } from 'lucide-react';
import { useState } from 'react';
import { api, type ExternalSource, type RagSource } from '../api/client.js';

type AiAssistantPageProps = {
  isAuthed: boolean;
  onLogin: () => void;
};

type AiMode = 'rag' | 'post-helper' | 'complaint-helper';

export function AiAssistantPage({ isAuthed, onLogin }: AiAssistantPageProps) {
  const [mode, setMode] = useState<AiMode>('rag');
  const [input, setInput] = useState('근처 야간 약국 어디 있어?');
  const [answer, setAnswer] = useState('오산 게시판에 쌓인 글과 외부 도구를 활용해 답변합니다.');
  const [sources, setSources] = useState<RagSource[]>([]);
  const [externalSources, setExternalSources] = useState<ExternalSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  function selectMode(nextMode: AiMode) {
    setMode(nextMode);
    if (nextMode !== 'rag') {
      setExternalSources([]);
    }
  }

  async function ask() {
    if (!isAuthed) {
      onLogin();
      return;
    }
    setIsLoading(true);
    try {
      if (mode === 'rag') {
        const result = await api.ragAsk(input);
        setAnswer(result.answer);
        setSources(result.sources ?? []);
        setExternalSources(result.externalSources ?? []);
      } else {
        const result = await api.agent(mode, input);
        setAnswer(result.answer);
        setSources([]);
        setExternalSources([]);
      }
    } catch (error) {
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

      <div className="segmented-control" role="tablist" aria-label="AI 모드">
        <button className={mode === 'rag' ? 'active' : ''} type="button" onClick={() => selectMode('rag')}>
          Q&A
        </button>
        <button className={mode === 'post-helper' ? 'active' : ''} type="button" onClick={() => selectMode('post-helper')}>
          글 도우미
        </button>
        <button className={mode === 'complaint-helper' ? 'active' : ''} type="button" onClick={() => selectMode('complaint-helper')}>
          민원
        </button>
      </div>

      <label className="prompt-box">
        <span>{mode === 'rag' ? '질문' : '요청'}</span>
        <textarea value={input} onChange={(event) => setInput(event.target.value)} />
      </label>

      <button className="primary-button" type="button" onClick={ask} disabled={isLoading}>
        <Send size={18} /> {isLoading ? '처리 중' : '보내기'}
      </button>

      <article className="answer-panel">
        <header>
          {mode === 'complaint-helper' ? <Megaphone size={18} /> : <FileText size={18} />}
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
                <div className="external-source-meta">
                  {source.category && <span>{source.category}</span>}
                  {source.source && <span>{source.source}</span>}
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
