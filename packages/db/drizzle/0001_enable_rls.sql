-- Enable Row Level Security on all tables with org_id.
--
-- RLS policies gate every row by the session variable `app.current_org_id`,
-- which the API middleware sets on every request for the app-role pool. The
-- admin-role pool (used by login/register/bootstrap) bypasses RLS because it
-- does not match the `FORCE ROW LEVEL SECURITY` condition — ordinary table
-- owners are not affected by policies.

-- Organizations: filter on id (not org_id)
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "organizations_tenant_isolation" ON "organizations"
  USING (id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "organizations_tenant_insert" ON "organizations"
  FOR INSERT WITH CHECK (id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint

-- Users
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "users_tenant_isolation" ON "users"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "users_tenant_insert" ON "users"
  FOR INSERT WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint

-- Sessions
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sessions_tenant_isolation" ON "sessions"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "sessions_tenant_insert" ON "sessions"
  FOR INSERT WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint

-- Data Sources
ALTER TABLE "data_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "data_sources_tenant_isolation" ON "data_sources"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "data_sources_tenant_insert" ON "data_sources"
  FOR INSERT WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint

-- Views
ALTER TABLE "views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "views_tenant_isolation" ON "views"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "views_tenant_insert" ON "views"
  FOR INSERT WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint

-- Telemetry Events (in telemetry schema)
ALTER TABLE "telemetry"."telemetry_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "telemetry_events_tenant_isolation" ON "telemetry"."telemetry_events"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "telemetry_events_tenant_insert" ON "telemetry"."telemetry_events"
  FOR INSERT WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);
