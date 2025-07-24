# BonkBoxes Backend

BonkBoxes is a backend system for a provably fair lottery/jackpot mechanism tied to a Solana token launched via Meteora's Dynamic Bonding Curve (DBC). The system periodically runs draws where holders of the token compete for a prize pool funded by trading fees. Fees are claimed, swapped to BONK tokens, and distributed to winners. The entire process is designed to be transparent and verifiable.

## Key Features
- **Automated Draws**: Runs every 30 minutes using a cron job.
- **Provably Fair Randomness**: Uses Orao VRF for verifiable random number generation.
- **Fee Management**: Claims fees from DBC (or DAMM v2 post-migration), swaps SOL to BONK via Jupiter, and distributes prizes.
- **Real-Time Updates**: Express API with WebSocket broadcasting for frontend integration (e.g., jackpot value, draw status).
- **Database Storage**: Saves draw results to Postgres for history and verification.
- **Migration Support**: Mode switching for DBC to DAMM v2 fee claiming.

## Architecture Overview

The backend is a Node.js application using Express for API routes, cron jobs for scheduling, and various services for modular logic. Everything runs in a single process for simplicity.

### Main Components
- **Services** (`src/services/`): Core logic modules.
  - `drawEngine.ts`: Orchestrates the full draw process.
  - `feeManagerService.ts`: Checks/claims fees (supports DBC and DAMM v2 modes).
  - `holderSnapshotService.ts`: Snapshots token holders and calculates tickets/ranges.
  - `jupiterService.ts`: Swaps SOL to BONK using Jupiter API.
  - `storageService.ts`: Saves draw results to Postgres.
  - `vrfService.ts`: Handles Orao VRF requests and fulfillment.
  - `winnerService.ts`: Selects winner and distributes prizes.
- **State Management** (`src/state/`): In-memory state for draw lifecycle (e.g., WAITING, EXECUTING).
- **Jobs** (`src/jobs/`): Cron-based scheduling (e.g., `drawExecution.ts` checks and runs draws).
- **API Routes** (`src/api/routes/`): Endpoints for frontend (e.g., fees, draw status) with WebSocket broadcasts.
- **Entry Point** (`src/core.ts`): Imports and starts everything (server, jobs).

### Tech Stack
- **Node.js/Express**: API server.
- **Postgres (Neon/Vercel)**: Database for draw history.
- **Cron (node-cron)**: Scheduling.
- **WebSockets (ws)**: Real-time updates.
- **SDKs**: `@meteora-ag/dynamic-bonding-curve-sdk`, `@meteora-ag/cp-amm-sdk`, `@orao-network/solana-vrf`, `@solana/web3.js`, `@solana/spl-token`, `@coral-xyz/anchor`.
- **Other**: `bn.js` for big numbers, `dotenv` for env vars.

## System Lifecycle

The system runs on a 30-minute draw cycle, managed by state transitions and cron jobs. Here's the flow:

1. **Initialization (Server Start)**:
   - State sets to `WAITING` with `nextDrawTime` as the next 30-minute mark (e.g., if now is 14:15, next is 14:30).
   - API server starts listening.
   - Cron job starts checking every minute.

2. **Waiting Phase**:
   - Cron checks every minute: "Is now >= nextDrawTime?"
   - API `/api/draw-status` returns current state and countdown.
   - Separate interval (in `fees.ts`) checks unclaimed fees every 10s, estimates BONK/USD value, and broadcasts via WebSocket.
   - Frontend polls or listens to WebSocket for real-time jackpot display.

3. **Draw Trigger**:
   - At draw time (e.g., 14:30), cron detects `now >= nextDrawTime`.
   - Sets state to `EXECUTING` (broadcast via WebSocket).
   - Runs `drawEngine.executeDraw()`:
     - Take holder snapshot (excludes pools).
     - Request VRF random number from Orao.
     - Select winner based on random number modulo total tickets.
     - Check/claim fees (SOL).
     - Swap claimed SOL to BONK via Jupiter.
     - Distribute BONK to winner.
     - Save results to Postgres.

4. **Announcing Phase**:
   - After draw, state sets to `ANNOUNCING` with `lastDrawResult` populated (broadcast via WebSocket).
   - Frontend detects this and shows winner popup.
   - After 30s timeout, resets to `WAITING`, calculates new `nextDrawTime` (e.g., 15:00), clears `lastDrawResult` (broadcast).

5. **Cycle Repeats**:
   - Back to waiting with updated countdown.

**Error Handling**: If draw fails, resets to WAITING. State persists in memory (restart resets it, but recalculates next time).

## Provably Fair Mechanism

Fairness is ensured through transparency and cryptography. Users can independently verify every step.

### How It Works
1. **Holder Snapshot**: Taken at draw start. Lists all holders, balances, tickets (1 per 10,000 tokens), and ranges. Excludes pools. Published as JSON.
2. **VRF Randomness**: Orao VRF generates a verifiable random number:
   - Request tx sent (proof of "when asked").
   - Multiple oracles fulfill (decentralized).
   - VRF account address holds final number.
3. **Winner Selection**: Deterministic: `winningTicket = randomNumber % totalTickets`. Find holder whose range includes it.
4. **Fee Claim/Swap/Distribution**: On-chain txs for claiming, swapping (Jupiter), and transferring BONK.

### User Verification Steps
- **Download `snapshot.json`** from frontend (from DB `raw_snapshot_data`).
- **Check Holders**: Verify own holdings/tickets match on-chain balances via explorer.
- **Verify Random Number**: Use request tx, fulfillment txs, and VRF account on Solscan. Recalculate `winningTicket`.
- **Confirm Winner**: Match `winningTicket` to snapshot ranges.
- **Check Prize**: Verify distribution tx transferred correct BONK.

All tx signatures and data are stored in DB and exposed via API for easy linking.

## Setup and Deployment

### Prerequisites
- Node.js v18+
- Postgres DB (Neon via Vercel)
- Solana wallet with SOL for fees/VRF

### Installation
```bash
npm install
```

### Environment Variables (.env)
```
RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
DATABASE_URL=postgres://...
LAUNCH_WALLET=[your keypair JSON array]
PORT=8080
```

### Running Locally
```bash
npm run build
npm run start
```

- API at `http://localhost:8080`.
- WebSocket at ws://localhost:8080.

### Deployment to Railway
1. Create Railway project.
2. Link GitHub repo.
3. Add env vars.
4. Set start command: `npm run start`.
5. Deploy—Railway handles the single process.

## API Endpoints
- **GET /api/draw-status**: Current draw state, next time, last result.
- **GET /api/unclaimed-fees**: Estimated jackpot (fees, BONK, USD).
- **WebSocket**: Connect for real-time updates on fees/draws.
