export type AccountType = "checking" | "savings" | "credit" | "investment" | "cash";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  institution?: string;
  updatedAt: string;
}

export type TransactionType = "income" | "expense" | "transfer";

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  accountId: string;
  plannedId?: string;
  tags?: string[];
}

export interface Category {
  id: string;
  name: string;
  type: "income" | "expense";
  color: string;
  parentId?: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  period: "monthly" | "annual";
  amount: number;
  year: number;
  month?: number;
}

export interface Goal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  priority: "high" | "medium" | "low";
}

export interface PlannedTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: TransactionType;
  categoryId: string;
  accountId: string;
  status: "pending" | "completed" | "cancelled";
  recurrence?: "once" | "monthly" | "yearly";
}

export interface Period {
  label: string;
  startDate: string;
  endDate: string;
  months: string[];
}
