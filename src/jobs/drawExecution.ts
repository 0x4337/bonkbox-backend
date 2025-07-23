// src/jobs/drawExecution.ts
import cron from "node-cron";
import { drawState, startDrawExecution, announceWinner, resetToWaiting } from "../state/drawState.js";
import DrawEngine from "../services/drawEngine.js";

const drawEngine = new DrawEngine();

// This cron job runs every minute to check the state.
cron.schedule("* * * * *", async () => {
  const now = new Date();

  // Only do something if we are in the WAITING state and the time is up.
  if (drawState.currentState === "WAITING" && now >= drawState.nextDrawTime) {
    try {
      console.log("Starting draw execution...");
      startDrawExecution(); // Transition state to EXECUTING

      // Run the main draw logic
      const result = await drawEngine.executeDraw();

      console.log("Draw complete. Announcing winner...");
      announceWinner(result); // Transition state to ANNOUNCING
    } catch (error) {
      console.error("Draw execution failed:", error);
      resetToWaiting(); // Reset state even if it fails
    }
  }
});
