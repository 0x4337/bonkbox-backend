import { Keypair, Connection } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Orao, randomnessAccountAddress } from "@orao-network/solana-vrf";
import dotenv from "dotenv";

dotenv.config();

const KEYPAIR = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.LAUNCH_WALLET as string)));

// Helper function to introduce a delay
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class VrfService {
  private vrf: Orao;

  constructor() {
    const connection = new Connection(process.env.RPC_URL as string, "confirmed");
    const wallet = new Wallet(KEYPAIR);

    const provider = new AnchorProvider(connection, wallet);
    this.vrf = new Orao(provider);
  }

  async generateVerifiableRandomNumber() {
    console.log("[VRF] Sending request for VRF...");
    // Request randomness and send the transaction
    const [seed, requestTxSignature] = await (await this.vrf.request()).rpc();
    console.log(`[VRF] Request sent: ${requestTxSignature}`);

    console.log("[VRF] Allowing network time to sync...");
    await sleep(2500);

    console.log("[VRF] Waiting for fulfillment...");
    const randomness = await this.vrf.waitFulfilled(seed);

    console.log("[VRF] Fulfillment received");

    const randomNumber = BigInt("0x" + Buffer.from(randomness.randomness).toString("hex"));

    const vrfAccountAddress = randomnessAccountAddress(seed);
    const vrfRequestTxSignature = requestTxSignature;
    return { randomNumber, vrfRequestTxSignature, vrfAccountAddress };
  }
}

export { VrfService };

// (async () => {
//   const vrfService = new VrfService();
//   try {
//     console.log("Requesting randomness from VRF...");
//     const { randomNumber, vrfAccountAddress, requestTxSignature } = await vrfService.generateRandomness();
//     console.log("Random number generated:", randomNumber.toString());
//     const ticketNumber = randomNumber % 100000n;
//     console.log("Ticket number generated:", ticketNumber.toString());
//     console.log("Request Transaction Signature:", requestTxSignature.toString());
//     console.log("VRF Account Address:", vrfAccountAddress.toString());
//   } catch (error) {
//     console.error("Error generating randomness:", error);
//   }
// })();
