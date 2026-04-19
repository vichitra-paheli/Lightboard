-- Multi-config LLM routing: RLS + backfill for model_configs and
-- agent_role_assignments (tables themselves are created in 0000).
--
-- This migration layers on the org-scoped RLS policies plus a one-time
-- backfill that turns each org's pre-existing `organizations.ai_credentials`
-- blob into a "Default" model config routed to all four agent roles.

-- ---------------------------------------------------------------------------
-- RLS — both new tables are org-scoped. Follow the pattern from 0001.
-- ---------------------------------------------------------------------------

ALTER TABLE "model_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "model_configs_tenant_isolation" ON "model_configs"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "model_configs_tenant_insert" ON "model_configs"
  FOR INSERT WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "agent_role_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "agent_role_assignments_tenant_isolation" ON "agent_role_assignments"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "agent_role_assignments_tenant_insert" ON "agent_role_assignments"
  FOR INSERT WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Backfill — for every org with existing ai_credentials, create a Default
-- model_configs row and wire it up to all four agent roles.
--
-- We intentionally leave organizations.ai_credentials and settings.ai intact
-- for one release so we can roll back. The new code path will ignore them
-- once a model_configs row exists.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  org_row RECORD;
  new_config_id uuid;
  provider_type text;
  model_name text;
  base_url text;
BEGIN
  FOR org_row IN
    SELECT id, settings, ai_credentials
    FROM organizations
    WHERE ai_credentials IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM model_configs WHERE model_configs.org_id = organizations.id
      )
  LOOP
    -- Translate the legacy providerType enum into the new provider key. The
    -- old schema only supported 'claude' | 'openai-compatible'; everything
    -- else in the handoff catalog is new and has no legacy rows to migrate.
    provider_type := COALESCE(org_row.settings->'ai'->>'providerType', 'anthropic');
    IF provider_type = 'claude' THEN
      provider_type := 'anthropic';
    END IF;

    model_name := COALESCE(
      org_row.settings->'ai'->>'model',
      CASE WHEN provider_type = 'anthropic'
           THEN 'claude-sonnet-4-20250514'
           ELSE 'gpt-4o'
      END
    );
    base_url := org_row.settings->'ai'->>'baseUrl';

    INSERT INTO model_configs (org_id, name, provider, model, base_url, encrypted_api_key)
    VALUES (
      org_row.id,
      'Default',
      provider_type,
      model_name,
      base_url,
      org_row.ai_credentials
    )
    RETURNING id INTO new_config_id;

    INSERT INTO agent_role_assignments (org_id, role, model_config_id) VALUES
      (org_row.id, 'leader',   new_config_id),
      (org_row.id, 'query',    new_config_id),
      (org_row.id, 'view',     new_config_id),
      (org_row.id, 'insights', new_config_id);
  END LOOP;
END $$;
