// Agent reasoning trace — collapsible with streaming tool calls.
// Variant A: "editorial log"   — dashed rule timeline, indent, mono prefixes
// Variant B: "quiet manifest"  — condensed list, grouped by kind, single column
// Variant C: "inline ribbon"   — one-line horizontal scroller of tool chips

function useStreamedCalls(calls, enabled) {
  const [count, setCount] = React.useState(enabled ? 0 : calls.length);
  React.useEffect(() => {
    if (!enabled) { setCount(calls.length); return; }
    setCount(0);
    let i = 0;
    const tick = () => {
      i += 1;
      setCount(i);
      if (i < calls.length) {
        setTimeout(tick, 180 + Math.random() * 240);
      }
    };
    const t = setTimeout(tick, 300);
    return () => clearTimeout(t);
  }, [calls, enabled]);
  return count;
}

const TOOL_CALLS = [
  { kind: 'schema', tool: 'introspect_schema', arg: 'cricket.ball_by_ball', dur: 42 },
  { kind: 'schema', tool: 'introspect_schema', arg: 'cricket.player_meta', dur: 31 },
  { kind: 'query', tool: 'sql', arg: "SELECT batter, SUM(runs) …", dur: 312, rows: 412 },
  { kind: 'query', tool: 'sql', arg: "SELECT batter, expected_runs …", dur: 486, rows: 412 },
  { kind: 'compute', tool: 'compute_model', arg: 'xRuns v3 · per 100 balls', dur: 94 },
  { kind: 'filter', tool: 'apply_filter', arg: 'career_runs >= 1000', dur: 12, rows: 38 },
  { kind: 'compute', tool: 'rank', arg: 'true_strike_rate desc', dur: 8 },
  { kind: 'query', tool: 'sql', arg: "SELECT AVG(tsr) WHERE rank > 10", dur: 118 },
  { kind: 'viz', tool: 'pick_chart_type', arg: 'horizontal_bar · n=10', dur: 22 },
  { kind: 'viz', tool: 'assign_palette', arg: 'warm_editorial', dur: 6 },
  { kind: 'narrate', tool: 'summarize', arg: 'key takeaways · 3 bullets', dur: 204 },
  { kind: 'narrate', tool: 'caveat', arg: 'interpretation note', dur: 88 },
];

function AgentTrace({ variant = 'editorial', open, onToggle, streaming }) {
  const count = useStreamedCalls(TOOL_CALLS, streaming);
  const visible = TOOL_CALLS.slice(0, count);
  const total = TOOL_CALLS.length;
  const done = count === total;

  return (
    <div style={{
      background: '#0F0F12',
      border: '1px solid #1E1E22',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      <TraceHeader
        total={total}
        count={count}
        done={done}
        open={open}
        onToggle={onToggle}
      />
      {open && (
        <div style={{
          padding: variant === 'ribbon' ? '10px 20px 18px' : '6px 20px 18px',
          borderTop: '1px solid #1A1A1E',
        }}>
          {variant === 'editorial' && <EditorialTrace calls={visible} done={done} streaming={streaming} />}
          {variant === 'manifest' && <ManifestTrace calls={visible} done={done} />}
          {variant === 'ribbon' && <RibbonTrace calls={visible} done={done} streaming={streaming} />}
        </div>
      )}
      {open && done && <TakeawaysBlock />}
    </div>
  );
}

function TraceHeader({ total, count, done, open, onToggle }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '14px 20px',
        cursor: 'pointer',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: 99,
          background: done ? '#7DB469' : '#E89B52',
          boxShadow: done ? 'none' : '0 0 0 3px rgba(232,155,82,0.15)',
          transition: 'all 220ms ease-out',
          animation: done ? 'none' : 'pulse 1.4s ease-in-out infinite',
        }} />
        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          color: '#EDEDEE',
          fontWeight: 500,
        }}>
          {done ? 'Completed' : 'Thinking'}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: '#6B6B73',
          letterSpacing: '0.04em',
        }}>
          {count}/{total} tool calls
          {!done && <span style={{ marginLeft: 8, opacity: 0.7 }}>· {TOOL_CALLS[count]?.tool ?? ''}</span>}
        </div>
      </div>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
        style={{
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 220ms cubic-bezier(.2,.8,.2,1)',
          color: hover ? '#BDBDC4' : '#6B6B73',
        }}
      >
        <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

const KIND_COLOR = {
  schema:  '#8AB4B8',
  query:   '#E89B52',
  compute: '#B08CA8',
  filter:  '#D9A441',
  viz:     '#F2C265',
  narrate: '#7DB469',
};
const KIND_LABEL = {
  schema: 'schema', query: 'query', compute: 'compute',
  filter: 'filter', viz: 'viz', narrate: 'narrate',
};

