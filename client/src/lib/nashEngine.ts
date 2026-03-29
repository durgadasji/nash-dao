/**
 * Nash Equilibrium Engine for DAO Governance
 *
 * Models a 2-player game between:
 *   - WHALE: large token holder (controls significant voting power)
 *   - RETAIL: small holders aggregate (many small voters)
 *
 * Strategies:
 *   - WHALE: "Vote" (participate) or "Abstain"
 *   - RETAIL: "Vote" (participate) or "Apathy" (not participate)
 *
 * Payoffs depend on:
 *   - Token concentration (Gini, whale share)
 *   - Turnout threshold (quorum)
 *   - Coordination costs
 *   - Proposal quality (expected value of passing)
 */

export interface TokenDistribution {
  whaleShare: number;       // 0-1, fraction of total tokens held by whale
  numRetailVoters: number;  // number of small retail token holders
  retailTurnoutRate: number; // 0-1, base probability retail voter participates
  quorumThreshold: number;  // 0-1, fraction of total supply needed to reach quorum
  votingCost: number;       // 0-1, relative cost of participating (gas, time, effort)
  proposalValue: number;    // expected value of a passing proposal (normalized 0-1)
  whaleAlignmentWithRetail: number; // -1=opposed, 0=neutral, 1=aligned
}

export interface PlayerPayoffs {
  whaleVoteRetailVote: [number, number];     // [whale, retail]
  whaleVoteRetailApathy: [number, number];
  whaleAbstainRetailVote: [number, number];
  whaleAbstainRetailApathy: [number, number];
}

export interface StrategyProfile {
  whaleProbVote: number;    // 0-1, mixed strategy probability whale votes
  retailProbVote: number;   // 0-1, mixed strategy probability retail votes
  equilibriumType: 'pure-both-vote' | 'pure-whale-dominates' | 'pure-mutual-apathy' | 'pure-retail-decides' | 'mixed';
  isNash: boolean;
}

export interface NashResult {
  payoffs: PlayerPayoffs;
  equilibria: StrategyProfile[];
  dominantStrategy: string;
  effectiveTurnout: number;
  quorumAchieved: boolean;
  whaleInfluenceRatio: number;     // whale votes / total votes
  retailCollectivePower: number;   // retail collective share
  giniCoefficient: number;
  powerIndex: number;              // Banzhaf-like power concentration index
  insights: Insight[];
}

export interface Insight {
  type: 'warning' | 'info' | 'success' | 'critical';
  title: string;
  body: string;
}

/**
 * Compute Gini coefficient from token shares.
 * Whale gets whaleShare, remaining split equally among retail.
 */
export function computeGini(whaleShare: number, numRetail: number): number {
  if (numRetail <= 0) return 1;
  const retailShare = (1 - whaleShare) / numRetail;
  const holdings = [whaleShare, ...Array(numRetail).fill(retailShare)].sort((a, b) => a - b);
  const n = holdings.length;
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * holdings[i];
  }
  return numerator / (n * holdings.reduce((a, b) => a + b, 0));
}

/**
 * Shapley-Shubik-inspired power index for the whale.
 * Measures probability whale is pivotal in a majority coalition.
 */
export function computePowerIndex(whaleShare: number): number {
  // Simplified: whale is pivotal when their vote swings the majority
  // With weight w and total 1.0, pivot at threshold 0.5
  if (whaleShare >= 0.5) return 1.0; // whale alone can pass anything
  // Power ≈ 2 * whaleShare when below 0.5 (linear approximation of Banzhaf)
  return Math.min(1, 2 * whaleShare);
}

/**
 * Compute payoff for whale given strategies.
 *
 * Whale payoff = expected_gain - voting_cost
 * expected_gain = f(proposal_value, alignment, quorum_achievability, vote_outcome)
 */
function whalePayoff(
  whaleVotes: boolean,
  retailParticipation: number, // fraction 0-1 of retail that votes
  dist: TokenDistribution
): number {
  const totalVotes = (whaleVotes ? dist.whaleShare : 0) + retailParticipation * (1 - dist.whaleShare);
  const quorumMet = totalVotes >= dist.quorumThreshold;

  if (!quorumMet) {
    // Proposal fails regardless — whale loses stake in ecosystem health
    const voteCostPenalty = whaleVotes ? dist.votingCost * 0.3 : 0;
    return -0.1 - voteCostPenalty; // ecosystem stagnation cost
  }

  // Whale voting power in this outcome
  const whaleVoteFraction = whaleVotes
    ? dist.whaleShare / totalVotes
    : 0;

  // If whale votes and has high concentration: high influence but at alignment risk
  const proposalOutcomeForWhale =
    dist.proposalValue * (0.5 + 0.5 * dist.whaleAlignmentWithRetail);

  // Expected value: influence * outcome - cost
  const gain = quorumMet ? proposalOutcomeForWhale * (0.4 + 0.6 * whaleVoteFraction) : 0;
  const cost = whaleVotes ? dist.votingCost * 0.5 : 0; // whale cost is lower relative to tokens

  return gain - cost;
}

