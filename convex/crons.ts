import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "plan daily heartbeats",
  "5 0 * * *",
  internal.agentActivations.planDailyHeartbeats,
  {},
);

export default crons;
