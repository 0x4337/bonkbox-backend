import { Router } from "express";
import { DrawState, drawState } from "../../state/drawState.js";
import { webSocketService } from "../../services/websocketService.js";
import { drawStateEvents } from "../../state/drawState.js";

const router = Router();

function getDrawStatusData() {
  let filteredLastDrawResult = null;

  if (drawState.lastDrawResult) {
    const { snapshot, winnerData, prizeData } = drawState.lastDrawResult;
    filteredLastDrawResult = {
      snapshot: {
        ...snapshot,
        holders: snapshot.holders.slice(0, 25),
      },
      winnerData,
      prizeData,
    };
  }

  return {
    currentState: drawState.currentState,
    nextDrawTime: drawState.nextDrawTime.toISOString(),
    lastDrawResult: filteredLastDrawResult,
  };
}

// Periodically broadcast the draw status.
// Listen for state changes and broadcast them
drawStateEvents.on("stateChanged", (newState: DrawState) => {
  let filteredLastDrawResult = null;

  if (newState.lastDrawResult) {
    const { snapshot, winnerData, prizeData } = newState.lastDrawResult;
    filteredLastDrawResult = {
      snapshot: {
        ...snapshot,
        holders: snapshot.holders.slice(0, 25),
      },
      winnerData,
      prizeData,
    };
  }

  webSocketService.broadcast({
    type: "drawStatusUpdate",
    data: {
      currentState: newState.currentState,
      nextDrawTime: newState.nextDrawTime.toISOString(),
      lastDrawResult: filteredLastDrawResult,
    },
  });
});

router.get("/api/draw-status", (req, res) => {
  res.json(getDrawStatusData());
});

export default router;
