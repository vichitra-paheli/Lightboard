function Shell({ children, onOpenFilmstrip, tweaks, setTweaks }) {
  return (
    <div style={{
      height: '100vh',
      background: '#08080A',
      color: '#EDEDEE',
      fontFamily: 'var(--font-body)',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <TopBar onOpenFilmstrip={onOpenFilmstrip} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        <Sidebar />
        <div style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function TopBar({ onOpenFilmstrip }) {
  return (
    <div style={{
      height: 56,
      borderBottom: '1px solid #17171B',
      display: 'grid',
      gridTemplateColumns: '260px 1fr 260px',
      alignItems: 'center',
      padding: '0 24px',
      background: '#0A0A0C',
      flex: '0 0 auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <IconButton>
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M1 3h12M1 7h12M1 11h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        </IconButton>
        <Wordmark size={18} />
      </div>
      <nav style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 4,
      }}>
        <NavItem icon="dashboard">Dashboard</NavItem>
        <NavItem icon="explore" active>Explore</NavItem>
        <NavItem icon="views">Views</NavItem>
        <NavItem icon="settings">Settings</NavItem>
      </nav>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14 }}>
        <AgentPicker />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '4px 10px 4px 4px',
          borderRadius: 999,
          border: '1px solid #17171B',
        }}>
          <div style={{
            width: 24, height: 24,
            borderRadius: 99,
            background: 'linear-gradient(135deg,#E89B52,#B08CA8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: '#0A0A0C',
            fontWeight: 700,
          }}>A</div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: '#BDBDC4',
          }}>alex</div>
        </div>
      </div>
    </div>
  );
}

function NavItem({ children, active, icon }) {
  const [hover, setHover] = React.useState(false);
  const icons = {
    dashboard: <path d="M1 1h5v5H1zM8 1h5v5H8zM1 8h5v5H1zM8 8h5v5H8z" stroke="currentColor" strokeWidth="1.1" fill="none"/>,
    explore:   <path d="M4.5 10.5L1.5 13.5M10 6a4 4 0 11-8 0 4 4 0 018 0z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>,
    views:     <path d="M1 11.5l3.5-4 3 2.5L12 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
    settings:  <path d="M7 4.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM7 1v1.5M7 11.5V13M13 7h-1.5M2.5 7H1M11.2 2.8l-1 1M3.8 10.2l-1 1M11.2 11.2l-1-1M3.8 3.8l-1-1" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round"/>,
  };
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset',
        cursor: 'pointer',
        position: 'relative',
        padding: '8px 14px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        color: active ? '#EDEDEE' : (hover ? '#BDBDC4' : '#8A8A92'),
        fontWeight: active ? 500 : 400,
        transition: 'color 180ms ease-out',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14">{icons[icon]}</svg>
      {children}
      {active && (
        <span style={{
          position: 'absolute',
          left: 14, right: 14, bottom: -18,
          height: 2,
          background: '#E89B52',
          borderRadius: 2,
        }} />
      )}
    </button>
  );
}

function IconButton({ children, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset',
        cursor: 'pointer',
        width: 30, height: 30,
        borderRadius: 8,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: hover ? '#EDEDEE' : '#8A8A92',
        background: hover ? '#131317' : 'transparent',
        transition: 'all 160ms ease-out',
      }}
    >
      {children}
    </button>
  );
}

function AgentPicker() {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 10px 5px 8px',
        borderRadius: 8,
        border: '1px solid #17171B',
        background: hover ? '#131317' : 'transparent',
        transition: 'all 160ms ease-out',
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: 99,
        background: '#7DB469',
        boxShadow: '0 0 0 2px rgba(125,180,105,0.15)',
      }} />
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: 12,
        color: '#EDEDEE',
      }}>Haiku 4.5</span>
      <svg width="8" height="8" viewBox="0 0 8 8" style={{ color: '#6B6B73' }}>
        <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    </button>
  );
}

function Sidebar() {
  const [db, setDb] = React.useState('cricket');
  return (
    <aside style={{
      width: 240,
      borderRight: '1px solid #17171B',
      background: '#09090B',
      padding: '16px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      flex: '0 0 auto',
      overflowY: 'auto',
    }}>
      <DatabasePicker value={db} onChange={setDb} />
      <Conversations />
      <div style={{ flex: 1 }} />
      <NewChatButton />
    </aside>
  );
}

