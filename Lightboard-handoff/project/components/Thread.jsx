// Conversation thread — user message, agent text messages, tool trace, and chart
function Thread({ traceVariant, traceOpen, setTraceOpen, streaming }) {
  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      scrollSnapType: 'y proximity',
      padding: '0',
    }}>
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '28px 48px 40px' }}>
        <ConversationHeader />

        <Block>
          <UserMessage>
            Show me the top 10 batters in the IPL since 2014 with highest True Strike Rate
            (xRuns − actual runs, per 100 balls). Minimum 1,000 career runs.
          </UserMessage>
        </Block>

        <Block>
          <AgentMessage>
            Great question. I'll compute True Strike Rate as <em>xRuns − actual runs</em>, normalized per 100 balls, then filter to batters with at least 1,000 career runs since 2014. Let me pull the ball-by-ball data and run the model.
          </AgentMessage>
        </Block>

        <Block>
          <AgentTrace
            variant={traceVariant}
            open={traceOpen}
            onToggle={() => setTraceOpen(!traceOpen)}
            streaming={streaming}
          />
        </Block>

        <Block snap>
          <Chart />
        </Block>

        <Block>
          <AgentMessage>
            Here's what stands out at a glance — <b>G Gambhir's +11.59 is nearly double</b> the next-best figure, which is an unusually wide gap for this kind of ranking. Want me to flip the formula to surface batters who <em>outperformed</em> the model, or break this down by phase of innings?
          </AgentMessage>
        </Block>

        <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Suggestion>Flip to batters who exceeded model</Suggestion>
          <Suggestion>Break down by phase of innings</Suggestion>
          <Suggestion>Filter to 2020 onwards</Suggestion>
          <Suggestion>Switch to scatter vs xRuns</Suggestion>
        </div>

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}

function Block({ children, snap }) {
  return (
    <div style={{
      marginTop: 20,
      scrollSnapAlign: snap ? 'center' : 'none',
      scrollSnapStop: snap ? 'always' : 'normal',
    }}>
      {children}
    </div>
  );
}

function ConversationHeader() {
  return (
    <div style={{ paddingBottom: 16, borderBottom: '1px solid #17171B' }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9.5,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#55555C',
        marginBottom: 6,
      }}>17 Apr · cricket</div>
      <h1 style={{
        margin: 0,
        fontFamily: 'var(--font-display)',
        fontSize: 26,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        color: '#EDEDEE',
      }}>Post 2014 IPL True Strike Rate</h1>
    </div>
  );
}

function UserMessage({ children }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{
        width: 26, height: 26, borderRadius: 99,
        background: 'linear-gradient(135deg,#E89B52,#B08CA8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 10, color: '#0A0A0C',
        fontWeight: 700, flex: '0 0 auto', marginTop: 1,
      }}>A</div>
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: 15, color: '#EDEDEE',
        lineHeight: 1.55, paddingTop: 2,
      }}>{children}</div>
    </div>
  );
}

function AgentMessage({ children }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{
        width: 26, height: 26, borderRadius: 6,
        background: '#0D0D10', border: '1px solid #1E1E22',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flex: '0 0 auto', marginTop: 1,
      }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1.5 L6 10.5 M2 3 L10 3 M2 9 L10 9" stroke="#F2C265" strokeWidth="1.1" strokeLinecap="round"/>
          <circle cx="6" cy="6" r="1.4" fill="#F2C265"/>
        </svg>
      </div>
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: 14, color: '#BDBDC4',
        lineHeight: 1.6, paddingTop: 2, maxWidth: 720,
      }}>{children}</div>
    </div>
  );
}

function Suggestion({ children }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', cursor: 'pointer',
        padding: '7px 12px', borderRadius: 999,
        border: '1px solid #1E1E22',
        background: hover ? '#131317' : '#0C0C0F',
        fontFamily: 'var(--font-body)', fontSize: 12,
        color: hover ? '#EDEDEE' : '#BDBDC4',
        transition: 'all 160ms ease-out',
      }}
    >{children}</button>
  );
}

