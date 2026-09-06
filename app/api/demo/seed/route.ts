import { NextResponse } from "next/server";
import { getSupabaseServerClient, getServerIsPlatformAdmin, getServerMemberships } from "@/lib/serverAuth";
import {
  demoCategories,
  demoAccounts,
  demoTransactions,
  demoBudgets,
  demoGoals,
  demoPlannedTransactions,
  demoActivities,
  demoNotifications,
  demoTodos,
} from "@/data/demo-seed";

// ============================================================
// POST /api/demo/seed
// Populates an EXISTING business with comprehensive demo data.
//
// Seeds only the existing Demo Business. It never creates a business,
// profile, membership, or platform-admin-owned records.
// ============================================================

export async function POST(request: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured." }, { status: 500 });
    }

    // 1. Get authenticated user
    const { data: user, error: userError } = await supabase.auth.getUser();
    if (userError || !user.user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const authUserId = user.user.id;

    // 2. Parse request body. Only the existing Demo Business is eligible.
    let body: { businessId?: string } = {};
    try {
      body = await request.json();
    } catch {
      // No body provided
    }

    // 3. Resolve the existing demo tenant by stable slug/name. Never create a
    // business or fall back to an arbitrary membership.
    let { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name, slug, currency")
      .eq("slug", "demo-business")
      .maybeSingle();
    if (!business && !businessError) {
      ({ data: business, error: businessError } = await supabase
        .from("businesses")
        .select("id, name, slug, currency")
        .eq("slug", "mwai-co-services")
        .maybeSingle());
    }
    if (!business && !businessError) {
      ({ data: business, error: businessError } = await supabase
        .from("businesses")
        .select("id, name, slug, currency")
        .eq("name", "Demo Business")
        .maybeSingle());
    }

    if (businessError || !business) {
      return NextResponse.json({ error: "Existing Demo Business was not found." }, { status: 404 });
    }

    const businessId = business.id;
    const businessName = business.name;
    const isPlatformAdmin = await getServerIsPlatformAdmin();
    if (!isPlatformAdmin) {
      const memberships = await getServerMemberships(authUserId);
      if (!memberships?.some((membership) => membership.id === businessId)) {
        return NextResponse.json({ error: "You are not authorized to seed the Demo Business." }, { status: 403 });
      }
    }

    // 4. Verify the optional id cannot redirect the seed to another tenant.
    if (body.businessId && body.businessId !== businessId) {
      return NextResponse.json({ error: "Only the existing Demo Business may be seeded." }, { status: 400 });
    }

    const { data: businessMembers } = await supabase
      .from("business_members")
      .select("user_id")
      .eq("business_id", businessId)
      .order("created_at");
    const memberUserIds = (businessMembers ?? [])
      .map((member) => member.user_id)
      .filter((userId): userId is string => typeof userId === "string");

    // 5. Verify the business exists
    const { data: verifiedBusiness, error: verifiedBusinessError } = await supabase
      .from("businesses")
      .select("id, name, slug, currency")
      .eq("id", businessId)
      .maybeSingle();

    if (verifiedBusinessError || !verifiedBusiness) {
      return NextResponse.json({ error: "Business not found." }, { status: 404 });
    }

    // 6. Clear only rows owned by this deterministic seed. Existing business
    // members and unrelated tenant records remain untouched.
    const deleteResults = await Promise.all([
      supabase.from("transactions").delete().eq("business_id", businessId).in("local_id", demoTransactions.map((t) => t.id)),
      supabase.from("planned_transactions").delete().eq("business_id", businessId).in("local_id", demoPlannedTransactions.map((p) => p.id)),
      supabase.from("activities").delete().eq("business_id", businessId).in("local_id", demoActivities.map((a) => a.id)),
      supabase.from("notifications").delete().eq("business_id", businessId).in("local_id", demoNotifications.map((n) => n.id)),
      supabase.from("budgets").delete().eq("business_id", businessId).in("local_id", demoBudgets.map((b) => b.id)),
      supabase.from("goals").delete().eq("business_id", businessId).in("local_id", demoGoals.map((g) => g.id)),
      supabase.from("accounts").delete().eq("business_id", businessId).in("local_id", demoAccounts.map((a) => a.id)),
      supabase.from("categories").delete().eq("business_id", businessId).in("local_id", demoCategories.map((c) => c.id)),
      supabase.from("app_settings").delete().eq("business_id", businessId).in("key", ["todos", "selectedYear"]),
    ]);
    const deleteError = deleteResults.find((result) => result.error)?.error;
    if (deleteError) {
      return NextResponse.json({ error: `Demo cleanup: ${deleteError.message}` }, { status: 500 });
    }

    // 7. Seed categories
    const catRows = demoCategories.map((c) => ({
      business_id: businessId,
      local_id: c.id,
      name: c.name,
      category_group: c.group,
      type: c.type,
      color: c.color,
    }));
    const { error: catError } = await supabase.from("categories").insert(catRows);
    if (catError) return NextResponse.json({ error: `Categories: ${catError.message}` }, { status: 500 });

    // 8. Seed accounts
    const accRows = demoAccounts.map((a) => ({
      business_id: businessId,
      local_id: a.id,
      name: a.name,
      type: a.type,
      opening_balance: a.openingBalance,
      current_balance: a.currentBalance,
      currency: a.currency,
      institution: a.institution || null,
      active: a.active,
    }));
    const { error: accError } = await supabase.from("accounts").insert(accRows);
    if (accError) return NextResponse.json({ error: `Accounts: ${accError.message}` }, { status: 500 });

    // 9. Seed transactions
    const txRows = demoTransactions.map((t) => ({
      business_id: businessId,
      local_id: t.id,
      date: t.date,
      account_local_id: t.accountId,
      category_local_id: t.categoryId,
      type: t.type,
      amount: t.amount,
      description: t.description,
      status: t.status,
      notes: t.notes || null,
      to_account_local_id: t.toAccountId || null,
      currency: t.currency || "KES",
    }));
    const { error: txError } = await supabase.from("transactions").insert(txRows);
    if (txError) return NextResponse.json({ error: `Transactions: ${txError.message}` }, { status: 500 });

    // 10. Seed budgets
    const budgetRows = demoBudgets.map((b) => ({
      business_id: businessId,
      local_id: b.id,
      category_local_id: b.categoryId,
      period_id: b.periodId,
      month: b.month,
      planned_amount: b.plannedAmount,
      actual_amount: b.actualAmount,
    }));
    const { error: budgetError } = await supabase.from("budgets").insert(budgetRows);
    if (budgetError) return NextResponse.json({ error: `Budgets: ${budgetError.message}` }, { status: 500 });

    // 11. Seed goals
    const goalRows = demoGoals.map((g) => ({
      business_id: businessId,
      local_id: g.id,
      name: g.name,
      target_amount: g.targetAmount,
      current_amount: g.currentAmount,
      target_date: g.targetDate,
      status: g.status,
      currency: g.currency || "KES",
    }));
    const { error: goalError } = await supabase.from("goals").insert(goalRows);
    if (goalError) return NextResponse.json({ error: `Goals: ${goalError.message}` }, { status: 500 });

    // 12. Seed planned transactions
    const plannedRows = demoPlannedTransactions.map((p) => ({
      business_id: businessId,
      local_id: p.id,
      date: p.date,
      account_local_id: p.accountId,
      category_local_id: p.categoryId,
      description: p.description,
      amount: p.amount,
      type: p.type,
      status: p.status,
      recurrence: p.recurrence || null,
      to_account_local_id: p.toAccountId || null,
      currency: "KES",
    }));
    const { error: plannedError } = await supabase.from("planned_transactions").insert(plannedRows);
    if (plannedError) return NextResponse.json({ error: `Planned: ${plannedError.message}` }, { status: 500 });

    // 13. Seed activities
    const activityRows = demoActivities.map((a, index) => ({
      business_id: businessId,
      local_id: a.id,
      actor_user_id: memberUserIds.length > 0 ? memberUserIds[index % memberUserIds.length] : null,
      title: a.title,
      date: a.date,
      notes: a.notes || null,
      status: a.status,
      due_date: a.dueDate || null,
      priority: a.priority || null,
      completed_at: a.completedAt || null,
    }));
    const { error: activityError } = await supabase.from("activities").insert(activityRows);
    if (activityError) return NextResponse.json({ error: `Activities: ${activityError.message}` }, { status: 500 });

    // 14. Seed notifications
    const notifRows = demoNotifications.map((n) => ({
      business_id: businessId,
      local_id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      status: n.status,
      date: n.date,
    }));
    const { error: notifError } = await supabase.from("notifications").insert(notifRows);
    if (notifError) return NextResponse.json({ error: `Notifications: ${notifError.message}` }, { status: 500 });

    // 15. Seed todos
    const { error: todosError } = await supabase.from("app_settings").insert({
      business_id: businessId,
      key: "todos",
      value: demoTodos,
    });
    if (todosError) return NextResponse.json({ error: `Todos: ${todosError.message}` }, { status: 500 });

    // 16. Set selected year
    const { error: yearError } = await supabase.from("app_settings").insert({
      business_id: businessId,
      key: "selectedYear",
      value: 2026,
    });
    if (yearError) return NextResponse.json({ error: `Year: ${yearError.message}` }, { status: 500 });

    const incomeTotal = demoTransactions
      .filter((transaction) => transaction.type === "income")
      .reduce((total, transaction) => total + transaction.amount, 0);
    const expenseTotal = demoTransactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((total, transaction) => total + transaction.amount, 0);

    // 17. Return success summary
    return NextResponse.json({
      success: true,
      authenticatedUserId: authUserId,
      businessName,
      businessId,
      counts: {
        categories: demoCategories.length,
        accounts: demoAccounts.length,
        transactions: demoTransactions.length,
        budgets: demoBudgets.length,
        goals: demoGoals.length,
        plannedTransactions: demoPlannedTransactions.length,
        activities: demoActivities.length,
        notifications: demoNotifications.length,
        todos: demoTodos.length,
        members: memberUserIds.length,
      },
      dateRange: {
        start: demoTransactions.reduce((min, transaction) => transaction.date < min ? transaction.date : min, demoTransactions[0]?.date ?? ""),
        end: demoTransactions.reduce((max, transaction) => transaction.date > max ? transaction.date : max, demoTransactions[0]?.date ?? ""),
      },
      totals: {
        income: incomeTotal,
        expenses: expenseTotal,
        netBeforeTransfers: incomeTotal - expenseTotal,
        accountBalances: demoAccounts.map((account) => ({
          id: account.id,
          name: account.name,
          openingBalance: account.openingBalance,
          currentBalance: account.currentBalance,
        })),
      },
      message: `Demo data seeded successfully into "${businessName}". All records belong to this business.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
