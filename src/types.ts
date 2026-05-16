// @ts-nocheck
export type GoalType = 'achievement' | 'avoidance';
export type GoalState = { done?: boolean; slipped?: boolean };

export type Goal = {
  id: string;
  title: string;
  type: GoalType;
  longTermGoalId?: string | null;
  longTermGoalTitle?: string | null;
  state?: GoalState;
  notes?: string | null;
  createdAt?: string;
};

export type LongTermGoal = {
  id: string;
  title: string;
  description?: string;
  status: 'active' | 'archived';
  createdAt?: string;
};

export type NarrativeVersion = {
  text: string;
  source: string;
  instruction?: string;
  createdAt?: string;
};

export type Week = {
  id: string;
  startDate: string;
  endDate: string | null;
  status: 'in_progress' | 'reviewed';
  goals: Goal[];
  narrative: { versions: NarrativeVersion[]; currentIndex: number };
  reviewConversation?: { messages: ChatMessage[] } | null;
  reviewedAt: string | null;
};

export type BacklogItem = { id: string; text: string; createdAt?: string };
export type Meta = {
  schemaVersion: number;
  longTermGoalIds: string[];
  currentWeekId: string;
  weekIds: string[];
  backlog: BacklogItem[];
};

export type StagedWeeklyGoal = {
  title: string;
  type: GoalType;
  longTermGoalTitle?: string | null;
  stagedIdx?: number;
};
export type StagedLongTermGoal = { title: string; description?: string; stagedIdx?: number };
export type StagedIdea = { text: string };

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  narrative?: string | null;
  proposals?: {
    weeklyGoals: StagedWeeklyGoal[];
    longTermGoals: StagedLongTermGoal[];
    ideas: StagedIdea[];
  };
  createdAt?: string;
};