function Composer({ onSend }) {
  const [value, setValue] = React.useState('');
  const [focused, setFocused] = React.useState(false);
  const [height, setHeight] = React.useState(() => {
    const stored = Number(localStorage.getItem('lb:composerH'));
    return Number.isFinite(stored) && stored >= 80 ? stored : 120;
  });
  const dragRef = React.useRef(null);

  const canSend = value.trim().length > 0;

  // Drag handle for manual resize
  const startDrag = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const onMove = (ev) => {
      const dy = startY - ev.clientY;
      const next = Math.max(80, Math.min(360, startH + dy));
      setHeight(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      localStorage.setItem('lb:composerH', String(document.documentElement.style.getPropertyValue('--composer-h') || height));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  React.useEffect(() => {
    localStorage.setItem('lb:composerH', String(height));
  }, [height]);

  return (
    <div style={{
      borderTop: '1px solid #17171B',
      background: '#0A0A0C',
      flex: '0 0 auto',
      position: 'relative',
    }}>
      {/* drag handle */}
      <div
        ref={dragRef}
        onMouseDown={startDrag}
        style={{
          position: 'absolute',
          top: -4, left: 0, right: 0, height: 8,
          cursor: 'ns-resize',
          zIndex: 3,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div style={{
          width: 36, height: 3, borderRadius: 99,
          background: '#26262C',
          transition: 'background 160ms ease-out',
        }}
          onMouseEnter={e => e.currentTarget.style.background = '#F2C265'}
          onMouseLeave={e => e.currentTarget.style.background = '#26262C'}
        />
      </div>

      <div style={{ padding: '16px 48px 20px' }}>
        <div style={{
          maxWidth: 920, margin: '0 auto',
          padding: '12px 14px',
          borderRadius: 14,
          border: `1px solid ${focused ? '#3B2E14' : '#1E1E22'}`,
          background: '#0D0D10',
          transition: 'border-color 180ms ease-out',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          height,
        }}>
          <textarea
            value={value}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSend) {
                e.preventDefault();
                onSend?.(value); setValue('');
              }
            }}
            placeholder="Ask a follow-up, or slice the data further…"
            style={{
              flex: 1,
              resize: 'none', outline: 'none', border: 'none',
              background: 'transparent', color: '#EDEDEE',
              fontFamily: 'var(--font-body)',
              fontSize: 14, lineHeight: 1.55,
              padding: '4px 2px',
              overflow: 'auto',
            }}
          />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <ComposerIcon title="Attach">
                <path d="M9.5 4.5L4 10a2 2 0 102.8 2.8L12 7.5a3.5 3.5 0 00-5-5L1.8 7.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
              </ComposerIcon>
              <ComposerIcon title="Run as SQL">
                <path d="M3 3v8l7-4-7-4z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
              </ComposerIcon>
              <ComposerIcon title="Attach view">
                <rect x="2" y="3" width="9" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                <path d="M2 6h9" stroke="currentColor" strokeWidth="1.1"/>
              </ComposerIcon>
            </div>
            <SendButton
              enabled={canSend}
              onClick={() => { if (canSend) { onSend?.(value); setValue(''); } }}
            />
          </div>
        </div>

        <div style={{
          maxWidth: 920, margin: '8px auto 0',
          display: 'flex', justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)', fontSize: 9.5,
          letterSpacing: '0.08em', color: '#3E3E45',
          textTransform: 'uppercase',
        }}>
          <span>cricket · 24 tables · 42.1M rows</span>
          <span>⌘ ⏎ send   ⏎ newline   ⇡ drag to resize</span>
        </div>
      </div>
    </div>
  );
}

function ComposerIcon({ children, title }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', cursor: 'pointer',
        width: 30, height: 30, borderRadius: 8,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: hover ? '#EDEDEE' : '#55555C',
        background: hover ? '#18181C' : 'transparent',
        transition: 'all 150ms ease-out',
      }}
    ><svg width="13" height="13" viewBox="0 0 13 13">{children}</svg></button>
  );
}

function SendButton({ enabled, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onClick} disabled={!enabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', cursor: enabled ? 'pointer' : 'not-allowed',
        padding: '8px 14px', borderRadius: 99,
        background: enabled ? '#EDEDEE' : '#1A1A1F',
        color: enabled ? '#0A0A0C' : '#55555C',
        fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        transition: 'all 180ms ease-out',
        transform: hover && enabled ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hover && enabled ? '0 4px 14px rgba(237,237,238,0.12)' : 'none',
      }}
    >
      <span>Send</span>
      <svg width="10" height="10" viewBox="0 0 10 10" style={{
        transition: 'transform 180ms ease-out',
        transform: hover && enabled ? 'translateX(2px)' : 'translateX(0)',
      }}>
        <path d="M1 5h7M5 1l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    </button>
  );
}

function FilmstripButton({ onClick, active }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', cursor: 'pointer',
        position: 'absolute', top: 16, right: 20, zIndex: 3,
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '7px 12px 7px 10px', borderRadius: 999,
        background: active ? '#16120B' : (hover ? '#131317' : '#0D0D10'),
        border: `1px solid ${active ? '#3B2E14' : '#1E1E22'}`,
        color: active ? '#F2C265' : '#BDBDC4',
        fontFamily: 'var(--font-body)', fontSize: 12,
        transition: 'all 180ms ease-out',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 13 13">
        <rect x="1" y="2" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.1" fill="none"/>
        <path d="M1 5h11M1 8h11M4 2v9M9 2v9" stroke="currentColor" strokeWidth="0.9"/>
      </svg>
      Filmstrip
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10,
        color: '#55555C', letterSpacing: '0.04em',
      }}>6</span>
    </button>
  );
}

window.Thread = Thread;
window.Composer = Composer;
window.FilmstripButton = FilmstripButton;
