import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { drawState } from "../state/drawState.js";
import { inMemoryFeeData } from "../api/routes/fees.js";

class WebSocketService {
  private wss: WebSocketServer | undefined;
  private clients: Set<WebSocket> = new Set();

  public initialize(server: Server): void {
    this.wss = new WebSocketServer({ server });
    this.wss.on("connection", (ws: WebSocket) => {
      this.handleConnection(ws);
    });
    console.log("WebSocket server initialized");
  }

  private handleConnection(ws: WebSocket): void {
    console.log("Client connected");
    this.clients.add(ws);

    //TODO: not DRY, need to eventually compartmentalise, fine for now...
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

    // 1. Send the current draw state immediately
    ws.send(
      JSON.stringify({
        type: "drawStatusUpdate",
        data: {
          currentState: drawState.currentState,
          nextDrawTime: drawState.nextDrawTime.toISOString(),
          lastDrawResult: filteredLastDrawResult,
        },
      }),
    );

    // 2. Send the formatted fee data immediately
    ws.send(
      JSON.stringify({
        type: "feesUpdate",
        data: { creatorBaseFee: inMemoryFeeData.creatorBaseFee.toString(), creatorQuoteFee: inMemoryFeeData.creatorQuoteFee.toString(), estimatedBonkAmount: inMemoryFeeData.estimatedBonkAmount, estimatedUsdValue: inMemoryFeeData.estimatedUsdValue },
      }),
    );

    ws.on("close", () => {
      console.log("Client disconnected");
      this.clients.delete(ws);
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      this.clients.delete(ws);
    });
  }

  public broadcast(data: any): void {
    if (!this.wss) return;
    const jsonData = JSON.stringify(data);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(jsonData);
      }
    });
  }
}

export const webSocketService = new WebSocketService();