/**
 * Retail payoff per individual retail voter.
 */
function retailPayoff(
  whaleVotes: boolean,
  retailVotes: boolean,
  retailParticipation: number,
  dist: TokenDistribution
): number {
  const whaleTokens = whaleVotes ? dist.whaleShare : 0;
  const retailTokensVoting = retailVotes ? retailParticipation * (1 - dist.whaleShare) : 0;
  const totalVotes = whaleTokens + retailTokensVoting;
  const quorumMet = totalVotes >= dist.quorumThreshold;

  if (!retailVotes) {
    // Abstaining retail voter: free-rider benefit if proposal passes anyway
    const freeRiderGain = quorumMet ? dist.proposalValue * 0.15 * (1 + dist.whaleAlignmentWithRetail * 0.5) : 0;
    return freeRiderGain;
  }

  if (!quorumMet) {
    return -dist.votingCost; // paid cost, got nothing
  }

  // Individual retail voter's fraction of total votes
  const individualRetailShare = (1 - dist.whaleShare) / dist.numRetailVoters;
  const votingRetailTotal = retailParticipation * (1 - dist.whaleShare);
  const individualInfluence = votingRetailTotal > 0 ? individualRetailShare / totalVotes : 0;

  // Whale alignment: if whale is opposed, retail gain from voting is higher (counterbalancing)
  const alignmentModifier = 1 - dist.whaleAlignmentWithRetail * 0.4;
  const gain = dist.proposalValue * alignmentModifier * (0.3 + 0.7 * individualInfluence * 100);

  return gain - dist.votingCost;
}