function DatabasePicker({ value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const dbs = [
    { id: 'cricket', name: 'cricket', kind: 'postgres', color: '#8AB4B8' },
    { id: 'sales_prod', name: 'sales_prod', kind: 'snowflake', color: '#E89B52' },
    { id: 'events', name: 'events', kind: 'clickhouse', color: '#F2C265' },
    { id: 'mart', name: 'analytics_mart', kind: 'bigquery', color: '#B08CA8' },
  ];
  const current = dbs.find(d => d.id === value) || dbs[0];
  return (
    <div>
      <Label>Database</Label>
      <button
        onClick={() => setOpen(!open)}
        style={{
          all: 'unset',
          cursor: 'pointer',
          boxSizing: 'border-box',
          width: '100%',
          marginTop: 6,
          padding: '9px 12px',
          borderRadius: 8,
          border: '1px solid #1E1E22',
          background: open ? '#131317' : '#0D0D10',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          transition: 'all 160ms ease-out',
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: 99,
          background: current.color,
        }} />
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          color: '#EDEDEE',
          flex: 1,
        }}>{current.name}</span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#55555C',
        }}>{current.kind}</span>
      </button>
      {open && (
        <div style={{
          marginTop: 4,
          background: '#0D0D10',
          border: '1px solid #1E1E22',
          borderRadius: 8,
          padding: 4,
          animation: 'traceIn 180ms ease-out both',
        }}>
          {dbs.map(d => (
            <button
              key={d.id}
              onClick={() => { onChange(d.id); setOpen(false); }}
              style={{
                all: 'unset',
                cursor: 'pointer',
                boxSizing: 'border-box',
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                background: d.id === value ? '#16120B' : 'transparent',
              }}
              onMouseEnter={e => { if (d.id !== value) e.currentTarget.style.background = '#131317'; }}
              onMouseLeave={e => { if (d.id !== value) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 99, background: d.color }} />
              <span style={{ fontSize: 12.5, color: '#EDEDEE', flex: 1 }}>{d.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#55555C', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{d.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 9.5,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: '#55555C',
    }}>{children}</div>
  );
}

function Conversations() {
  const groups = [
    {
      label: 'Today',
      items: [
        { id: 'c1', title: 'Post 2014 IPL True Strike Rate', active: true },
        { id: 'c2', title: 'RCB Team Analysis' },
      ],
    },
    {
      label: 'Yesterday',
      items: [
        { id: 'c3', title: 'Toss decision · win %' },
        { id: 'c4', title: 'Death overs economy' },
      ],
    },
    {
      label: 'This week',
      items: [
        { id: 'c5', title: 'Fielder impact model v2' },
        { id: 'c6', title: 'Venue-adjusted averages' },
        { id: 'c7', title: 'Powerplay SR trends' },
      ],
    },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Label>Conversations</Label>
      {groups.map(g => (
        <div key={g.label}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#3E3E45',
            padding: '0 4px 4px',
          }}>{g.label}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {g.items.map(i => <ConvoItem key={i.id} item={i} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConvoItem({ item }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        padding: '6px 10px',
        borderRadius: 6,
        fontFamily: 'var(--font-body)',
        fontSize: 12.5,
        color: item.active ? '#EDEDEE' : (hover ? '#BDBDC4' : '#8A8A92'),
        background: item.active ? '#131317' : 'transparent',
        fontWeight: item.active ? 500 : 400,
        borderLeft: item.active ? '2px solid #E89B52' : '2px solid transparent',
        paddingLeft: item.active ? 8 : 10,
        transition: 'all 150ms ease-out',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'block',
      }}
      title={item.title}
    >
      {item.title}
    </button>
  );
}

function NewChatButton() {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        padding: '9px 12px',
        borderRadius: 8,
        border: '1px solid #1E1E22',
        background: hover ? '#131317' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'all 160ms ease-out',
      }}
    >
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: '#EDEDEE' }}>New conversation</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#55555C' }}>⌘ K</span>
    </button>
  );
}

window.Shell = Shell;
window.IconButton = IconButton;
