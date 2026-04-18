// Editorial horizontal bar chart — hand-curated feel
function Chart({ animateIn = true }) {
  const data = [
    { rank: 1, name: 'M Vijay', value: 6.43, runs: 1172, hl: true },
    { rank: 2, name: 'CH Gayle', value: 5.24, runs: 2344 },
    { rank: 3, name: 'MS Dhoni', value: 5.01, runs: 1867 },
    { rank: 4, name: 'LMP Simmons', value: 4.63, runs: 1079 },
    { rank: 5, name: 'AJ Finch', value: 4.06, runs: 1204 },
    { rank: 6, name: 'DA Miller', value: 3.77, runs: 1310 },
    { rank: 7, name: 'RA Jadeja', value: 3.37, runs: 1485 },
    { rank: 8, name: 'JP Duminy', value: 3.35, runs: 1090 },
    { rank: 9, name: 'WP Saha', value: 3.08, runs: 1002 },
    { rank: 10, name: 'G Gambhir', value: 11.59, runs: 1573, outlier: true },
  ];
  // sort by value desc for display
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map(d => d.value));
  const baseline = 2.1; // "rest avg" dashed line, rendered in value units

  // color ramp: warm amber for outlier/top, muted copper descending
  const color = (v) => {
    if (v > 8) return '#F2C265'; // gold outlier
    if (v > 5) return '#E89B52';
    if (v > 4) return '#D97A44';
    return '#B85C3A';
  };

  const [mounted, setMounted] = React.useState(!animateIn);
  React.useEffect(() => {
    if (!animateIn) return;
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, [animateIn]);

  return (
    <div style={{
      background: '#101013',
      border: '1px solid #1E1E22',
      borderRadius: 14,
      padding: '28px 32px 24px',
      position: 'relative',
    }}>
      {/* header row */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 22,
        gap: 24,
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#6B6B73',
            marginBottom: 8,
          }}>
            Figure 01 · Batting performance vs. model
          </div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 600,
            color: '#EDEDEE',
            letterSpacing: '-0.015em',
            lineHeight: 1.15,
          }}>
            True Strike Rate leaders, IPL 2014–2024
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12.5,
            color: '#8A8A92',
            marginTop: 6,
            maxWidth: 620,
          }}>
            xRuns − actual runs, per 100 balls · minimum 1,000 career runs
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <PillButton icon="filter">Filters</PillButton>
          <PillButton icon="download" subtle>PNG</PillButton>
        </div>
      </div>

      {/* chart body */}
      <div style={{ position: 'relative', paddingLeft: 0 }}>
        {/* baseline label */}
        <div style={{
          position: 'absolute',
          left: `calc(148px + ${(baseline / max) * 100}% * (1 - 148px/100%))`,
          top: -4,
          transform: 'translateX(-50%)',
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          color: '#6B6B73',
          letterSpacing: '0.08em',
        }}>
          REST AVG
        </div>

        {sorted.map((d, i) => {
          const w = (d.value / max) * 100;
          return (
            <div key={d.name} style={{
              display: 'grid',
              gridTemplateColumns: '24px 120px 1fr 68px',
              alignItems: 'center',
              height: 32,
              gap: 0,
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(4px)',
              transition: `opacity 420ms cubic-bezier(.2,.8,.2,1) ${i * 32}ms, transform 420ms cubic-bezier(.2,.8,.2,1) ${i * 32}ms`,
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: '#4E4E55',
                textAlign: 'right',
                paddingRight: 10,
              }}>
                {String(d.rank).padStart(2, '0')}
              </div>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: d.outlier ? '#EDEDEE' : '#BDBDC4',
                fontWeight: d.outlier ? 600 : 400,
                paddingRight: 12,
                textAlign: 'right',
              }}>
                {d.name}
              </div>
              <div style={{ position: 'relative', height: 20 }}>
                {/* baseline dashed line */}
                <div style={{
                  position: 'absolute',
                  left: `${(baseline / max) * 100}%`,
                  top: -6,
                  bottom: -6,
                  width: 1,
                  borderLeft: '1px dashed #2A2A30',
                }} />
                <div style={{
                  position: 'absolute',
                  left: 0,
                  top: 2,
                  bottom: 2,
                  width: mounted ? `${w}%` : '0%',
                  background: color(d.value),
                  borderRadius: 2,
                  transition: `width 720ms cubic-bezier(.2,.8,.2,1) ${i * 32 + 120}ms`,
                  boxShadow: d.outlier ? '0 0 0 1px rgba(242,194,101,0.25)' : 'none',
                }} />
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11.5,
                color: d.outlier ? '#F2C265' : '#BDBDC4',
                fontWeight: d.outlier ? 600 : 400,
                textAlign: 'right',
                paddingLeft: 12,
                fontVariantNumeric: 'tabular-nums',
              }}>
                +{d.value.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>

      {/* footnote */}
      <div style={{
        marginTop: 18,
        paddingTop: 14,
        borderTop: '1px solid #1E1E22',
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: 'var(--font-mono)',
        fontSize: 9.5,
        letterSpacing: '0.08em',
        color: '#55555C',
        textTransform: 'uppercase',
      }}>
        <span>Source · IPL ball-by-ball · 2014–2024</span>
        <span>n = 38 players · updated 17 Apr 2026</span>
      </div>
    </div>
  );
}

function PillButton({ children, icon, subtle }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 999,
        border: '1px solid #26262C',
        background: hover ? '#1A1A1F' : '#131317',
        color: '#BDBDC4',
        fontFamily: 'var(--font-body)',
        fontSize: 12,
        cursor: 'pointer',
        transition: 'all 180ms ease-out',
      }}
    >
      {icon === 'filter' && (
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M1 2h9M2.5 5.5h6M4 9h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      )}
      {icon === 'download' && (
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M5.5 1.5v6m0 0L3 5m2.5 2.5L8 5M1.5 9.5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {children}
    </button>
  );
}

window.Chart = Chart;
window.PillButton = PillButton;