export function computeNash(dist: TokenDistribution): NashResult {
  // Four pure strategy combinations
  const retailFullParticipation = dist.retailTurnoutRate;
  const retailLowParticipation = dist.retailTurnoutRate * 0.1; // apathy scenario

  const wVrV: [number, number] = [
    whalePayoff(true, retailFullParticipation, dist),
    retailPayoff(true, true, retailFullParticipation, dist)
  ];
  const wVrA: [number, number] = [
    whalePayoff(true, retailLowParticipation, dist),
    retailPayoff(true, false, retailLowParticipation, dist)
  ];
  const wArV: [number, number] = [
    whalePayoff(false, retailFullParticipation, dist),
    retailPayoff(false, true, retailFullParticipation, dist)
  ];
  const wArA: [number, number] = [
    whalePayoff(false, retailLowParticipation, dist),
    retailPayoff(false, false, retailLowParticipation, dist)
  ];

  const payoffs: PlayerPayoffs = {
    whaleVoteRetailVote: wVrV,
    whaleVoteRetailApathy: wVrA,
    whaleAbstainRetailVote: wArV,
    whaleAbstainRetailApathy: wArA,
  };

  // Check Nash equilibrium conditions for each pure strategy profile
  // NE: no player can unilaterally improve by deviating
  const equilibria: StrategyProfile[] = [];

  // (Vote, Vote): whale prefers vote given retail votes if wVrV[0] >= wArV[0]
  //               retail prefers vote given whale votes if wVrV[1] >= wVrA[1] — NOTE: retail's choice fixes whale's strategy
  const isNeVoteVote =
    wVrV[0] >= wArV[0] && // whale: vote vs abstain when retail votes
    wVrV[1] >= wArV[1];   // retail: vote vs abstain when whale votes
  // Wait — retail comparison: retail chooses between vote (wVrV) and apathy (wArV changed to whale abstain when retail abstains)
  // Actually: given whale VOTES, retail compares wVrV[1] vs wVrA[1] (since if retail abstains, whale still votes)
  const isNeVV = wVrV[0] >= wArV[0] && wVrV[1] >= wVrA[1];
  const isNeVA = wVrA[0] >= wArA[0] && wVrA[1] >= wVrV[1];
  const isNeAV = wArV[0] >= wVrV[0] && wArV[1] >= wArA[1];
  const isNeAA = wArA[0] >= wVrA[0] && wArA[1] >= wArV[1];

  if (isNeVV) {
    equilibria.push({
      whaleProbVote: 1, retailProbVote: 1,
      equilibriumType: 'pure-both-vote', isNash: true
    });
  }
  if (isNeVA) {
    equilibria.push({
      whaleProbVote: 1, retailProbVote: 0,
      equilibriumType: 'pure-whale-dominates', isNash: true
    });
  }
  if (isNeAV) {
    equilibria.push({
      whaleProbVote: 0, retailProbVote: 1,
      equilibriumType: 'pure-retail-decides', isNash: true
    });
  }
  if (isNeAA) {
    equilibria.push({
      whaleProbVote: 0, retailProbVote: 0,
      equilibriumType: 'pure-mutual-apathy', isNash: true
    });
  }

  // Mixed Nash equilibrium: solve for probabilities that make each player indifferent
  // Whale indifferent: p_retail * wVrV[0] + (1-p_retail) * wVrA[0] = p_retail * wArV[0] + (1-p_retail) * wArA[0]
  // Solve: p_retail = (wArA[0] - wVrA[0]) / (wVrV[0] - wArV[0] - wVrA[0] + wArA[0])
  const denomWhale = (wVrV[0] - wArV[0]) - (wVrA[0] - wArA[0]);
  const denomRetail = (wVrV[1] - wVrA[1]) - (wArV[1] - wArA[1]);

  if (Math.abs(denomWhale) > 0.001 && Math.abs(denomRetail) > 0.001) {
    const mixedRetail = (wArA[0] - wVrA[0]) / denomWhale;
    const mixedWhale = (wArA[1] - wArV[1]) / denomRetail;

    if (mixedWhale > 0 && mixedWhale < 1 && mixedRetail > 0 && mixedRetail < 1) {
      equilibria.push({
        whaleProbVote: mixedWhale,
        retailProbVote: mixedRetail,
        equilibriumType: 'mixed',
        isNash: true
      });
    }
  }

  // Determine dominant strategy
  let dominantStrategy = 'No dominant strategy — strategic interdependence';
  const whaleDominatesVote = wVrV[0] > wArV[0] && wVrA[0] > wArA[0];
  const whaleDominatesAbstain = wArV[0] > wVrV[0] && wArA[0] > wVrA[0];
  const retailDominatesVote = wVrV[1] > wArV[1] && wVrA[1] > wArA[1]; // corrected
  const retailDominatesApathy = wArV[1] > wVrV[1] && wArA[1] > wVrA[1];

  if (whaleDominatesVote && retailDominatesVote) dominantStrategy = 'Dominant: Both vote — governance health optimal';
  else if (whaleDominatesVote && retailDominatesApathy) dominantStrategy = 'Dominant: Whale votes, retail free-rides — plutocratic equilibrium';
  else if (whaleDominatesAbstain && retailDominatesApathy) dominantStrategy = 'Dominant: Mutual apathy — governance collapse';
  else if (whaleDominatesVote) dominantStrategy = 'Whale dominant: always votes; retail strategy undetermined';
  else if (retailDominatesVote) dominantStrategy = 'Retail dominant: always vote; whale strategy undetermined';

  // Compute derived metrics
  const primaryEq = equilibria[0] ?? { whaleProbVote: 0.5, retailProbVote: dist.retailTurnoutRate };
  const effectiveTurnout = primaryEq.whaleProbVote * dist.whaleShare +
    primaryEq.retailProbVote * dist.retailTurnoutRate * (1 - dist.whaleShare);
  const quorumAchieved = effectiveTurnout >= dist.quorumThreshold;
  const whaleVotesInEq = primaryEq.whaleProbVote * dist.whaleShare;
  const retailVotesInEq = primaryEq.retailProbVote * dist.retailTurnoutRate * (1 - dist.whaleShare);
  const totalVotesInEq = whaleVotesInEq + retailVotesInEq;
  const whaleInfluenceRatio = totalVotesInEq > 0 ? whaleVotesInEq / totalVotesInEq : 0;
  const gini = computeGini(dist.whaleShare, dist.numRetailVoters);
  const powerIndex = computePowerIndex(dist.whaleShare);

  // Generate insights
  const insights: Insight[] = [];

  if (gini > 0.8) {
    insights.push({
      type: 'critical',
      title: 'Extreme token concentration',
      body: `Gini coefficient of ${gini.toFixed(3)} approaches full plutocracy. Single-whale dominance is structurally locked in regardless of retail behavior.`
    });
  } else if (gini > 0.6) {
    insights.push({
      type: 'warning',
      title: 'High inequality detected',
      body: `Gini of ${gini.toFixed(3)} means whale influence far exceeds proportional token weight due to coordination advantages.`
    });
  }

  if (!quorumAchieved) {
    insights.push({
      type: 'critical',
      title: 'Quorum failure at equilibrium',
      body: `Equilibrium turnout (${(effectiveTurnout * 100).toFixed(1)}%) falls below quorum threshold (${(dist.quorumThreshold * 100).toFixed(0)}%). Governance is structurally blocked.`
    });
  }

  if (equilibria.some(e => e.equilibriumType === 'pure-whale-dominates')) {
    insights.push({
      type: 'warning',
      title: 'Whale dominance equilibrium exists',
      body: 'A stable Nash equilibrium where only the whale participates — retail rational apathy becomes a fixed point. Lowering voting costs or adding retail incentives could break this.'
    });
  }

  if (equilibria.some(e => e.equilibriumType === 'pure-mutual-apathy')) {
    insights.push({
      type: 'critical',
      title: 'Mutual apathy trap',
      body: 'Neither whale nor retail has incentive to vote unilaterally — a coordination failure. This is a governance death spiral. Mechanism redesign required.'
    });
  }

  if (equilibria.some(e => e.equilibriumType === 'mixed')) {
    const mixedEq = equilibria.find(e => e.equilibriumType === 'mixed')!;
    insights.push({
      type: 'info',
      title: 'Mixed strategy equilibrium',
      body: `Players randomize: whale votes with probability ${(mixedEq.whaleProbVote * 100).toFixed(1)}%, retail with ${(mixedEq.retailProbVote * 100).toFixed(1)}%. This is unstable — small parameter shifts can tip to a pure equilibrium.`
    });
  }

  if (whaleInfluenceRatio > 0.7 && quorumAchieved) {
    insights.push({
      type: 'warning',
      title: 'Effective plutocracy',
      body: `Whale controls ${(whaleInfluenceRatio * 100).toFixed(1)}% of active votes at equilibrium. Nominal decentralization masks concentrated decision power.`
    });
  }

  if (dist.whaleAlignmentWithRetail < -0.3) {
    insights.push({
      type: 'warning',
      title: 'Adversarial whale alignment',
      body: 'Whale interests are misaligned with retail. Passing proposals may extract value from small holders. Governance attack vector is elevated.'
    });
  }

  if (equilibria.some(e => e.equilibriumType === 'pure-both-vote')) {
    insights.push({
      type: 'success',
      title: 'Healthy participation equilibrium',
      body: 'Stable Nash equilibrium where both whale and retail vote. This is the governance-optimal outcome — proposals reflect broad token-holder consensus.'
    });
  }

  if (dist.votingCost > 0.6) {
    insights.push({
      type: 'info',
      title: 'High voting friction',
      body: 'Elevated voting cost pushes rational retail holders toward apathy. Gas abstraction, snapshot voting, or participation incentives would shift equilibrium.'
    });
  }

  return {
    payoffs,
    equilibria: equilibria.length > 0 ? equilibria : [{
      whaleProbVote: 0.5,
      retailProbVote: 0.5,
      equilibriumType: 'mixed',
      isNash: false
    }],
    dominantStrategy,
    effectiveTurnout,
    quorumAchieved,
    whaleInfluenceRatio,
    retailCollectivePower: 1 - dist.whaleShare,
    giniCoefficient: gini,
    powerIndex,
    insights,
  };
}

