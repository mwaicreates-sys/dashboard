import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

    const isPlatformAdmin = await getServerIsPlatformAdmin();
    let db = supabase;
    if (isPlatformAdmin) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceKey) {
        return NextResponse.json(
          { error: "Demo seeding requires the server-only Supabase service-role key." },
          { status: 500 },
        );
      }
      db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }

    // 3. Resolve the dedicated demo tenant by stable identifier. Geraldmwaike
    // and Mwai & Co are intentionally never candidates for this seed.
    let { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name, slug, currency")
      .eq("slug", "demo-business")
      .maybeSingle();
    if (!business && !businessError) {
      ({ data: business, error: businessError } = await supabase
        .from("businesses")
        .select("id, name, slug, currency")
        .eq("name", "Demo Business")
        .maybeSingle());
    }

    if (businessError) {
      return NextResponse.json({ error: `Could not resolve Demo Business: ${businessError.message}` }, { status: 500 });
    }

    if (!business) {
      if (!isPlatformAdmin) {
        return NextResponse.json({ error: "Demo Business was not found." }, { status: 404 });
      }

      const { data: createdBusinessId, error: createError } = await supabase.rpc("admin_create_business", {
        p_currency: "KES",
        p_name: "Demo Business",
        p_owner_name: null,
        p_owner_email: null,
      });
      if (createError || typeof createdBusinessId !== "string") {
        return NextResponse.json(
          { error: `Demo Business does not exist and could not be provisioned: ${createError?.message ?? "invalid business id"}` },
          { status: 500 },
        );
      }

      const { data: createdBusiness, error: createdBusinessError } = await db
        .from("businesses")
        .select("id, name, slug, currency")
        .eq("id", createdBusinessId)
        .maybeSingle();
      if (createdBusinessError || !createdBusiness) {
        return NextResponse.json({ error: "Demo Business was created but could not be reloaded." }, { status: 500 });
      }
      business = createdBusiness;
    }

    const businessId = business.id;
    const businessName = business.name;
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

    const { data: businessMembers } = await db
      .from("business_members")
      .select("user_id")
      .eq("business_id", businessId)
      .order("created_at");
    const memberUserIds = (businessMembers ?? [])
      .map((member) => member.user_id)
      .filter((userId): userId is string => typeof userId === "string");

    // 5. Verify the business exists
    const { data: verifiedBusiness, error: verifiedBusinessError } = await db
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
      db.from("transactions").delete().eq("business_id", businessId).in("local_id", demoTransactions.map((t) => t.id)),
      db.from("planned_transactions").delete().eq("business_id", businessId).in("local_id", demoPlannedTransactions.map((p) => p.id)),
      db.from("activities").delete().eq("business_id", businessId).in("local_id", demoActivities.map((a) => a.id)),
      db.from("notifications").delete().eq("business_id", businessId).in("local_id", demoNotifications.map((n) => n.id)),
      db.from("budgets").delete().eq("business_id", businessId).in("local_id", demoBudgets.map((b) => b.id)),
      db.from("goals").delete().eq("business_id", businessId).in("local_id", demoGoals.map((g) => g.id)),
      db.from("accounts").delete().eq("business_id", businessId).in("local_id", demoAccounts.map((a) => a.id)),
      db.from("categories").delete().eq("business_id", businessId).in("local_id", demoCategories.map((c) => c.id)),
      db.from("app_settings").delete().eq("business_id", businessId).in("key", ["todos", "year", "currency"]),
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
    const { data: insertedCategories, error: catError } = await db
      .from("categories")
      .insert(catRows)
      .select("id, local_id");
    if (catError) return NextResponse.json({ error: `Categories: ${catError.message}` }, { status: 500 });
    const categoryIds = new Map((insertedCategories ?? []).map((row) => [row.local_id, row.id]));
    if (categoryIds.size !== demoCategories.length) {
      return NextResponse.json({ error: "Categories: seeded category ids could not be resolved." }, { status: 500 });
    }

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
    const { data: insertedAccounts, error: accError } = await db
      .from("accounts")
      .insert(accRows)
      .select("id, local_id");
    if (accError) return NextResponse.json({ error: `Accounts: ${accError.message}` }, { status: 500 });
    const accountIds = new Map((insertedAccounts ?? []).map((row) => [row.local_id, row.id]));
    if (accountIds.size !== demoAccounts.length) {
      return NextResponse.json({ error: "Accounts: seeded account ids could not be resolved." }, { status: 500 });
    }

    // 9. Seed transactions
    const txRows = demoTransactions.map((t) => ({
      business_id: businessId,
      local_id: t.id,
      date: t.date,
      account_local_id: t.accountId,
      account_id: accountIds.get(t.accountId),
      category_local_id: t.categoryId,
      category_id: categoryIds.get(t.categoryId),
      type: t.type,
      amount: t.amount,
      description: t.description,
      status: t.status,
      notes: t.notes || null,
      to_account_local_id: t.toAccountId || null,
      to_account_id: t.toAccountId ? accountIds.get(t.toAccountId) : null,
      currency: t.currency || "KES",
    }));
    const { error: txError } = await db.from("transactions").insert(txRows);
    if (txError) return NextResponse.json({ error: `Transactions: ${txError.message}` }, { status: 500 });

    // 10. Seed budgets
    const budgetRows = demoBudgets.map((b) => ({
      business_id: businessId,
      local_id: b.id,
      category_local_id: b.categoryId,
      category_id: categoryIds.get(b.categoryId),
      period_id: b.periodId,
      month: b.month,
      planned_amount: b.plannedAmount,
      actual_amount: b.actualAmount,
    }));
    const { error: budgetError } = await db.from("budgets").insert(budgetRows);
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
    const { error: goalError } = await db.from("goals").insert(goalRows);
    if (goalError) return NextResponse.json({ error: `Goals: ${goalError.message}` }, { status: 500 });

    // 12. Seed planned transactions
    const plannedRows = demoPlannedTransactions.map((p) => ({
      business_id: businessId,
      local_id: p.id,
      date: p.date,
      account_local_id: p.accountId,
      account_id: accountIds.get(p.accountId),
      category_local_id: p.categoryId,
      category_id: categoryIds.get(p.categoryId),
      description: p.description,
      amount: p.amount,
      type: p.type,
      status: p.status,
      recurrence: p.recurrence || null,
      to_account_local_id: p.toAccountId || null,
      to_account_id: p.toAccountId ? accountIds.get(p.toAccountId) : null,
      currency: "KES",
    }));
    const { error: plannedError } = await db.from("planned_transactions").insert(plannedRows);
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
    const { error: activityError } = await db.from("activities").insert(activityRows);
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
    const { error: notifError } = await db.from("notifications").insert(notifRows);
    if (notifError) return NextResponse.json({ error: `Notifications: ${notifError.message}` }, { status: 500 });

    // 15. Seed todos
    const { error: todosError } = await db.from("app_settings").insert({
      business_id: businessId,
      key: "todos",
      value: demoTodos,
    });
    if (todosError) return NextResponse.json({ error: `Todos: ${todosError.message}` }, { status: 500 });

    // 16. Set the business display settings using the keys read by cloudSync.
    const { error: settingsError } = await db.from("app_settings").insert([
      { business_id: businessId, key: "year", value: 2026 },
      { business_id: businessId, key: "currency", value: "KES" },
    ]);
    if (settingsError) return NextResponse.json({ error: `Settings: ${settingsError.message}` }, { status: 500 });

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
