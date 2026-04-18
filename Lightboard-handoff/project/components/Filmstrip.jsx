// Filmstrip panel — thumbnails of past chart generations
function Filmstrip({ open, onClose, active, onPick }) {
  const items = [
    { id: 'g1', title: 'Batting averages by season',  ts: '2:14pm', kind: 'bar',  pinned: false },
    { id: 'g2', title: 'Strike rate distribution',     ts: '2:18pm', kind: 'hist', pinned: false },
    { id: 'g3', title: 'xRuns vs actual, 2020',        ts: '2:24pm', kind: 'scatter', pinned: true },
    { id: 'g4', title: 'xRuns vs actual, 2014–2024',   ts: '2:27pm', kind: 'scatter', pinned: false },
    { id: 'g5', title: 'Top TSR players (first cut)',  ts: '2:31pm', kind: 'bar',  pinned: false },
    { id: 'g6', title: 'Top TSR · min 1,000 runs',     ts: '2:34pm', kind: 'bar',  pinned: true, current: true },
  ];
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: open ? 320 : 0,
        background: '#0C0C0F',
        borderLeft: open ? '1px solid #1E1E22' : '1px solid transparent',
        transition: 'width 280ms cubic-bezier(.2,.8,.2,1)',
        overflow: 'hidden',
        zIndex: 5,
      }}
    >
      <div style={{
        width: 320,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px 12px',
          borderBottom: '1px solid #18181C',
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#6B6B73',
            }}>Filmstrip</div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              color: '#EDEDEE',
              fontWeight: 600,
              marginTop: 2,
            }}>{items.length} generations</div>
          </div>
          <button onClick={onClose} style={{
            all: 'unset',
            cursor: 'pointer',
            width: 26, height: 26,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            color: '#8A8A92',
          }}>
            <svg width="11" height="11" viewBox="0 0 11 11"><path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
          {items.slice().reverse().map((it, i) => (
            <FilmstripCard key={it.id} item={it} onClick={() => onPick?.(it)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FilmstripCard({ item, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset',
        display: 'block',
        width: '100%',
        boxSizing: 'border-box',
        padding: 10,
        borderRadius: 10,
        marginBottom: 8,
        background: item.current ? '#16120B' : (hover ? '#131317' : 'transparent'),
        border: item.current ? '1px solid #3B2E14' : '1px solid transparent',
        cursor: 'pointer',
        transition: 'all 180ms ease-out',
      }}
    >
      <Thumbnail kind={item.kind} highlight={item.current} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          color: '#EDEDEE',
          fontWeight: item.current ? 600 : 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {item.title}
        </div>
        {item.pinned && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.1em',
            color: '#F2C265',
            textTransform: 'uppercase',
          }}>pinned</span>
        )}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9.5,
        color: '#55555C',
        letterSpacing: '0.08em',
        marginTop: 2,
      }}>
        {item.ts} · {item.kind}
      </div>
    </button>
  );
}

function Thumbnail({ kind, highlight }) {
  // Procedural mini-chart thumbnails
  if (kind === 'bar') {
    const bars = [0.7, 0.55, 0.48, 0.42, 0.38, 0.32, 0.28, 0.25, 0.22];
    return (
      <div style={{
        height: 96,
        background: '#101013',
        border: '1px solid #1E1E22',
        borderRadius: 6,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        justifyContent: 'center',
      }}>
        {bars.map((b, i) => (
          <div key={i} style={{
            height: 4,
            width: `${b * 100}%`,
            background: highlight
              ? (i < 3 ? '#E89B52' : '#6B3E28')
              : '#3A3A42',
            borderRadius: 1,
          }} />
        ))}
      </div>
    );
  }
  if (kind === 'scatter') {
    const pts = Array.from({ length: 24 }, (_, i) => ({
      x: Math.random() * 90 + 5,
      y: Math.random() * 70 + 10,
    }));
    return (
      <div style={{
        height: 96,
        background: '#101013',
        border: '1px solid #1E1E22',
        borderRadius: 6,
        position: 'relative',
      }}>
        {pts.map((p, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${p.x}%`, top: `${p.y}%`,
            width: 3, height: 3, borderRadius: 99,
            background: '#8AB4B8',
            opacity: 0.7,
          }} />
        ))}
      </div>
    );
  }
  if (kind === 'hist') {
    const bars = [0.2, 0.35, 0.55, 0.8, 0.6, 0.4, 0.28, 0.18, 0.1];
    return (
      <div style={{
        height: 96,
        background: '#101013',
        border: '1px solid #1E1E22',
        borderRadius: 6,
        padding: 10,
        display: 'flex',
        alignItems: 'flex-end',
        gap: 3,
      }}>
        {bars.map((b, i) => (
          <div key={i} style={{
            flex: 1,
            height: `${b * 100}%`,
            background: '#B08CA8',
            opacity: 0.75,
            borderRadius: '1px 1px 0 0',
          }} />
        ))}
      </div>
    );
  }
}

window.Filmstrip = Filmstrip;
