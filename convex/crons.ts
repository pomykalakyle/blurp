import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "plan daily heartbeat agent runs",
  "5 0 * * *",
  internal.agentRuns.planDailyHeartbeats,
  {},
);

export default crons;
