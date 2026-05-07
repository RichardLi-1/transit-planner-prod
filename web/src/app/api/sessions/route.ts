import { NextResponse } from "next/server";
import { auth0 } from "~/lib/auth0";
import { supabase } from "~/server/supabase";
import type { CreatePlanBody, PlanSession, PlanSessionSummary } from "~/lib/plans";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.sub;

  const { data, error } = await supabase
    .from("plan_sessions")
    .select("id, name, routes, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summaries: PlanSessionSummary[] = (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    routeCount: Array.isArray(row.routes) ? (row.routes as unknown[]).length : 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));

  return NextResponse.json(summaries);
}

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.sub;

  let body: CreatePlanBody;
  try {
    body = (await req.json()) as CreatePlanBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, routes, hiddenRoutes } = body;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!Array.isArray(routes)) {
    return NextResponse.json({ error: "Routes must be an array" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("plan_sessions")
    .insert({
      user_id: userId,
      name: name.trim(),
      routes,
      hidden_routes: Array.isArray(hiddenRoutes) ? hiddenRoutes : [],
    })
    .select("id, name, routes, hidden_routes, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const plan: PlanSession = {
    id: data.id as string,
    name: data.name as string,
    routes: data.routes as PlanSession["routes"],
    hiddenRoutes: (data.hidden_routes as string[]) ?? [],
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };

  return NextResponse.json(plan, { status: 201 });
}
