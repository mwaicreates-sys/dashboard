import { NextResponse } from "next/server";
import { getSupabaseServerClient, getServerMemberships } from "@/lib/serverAuth";
import type { BusinessInfo } from "@/lib/cloudSync";
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
// Uses ONLY the authenticated session to resolve the target business.
// Does NOT create a new business, profile, or membership.
//
// Behavior:
//   1. Get authenticated user via auth.getUser()
//   2. Get user's business memberships via getServerMemberships()
//   3. If exactly 1 membership → seed that business
//   4. If multiple memberships → require explicit businessId in body
//   5. If 0 memberships → return error
//
// Request body (optional):
//   { "businessId": "uuid" }  // required only when user has multiple businesses
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

    // 2. Get user's business memberships using existing application logic
    const memberships = await getServerMemberships(authUserId);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json(
        { error: "No business memberships found. Join or create a business first." },
        { status: 404 }
      );
    }

    // 3. Parse request body for optional businessId
    let body: { businessId?: string } = {};
    try {
      body = await request.json();
    } catch {
      // No body provided
    }

    // 4. Resolve target business
    let targetBusiness: BusinessInfo | null = null;

    if (memberships.length === 1) {
      // Exactly one membership → use it automatically
      targetBusiness = memberships[0];
    } else if (memberships.length > 1) {
      // Multiple memberships → require explicit businessId
      if (!body.businessId || typeof body.businessId !== "string") {
        return NextResponse.json(
          {
            error: "Multiple businesses found. Specify which business to seed.",
            businesses: memberships.map((m) => ({
              id: m.id,
              name: m.name,
              role: m.role,
            })),
          },
          { status: 400 }
        );
      }

      // Find the specified business
      targetBusiness = memberships.find((m) => m.id === body.businessId) || null;

      if (!targetBusiness) {
        return NextResponse.json(
          {
            error: "Business not found or you don't have access to it.",
            availableBusinesses: memberships.map((m) => ({
              id: m.id,
              name: m.name,
              role: m.role,
            })),
          },
          { status: 404 }
        );
      }
    }

    const businessId = targetBusiness!.id;
    const businessName = targetBusiness!.name;

    // 5. Verify the business exists
    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name, currency")
      .eq("id", businessId)
      .maybeSingle();

    if (businessError || !business) {
      return NextResponse.json({ error: "Business not found." }, { status: 404 });
    }

    // 6. Clear existing data for this business (safe reset)
    await supabase.from("transactions").delete().eq("business_id", businessId);
    await supabase.from("planned_transactions").delete().eq("business_id", businessId);
    await supabase.from("activities").delete().eq("business_id", businessId);
    await supabase.from("notifications").delete().eq("business_id", businessId);
    await supabase.from("budgets").delete().eq("business_id", businessId);
    await supabase.from("goals").delete().eq("business_id", businessId);
    await supabase.from("accounts").delete().eq("business_id", businessId);
    await supabase.from("categories").delete().eq("business_id", businessId);
    await supabase.from("app_settings").delete().eq("business_id", businessId);

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
    const activityRows = demoActivities.map((a) => ({
      business_id: businessId,
      local_id: a.id,
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
