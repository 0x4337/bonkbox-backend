import { HolderSnapshot, TokenHolderWithRange } from "./holderSnapshotService.js";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { createTransferInstruction, getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import dotenv from "dotenv";

dotenv.config();

class WinnerService {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(process.env.RPC_URL as string, "confirmed");
  }

  selectWinner(holdersSnapshot: HolderSnapshot, randomNumber: bigint): { winner: TokenHolderWithRange; winningTicket: number } {
    console.log("[WINNER] Using VRF random number to select winner...");
    const { holders, totalTickets } = holdersSnapshot;

    const winningTicket = Number(randomNumber % BigInt(totalTickets));
    console.log("[WINNER] Winning ticket computed: ", winningTicket);

    const winner = holders.find((holder) => winningTicket >= holder.ticketRange[0] && winningTicket <= holder.ticketRange[1]) as TokenHolderWithRange;

    console.log("[WINNER] Winner selected:", winner.owner);
    return { winner, winningTicket };
  }

  async distributePrize(winner: TokenHolderWithRange): Promise<{ signature: string; formattedAmount: number }> {
    const connection = this.connection;
    console.log("[DISTRIBUTE] Starting prize distribution...");

    const prizeCollectorWallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.LAUNCH_WALLET as string)));

    const bonkTokenMint = new PublicKey("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263");
    const winnerPublicKey = new PublicKey(winner.owner);
    console.log("[DISTRIBUTE] Winner public key:", winnerPublicKey.toBase58());

    const prizeCollectorTokenAccount = await getAssociatedTokenAddress(bonkTokenMint, prizeCollectorWallet.publicKey);
    console.log("[DISTRIBUTE] Prize collector token account:", prizeCollectorTokenAccount.toBase58());

    const winnerTokenAccount = await getOrCreateAssociatedTokenAccount(connection, prizeCollectorWallet, bonkTokenMint, winnerPublicKey);
    console.log("[DISTRIBUTE] Winner token account:", winnerTokenAccount.address.toBase58());

    const tokenAccountBalance = await connection.getTokenAccountBalance(prizeCollectorTokenAccount);
    console.log("[DISTRIBUTE] Prize collector token account balance:", tokenAccountBalance.value.uiAmountString, "tokens");

    const bonkTokenDecimals = 5;

    // SPL expects amount as a string or bigint in lowest denomination (u64, integer, not float)
    const rawAmount = BigInt(tokenAccountBalance.value.amount);
    if (rawAmount === 0n) {
      console.error("[DISTRIBUTE] Prize collector token account balance is zero. Aborting transfer.");
      throw new Error("Prize collector token account balance is zero.");
    }
    const formattedAmount = Number(rawAmount) / 10 ** bonkTokenDecimals;
    console.log(`[DISTRIBUTE] Transferring ${rawAmount} (${formattedAmount} tokens)`);

    const transaction = new Transaction().add(createTransferInstruction(prizeCollectorTokenAccount, winnerTokenAccount.address, prizeCollectorWallet.publicKey, rawAmount));

    try {
      const signature = await sendAndConfirmTransaction(connection, transaction, [prizeCollectorWallet]);
      console.log("[DISTRIBUTE] Prize distributed! Transaction signature:", signature);
      return { signature, formattedAmount };
    } catch (error) {
      console.error("[DISTRIBUTE] Failed to distribute prize:", error);
      throw error;
    }
  }
}

// const winnerService = new WinnerService();
// winnerService.distributePrize({ owner: "AkuMsMN58SytG7cTqK837DpMjgTwTAApN537mS1igcGg", balance: 1, tickets: 1, ticketRange: [1, 1] });

export { WinnerService };
