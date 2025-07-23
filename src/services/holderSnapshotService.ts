import { PublicKey, Connection } from "@solana/web3.js";

// ────────────────────────────────
// Constants
// ────────────────────────────────

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const connection = new Connection(process.env.RPC_URL as string, "confirmed");

// ────────────────────────────────
// Type Definitions
// ────────────────────────────────

interface TokenHolder {
  owner: string;
  balance: number;
  tickets: number;
}

interface TokenHolderWithRaw extends TokenHolder {
  _raw: bigint;
}

export interface TokenHolderWithRange extends TokenHolder {
  ticketRange: [number, number];
}

interface TokenHolderAndBlockInfo {
  holders: TokenHolder[];
  block: {
    slot: number;
    blockhash: string;
    blockTime: number | null;
  };
}

export interface HolderSnapshot extends TokenHolderAndBlockInfo {
  holders: TokenHolderWithRange[];
  totalTickets: number;
}

// ────────────────────────────────
// Snapshot Service (Main Entry Point)
// ────────────────────────────────

class HolderSnapshotService {
  async takeSnapshot(tokenMint: string, avoidAddresses: string[]): Promise<HolderSnapshot> {
    console.log("[SNAPSHOT] Taking token holder snapshot...");
    const { holders, block } = await getHoldersWithTicketsAndBlockInfo(tokenMint, avoidAddresses);
    console.log("[SNAPSHOT] total holders found:", holders.length);

    // Calculate ticket ranges
    let currentTicket = 0;
    const holdersWithRanges: TokenHolderWithRange[] = holders.map((holder: TokenHolder) => {
      const ticketRange: [number, number] = [currentTicket, currentTicket + holder.tickets - 1];
      currentTicket += holder.tickets;
      return {
        ...holder,
        ticketRange,
      };
    });

    return {
      holders: holdersWithRanges,
      totalTickets: currentTicket,
      block,
    };
  }
}

// ────────────────────────────────
// Helper Functions
// ────────────────────────────────

/**
 * Fetches all SPL token holders for a given mint, along with their balances, ticket counts,
 * and snapshot block information (slot, blockhash, blockTime).
 *
 * - Only includes accounts with a nonzero token balance.
 * - Calculates "tickets" as floor(balance / 10,000).
 * - Returns holders sorted by descending raw token amount.
 *
 * @param tokenMint - The base58 address of the SPL token mint.
 * @param avoidAddresses - The base58 addresses to avoid.
 * @returns An object containing:
 *   - holders: Array of { owner, balance, tickets }
 *   - block: { slot, blockhash, blockTime }
 */
async function getHoldersWithTicketsAndBlockInfo(tokenMint: string, avoidAddresses: string[]): Promise<TokenHolderAndBlockInfo> {
  const mint = new PublicKey(tokenMint);

  // Get the mint decimals to convert raw units to user-friendly balances
  const decimals = await getMintDecimals(tokenMint);

  // Get the latest slot, blockhash, and block time for snapshot context
  const slot = await connection.getSlot("confirmed");
  const blockInfo = await connection.getBlock(slot, { maxSupportedTransactionVersion: 0 });
  const blockhash = blockInfo?.blockhash ?? "";
  const blockTime = blockInfo?.blockTime ?? null;

  // Pull every token account holding this mint
  const accounts = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      { dataSize: 165 }, // SPL token-account size
      { memcmp: { offset: 0, bytes: mint.toBase58() } }, // mint filter
    ],
  });

  const holders: TokenHolderWithRaw[] = [];

  for (const { account } of accounts) {
    if (!("parsed" in account.data)) continue;
    if (avoidAddresses.includes(account.data.parsed.info.owner)) continue;

    const { owner, tokenAmount } = account.data.parsed.info;

    const raw = BigInt(tokenAmount.amount); // raw units (no decimals)

    if (raw === 0n) continue;

    // Convert raw units to user-friendly balance using decimals
    const balance = Number(tokenAmount.amount) / 10 ** decimals;

    // Calculate tickets based on the user-friendly balance (1 ticket per 10,000 tokens)
    const tickets = Math.floor(balance / 10_000);
    if (tickets === 0) continue;

    holders.push({
      owner,
      balance,
      tickets,
      _raw: raw,
    });
  }

  // Sort the holders array so that accounts with the largest token balance come first.
  // This compares the '_raw' field (the original on-chain token amount as a BigInt) for each holder.
  // If 'b' has more tokens than 'a', it comes before 'a' in the sorted list.
  holders.sort((a, b) => (b._raw > a._raw ? 1 : b._raw < a._raw ? -1 : 0));

  return {
    holders: holders.map(({ _raw, ...rest }) => rest),
    block: {
      slot,
      blockhash,
      blockTime,
    },
  };
}

/**
 * Fetches the number of decimals for a given SPL token mint.
 *
 * The decimals value is required to convert raw token amounts (stored as integers on-chain)
 * into user-friendly numbers (e.g., 6 decimals means 1,000,000 = 1 token).
 * This function queries the mint account on-chain, parses its data,
 * and extracts the decimals field from the parsed account info.
 *
 * @param mintAddress - The base58 address of the SPL token mint.
 * @returns The number of decimals used by the token mint.
 * @throws If the mint account cannot be fetched or parsed correctly.
 */
async function getMintDecimals(mintAddress: string): Promise<number> {
  // Convert the mint address string into a PublicKey object
  const mintPubkey = new PublicKey(mintAddress);

  // Fetch the parsed account info for the mint address from the blockchain
  const mintAccountInfo = await connection.getParsedAccountInfo(mintPubkey);

  // Validate that the account info is present and properly parsed
  // We expect the data to be in parsed format and to contain an 'info' field with 'decimals'
  if (!mintAccountInfo.value || !mintAccountInfo.value.data || !("parsed" in mintAccountInfo.value.data) || !mintAccountInfo.value.data.parsed || !mintAccountInfo.value.data.parsed.info) {
    throw new Error("Unable to fetch mint info or parse decimals");
  }

  // Extract and return the decimals value from the parsed account info
  return mintAccountInfo.value.data.parsed.info.decimals; // Likely either 6 or 9
}

export { HolderSnapshotService };

// ────────────────────────────────
// Example Usage
// ────────────────────────────────

// const snapshotService = new HolderSnapshotServices();
// snapshotService.takeSnapshot("8m1qtB5KjFQ5YyLG9MWGYq38YQ7y5mHnUwQtrEvQbonk", "WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh").then(console.log);
