-- Enable Row Level Security on all tables with org_id
-- This migration must be run after the initial schema migration

-- Organizations: filter on id (not org_id)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY organizations_tenant_isolation ON organizations
  USING (id = current_setting('app.current_org_id', true)::uuid);
CREATE POLICY organizations_tenant_insert ON organizations
  FOR INSERT WITH CHECK (id = current_setting('app.current_org_id', true)::uuid);

-- Users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_tenant_isolation ON users
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
CREATE POLICY users_tenant_insert ON users
  FOR INSERT WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- Sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessions_tenant_isolation ON sessions
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
CREATE POLICY sessions_tenant_insert ON sessions
  FOR INSERT WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- Data Sources
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY data_sources_tenant_isolation ON data_sources
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
CREATE POLICY data_sources_tenant_insert ON data_sources
  FOR INSERT WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- Views
ALTER TABLE views ENABLE ROW LEVEL SECURITY;
CREATE POLICY views_tenant_isolation ON views
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
CREATE POLICY views_tenant_insert ON views
  FOR INSERT WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- Telemetry Events (in telemetry schema)
ALTER TABLE telemetry.telemetry_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY telemetry_events_tenant_isolation ON telemetry.telemetry_events
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
CREATE POLICY telemetry_events_tenant_insert ON telemetry.telemetry_events
  FOR INSERT WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);
