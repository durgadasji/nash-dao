import { useState, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Cell, ScatterChart, Scatter, Tooltip as RechartsTooltip
} from "recharts";
import {
  computeNash,
  TokenDistribution,
  PRESETS,
  type NashResult,
  type StrategyProfile,
} from "@/lib/nashEngine";
import { Info, Zap, AlertTriangle, CheckCircle2, ChevronRight, BarChart2 } from "lucide-react";

// ─── Colour palette ─────────────────────────────────────────────────────────
const C = {
  whale:    "hsl(248 85% 68%)",
  retail:   "hsl(172 66% 50%)",
  warning:  "hsl(38 92% 55%)",
  critical: "hsl(355 75% 60%)",
  success:  "hsl(142 60% 48%)",
  neutral:  "hsl(215 10% 48%)",
  surface:  "hsl(222 18% 11%)",
  border:   "hsl(222 14% 18%)",
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const pct = (v: number, decimals = 1) => `${(v * 100).toFixed(decimals)}%`;
const fmt = (v: number, decimals = 3) => v.toFixed(decimals);
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function insightColor(type: string) {
  if (type === "critical") return C.critical;
  if (type === "warning")  return C.warning;
  if (type === "success")  return C.success;
  return "hsl(210 15% 55%)";
}

function insightIcon(type: string) {
  if (type === "critical") return <AlertTriangle size={13} />;
  if (type === "warning")  return <AlertTriangle size={13} />;
  if (type === "success")  return <CheckCircle2 size={13} />;
  return <Info size={13} />;
}

function equilibriumColor(type: string) {
  if (type === "pure-both-vote")      return C.success;
  if (type === "pure-whale-dominates") return C.whale;
  if (type === "pure-mutual-apathy")  return C.critical;
  if (type === "pure-retail-decides") return C.retail;
  return C.warning;
}

function equilibriumLabel(type: string) {
  if (type === "pure-both-vote")      return "Both Vote";
  if (type === "pure-whale-dominates") return "Whale Dominates";
  if (type === "pure-mutual-apathy")  return "Mutual Apathy";
  if (type === "pure-retail-decides") return "Retail Decides";
  return "Mixed Strategy";
}

// ─── Slider control ─────────────────────────────────────────────────────────
interface SliderRowProps {
  label: string;
  tooltip: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  accent: string;
  onChange: (v: number) => void;
}

function SliderRow({ label, tooltip, value, min, max, step, display, accent, onChange }: SliderRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground/80">{label}</span>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info size={11} className="text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[200px] text-xs">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <span
          className="text-xs font-mono font-semibold tabular-nums"
          style={{ color: accent }}
        >
          {display}
        </span>
      </div>
      <Slider
        data-testid={`slider-${label.toLowerCase().replace(/\s+/g, "-")}`}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
        style={{ "--accent-color": accent } as React.CSSProperties}
      />
    </div>
  );
}

