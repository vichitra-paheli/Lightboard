import { agentRoleAssignments, modelConfigs } from '@lightboard/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth';
import { AGENT_ROLES, type AgentRole } from '@/lib/ai-provider';

/** Shape of the `PUT` payload — partial map role → configId. */
interface RoutingBody {
  leader?: string | null;
  query?: string | null;
  view?: string | null;
  insights?: string | null;
}

/**
 * GET /api/settings/ai/routing — return the current role → configId mapping.
 * Roles that aren't yet mapped return `null` so the UI can show them as
 * unset (the org has configs but hasn't picked a default yet).
 */
export const GET = withAuth(async (_req, { db, orgId }) => {
  const rows = await db
    .select({ role: agentRoleAssignments.role, modelConfigId: agentRoleAssignments.modelConfigId })
    .from(agentRoleAssignments)
    .where(eq(agentRoleAssignments.orgId, orgId));

  const map: Record<AgentRole, string | null> = {
    leader: null,
    query: null,
    view: null,
    insights: null,
  };
  for (const row of rows) {
    if (AGENT_ROLES.includes(row.role as AgentRole)) {
      map[row.role as AgentRole] = row.modelConfigId;
    }
  }
  return NextResponse.json({ routing: map });
});

/**
 * PUT /api/settings/ai/routing — bulk upsert the four role assignments.
 *
 * Validates every referenced config id belongs to this org before writing.
 * Accepts a partial body — any omitted role is left unchanged.
 */
export const PUT = withAuth(async (req, { db, orgId }) => {
  let body: RoutingBody;
  try {
    body = (await req.json()) as RoutingBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Collect every non-null config id referenced in the payload so we can
  // validate them all in a single round-trip.
  const requestedIds = AGENT_ROLES.map((role) => body[role])
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  const uniqueIds = Array.from(new Set(requestedIds));

  if (uniqueIds.length > 0) {
    const owned = await db
      .select({ id: modelConfigs.id })
      .from(modelConfigs)
      .where(and(eq(modelConfigs.orgId, orgId), inArray(modelConfigs.id, uniqueIds)));
    const ownedSet = new Set(owned.map((r) => r.id));
    for (const id of uniqueIds) {
      if (!ownedSet.has(id)) {
        return NextResponse.json(
          { error: `Config ${id} does not exist or does not belong to this org.` },
          { status: 400 },
        );
      }
    }
  }

  // Apply each role update individually so we can honor partial bodies cleanly.
  for (const role of AGENT_ROLES) {
    const value = body[role];
    if (value === undefined) continue;
    if (value === null) {
      await db
        .delete(agentRoleAssignments)
        .where(and(eq(agentRoleAssignments.orgId, orgId), eq(agentRoleAssignments.role, role)));
      continue;
    }
    // Try update first; if the row doesn't exist yet, insert it.
    const updated = await db
      .update(agentRoleAssignments)
      .set({ modelConfigId: value })
      .where(and(eq(agentRoleAssignments.orgId, orgId), eq(agentRoleAssignments.role, role)))
      .returning({ role: agentRoleAssignments.role });
    if (updated.length === 0) {
      await db
        .insert(agentRoleAssignments)
        .values({ orgId, role, modelConfigId: value });
    }
  }

  const rows = await db
    .select({ role: agentRoleAssignments.role, modelConfigId: agentRoleAssignments.modelConfigId })
    .from(agentRoleAssignments)
    .where(eq(agentRoleAssignments.orgId, orgId));
  const map: Record<AgentRole, string | null> = {
    leader: null,
    query: null,
    view: null,
    insights: null,
  };
  for (const row of rows) {
    if (AGENT_ROLES.includes(row.role as AgentRole)) {
      map[row.role as AgentRole] = row.modelConfigId;
    }
  }
  return NextResponse.json({ routing: map });
});