export const PRESETS: Record<string, { label: string; description: string; dist: TokenDistribution }> = {
  healthyDao: {
    label: 'Healthy DAO',
    description: 'Balanced token distribution, low costs, aligned incentives',
    dist: {
      whaleShare: 0.18,
      numRetailVoters: 500,
      retailTurnoutRate: 0.45,
      quorumThreshold: 0.20,
      votingCost: 0.15,
      proposalValue: 0.70,
      whaleAlignmentWithRetail: 0.6,
    }
  },
  whaleCapture: {
    label: 'Whale Capture',
    description: 'Single entity controls majority, retail disenfranchised',
    dist: {
      whaleShare: 0.52,
      numRetailVoters: 2000,
      retailTurnoutRate: 0.08,
      quorumThreshold: 0.10,
      votingCost: 0.45,
      proposalValue: 0.60,
      whaleAlignmentWithRetail: -0.5,
    }
  },
  apathySpiral: {
    label: 'Apathy Spiral',
    description: 'High coordination costs cause governance collapse',
    dist: {
      whaleShare: 0.25,
      numRetailVoters: 5000,
      retailTurnoutRate: 0.04,
      quorumThreshold: 0.30,
      votingCost: 0.75,
      proposalValue: 0.40,
      whaleAlignmentWithRetail: 0.1,
    }
  },
  plutocraticEquilibrium: {
    label: 'Plutocratic Equilibrium',
    description: 'Moderate concentration, retail free-rides on whale',
    dist: {
      whaleShare: 0.38,
      numRetailVoters: 1200,
      retailTurnoutRate: 0.12,
      quorumThreshold: 0.15,
      votingCost: 0.35,
      proposalValue: 0.65,
      whaleAlignmentWithRetail: 0.2,
    }
  },
  coordinatedRetail: {
    label: 'Coordinated Retail',
    description: 'High retail participation overcomes whale concentration',
    dist: {
      whaleShare: 0.30,
      numRetailVoters: 3000,
      retailTurnoutRate: 0.65,
      quorumThreshold: 0.25,
      votingCost: 0.10,
      proposalValue: 0.75,
      whaleAlignmentWithRetail: -0.3,
    }
  },
};
