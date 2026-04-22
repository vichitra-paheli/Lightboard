CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"tool_calls" jsonb,
	"tool_results" jsonb,
	"view_spec" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"data_source_id" uuid,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_conv_seq_idx" ON "conversation_messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE INDEX "conversation_messages_org_conv_idx" ON "conversation_messages" USING btree ("org_id","conversation_id");--> statement-breakpoint
CREATE INDEX "conversations_org_source_last_idx" ON "conversations" USING btree ("org_id","data_source_id","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_org_creator_last_idx" ON "conversations" USING btree ("org_id","created_by","last_message_at");--> statement-breakpoint

-- Row-Level Security: follow the pattern from 0001_enable_rls.sql. Both tables
-- carry `org_id` and are gated by the `app.current_org_id` session variable
-- that the API middleware sets on every request for the app pool.

ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "conversations_tenant_isolation" ON "conversations"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "conversations_tenant_insert" ON "conversations"
  FOR INSERT WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "conversation_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "conversation_messages_tenant_isolation" ON "conversation_messages"
  USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "conversation_messages_tenant_insert" ON "conversation_messages"
  FOR INSERT WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);