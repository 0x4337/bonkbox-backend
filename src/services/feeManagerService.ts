import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";
import BN from "bn.js";
import dotenv from "dotenv";

dotenv.config();

class FeeManagerService {
  private connection: Connection;
  private dbcClient: DynamicBondingCurveClient;
  private poolAddress: PublicKey;
  private keypair: Keypair;

  constructor() {
    this.connection = new Connection(process.env.RPC_URL as string, "confirmed");
    this.dbcClient = new DynamicBondingCurveClient(this.connection, "confirmed");
    this.poolAddress = new PublicKey("8XjEStrzsN1w8u1dggpFofRjxQu5edRpwaY5gSmXwgQA"); // TODO: NEEDS CHANGING
    this.keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.LAUNCH_WALLET as string)));
  }

  async checkFees() {
    console.log("[FEES] Checking unclaimed fees...");
    const fees = await this.dbcClient.state.getPoolFeeMetrics(this.poolAddress);
    const creatorBaseFee = fees.current.creatorBaseFee;
    const creatorQuoteFee = fees.current.creatorQuoteFee;

    console.log("[FEES] Creator Base Fee:", creatorBaseFee.toString(), "tokens");
    console.log("[FEES] Creator Quote Fee:", creatorQuoteFee.toString(), "lamports");
    console.log("[FEES] SOL Value:", (creatorQuoteFee.toNumber() / 1e9).toFixed(9), "SOL");

    return {
      creatorBaseFee,
      creatorQuoteFee,
    };
  }

  async claimFees(creatorBaseFee: BN, creatorQuoteFee: BN) {
    console.log("[FEES] Creating fee claim transaction...");

    const claimTx = await this.dbcClient.creator.claimCreatorTradingFee({
      creator: this.keypair.publicKey,
      payer: this.keypair.publicKey,
      pool: this.poolAddress,
      maxBaseAmount: creatorBaseFee,
      maxQuoteAmount: creatorQuoteFee,
    });

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
