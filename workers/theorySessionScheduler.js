import { sweepExpiredTheorySessions } from "../services/theorySessionService.js";
import { sendPendingTheoryResults } from "../services/theoryResultEmail.js";

export const startTheorySessionScheduler = () => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await sweepExpiredTheorySessions(); await sendPendingTheoryResults(); }
    catch (error) { console.error("Theory session scheduler failed", error); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 5000);
  timer.unref?.();
  void tick();
  return { stop: () => clearInterval(timer) };
};
