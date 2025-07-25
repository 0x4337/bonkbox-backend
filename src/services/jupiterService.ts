import { Keypair, VersionedTransaction, Connection } from "@solana/web3.js";
import BN from "bn.js";
import dotenv from "dotenv";

dotenv.config();

class JupiterService {
  private keypair: Keypair;
  private connection: Connection;
  private jitoEndpoint: string;

  constructor() {
    this.keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.LAUNCH_WALLET as string)));
    // Regular RPC for other operations
    this.connection = new Connection(process.env.RPC_URL as string, "confirmed");
    // Correct Jito endpoint for transactions
    this.jitoEndpoint = "https://mainnet.block-engine.jito.wtf/api/v1/transactions";
  }

  async swapSolToBonk(lamports: BN): Promise<{ signature: string }> {
    console.log("[SWAP] Swapping SOL to $BONK using Jupiter + Jito");
    console.log(`[SWAP] Amount: ${lamports.toString()} lamports (${lamports.toNumber() / 1e9} SOL)`);

    const SOL_MINT = "So11111111111111111111111111111111111111112";
    const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[SWAP] Attempt ${attempt}/3`);

        // Step 1: Get Quote using Jupiter Quote API
        console.log("[SWAP] Getting quote from Jupiter...");
        const quoteUrl = new URL("https://lite-api.jup.ag/swap/v1/quote");
        quoteUrl.searchParams.append("inputMint", SOL_MINT);
        quoteUrl.searchParams.append("outputMint", BONK_MINT);
        quoteUrl.searchParams.append("amount", lamports.toString());
        quoteUrl.searchParams.append("slippageBps", "200"); // 2% slippage for large amount
        quoteUrl.searchParams.append("restrictIntermediateTokens", "true"); // More stable routing
        quoteUrl.searchParams.append("dynamicSlippage", "true"); // Let Jupiter optimize slippage

        const quoteResponse = await (await fetch(quoteUrl.toString())).json();

        if (!quoteResponse.outAmount) {
          throw new Error(`Quote failed: ${JSON.stringify(quoteResponse)}`);
        }

        console.log("[SWAP] Quote received:");
        console.log(`[SWAP] Input: ${quoteResponse.inAmount} lamports SOL`);
        console.log(`[SWAP] Expected Output: ${quoteResponse.outAmount} BONK`);
        console.log(`[SWAP] Price Impact: ${quoteResponse.priceImpactPct}%`);

        // Step 2: Build Swap Transaction with Jito optimization
        console.log("[SWAP] Building swap transaction with Jito...");
        const swapResponse = await (
          await fetch("https://lite-api.jup.ag/swap/v1/swap", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              quoteResponse,
              userPublicKey: this.keypair.publicKey.toString(),

              // Jito configuration for MEV protection
              prioritizationFeeLamports: {
                jitoTipLamports: 10000000, // 0.01 SOL tip (fixed amount for Jito)
              },

              // Additional optimizations for transaction landing
              dynamicComputeUnitLimit: true, // Let Jupiter estimate compute units
              dynamicSlippage: true, // Let Jupiter optimize slippage
            }),
          })
        ).json();

        if (!swapResponse.swapTransaction) {
          throw new Error(`Swap transaction build failed: ${JSON.stringify(swapResponse)}`);
        }

        console.log("[SWAP] Transaction built successfully");
        console.log(`[SWAP] Compute Unit Limit: ${swapResponse.computeUnitLimit}`);
        console.log(`[SWAP] Priority Fee: ${swapResponse.prioritizationFeeLamports} lamports`);

        if (swapResponse.dynamicSlippageReport) {
          console.log(`[SWAP] Dynamic Slippage: ${swapResponse.dynamicSlippageReport.slippageBps} bps`);
        }

        // Step 3: Deserialize, Sign and Prepare Transaction
        console.log("[SWAP] Signing transaction...");
        const transactionBase64 = swapResponse.swapTransaction;
        const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, "base64"));

        // Sign the transaction
        transaction.sign([this.keypair]);

        // Serialize for sending
        const transactionBinary = transaction.serialize();

        // Step 4: Send Transaction via Jito
        console.log("[SWAP] Sending transaction via Jito...");
        const signature = await this.sendJitoTransaction(transactionBinary);

        // Step 5: Confirm Transaction
        console.log("[SWAP] Confirming transaction...");
        const confirmation = await this.connection.confirmTransaction(
          {
            signature,
            blockhash: transaction.message.recentBlockhash,
            lastValidBlockHeight: swapResponse.lastValidBlockHeight,
          },
          "finalized",
        );

        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        console.log("[SWAP] Swap successful!");
        console.log(`[SWAP] Transaction: https://solscan.io/tx/${signature}`);
        console.log(`[SWAP] Expected BONK received: ${quoteResponse.outAmount}`);

        return { signature };
      } catch (error) {
        console.error(`[SWAP] Attempt ${attempt} failed:`, error);

        if (attempt < 3) {
          console.log("[SWAP] Retrying in 2 seconds...");
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    throw new Error("[SWAP] All swap attempts failed after 3 tries");
  }

  private async sendJitoTransaction(transactionBinary: Uint8Array): Promise<string> {
    // Send transaction to Jito using the correct endpoint and format
    const response = await fetch(this.jitoEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: [
          Buffer.from(transactionBinary).toString("base64"), // Use base64 encoding (recommended)
          {
            encoding: "base64",
            // Jito automatically sets skipPreflight: true
          },
        ],
      }),
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(`Jito transaction submission failed: ${JSON.stringify(result.error)}`);
    }

    console.log(`[SWAP] Transaction submitted via Jito: ${result.result}`);
    return result.result;
  }

  // Helper method to estimate swap output (for testing/validation)
  async getSwapQuote(lamports: BN): Promise<any> {
    const SOL_MINT = "So11111111111111111111111111111111111111112";
    const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

    const quoteUrl = new URL("https://lite-api.jup.ag/swap/v1/quote");
    quoteUrl.searchParams.append("inputMint", SOL_MINT);
    quoteUrl.searchParams.append("outputMint", BONK_MINT);
    quoteUrl.searchParams.append("amount", lamports.toString());
    quoteUrl.searchParams.append("slippageBps", "200");
    quoteUrl.searchParams.append("restrictIntermediateTokens", "true");

    return await (await fetch(quoteUrl.toString())).json();
  }
}

export { JupiterService };
