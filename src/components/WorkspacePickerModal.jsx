import { useState } from 'react';
import Icon from './Icon.jsx';

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000,
};

const dialogStyle = {
  background: 'white', borderRadius: 12, width: 460, maxWidth: '92vw',
  padding: 20, boxShadow: '0 12px 48px rgba(0,0,0,0.18)',
  display: 'flex', flexDirection: 'column', gap: 14,
};

const tabsStyle = {
  display: 'flex', gap: 6, borderRadius: 8, padding: 4,
  background: 'var(--gray-100, #f3f4f6)',
};

const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4 };
const labelStyle = { fontSize: 12, color: 'var(--gray-600, #4b5563)' };
const inputStyle = {
  padding: '8px 10px', fontSize: 13, border: '1px solid var(--gray-300, #d1d5db)',
  borderRadius: 6, outline: 'none', background: 'white',
};

export default function WorkspacePickerModal({
  open, onClose, onPickLocal, onPickS3, busy,
}) {
  const [tab, setTab] = useState('local');
  const [bucket, setBucket] = useState('');
  const [prefix, setPrefix] = useState('');
  const [region, setRegion] = useState('ap-northeast-2');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [error, setError] = useState(null);

  if (!open) return null;

  function tabButton(key, label) {
    const on = tab === key;
    return (
      <button
        type="button"
        onClick={() => setTab(key)}
        style={{
          flex: 1, padding: '6px 10px', border: 'none', borderRadius: 6,
          background: on ? 'white' : 'transparent',
          boxShadow: on ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          fontSize: 13, cursor: 'pointer',
          fontWeight: on ? 600 : 400,
        }}
      >{label}</button>
    );
  }

  async function handlePickLocal() {
    setError(null);
    try {
      await onPickLocal();
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  async function handlePickS3(e) {
    e.preventDefault();
    setError(null);
    if (!bucket.trim() || !region.trim() || !accessKey.trim() || !secretKey.trim()) {
      setError('bucket, region, access key, secret key는 필수입니다.');
      return;
    }
    try {
      await onPickS3({
        bucket: bucket.trim(),
        prefix: prefix.trim(),
        region: region.trim(),
        accessKey: accessKey.trim(),
        secretKey: secretKey,
      });
    } catch (e) {
      setError(e?.message || (typeof e === 'string' ? e : JSON.stringify(e)));
    }
  }

  return (
    <div style={overlayStyle} onClick={busy ? undefined : onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>워크스페이스 열기</div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--gray-500)' }}
            aria-label="close"
          ><Icon name="x" size={16}/></button>
        </div>

        <div style={tabsStyle}>
          {tabButton('local', '로컬 폴더')}
          {tabButton('s3', 'S3')}
        </div>

        {tab === 'local' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--gray-700, #374151)' }}>
              OS 폴더 선택 다이얼로그를 엽니다. 선택한 폴더가 워크스페이스가 됩니다.
            </div>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={handlePickLocal}
            >
              <Icon name="folder" size={14}/>폴더 선택…
            </button>
          </div>
        )}

        {tab === 's3' && (
          <form onSubmit={handlePickS3} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Bucket</label>
              <input style={inputStyle} value={bucket} onChange={(e) => setBucket(e.target.value)} placeholder="my-books-bucket"/>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Prefix (선택)</label>
              <input style={inputStyle} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="books/"/>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Region</label>
              <input style={inputStyle} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="ap-northeast-2"/>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Access Key</label>
              <input style={inputStyle} value={accessKey} onChange={(e) => setAccessKey(e.target.value)} placeholder="AKIA..." autoComplete="off"/>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Secret Key</label>
              <input style={inputStyle} type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} autoComplete="off"/>
            </div>
            <div style={{ fontSize: 11, color: 'var(--gray-500, #6b7280)', lineHeight: 1.5 }}>
              자격증명은 로컬 config 파일에 평문으로 저장됩니다. 충돌은 더 최근에 수정된 쪽이 이깁니다.
            </div>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? '연결 중…' : 'S3 워크스페이스 사용'}
            </button>
          </form>
        )}

        {error && (
          <div style={{ fontSize: 12, color: '#b91c1c', background: '#fee', padding: '8px 10px', borderRadius: 6 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