function EditorialTrace({ calls, done, streaming }) {
  const [mounted, setMounted] = React.useState(!streaming);
  React.useEffect(() => {
    if (mounted) return;
    const t = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(t);
  }, [mounted]);
  return (
    <div style={{ position: 'relative', paddingLeft: 10 }}>
      <div style={{
        position: 'absolute',
        left: 3,
        top: 8,
        bottom: 8,
        borderLeft: '1px dashed #26262C',
      }} />
      {calls.map((c, i) => (
        <div key={i} style={{
          display: 'grid',
          gridTemplateColumns: '70px 1fr auto',
          alignItems: 'baseline',
          gap: 14,
          padding: '6px 0 6px 14px',
          position: 'relative',
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(2px)',
          transition: `opacity 260ms cubic-bezier(.2,.8,.2,1) ${i * 18}ms, transform 260ms cubic-bezier(.2,.8,.2,1) ${i * 18}ms`,
        }}>
          <div style={{
            position: 'absolute',
            left: -2,
            top: 12,
            width: 8, height: 8,
            borderRadius: 99,
            background: '#0F0F12',
            border: `1.5px solid ${KIND_COLOR[c.kind]}`,
          }} />
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: KIND_COLOR[c.kind],
          }}>
            {KIND_LABEL[c.kind]}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11.5,
            color: '#BDBDC4',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            <span style={{ color: '#EDEDEE' }}>{c.tool}</span>
            <span style={{ color: '#55555C' }}>(</span>
            <span>{c.arg}</span>
            <span style={{ color: '#55555C' }}>)</span>
            {c.rows != null && (
              <span style={{ color: '#6B6B73', marginLeft: 8 }}>→ {c.rows} rows</span>
            )}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: '#55555C',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {c.dur}ms
          </div>
        </div>
      ))}
      {!done && calls.length > 0 && (
        <div style={{
          position: 'absolute',
          left: -2,
          bottom: 0,
          width: 8, height: 8,
          borderRadius: 99,
          background: '#E89B52',
          animation: 'pulse 1.4s ease-in-out infinite',
        }} />
      )}
    </div>
  );
}

function ManifestTrace({ calls }) {
  // Group by kind, show counts, subtler
  const groups = {};
  calls.forEach(c => {
    groups[c.kind] = groups[c.kind] || [];
    groups[c.kind].push(c);
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4 }}>
      {Object.entries(groups).map(([kind, items]) => (
        <div key={kind} style={{
          display: 'grid',
          gridTemplateColumns: '90px 1fr auto',
          gap: 12,
          alignItems: 'baseline',
          padding: '5px 0',
          borderBottom: '1px solid #18181C',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: KIND_COLOR[kind],
          }}>
            {kind} · {items.length}
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: '#BDBDC4',
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
          }}>
            {items.map((c, j) => (
              <span key={j} style={{
                padding: '2px 8px',
                background: '#18181C',
                borderRadius: 4,
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
              }}>
                {c.tool}
              </span>
            ))}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: '#55555C',
          }}>
            {items.reduce((s, x) => s + x.dur, 0)}ms
          </div>
        </div>
      ))}
    </div>
  );
}

function RibbonTrace({ calls, streaming }) {
  const [mounted, setMounted] = React.useState(!streaming);
  React.useEffect(() => {
    if (mounted) return;
    const t = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(t);
  }, [mounted]);
  return (
    <div style={{
      display: 'flex',
      gap: 6,
      overflowX: 'auto',
      padding: '4px 0 10px',
      scrollbarWidth: 'none',
    }}>
      {calls.map((c, i) => (
        <div key={i} style={{
          flex: '0 0 auto',
          padding: '6px 10px',
          borderRadius: 6,
          background: '#18181C',
          border: `1px solid ${KIND_COLOR[c.kind]}30`,
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(2px)',
          transition: `opacity 260ms cubic-bezier(.2,.8,.2,1) ${i * 14}ms, transform 260ms cubic-bezier(.2,.8,.2,1) ${i * 14}ms`,
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: 99,
            background: KIND_COLOR[c.kind],
          }} />
          <span style={{ color: '#EDEDEE' }}>{c.tool}</span>
          <span style={{ color: '#55555C' }}>{c.dur}ms</span>
        </div>
      ))}
    </div>
  );
}

function TakeawaysBlock() {
  return (
    <div style={{
      padding: '18px 22px 20px',
      borderTop: '1px solid #1A1A1E',
      background: '#0C0C0F',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9.5,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#6B6B73',
        marginBottom: 10,
      }}>
        Key takeaways
      </div>
      <ol style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        color: '#BDBDC4',
        lineHeight: 1.55,
      }}>
        {[
          <><b style={{ color: '#EDEDEE' }}>G Gambhir</b> is the outlier — a True Strike Rate of <b style={{ color: '#F2C265' }}>+11.59</b>, nearly double the next-best (M Vijay, +6.43). The model consistently priced his situations as high-value.</>,
          <>The rest of the top 10 cluster tightly between <b style={{ color: '#EDEDEE' }}>+3.08</b> and <b style={{ color: '#EDEDEE' }}>+5.24</b> — a competitive band of batters who left runs on the table relative to expectations.</>,
          <>Big names like <b>CH Gayle</b> and <b>MS Dhoni</b> rank high, both known for calculated batting — often preserving wickets when the model expected more aggression.</>,
        ].map((t, i) => (
          <li key={i} style={{
            display: 'grid',
            gridTemplateColumns: '22px 1fr',
            alignItems: 'baseline',
            padding: '4px 0',
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: '#55555C',
            }}>0{i + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
      <div style={{
        marginTop: 14,
        padding: '10px 12px',
        borderRadius: 8,
        background: '#15120B',
        border: '1px solid #3B2E14',
        fontFamily: 'var(--font-body)',
        fontSize: 12,
        color: '#D9A441',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 2 }}>⚠</span>
        <span>
          <b>Interpretation note</b> — a positive True Strike Rate means the model expected <em>more</em> runs than the batter scored. If you'd like to flip the formula to find batters who outperformed expectations, just let me know.
        </span>
      </div>
    </div>
  );
}

window.AgentTrace = AgentTrace;
