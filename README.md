# Nash Equilibrium Simulator for DAO Governance

An interactive game-theory simulator for token-weighted DAO voting. It models governance as a two-player game between a large token holder and the aggregate of small holders, solves for the Nash equilibria, and shows when rational self-interest produces healthy participation, whale capture, or a turnout collapse.

This was an early step in an evolving line of work on visualizing equilibrium dynamics; it stands as an exploratory tool rather than a finished instrument.

## The game it models

Two players choose whether to participate:

- **Whale:** a large token holder, choosing to *vote* or *abstain*.
- **Retail:** the aggregate of many small holders, choosing to *vote* or stay in *apathy*.

Each player's payoff depends on token concentration (the whale's share), the retail turnout rate, the quorum threshold, the cost of voting (gas, time, effort), the expected value of a passing proposal, and how aligned the whale's interests are with retail's. A retail voter who abstains can still free-ride on a proposal that passes anyway; a bloc that pays the voting cost but misses quorum gets nothing. Those tensions are what set the equilibrium.

## What it computes

For a given distribution the engine evaluates all four pure-strategy combinations, tests each for the Nash condition (no player gains by deviating alone), and solves for a mixed equilibrium where players randomize. It classifies the outcome (both vote, whale dominates, mutual apathy, retail decides, or mixed) and reports the derived structure: effective turnout against quorum, the whale's share of active votes, the Gini coefficient of the token distribution, and a Banzhaf-style power index for how often the whale is pivotal. It then surfaces plain-language readings of the danger states: extreme concentration, quorum failure, a whale-dominance fixed point, the mutual-apathy trap, effective plutocracy behind nominal decentralization, and adversarial whale alignment.

## Presets

Five starting distributions frame the space: Healthy DAO, Whale Capture, Apathy Spiral, Plutocratic Equilibrium, and Coordinated Retail (where high small-holder turnout overcomes concentration).

## Running it

    npm install
    npm run dev      # Express + Vite dev server on localhost
    npm run build    # production build
    npm start        # run the production build

The simulator runs entirely in the browser; the Express server is a thin static host, and the project deploys as a single-page app on Vercel.

## Structure

- `client/src/lib/nashEngine.ts`, the model: payoffs, the pure and mixed equilibrium solver, the Gini and power-index computations, and the insight rules.
- `client/src/pages/Simulator.tsx`, the interface: the distribution controls and the equilibrium readout.
- `server/`, the Express/Vite host; `shared/schema.ts`, shared types.
