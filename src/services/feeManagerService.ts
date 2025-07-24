// import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
// import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";
// import BN from "bn.js";
// import dotenv from "dotenv";

// dotenv.config();

// class FeeManagerService {
//   private connection: Connection;
//   private dbcClient: DynamicBondingCurveClient;
//   private poolAddress: PublicKey;
//   private keypair: Keypair;

//   constructor() {
//     this.connection = new Connection(process.env.RPC_URL as string, "confirmed");
//     this.dbcClient = new DynamicBondingCurveClient(this.connection, "confirmed");
//     this.poolAddress = new PublicKey("8XjEStrzsN1w8u1dggpFofRjxQu5edRpwaY5gSmXwgQA"); // TODO: NEEDS CHANGING
//     this.keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.LAUNCH_WALLET as string)));
//   }

//   async checkFees() {
//     console.log("[FEES] Checking unclaimed fees...");
//     const fees = await this.dbcClient.state.getPoolFeeMetrics(this.poolAddress);
//     const creatorBaseFee = fees.current.creatorBaseFee;
//     const creatorQuoteFee = fees.current.creatorQuoteFee;

//     console.log("[FEES] Creator Base Fee:", creatorBaseFee.toString(), "tokens");
//     console.log("[FEES] Creator Quote Fee:", creatorQuoteFee.toString(), "lamports");
//     console.log("[FEES] SOL Value:", (creatorQuoteFee.toNumber() / 1e9).toFixed(9), "SOL");

//     return {
//       creatorBaseFee,
//       creatorQuoteFee,
//     };
//   }

//   async claimFees(creatorBaseFee: BN, creatorQuoteFee: BN) {
//     console.log("[FEES] Creating fee claim transaction...");

//     const claimTx = await this.dbcClient.creator.claimCreatorTradingFee({
//       creator: this.keypair.publicKey,
//       payer: this.keypair.publicKey,
//       pool: this.poolAddress,
//       maxBaseAmount: creatorBaseFee,
//       maxQuoteAmount: creatorQuoteFee,
//     });

//     console.log("[FEES] Signing and sending claim transaction...");
//     claimTx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
//     claimTx.feePayer = this.keypair.publicKey;
//     claimTx.sign(this.keypair);

//     const rawTx = claimTx.serialize();
//     const signature = await this.connection.sendRawTransaction(rawTx, { skipPreflight: false });

//     console.log("[FEES] Claim transaction sent!");
//     console.log("[FEES] Claim transaction signature: ", signature);

//     console.log("[FEES] Waiting for confirmation...");
//     const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
//     await this.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

//     console.log("[FEES] Claim transaction confirmed");

//     return { signature };
//   }
// }

// export { FeeManagerService };

// V2

import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { CpAmm } from "@meteora-ag/cp-amm-sdk"; // New import for DAMM v2
import { getAssociatedTokenAddress } from "@solana/spl-token";
import BN from "bn.js";
import dotenv from "dotenv";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"; // Assuming standard tokens; adjust if Token2022

dotenv.config();

class FeeManagerService {
  private mode: "dbc" | "dammv2" = "dbc"; // Flip to 'dammv2' post-migration and redeploy
  private connection: Connection;
  private dbcClient: DynamicBondingCurveClient;
  private cpAmm: CpAmm; // For DAMM v2
  private poolAddress: PublicKey; // DBC pool
  private newPoolAddress: PublicKey; // DAMM v2 pool (hardcode post-migration)
  private positionAddress: PublicKey; // Your position in DAMM v2 (hardcode post-migration)
  private keypair: Keypair;

