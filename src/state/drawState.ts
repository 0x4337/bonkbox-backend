import { DrawResult } from "../services/drawEngine.js";
import EventEmitter from "events";

export interface DrawState {
  currentState: "WAITING" | "EXECUTING" | "ANNOUNCING";
  nextDrawTime: Date;
  lastDrawResult: DrawResult | null;
}

// This object holds the live state of our application.
export const drawState: DrawState = {
  // Can be 'WAITING', 'EXECUTING', or 'ANNOUNCING'
  currentState: "WAITING",

  // The exact time the next draw is scheduled to run.
  nextDrawTime: getNextDrawTime(), // We'll define this function

  // When a draw is complete, we'll store the winner's info here temporarily.
  lastDrawResult: null, // Will hold winner's address, prize, etc.
};

// Event emitter for draw state changes
export const drawStateEvents = new EventEmitter();

// Helper function: Calculate the next draw time (every 30 minutes, on :00 or :30)
function getNextDrawTime(): Date {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  let nextMinute: number;
  let nextHour = currentHour;

  if (currentMinute < 45) {
    // If before :35, next is :35 of current hour
    nextMinute = 45;
  } else {
    // If at or after :45, next is :00 of next hour
    nextMinute = 0;
    nextHour = (currentHour + 1) % 24; // Wrap around at midnight
  }

  // Create the Date object for the next draw
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), nextHour, nextMinute, 0, 0);

  // If the calculated time is in the past (edge case, like exactly at :45:00), add 45 minutes
  if (next <= now) {
    next.setMinutes(next.getMinutes() + 45);
  }

  console.log("[DRAW TIME] Next draw time:", next);
  return next;
}

// We'll need functions to transition the state
export function startDrawExecution() {
  drawState.currentState = "EXECUTING";
  drawState.lastDrawResult = null;
  drawStateEvents.emit("stateChanged", { ...drawState });
}

// In announceWinner, start the timeout HERE (not in resetToWaiting)
export function announceWinner(drawResultData: DrawResult) {
  drawState.currentState = "ANNOUNCING";
  drawState.lastDrawResult = drawResultData;
  drawStateEvents.emit("stateChanged", { ...drawState });

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
  drawStateEvents.emit("stateChanged", { ...drawState });
}
