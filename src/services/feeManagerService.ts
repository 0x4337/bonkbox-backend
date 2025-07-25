// V2

import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { CpAmm, getUnClaimReward } from "@meteora-ag/cp-amm-sdk"; // New import for DAMM v2
import { getAssociatedTokenAddress } from "@solana/spl-token";
import BN from "bn.js";
import dotenv from "dotenv";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"; // Assuming standard tokens; adjust if Token2022

dotenv.config();

class FeeManagerService {
  private mode: "dbc" | "dammv2" | "restart" = "restart"; // Flip back to dammv2 after restart draw
  private connection: Connection;
  private dbcClient: DynamicBondingCurveClient;
  private cpAmm: CpAmm; // For DAMM v2
  private poolAddress: PublicKey; // DBC pool
  private newPoolAddress: PublicKey; // DAMM v2 pool (hardcode post-migration)
  private positionAddress: PublicKey; // Your position in DAMM v2 (hardcode post-migration)
  private positionNftAccount: PublicKey;
  private keypair: Keypair;

  constructor() {
    this.connection = new Connection(process.env.RPC_URL as string, "confirmed");
    this.dbcClient = new DynamicBondingCurveClient(this.connection, "confirmed");
    this.cpAmm = new CpAmm(this.connection); // Initialize DAMM v2 client
    this.poolAddress = new PublicKey("HAo56a9rJuwQtnoMgu1Npc7jGFoMSFTKuGN5gSNYjsKs"); // DBC
    this.newPoolAddress = new PublicKey("3VJLx1UCMQqqn8abE9cV9gkzyETpf8EPDDYiYoMNNYRb"); // DAMM V2
    this.positionAddress = new PublicKey("8YUeYZq2Nax15Fou2Qb9dEDGGcndaoXnofQ2ryqhEdgf");
    this.positionNftAccount = new PublicKey("y6QuXc1BsXJSVCt9cUdxfvcBAYuxz8pV8VpnkZZyaG9");
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
    } else if (this.mode === "restart") {
      const creatorBaseFee = new BN(0);
      const creatorQuoteFee = new BN(220000000000); // 220 hard coded restart draw jackpot

      return { creatorBaseFee, creatorQuoteFee };
    } else {
      const poolState = await this.cpAmm.fetchPoolState(this.newPoolAddress);
      const positionState = await this.cpAmm.fetchPositionState(this.positionAddress);

      const unClaimedReward = getUnClaimReward(poolState, positionState);

      const unclaimedFeeA = unClaimedReward.feeTokenA;
      const unclaimedFeeB = unClaimedReward.feeTokenB;

      console.log("[FEES] Previously Claimed (SOL):", (positionState.metrics.totalClaimedBFee.toNumber() / 1e9).toFixed(9));
      console.log("[FEES] Unclaimed (SOL):", (unclaimedFeeB.toNumber() / 1e9).toFixed(9));

      const totalPositionFeeB = positionState.metrics.totalClaimedBFee.add(unclaimedFeeB);
      console.log("[FEES] Total Accrued For Position (SOL):", (totalPositionFeeB.toNumber() / 1e9).toFixed(9));

      return { creatorBaseFee: unclaimedFeeA, creatorQuoteFee: unclaimedFeeB };
    }
  }

  async claimFees(creatorBaseFee: BN, creatorQuoteFee: BN) {
    console.log("[FEES] Creating fee claim transaction...");
    let claimTx: Transaction;
    if (this.mode === "dbc") {
      if (creatorQuoteFee.isZero()) {
        throw new Error("[FEES] Creator Quote Fee is zero, nothing to claim.");
      }

      claimTx = await this.dbcClient.creator.claimCreatorTradingFee({
        creator: this.keypair.publicKey,
        payer: this.keypair.publicKey,
        pool: this.poolAddress,
        maxBaseAmount: creatorBaseFee,
        maxQuoteAmount: creatorQuoteFee,
      });
    } else if (this.mode === "restart") {
      return { signature: null }; // Fees already claimed manually and reside in dev wallet.
    } else {
      const poolState = await this.cpAmm.fetchPoolState(this.newPoolAddress);
      const positionNftAccountAddress = this.positionNftAccount;

      claimTx = await this.cpAmm.claimPositionFee2({
        owner: this.keypair.publicKey,
        pool: this.newPoolAddress,
        position: this.positionAddress,
        positionNftAccount: this.positionNftAccount,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
        receiver: this.keypair.publicKey,
        feePayer: this.keypair.publicKey,
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
