// src/api/routes/draw.ts
import { Router } from "express";
import { drawState } from "../../state/drawState.js";

const router = Router();

router.get("/api/draw-status", (req, res) => {
  let filteredLastDrawResult = null;

  if (drawState.lastDrawResult) {
    const { snapshot, verificationData, winnerData, prizeData } = drawState.lastDrawResult;
    filteredLastDrawResult = {
      snapshot: {
        ...snapshot,
        holders: snapshot.holders.slice(0, 25),
      },
      // verificationData, // res.json cant serialize BigInt which is in verificationData - not needed anyway.
      winnerData,
      prizeData,
    };
  }

  res.json({
    currentState: drawState.currentState,
    nextDrawTime: drawState.nextDrawTime.toISOString(),
    lastDrawResult: filteredLastDrawResult,
  });
});

export default router;
