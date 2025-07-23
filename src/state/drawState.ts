import { DrawResult } from "../services/drawEngine.js";

// This object holds the live state of our application.
export const drawState: {
  currentState: "WAITING" | "EXECUTING" | "ANNOUNCING";
  nextDrawTime: Date;
  lastDrawResult: DrawResult | null;
} = {
  // Can be 'WAITING', 'EXECUTING', or 'ANNOUNCING'
  currentState: "WAITING",

  // The exact time the next draw is scheduled to run.
  nextDrawTime: getNextDrawTime(), // We'll define this function

  // When a draw is complete, we'll store the winner's info here temporarily.
  lastDrawResult: null, // Will hold winner's address, prize, etc.
};

// Helper function: Calculate the next draw time (every 30 minutes, on :00 or :30)
function getNextDrawTime(): Date {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  let nextMinute: number;
  let nextHour = currentHour;

  if (currentMinute < 30) {
    // If before :30, next is :30 of current hour
    nextMinute = 30;
  } else {
    // If at or after :30, next is :00 of next hour
    nextMinute = 0;
    nextHour = (currentHour + 1) % 24; // Wrap around at midnight
  }

  // Create the Date object for the next draw
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), nextHour, nextMinute, 0, 0);

  // If the calculated time is in the past (edge case, like exactly at :30:00), add 30 minutes
  if (next <= now) {
    next.setMinutes(next.getMinutes() + 30);
  }

  console.log("[DRAW TIME] Next draw time:", next);
  return next;
}

// We'll need functions to transition the state
export function startDrawExecution() {
  drawState.currentState = "EXECUTING";
  drawState.lastDrawResult = null;
}

// In announceWinner, start the timeout HERE (not in resetToWaiting)
export function announceWinner(drawResultData: DrawResult) {
  drawState.currentState = "ANNOUNCING";
  drawState.lastDrawResult = drawResultData;

  // After 1 minute, reset
  setTimeout(() => {
    resetToWaiting();
  }, 30 * 1000);
}

// In resetToWaiting, just update state and time (no timeout here)
export function resetToWaiting() {
  drawState.currentState = "WAITING";
  drawState.nextDrawTime = getNextDrawTime(); // Update to the NEW next time
  drawState.lastDrawResult = null;
}
