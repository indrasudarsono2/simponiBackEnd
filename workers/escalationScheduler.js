import cron from "node-cron";
import { runEscalationWorker } from "./escalationWorker.js";

const ESCALATION_CRON_EXPRESSION = "*/15 * * * *";
let isEscalationWorkerRunning = false;

const runScheduledEscalationWorker = async () => {
  if (isEscalationWorkerRunning) {
    console.warn("Escalation scheduler skipped: previous run is still active.");
    return;
  }

  isEscalationWorkerRunning = true;

  try {
    const result = await runEscalationWorker();
    console.log(`Escalation scheduler completed: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error("Escalation scheduler failed:", error);
  } finally {
    isEscalationWorkerRunning = false;
  }
};

export function startEscalationScheduler() {
  const task = cron.schedule(
    ESCALATION_CRON_EXPRESSION,
    runScheduledEscalationWorker,
    { timezone: "Asia/Jakarta" },
  );

  console.log("Escalation scheduler started: every 15 minutes.");
  return task;
}
