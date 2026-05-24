import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Icon from './Icon.jsx';

export default function AnalysisPanel({ file, onClose }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const r = await invoke('analyze_text', { text: file.content || '' });
      setResult(r);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [file]);

  useEffect(() => { run(); }, [run]);

  return (
    <aside className="analysis-pane">
      <div className="analysis-head">
        <Icon name="sparkles" size={14}/>
        <span className="analysis-title">본문 분석</span>
        <div className="analysis-actions">
          <button className="icon-btn" title="다시 분석" onClick={run} disabled={loading}>
            <Icon name="refresh" size={14}/>
          </button>
          <button className="icon-btn" title="분석 패널 닫기" onClick={onClose}>
            <Icon name="x" size={14}/>
          </button>
        </div>
      </div>
      <div className="analysis-scroll">
        {loading && <div className="analysis-empty">분석 중…</div>}
        {error && !loading && <div className="analysis-empty analysis-error">오류: {error}</div>}
        {result && !loading && !error && <AnalysisResult result={result}/>}
      </div>
    </aside>
  );
}

function AnalysisResult({ result }) {
  const t = result.totals;
  const totalSentenceChars = t.dialogueCharacters + t.narrationCharacters;
  const dialogueRatio = totalSentenceChars > 0
    ? Math.round((t.dialogueCharacters / totalSentenceChars) * 100)
    : 0;
  return (
    <>
      <section className="analysis-section">
        <div className="analysis-section-title">전체 요약</div>
        <div className="analysis-grid">
          <Stat label="챕터" value={t.chapters}/>
          <Stat label="씬" value={t.scenes}/>
          <Stat label="문단" value={t.paragraphs}/>
          <Stat label="문장" value={t.sentences}/>
          <Stat label="글자" value={t.characters}/>
          <Stat label="대사 비중" value={`${dialogueRatio}%`}/>
        </div>
        {t.sentences > 0 && (
          <div className="analysis-sub">
            문장 길이 평균 {t.averageSentenceChars.toFixed(1)}자 · 최소 {t.shortestSentenceChars}자 · 최대 {t.longestSentenceChars}자
          </div>
        )}
      </section>
      <section className="analysis-section">
        <div className="analysis-section-title">챕터별 요약</div>
        {result.chapters.length === 0 ? (
          <div className="analysis-empty">아직 분석할 내용이 없습니다.</div>
        ) : (
          <ol className="analysis-chapter-list">
            {result.chapters.map((c, i) => (
              <li key={i} className="analysis-chapter">
                <div className="analysis-chapter-title">{c.title || '서두'}</div>
                <div className="analysis-chapter-stats">
                  문단 {c.paragraphs} · 문장 {c.sentences} · 글자 {c.characters}
                  {c.scenes > 0 && <> · 씬 {c.scenes}</>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="analysis-stat">
      <div className="analysis-stat-value">{value}</div>
      <div className="analysis-stat-label">{label}</div>
    </div>
  );
}
