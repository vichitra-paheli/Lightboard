// Tron-style Lightboard sigil — letters drawn with light strokes.
// Each letter is a simple geometric path (uppercase). On mount, strokes
// draw in from left-to-right using stroke-dashoffset. Each letter keeps
// its curated editorial hue; the draw-in reveals the wordmark like
// filaments lighting up on a circuit.

const LETTER_PATHS = {
  // viewBox for each letter: 0 0 10 14 (10 wide, 14 tall)
  L: 'M2 1 L2 13 L8 13',
  I: 'M5 1 L5 13 M3 1 L7 1 M3 13 L7 13',
  G: 'M8.5 3.5 C7 1 3 1 2 4 L2 10 C3 13 7 13 8.5 10.5 L8.5 8 L5.5 8',
  H: 'M2 1 L2 13 M8 1 L8 13 M2 7 L8 7',
  T: 'M1 1 L9 1 M5 1 L5 13',
  B: 'M2 1 L2 13 L6 13 C9 13 9 7 6 7 L2 7 M2 7 L6 7 C9 7 9 1 6 1 L2 1',
  O: 'M2 4 C2 1 8 1 8 4 L8 10 C8 13 2 13 2 10 Z',
  A: 'M1 13 L5 1 L9 13 M2.8 9 L7.2 9',
  R: 'M2 13 L2 1 L6 1 C9 1 9 7 6 7 L2 7 M6 7 L8.5 13',
  D: 'M2 1 L2 13 L5 13 C9 13 9 1 5 1 Z',
};

function LightboardSigil({ size = 20, delay = 0, replayKey = 0 }) {
  const letters = [
    { ch: 'L', c: '#F4A261' },
    { ch: 'I', c: '#E76F51' },
    { ch: 'G', c: '#E9C46A' },
    { ch: 'H', c: '#D9A441' },
    { ch: 'T', c: '#EDEDEE' },
    { ch: 'B', c: '#8AB4B8' },
    { ch: 'O', c: '#5E8B95' },
    { ch: 'A', c: '#6A7BA2' },
    { ch: 'R', c: '#B08CA8' },
    { ch: 'D', c: '#D4846F' },
  ];
  // tighter tracking
  const letterW = size * 0.72;
  const letterH = size * 1.0;
  return (
    <svg
      key={replayKey}
      width={letterW * letters.length}
      height={letterH * 1.1}
      viewBox={`0 0 ${10 * letters.length} 15`}
      style={{ display: 'block', overflow: 'visible' }}
      aria-label="Lightboard"
    >
      {letters.map((l, i) => (
        <g key={i} transform={`translate(${i * 10} 0.5)`}>
          <TronLetter
            ch={l.ch}
            color={l.c}
            delay={delay + i * 80}
          />
        </g>
      ))}
    </svg>
  );
}

function TronLetter({ ch, color, delay }) {
  const d = LETTER_PATHS[ch];
  const L = 50;
  const animStyle = {
    strokeDasharray: L,
    animation: `sigilDraw 900ms cubic-bezier(.6,.1,.2,1) ${delay}ms both`,
    ['--sigil-len']: L,
  };
  return (
    <>
      <path
        d={d}
        stroke={color}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.35"
        pathLength={L}
        style={animStyle}
      />
      <path
        d={d}
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        pathLength={L}
        style={animStyle}
      />
    </>
  );
}

window.LightboardSigil = LightboardSigil;
window.Wordmark = LightboardSigil; // backward compat
