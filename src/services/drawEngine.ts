import { VrfService } from "./vrfService.js";
import { HolderSnapshot, HolderSnapshotService, TokenHolderWithRange } from "./holderSnapshotService.js";
import { WinnerService } from "./winnerService.js";
import { StorageService } from "./storageService.js";
import { PublicKey } from "@solana/web3.js";
import { FeeManagerService } from "./feeManagerService.js";
import { JupiterService } from "./jupiterService.js";

export interface VerificationData {
  randomNumber: bigint;
  vrfRequestTxSignature: string;
  vrfAccountAddress: PublicKey;
}

export interface WinnerData {
  winner: TokenHolderWithRange;
  winningTicket: number;
}

export interface PrizeData {
  prizeDistributionTxSignature: string;
  formattedAmount: number;
}

export interface DrawResult {
  snapshot: HolderSnapshot;
  verificationData: VerificationData;
  winnerData: WinnerData;
  prizeData: PrizeData;
}

class DrawEngine {
  private snapshotService: HolderSnapshotService;
  private vrfService: VrfService;
  private winnerService: WinnerService;
  private storageService: StorageService;
  private feeManagerService: FeeManagerService;
  private jupiterService: JupiterService;

  constructor() {
    this.snapshotService = new HolderSnapshotService();
    this.vrfService = new VrfService();
    this.winnerService = new WinnerService();
    this.storageService = new StorageService();
    this.feeManagerService = new FeeManagerService();
    this.jupiterService = new JupiterService();
  }

  async executeDraw(): Promise<DrawResult> {
    // 1. Take snapshot
    const snapshot = await this.snapshotService.takeSnapshot("DpJAoi4aCyzePWvvgrxQFRdLgHZQGf7SfUSo4wLUgeci", ["ahFQfXL4GX5YWpDNjZR1ewVw63SHCRsJ7KXxGC4j5EY", "FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM"]); // TODO: NEEDS CHANGING

    // 2. Generate VRF
    const { randomNumber, vrfRequestTxSignature, vrfAccountAddress } = await this.vrfService.generateVerifiableRandomNumber();

    // 3. Select winner
    const { winner, winningTicket } = this.winnerService.selectWinner(snapshot, randomNumber);

    // 4. Check unclaimed fees
    const { creatorBaseFee, creatorQuoteFee } = await this.feeManagerService.checkFees();

    // 5. Claim fees
    const { signature: claimFeesTxSignature } = await this.feeManagerService.claimFees(creatorBaseFee, creatorQuoteFee);

    // 6. Swap sol to bonk
    const { signature: swapSolToBonkTxSignature } = await this.jupiterService.swapSolToBonk(creatorQuoteFee);

    // 6. Distribute prize
    const { signature: prizeDistributionTxSignature, formattedAmount } = await this.winnerService.distributePrize(winner);

    // 7. Save files and data
    const prizeData = { prizeDistributionTxSignature, formattedAmount };
    const verificationData = { randomNumber, vrfRequestTxSignature, vrfAccountAddress };
    const winnerData = { winner, winningTicket };
    await this.storageService.saveDrawResult(snapshot, verificationData, winnerData, prizeData);

    return { snapshot, verificationData, winnerData, prizeData };
  }
}

export default DrawEngine;
