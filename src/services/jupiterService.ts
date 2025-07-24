import { Keypair, VersionedTransaction } from "@solana/web3.js";
import BN from "bn.js";
import dotenv from "dotenv";

dotenv.config();

class JupiterService {
  private keypair: Keypair;

  constructor() {
    this.keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.LAUNCH_WALLET as string)));
  }

  async swapSolToBonk(lamports: BN): Promise<{ signature: string }> {
    console.log("[SWAP] Swapping SOL to $BONK");

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const orderResponse = await (await fetch(`https://lite-api.jup.ag/ultra/v1/order?inputMint=So11111111111111111111111111111111111111112&outputMint=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263&amount=${lamports}&taker=ahFQfXL4GX5YWpDNjZR1ewVw63SHCRsJ7KXxGC4j5EY`)).json();
        console.log("[SWAP] Order Response:", orderResponse);

        // Extract the transaction from the order response
        const transactionBase64 = orderResponse.transaction;

        // Deserialize the transaction
        const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, "base64"));

        // Sign the transaction
        transaction.sign([this.keypair]);

        // Serialize the transaction to base64 format
        const signedTransaction = Buffer.from(transaction.serialize()).toString("base64");

        let executeResponse = await (
          await fetch("https://lite-api.jup.ag/ultra/v1/execute", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              signedTransaction: signedTransaction,
              requestId: orderResponse.requestId,
            }),
          })
        ).json();

        if (executeResponse.status === "Success") {
          console.log("[SWAP] Swap successful:", JSON.stringify(executeResponse, null, 2));
          console.log(`[SWAP] Swap Signature: ${executeResponse.signature}`);
          return { signature: executeResponse.signature };
        } else {
          console.error(`[SWAP] Swap failed on attempt ${attempt}:`, JSON.stringify(executeResponse, null, 2));
          if (attempt < 3) {
            console.log(`[SWAP] Retrying swap...`);
          }
        }
      } catch (error) {
        console.error(`[SWAP] Error on attempt ${attempt}:`, error);
        if (attempt < 3) {
          console.log(`[SWAP] Retrying swap...`);
        }
      }
    }

    throw new Error("[SWAP] Swap failed after 3 attempts");
  }
}

// const jupiterService = new JupiterService();
// const { signature } = await jupiterService.swapSolToBonk(new BN(10000000));

export { JupiterService };
