import postgres from "postgres";
import dotenv from "dotenv";
import { HolderSnapshot } from "./holderSnapshotService.js";
import { VerificationData, WinnerData, PrizeData } from "./drawEngine.js";

dotenv.config();

class StorageService {
  private sql: postgres.Sql;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    this.sql = postgres(databaseUrl);
  }

  async saveDrawResult(snapshot: HolderSnapshot, verificationData: VerificationData, winnerData: WinnerData, prizeData: PrizeData): Promise<void> {
    const { totalTickets, holders } = snapshot;
    const { randomNumber, vrfRequestTxSignature, vrfAccountAddress } = verificationData;
    const { winningTicket } = winnerData;
    const { owner, balance, tickets, ticketRange } = winnerData.winner;
    const { prizeDistributionTxSignature, formattedAmount } = prizeData;

    await this.sql`
      INSERT INTO draws (
          raw_snapshot_data,
          total_tickets,
          random_number,
          vrf_request_tx,
          vrf_account_address,
          winning_ticket,
          winner_address,
          winner_token_balance,
          winner_tickets_amount,
          winner_ticket_range,
          prize_distribution_tx,
          prize_amount
      ) VALUES (
          ${JSON.stringify(snapshot)},
          ${totalTickets},
          ${randomNumber.toString()},
          ${vrfRequestTxSignature},
          ${vrfAccountAddress.toString()},
          ${winningTicket},
          ${owner},
          ${balance},
          ${tickets},
          ${JSON.stringify(ticketRange)},
          ${prizeDistributionTxSignature},
          ${formattedAmount}
      )`;

    fetch("https://bonkbox.app/api/revalidate");
  }
}

export { StorageService };
