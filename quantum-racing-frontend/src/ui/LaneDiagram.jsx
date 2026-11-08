// Small top-down schematic of the three lanes, used on the How to play screen.
const LANE_X = [24, 60, 96];

export default function LaneDiagram({ walls = [], ghosts = [], car, gate = false, orb, arrow, faded = [] }) {
  return (
    <svg className="diagram" viewBox="0 0 120 96" aria-hidden="true">
      <rect x="6" y="0" width="108" height="96" fill="var(--road)" />
      <line x1="6" y1="0" x2="6" y2="96" className="d-edge" />
      <line x1="114" y1="0" x2="114" y2="96" className="d-edge" />
      <line x1="42" y1="0" x2="42" y2="96" className="d-dash" />
      <line x1="78" y1="0" x2="78" y2="96" className="d-dash" />

      {gate && (
        <g>
          <rect x="6" y="22" width="108" height="5" className="d-gate" />
          <rect x="2" y="18" width="5" height="13" className="d-gate" />
          <rect x="113" y="18" width="5" height="13" className="d-gate" />
        </g>
      )}

      {walls.map((l) => (
        <rect key={`w${l}`} x={LANE_X[l] - 14} y="20" width="28" height="9" className="d-wall" />
      ))}

      {orb !== undefined && <path d={`M${LANE_X[orb]} 38 l5 6 l-5 6 l-5 -6 Z`} className="d-orb" />}

      {ghosts.length > 1 && (
        <path
          d={`M${LANE_X[ghosts[0].lane]} 66 ${ghosts
            .slice(1)
            .map((g) => `Q${(LANE_X[g.lane] + LANE_X[g.lane - 1]) / 2} 58 ${LANE_X[g.lane]} 66`)
            .join(' ')}`}
          className="d-wave"
        />
      )}

      {ghosts.map((g) => (
        <g key={`g${g.lane}`} opacity={faded.includes(g.lane) ? 0.18 : 0.3 + g.p * 0.7}>
          <rect x={LANE_X[g.lane] - 7} y="68" width="14" height="20" rx="2" className="d-ghost" />
          <text x={LANE_X[g.lane]} y="95" className="d-label">
            {faded.includes(g.lane) ? '×' : `${Math.round(g.p * 100)}`}
          </text>
        </g>
      ))}

      {car !== undefined && <rect x={LANE_X[car] - 7} y="68" width="14" height="20" rx="2" className="d-car" />}

      {arrow && (
        <path
          d={arrow === 'right' ? 'M70 78 h16 m-5 -5 l5 5 l-5 5' : 'M50 78 h-16 m5 -5 l-5 5 l5 5'}
          className="d-arrow"
        />
      )}
    </svg>
  );
}