// ─── Payoff Matrix ───────────────────────────────────────────────────────────
function PayoffMatrix({ result, nash }: { result: NashResult; nash: NashResult }) {
  const { payoffs } = result;
  const cells = [
    { r: 0, c: 0, whale: payoffs.whaleVoteRetailVote[0],   retail: payoffs.whaleVoteRetailVote[1],   isNE: nash.equilibria.some(e => e.equilibriumType === "pure-both-vote") },
    { r: 0, c: 1, whale: payoffs.whaleVoteRetailApathy[0],  retail: payoffs.whaleVoteRetailApathy[1],  isNE: nash.equilibria.some(e => e.equilibriumType === "pure-whale-dominates") },
    { r: 1, c: 0, whale: payoffs.whaleAbstainRetailVote[0], retail: payoffs.whaleAbstainRetailVote[1], isNE: nash.equilibria.some(e => e.equilibriumType === "pure-retail-decides") },
    { r: 1, c: 1, whale: payoffs.whaleAbstainRetailApathy[0], retail: payoffs.whaleAbstainRetailApathy[1], isNE: nash.equilibria.some(e => e.equilibriumType === "pure-mutual-apathy") },
  ];

  return (
    <div data-testid="payoff-matrix" className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payoff Matrix</div>
      <div className="relative">
        {/* Column headers */}
        <div className="grid grid-cols-3 gap-px mb-px">
          <div /> {/* top-left empty */}
          <div className="text-center text-xs py-1.5 font-medium rounded-t" style={{ color: C.retail, background: "hsl(172 40% 12%)" }}>Retail: Vote</div>
          <div className="text-center text-xs py-1.5 font-medium rounded-t" style={{ color: C.retail, background: "hsl(172 20% 10%)" }}>Retail: Apathy</div>
        </div>
        {/* Rows */}
        {[0, 1].map(row => (
          <div key={row} className="grid grid-cols-3 gap-px mb-px">
            <div
              className="flex items-center justify-center text-xs font-medium py-3 rounded-l"
              style={{ color: C.whale, background: row === 0 ? "hsl(248 40% 12%)" : "hsl(248 20% 10%)" }}
            >
              {row === 0 ? "Whale: Vote" : "Whale: Abstain"}
            </div>
            {[0, 1].map(col => {
              const cell = cells[row * 2 + col];
              const isNE = cell.isNE;
              return (
                <div
                  key={col}
                  data-testid={`matrix-cell-${row}-${col}`}
                  className="relative matrix-cell flex flex-col items-center gap-1 transition-all"
                  style={{
                    background: isNE ? "hsl(248 30% 14%)" : C.surface,
                    border: isNE ? `1px solid hsl(248 85% 68% / 0.4)` : `1px solid transparent`,
                  }}
                >
                  <div className="flex gap-2 text-xs font-mono-data">
                    <span style={{ color: C.whale }}>{fmt(cell.whale)}</span>
                    <span className="text-muted-foreground">/</span>
                    <span style={{ color: C.retail }}>{fmt(cell.retail)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px]" style={{ color: C.whale }}>W</span>
                    <span className="text-[10px]" style={{ color: C.retail }}>R</span>
                    {isNE && (
                      <span className="text-[9px] px-1 py-0.5 rounded font-bold leading-none" style={{ background: C.whale, color: "hsl(222 20% 8%)" }}>NE</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: C.whale }} />
          Whale payoff
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: C.retail }} />
          Retail payoff
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[10px] px-1 rounded" style={{ background: C.whale, color: "hsl(222 20% 8%)" }}>NE</span>
          Nash Equilibrium
        </span>
      </div>
    </div>
  );
}

// ─── Radar chart for governance health ──────────────────────────────────────
function GovernanceRadar({ result, dist }: { result: NashResult; dist: TokenDistribution }) {
  const data = [
    { metric: "Participation", value: result.effectiveTurnout * 100 },
    { metric: "Decentralization", value: (1 - result.giniCoefficient) * 100 },
    { metric: "Retail Power", value: result.retailCollectivePower * (dist.retailTurnoutRate) * 100 },
    { metric: "Alignment", value: ((dist.whaleAlignmentWithRetail + 1) / 2) * 100 },
    { metric: "Quorum Safety", value: result.quorumAchieved ? Math.min(100, (result.effectiveTurnout / dist.quorumThreshold) * 60) : 15 },
    { metric: "Low Cost", value: (1 - dist.votingCost) * 100 },
  ];

  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
          <PolarGrid stroke={C.border} />
          <PolarAngleAxis
            dataKey="metric"
            tick={{ fill: "hsl(215 10% 55%)", fontSize: 10 }}
          />
          <Radar
            name="Health"
            dataKey="value"
            stroke={C.whale}
            fill={C.whale}
            fillOpacity={0.18}
            strokeWidth={1.5}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Equilibrium strategy chart ──────────────────────────────────────────────
function StrategyMixChart({ equilibria }: { equilibria: StrategyProfile[] }) {
  const data = equilibria.map(eq => ({
    name: equilibriumLabel(eq.equilibriumType),
    whale: Math.round(eq.whaleProbVote * 100),
    retail: Math.round(eq.retailProbVote * 100),
    color: equilibriumColor(eq.equilibriumType),
  }));

  return (
    <div className="h-[160px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="30%" margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "hsl(215 10% 50%)", fontSize: 9 }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: "hsl(215 10% 50%)", fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
          <RechartsTooltip
            contentStyle={{ background: "hsl(222 18% 11%)", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: "hsl(210 15% 70%)" }}
            formatter={(v: number, name: string) => [`${v}%`, name === "whale" ? "Whale vote prob." : "Retail vote prob."]}
          />
          <Bar dataKey="whale" name="whale" fill={C.whale} radius={[2, 2, 0, 0]} />
          <Bar dataKey="retail" name="retail" fill={C.retail} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Power scatter ────────────────────────────────────────────────────────────
function PowerScatterPlot({ dist, result }: { dist: TokenDistribution; result: NashResult }) {
  const points = [
    { x: dist.whaleShare * 100, y: result.whaleInfluenceRatio * 100, label: "Whale", fill: C.whale },
    { x: (1 - dist.whaleShare) * 100, y: (1 - result.whaleInfluenceRatio) * 100, label: "Retail", fill: C.retail },
  ];

  return (
    <div className="h-[140px]">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis
            dataKey="x" type="number" domain={[0, 100]}
            tick={{ fill: "hsl(215 10% 50%)", fontSize: 9 }}
            tickLine={false} axisLine={false}
            label={{ value: "Token %", fill: "hsl(215 10% 45%)", fontSize: 9, position: "insideBottomRight", offset: -4 }}
          />
          <YAxis
            dataKey="y" type="number" domain={[0, 100]}
            tick={{ fill: "hsl(215 10% 50%)", fontSize: 9 }}
            tickLine={false} axisLine={false}
            label={{ value: "Vote %", fill: "hsl(215 10% 45%)", fontSize: 9, angle: -90, position: "insideLeft", offset: 12 }}
          />
          <RechartsTooltip
            contentStyle={{ background: "hsl(222 18% 11%)", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }}
            formatter={(v: number, name: string, props: any) => [`${v.toFixed(1)}%`, props?.payload?.label || name]}
          />
          {points.map((p) => (
            <Scatter
              key={p.label}
              name={p.label}
              data={[p]}
              fill={p.fill}
            />
          ))}
          {/* Diagonal reference line: if token% = vote%, power is proportional */}
          {/* Rendered as SVG overlay — can't easily do in recharts without custom */}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color, testId }: {
  label: string; value: string; sub?: string; color: string; testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg p-3 flex flex-col gap-1"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold font-mono-data leading-none" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ─── Main Simulator ───────────────────────────────────────────────────────────
export default function Simulator() {
  const [dist, setDist] = useState<TokenDistribution>(PRESETS.healthyDao.dist);
  const [activePreset, setActivePreset] = useState<string>("healthyDao");

  const result = useMemo(() => computeNash(dist), [dist]);

  function setField<K extends keyof TokenDistribution>(key: K, val: TokenDistribution[K]) {
    setDist(prev => ({ ...prev, [key]: val }));
    setActivePreset("");
  }

  function applyPreset(key: string) {
    setDist(PRESETS[key].dist);
    setActivePreset(key);
  }

  const primaryEq = result.equilibria[0];
  const eqColor = equilibriumColor(primaryEq?.equilibriumType ?? "mixed");

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* ── Left Panel: Controls ─────────────────────────────────── */}
      <aside
        className="w-[260px] flex-shrink-0 flex flex-col border-r overflow-y-auto"
        style={{ borderColor: C.border }}
      >
        {/* Logo + title */}
        <div className="p-4 border-b flex items-center gap-3" style={{ borderColor: C.border }}>
          <svg aria-label="Nash DAO Logo" viewBox="0 0 32 32" width="28" height="28" fill="none">
            {/* Two overlapping circles = game theory / intersection */}
            <circle cx="11" cy="16" r="9" stroke="hsl(248 85% 68%)" strokeWidth="1.5" fill="none" opacity="0.9" />
            <circle cx="21" cy="16" r="9" stroke="hsl(172 66% 50%)" strokeWidth="1.5" fill="none" opacity="0.9" />
            {/* Intersection filled */}
            <path d="M16 8.1C18.2 10 19.8 12.8 19.8 16C19.8 19.2 18.2 22 16 23.9C13.8 22 12.2 19.2 12.2 16C12.2 12.8 13.8 10 16 8.1Z" fill="hsl(248 85% 68%)" fillOpacity="0.25" />
            {/* Center dot */}
            <circle cx="16" cy="16" r="1.5" fill="hsl(210 15% 88%)" />
          </svg>
          <div>
            <div className="text-sm font-bold tracking-tight leading-none">Nash DAO</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Equilibrium Simulator</div>
          </div>
        </div>

        {/* Presets */}
        <div className="p-3 border-b" style={{ borderColor: C.border }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Scenario Presets</div>
          <div className="space-y-1">
            {Object.entries(PRESETS).map(([key, preset]) => (
              <button
                key={key}
                data-testid={`preset-${key}`}
                onClick={() => applyPreset(key)}
                className="w-full text-left px-2 py-1.5 rounded text-xs transition-all flex items-center justify-between group"
                style={{
                  background: activePreset === key ? "hsl(248 40% 16%)" : "transparent",
                  color: activePreset === key ? "hsl(248 85% 80%)" : "hsl(215 10% 55%)",
                  border: `1px solid ${activePreset === key ? "hsl(248 85% 68% / 0.3)" : "transparent"}`,
                }}
              >
                <span>{preset.label}</span>
                <ChevronRight size={10} className="opacity-0 group-hover:opacity-60 transition-opacity" />
              </button>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex-1 p-3 space-y-4 overflow-y-auto">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: C.whale }}>
              Token Distribution
            </div>
            <div className="space-y-4">
              <SliderRow
                label="Whale Token Share"
                tooltip="Fraction of total token supply controlled by the whale actor"
                value={dist.whaleShare}
                min={0.05} max={0.80} step={0.01}
                display={pct(dist.whaleShare)}
                accent={C.whale}
                onChange={v => setField("whaleShare", v)}
              />
              <SliderRow
                label="Retail Voter Count"
                tooltip="Number of distinct small token holders"
                value={dist.numRetailVoters}
                min={10} max={10000} step={10}
                display={dist.numRetailVoters.toLocaleString()}
                accent={C.retail}
                onChange={v => setField("numRetailVoters", v)}
              />
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: C.retail }}>
              Participation & Costs
            </div>
            <div className="space-y-4">
              <SliderRow
                label="Base Retail Turnout"
                tooltip="Baseline probability that any retail voter participates (before strategic considerations)"
                value={dist.retailTurnoutRate}
                min={0.01} max={0.95} step={0.01}
                display={pct(dist.retailTurnoutRate)}
                accent={C.retail}
                onChange={v => setField("retailTurnoutRate", v)}
              />
              <SliderRow
                label="Quorum Threshold"
                tooltip="Minimum fraction of total supply required for a valid vote"
                value={dist.quorumThreshold}
                min={0.05} max={0.60} step={0.01}
                display={pct(dist.quorumThreshold)}
                accent="hsl(215 10% 60%)"
                onChange={v => setField("quorumThreshold", v)}
              />
              <SliderRow
                label="Voting Cost"
                tooltip="Normalized friction of participating (gas, time, delegation complexity). 0 = free, 1 = prohibitive"
                value={dist.votingCost}
                min={0.00} max={1.00} step={0.01}
                display={pct(dist.votingCost)}
                accent={C.warning}
                onChange={v => setField("votingCost", v)}
              />
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "hsl(215 10% 55%)" }}>
              Proposal Dynamics
            </div>
            <div className="space-y-4">
              <SliderRow
                label="Proposal Value"
                tooltip="Expected positive value of a passing proposal for token holders (normalized)"
                value={dist.proposalValue}
                min={0.10} max={1.00} step={0.01}
                display={pct(dist.proposalValue)}
                accent={C.success}
                onChange={v => setField("proposalValue", v)}
              />
              <SliderRow
                label="Whale↔Retail Alignment"
                tooltip="-1 = adversarial (whale extracts from retail), 0 = neutral, +1 = fully aligned interests"
                value={(dist.whaleAlignmentWithRetail + 1) / 2}
                min={0.00} max={1.00} step={0.01}
                display={dist.whaleAlignmentWithRetail >= 0 ? `+${fmt(dist.whaleAlignmentWithRetail, 2)}` : fmt(dist.whaleAlignmentWithRetail, 2)}
                accent={dist.whaleAlignmentWithRetail >= 0 ? C.success : C.critical}
                onChange={v => setField("whaleAlignmentWithRetail", clamp(v * 2 - 1, -1, 1))}
              />
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header bar */}
        <header
          className="h-10 flex items-center gap-4 px-4 border-b flex-shrink-0"
          style={{ borderColor: C.border }}
        >
          <div className="flex items-center gap-2">
            <Zap size={12} style={{ color: C.whale }} />
            <span className="text-xs text-muted-foreground">Equilibrium:</span>
            <div className="flex gap-1.5">
              {result.equilibria.map((eq, i) => (
                <span
                  key={i}
                  data-testid={`eq-badge-${i}`}
                  className="equilibrium-badge nash-active"
                  style={{
                    background: `${equilibriumColor(eq.equilibriumType)}22`,
                    color: equilibriumColor(eq.equilibriumType),
                    border: `1px solid ${equilibriumColor(eq.equilibriumType)}44`,
                  }}
                >
                  {equilibriumLabel(eq.equilibriumType)}
                </span>
              ))}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
            <span data-testid="dominant-strategy" className="max-w-[420px] truncate">{result.dominantStrategy}</span>
          </div>
        </header>

        {/* Body — 3 column grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-4 h-full" style={{ gridTemplateRows: "auto auto 1fr" }}>

            {/* ── Row 1: KPIs ───────────────────────────────────── */}
            <div className="col-span-3 grid grid-cols-6 gap-3">
              <KPICard
                testId="kpi-turnout"
                label="Equilibrium Turnout"
                value={pct(result.effectiveTurnout)}
                sub="of total supply"
                color={result.effectiveTurnout >= 0.3 ? C.success : result.effectiveTurnout >= 0.1 ? C.warning : C.critical}
              />
              <KPICard
                testId="kpi-quorum"
                label="Quorum Status"
                value={result.quorumAchieved ? "Achieved" : "Failed"}
                sub={`threshold: ${pct(dist.quorumThreshold)}`}
                color={result.quorumAchieved ? C.success : C.critical}
              />
              <KPICard
                testId="kpi-whale-influence"
                label="Whale Vote Share"
                value={pct(result.whaleInfluenceRatio)}
                sub="of active votes"
                color={result.whaleInfluenceRatio > 0.6 ? C.critical : result.whaleInfluenceRatio > 0.4 ? C.warning : C.success}
              />
              <KPICard
                testId="kpi-gini"
                label="Gini Coefficient"
                value={result.giniCoefficient.toFixed(3)}
                sub="token inequality"
                color={result.giniCoefficient > 0.7 ? C.critical : result.giniCoefficient > 0.5 ? C.warning : C.success}
              />
              <KPICard
                testId="kpi-power-index"
                label="Whale Power Index"
                value={result.powerIndex.toFixed(3)}
                sub="Banzhaf-like pivot"
                color={result.powerIndex > 0.7 ? C.critical : result.powerIndex > 0.4 ? C.whale : C.success}
              />
              <KPICard
                testId="kpi-equilibria-count"
                label="Nash Equilibria"
                value={String(result.equilibria.length)}
                sub={result.equilibria.some(e => e.equilibriumType === "mixed") ? "incl. mixed" : "pure strategy"}
                color={C.whale}
              />
            </div>

            {/* ── Row 2+: Main panels ────────────────────────────── */}

            {/* Payoff Matrix */}
            <div
              className="rounded-lg p-4"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}
            >
              <PayoffMatrix result={result} nash={result} />
              <div className="mt-4">
                <StrategyMixChart equilibria={result.equilibria} />
                <div className="text-[10px] text-muted-foreground text-center mt-1">Strategy probabilities at each Nash equilibrium</div>
              </div>
            </div>

            {/* Governance Radar */}
            <div
              className="rounded-lg p-4 flex flex-col"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}
            >
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Governance Health</div>
              <GovernanceRadar result={result} dist={dist} />
              <div className="mt-3 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Token vs Vote Power</div>
                <PowerScatterPlot dist={dist} result={result} />
                <div className="text-[10px] text-muted-foreground text-center">Diagonal = proportional power. Deviation = concentration</div>
              </div>
            </div>

            {/* Insights panel */}
            <div
              className="rounded-lg p-4 flex flex-col overflow-y-auto"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}
            >
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <BarChart2 size={11} />
                Analysis
              </div>

              {/* Equilibrium detail */}
              <div className="space-y-2 mb-4">
                {result.equilibria.map((eq, i) => (
                  <div
                    key={i}
                    data-testid={`eq-detail-${i}`}
                    className="rounded p-3 space-y-2"
                    style={{
                      background: `${equilibriumColor(eq.equilibriumType)}0f`,
                      border: `1px solid ${equilibriumColor(eq.equilibriumType)}30`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: equilibriumColor(eq.equilibriumType) }}>
                        {equilibriumLabel(eq.equilibriumType)}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[9px] h-4"
                        style={{ borderColor: `${equilibriumColor(eq.equilibriumType)}40`, color: equilibriumColor(eq.equilibriumType) }}
                      >
                        {eq.equilibriumType === "mixed" ? "Mixed" : "Pure"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Whale votes: </span>
                        <span className="font-mono-data" style={{ color: C.whale }}>{pct(eq.whaleProbVote)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Retail votes: </span>
                        <span className="font-mono-data" style={{ color: C.retail }}>{pct(eq.retailProbVote)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Insights */}
              <div className="space-y-2 overflow-y-auto flex-1">
                {result.insights.map((insight, i) => (
                  <div
                    key={i}
                    data-testid={`insight-${i}`}
                    className="rounded p-2.5 space-y-1"
                    style={{
                      background: `${insightColor(insight.type)}0c`,
                      border: `1px solid ${insightColor(insight.type)}28`,
                    }}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: insightColor(insight.type) }}>
                      {insightIcon(insight.type)}
                      {insight.title}
                    </div>
                    <p className="text-[11px] leading-relaxed" style={{ color: "hsl(210 8% 58%)" }}>
                      {insight.body}
                    </p>
                  </div>
                ))}
                {result.insights.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-4">
                    No notable governance signals detected
                  </div>
                )}
              </div>
            </div>

            {/* ── Row 3: Best-response deviation analysis ──── */}
            <div
              className="col-span-3 rounded-lg p-4"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Best-Response Deviation Analysis
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Each card shows one player's incentive to deviate unilaterally, holding the other player's strategy fixed
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  {
                    scenario: "Whale: Vote vs. Abstain",
                    fromAction: "Vote",
                    toAction: "Abstain",
                    delta: result.payoffs.whaleAbstainRetailVote[0] - result.payoffs.whaleVoteRetailVote[0],
                    context: "Retail is voting — should whale deviate to abstain?",
                    actor: "whale"
                  },
                  {
                    scenario: "Whale: Abstain vs. Vote",
                    fromAction: "Abstain",
                    toAction: "Vote",
                    delta: result.payoffs.whaleVoteRetailApathy[0] - result.payoffs.whaleAbstainRetailApathy[0],
                    context: "Retail is apathetic — should whale deviate to vote?",
                    actor: "whale"
                  },
                  {
                    scenario: "Retail: Vote vs. Apathy",
                    fromAction: "Vote",
                    toAction: "Apathy",
                    delta: result.payoffs.whaleVoteRetailApathy[1] - result.payoffs.whaleVoteRetailVote[1],
                    context: "Whale is voting — should retail deviate to apathy?",
                    actor: "retail"
                  },
                  {
                    scenario: "Retail: Apathy vs. Vote",
                    fromAction: "Apathy",
                    toAction: "Vote",
                    delta: result.payoffs.whaleAbstainRetailVote[1] - result.payoffs.whaleAbstainRetailApathy[1],
                    context: "Whale is abstaining — should retail deviate to vote?",
                    actor: "retail"
                  },
                ].map((d, i) => {
                  const color = d.delta > 0.01 ? C.critical : d.delta < -0.01 ? C.success : C.neutral;
                  const actorColor = d.actor === "whale" ? C.whale : C.retail;
                  return (
                    <div
                      key={i}
                      data-testid={`deviation-${i}`}
                      className="rounded p-3 space-y-1.5"
                      style={{ background: "hsl(222 20% 8%)", border: `1px solid ${C.border}` }}
                    >
                      <div className="text-xs font-medium" style={{ color: actorColor }}>{d.scenario}</div>
                      <div className="text-[10px] text-muted-foreground leading-relaxed">{d.context}</div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-base font-bold font-mono-data" style={{ color }}>
                          {d.delta > 0 ? "+" : ""}{d.delta.toFixed(3)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">Δ payoff from deviating</span>
                      </div>
                      <div className="text-[10px] font-medium" style={{ color }}>
                        {d.delta > 0.01 ? `Wants to switch to ${d.toAction}` : d.delta < -0.01 ? `Stable — no gain from ${d.toAction}` : "Indifferent"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
