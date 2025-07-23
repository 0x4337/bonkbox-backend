import { FeeManagerService } from "../../services/feeManagerService.js";
import { Router } from "express";
import BN from "bn.js";
import { drawState } from "../../state/drawState.js";

const router = Router();

const feeManagerService = new FeeManagerService();

let inMemoryFeeData = {
  creatorBaseFee: new BN(0),
  creatorQuoteFee: new BN(0),
  estimatedBonkAmount: 0,
  estimatedUsdValue: 0,
};

async function fetchFeeData() {
  console.log("[INTERVAL] Checking unclaimed fees...");
  const feeData = await feeManagerService.checkFees();

  // creatorBaseFee and creatorQuoteFee are expected to be BN instances
  // For SOL, convert lamports (1e9 lamports = 1 SOL)
  const creatorBaseFee = new BN(feeData.creatorBaseFee);
  const creatorQuoteFee = new BN(feeData.creatorQuoteFee);

  // Get number value for calculations
  const creatorQuoteFeeLamports = creatorQuoteFee.toNumber();
  const creatorQuoteFeeSOL = creatorQuoteFeeLamports / 1e9;

  const priceData = await (await fetch("https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112,DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263")).json();

  const solanaPrice = priceData["So11111111111111111111111111111111111111112"].usdPrice;
  const bonkPrice = priceData["DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"].usdPrice;

  // Calculate fee values correctly in USD and BONK
  const estimatedUsdValue = creatorQuoteFeeSOL * solanaPrice;
  const estimatedBonkAmount = estimatedUsdValue / bonkPrice;

  inMemoryFeeData.estimatedUsdValue = estimatedUsdValue;
  inMemoryFeeData.estimatedBonkAmount = estimatedBonkAmount;
  inMemoryFeeData.creatorBaseFee = creatorBaseFee;
  inMemoryFeeData.creatorQuoteFee = creatorQuoteFee;
}

fetchFeeData();
setInterval(async () => {
  if (drawState.currentState !== "WAITING") {
    return;
  }

  await fetchFeeData();
}, 10000);

router.get("/api/unclaimed-fees", async (req, res) => {
  res.json({
    creatorBaseFee: inMemoryFeeData.creatorBaseFee.toString(),
    creatorQuoteFee: inMemoryFeeData.creatorQuoteFee.toString(),
    estimatedBonkAmount: inMemoryFeeData.estimatedBonkAmount,
    estimatedUsdValue: inMemoryFeeData.estimatedUsdValue,
  });
});

export default router;