  constructor() {
    this.connection = new Connection(process.env.RPC_URL as string, "confirmed");
    this.dbcClient = new DynamicBondingCurveClient(this.connection, "confirmed");
    this.cpAmm = new CpAmm(this.connection); // Initialize DAMM v2 client
    this.poolAddress = new PublicKey("8XjEStrzsN1w8u1dggpFofRjxQu5edRpwaY5gSmXwgQA"); // TODO: NEEDS CHANGING (DBC)
    this.newPoolAddress = new PublicKey("8XjEStrzsN1w8u1dggpFofRjxQu5edRpwaY5gSmXwgQA"); // Hardcode after migration
    this.positionAddress = new PublicKey("8XjEStrzsN1w8u1dggpFofRjxQu5edRpwaY5gSmXwgQA"); // Hardcode after running fetch script
    this.keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.LAUNCH_WALLET as string)));
  }

  async checkFees() {
    console.log("[FEES] Checking unclaimed fees...");
    if (this.mode === "dbc") {
      const fees = await this.dbcClient.state.getPoolFeeMetrics(this.poolAddress);
      const creatorBaseFee = fees.current.creatorBaseFee;
      const creatorQuoteFee = fees.current.creatorQuoteFee;
      console.log("[FEES] Creator Base Fee:", creatorBaseFee.toString(), "tokens");
      console.log("[FEES] Creator Quote Fee:", creatorQuoteFee.toString(), "lamports");
      console.log("[FEES] SOL Value:", (creatorQuoteFee.toNumber() / 1e9).toFixed(9), "SOL");
      return { creatorBaseFee, creatorQuoteFee };
    } else {
      // DAMM v2: Fetch position state to get accrued fees
      const positionState = await this.cpAmm.fetchPositionState(this.positionAddress);
      const creatorBaseFee = positionState.feeAPending; // Assuming tokenA is base
      const creatorQuoteFee = positionState.feeBPending; // Assuming tokenB is quote (SOL)
      console.log("[FEES] Creator Base Fee (DAMM v2):", creatorBaseFee.toString(), "tokens");
      console.log("[FEES] Creator Quote Fee (DAMM v2):", creatorQuoteFee.toString(), "lamports");
      console.log("[FEES] SOL Value (DAMM v2):", (creatorQuoteFee.toNumber() / 1e9).toFixed(9), "SOL");
      return { creatorBaseFee, creatorQuoteFee };
    }
  }

  async claimFees(creatorBaseFee: BN, creatorQuoteFee: BN) {
    console.log("[FEES] Creating fee claim transaction...");
    let claimTx: Transaction;
    if (this.mode === "dbc") {
      claimTx = await this.dbcClient.creator.claimCreatorTradingFee({
        creator: this.keypair.publicKey,
        payer: this.keypair.publicKey,
        pool: this.poolAddress,
        maxBaseAmount: creatorBaseFee,
        maxQuoteAmount: creatorQuoteFee,
      });
    } else {
      // DAMM v2: Claims all fees (ignores base/quote params as it claims everything)
      const poolState = await this.cpAmm.fetchPoolState(this.newPoolAddress);
      const positionState = await this.cpAmm.fetchPositionState(this.positionAddress);
      const positionNftAccount = await getAssociatedTokenAddress(positionState.nftMint, this.keypair.publicKey);

      claimTx = await this.cpAmm.claimPositionFee2({
        owner: this.keypair.publicKey,
        pool: this.newPoolAddress,
        position: this.positionAddress,
        positionNftAccount,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAProgram: TOKEN_PROGRAM_ID, // Adjust if Token2022
        tokenBProgram: TOKEN_PROGRAM_ID, // Adjust if Token2022
        receiver: this.keypair.publicKey, // Fees go to your wallet
        feePayer: this.keypair.publicKey, // Optional, but specify for clarity
      });
    }

    console.log("[FEES] Signing and sending claim transaction...");
    claimTx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    claimTx.feePayer = this.keypair.publicKey;
    claimTx.sign(this.keypair);

    const rawTx = claimTx.serialize();
    const signature = await this.connection.sendRawTransaction(rawTx, { skipPreflight: false });

    console.log("[FEES] Claim transaction sent!");
    console.log("[FEES] Claim transaction signature: ", signature);

    console.log("[FEES] Waiting for confirmation...");
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    await this.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

    console.log("[FEES] Claim transaction confirmed");

    return { signature };
  }
}

export { FeeManagerService };
