// Database types for orchestra-app.
// Keep these in sync with supabase/migrations/*.sql

export type UUID = string;
export type Timestamp = string; // ISO 8601

// ---------- enums ----------
export type ManagerRole = 'admin' | 'manager';
export type ManagerStatus = 'active' | 'pending';
export type PlanType = 'starter' | 'pro';
export type PlanStatus = 'trialing' | 'active' | 'past_due' | 'cancelled';
export type SendStatus = 'queued' | 'sent' | 'accepted' | 'declined' | 'no_response' | 'skipped' | 'failed';
export type EmailProvider = 'gmail' | 'outlook' | 'smtp';
export type NotificationType =
  | 'response_accepted'
  | 'response_declined'
  | 'no_response_advanced'
  | 'position_filled'
  | 'send_failed'
  | 'trial_ending'
  | 'payment_failed';

// ---------- tables ----------
export interface Organization {
  id: UUID;
  name: string;
  logo_url: string | null;
  onboarding_completed: boolean;
  onboarding_step: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ManagerInvite {
  id: UUID;
  organization_id: UUID;
  email: string;
  role: ManagerRole;
  token: string;
  expires_at: Timestamp;
  accepted_at: Timestamp | null;
  invited_by: UUID | null;
  created_at: Timestamp;
}

export interface Manager {
  id: UUID;
  organization_id: UUID;
  user_id: UUID | null;
  email: string;
  role: ManagerRole;
  status: ManagerStatus;
  created_at: Timestamp;
}

export interface Plan {
  id: UUID;
  organization_id: UUID;
  plan_type: PlanType;
  send_count: number;
  send_limit: number;
  billing_period_start: Timestamp;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: Timestamp | null;
  status: PlanStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Musician {
  id: UUID;
  organization_id: UUID;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  position: string;
  rank: number;
  notes: string | null;
  is_blacklisted: boolean;
  custom_fields: Record<string, string | number | boolean | null>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'boolean' | 'select';

export interface CustomFieldDefinition {
  id: UUID;
  organization_id: UUID;
  label: string;
  field_type: CustomFieldType;
  options: string[] | null;
  is_required: boolean;
  display_order: number;
  created_at: Timestamp;
}

export interface MusicianAvailability {
  id: UUID;
  musician_id: UUID;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  reason: string | null;
  created_at: Timestamp;
}

// Musician with computed/joined flags used in list views
export interface MusicianWithStatus extends Musician {
  currently_unavailable?: boolean;
  has_notes?: boolean;
}

export interface EmailIntegration {
  id: UUID;
  manager_id: UUID;
  organization_id: UUID;
  provider: EmailProvider;
  email_address: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: Timestamp | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_username: string | null;
  smtp_password_encrypted: string | null;
  smtp_password_iv: string | null;
  smtp_from_name: string | null;
  is_active: boolean;
  connected_at: Timestamp;
  updated_at: Timestamp;
}

export interface EmailTemplate {
  id: UUID;
  organization_id: UUID;
  name: string;
  subject: string;
  body: string; // supports {{name}}, {{concert_name}}, {{date}}, etc.
  is_default: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface TemplateAttachment {
  id: UUID;
  template_id: UUID;
  file_name: string;
  file_url: string; // public URL in Supabase Storage
  file_size: number;
  mime_type: string;
  created_at: Timestamp;
}

// Template with attachment metadata for list/detail views
export interface EmailTemplateWithMeta extends EmailTemplate {
  attachment_count?: number;
  attachments?: TemplateAttachment[];
}

// Project (formerly "Concert") — generic cascade outreach workspace
export type ProjectStatus = 'draft' | 'active' | 'filled' | 'completed' | 'cancelled';
/** @deprecated use ProjectStatus */
export type ConcertStatus = ProjectStatus;
export type ConcertPositionStatus = 'pending' | 'active' | 'filled' | 'exhausted' | 'cancelled';
export type PositionMusicianStatus = 'pending' | 'sent' | 'accepted' | 'declined' | 'no_response' | 'skipped';
export type ResponseDeadlineType = 'days' | 'specific_date';

export interface Concert {
  id: UUID;
  organization_id: UUID;
  created_by: UUID | null;
  name: string;
  // Legacy concert fields — nullable, no longer shown in UI
  dates: string[] | null;
  rehearsal_dates: string[] | null;
  venue: string | null;
  // Project fields
  notes: string | null;
  template_id: UUID | null;          // default template for this project
  accept_deadline_hours: number;     // hours before auto-advancing
  accept_deadline_text: string | null; // human-readable deadline sentence
  custom_variables: Record<string, string>; // user-defined {{variables}}
  status: ProjectStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// Recipient Groups — reusable ordered contact sequences
export interface RecipientGroup {
  id: UUID;
  organization_id: UUID;
  name: string;
  description: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface RecipientGroupMember {
  id: UUID;
  group_id: UUID;
  musician_id: UUID | null; // null = ad-hoc contact not in main contacts list
  name: string;
  email: string;
  rank: number;
  created_at: Timestamp;
}

export interface RecipientGroupWithCount extends RecipientGroup {
  member_count: number;
}

export type SendMode = 'cascade' | 'broadcast';

export interface ConcertPosition {
  id: UUID;
  concert_id: UUID;
  position_name: string;
  musicians_needed: number;
  template_id: UUID | null;
  response_deadline_type: ResponseDeadlineType;
  response_deadline_days: number | null;
  response_deadline_date: Timestamp | null;
  auto_resend_enabled: boolean;
  auto_resend_days: number | null;
  send_mode: SendMode;
  position_group_label: string | null;
  status: ConcertPositionStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PositionDefinition {
  id: UUID;
  organization_id: UUID;
  name: string;
  section: string | null;
  display_order: number;
  default_group_id: UUID | null;
  created_at: Timestamp;
}

export interface ConcertPositionMusician {
  id: UUID;
  concert_position_id: UUID;
  musician_id: UUID;
  rank: number;
  status: PositionMusicianStatus;
  sent_at: Timestamp | null;
  responded_at: Timestamp | null;
  skip_reason: string | null;
  created_at: Timestamp;
}

// Position musician joined with master-list musician details + computed flags
export interface PositionMusicianRow extends ConcertPositionMusician {
  first_name: string;
  last_name: string;
  email: string;
  is_blacklisted: boolean;
  currently_unavailable?: boolean;
}

export interface ConcertWithPositions extends Concert {
  positions?: ConcertPosition[];
}

export type SendLogStatus = 'sent' | 'accepted' | 'declined' | 'no_response' | 'failed' | 'skipped';

export interface SendLog {
  id: UUID;
  concert_position_id: UUID | null;
  concert_position_musician_id: UUID | null;
  musician_id: UUID | null;
  organization_id: UUID | null;
  status: SendLogStatus;
  token: string;
  token_expires_at: Timestamp;
  token_used_at: Timestamp | null;
  sent_at: Timestamp | null;
  responded_at: Timestamp | null;
  email_subject: string | null;
  email_body: string | null;
  manager_id: UUID | null;
  failure_reason: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Notification {
  id: UUID;
  organization_id: UUID | null;
  manager_id: UUID;
  type: string;
  title: string;
  message: string;
  action_url: string | null;
  read: boolean;
  read_at: Timestamp | null;
  metadata: Record<string, unknown> | null;
  created_at: Timestamp;
}

export interface NotificationPreferences {
  id: UUID;
  manager_id: UUID;
  accepted_email: boolean;
  accepted_inapp: boolean;
  declined_email: boolean;
  declined_inapp: boolean;
  no_response_email: boolean;
  no_response_inapp: boolean;
  exhausted_email: boolean;
  exhausted_inapp: boolean;
  limit_warning_email: boolean;
  limit_warning_inapp: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type ActivityAction =
  | 'concert_created' | 'concert_updated' | 'concert_deleted' | 'concert_status_changed'
  | 'position_added' | 'position_updated' | 'position_deleted'
  | 'send_started' | 'send_accepted' | 'send_declined' | 'send_no_response'
  | 'send_failed' | 'send_skipped' | 'send_next_triggered' | 'position_exhausted' | 'position_filled'
  | 'musician_added' | 'musician_updated' | 'musician_deleted' | 'musician_imported'
  | 'musician_blacklisted' | 'musician_unblacklisted'
  | 'template_created' | 'template_updated' | 'template_deleted'
  | 'manager_invited' | 'manager_removed' | 'email_connected' | 'email_disconnected'
  | 'plan_upgraded' | 'plan_downgraded';

export interface ActivityLog {
  id: UUID;
  organization_id: UUID;
  manager_id: UUID | null;
  action: string;
  entity_type: string | null;
  entity_id: UUID | null;
  details: Record<string, unknown> | null;
  created_at: Timestamp;
}

export interface ActivityLogWithManager extends ActivityLog {
  manager_name: string | null;
}

// Usage history row (DB-backed).
export interface UsageHistory {
  id: UUID;
  organization_id: UUID;
  billing_period_start: Timestamp;
  billing_period_end: Timestamp;
  plan_type: string;
  send_limit: number;
  send_count: number;
  overage_count: number;
  overage_charged: boolean;
  overage_amount_cents: number;
  created_at: Timestamp;
}

// Computed usage summary DTO (camelCase — not a DB row).
export interface UsageSummary {
  currentPeriodStart: string;
  currentPeriodEnd: string;
  planType: string;
  sendCount: number;
  sendLimit: number;
  overageCount: number;
  percentageUsed: number;
  remainingSends: number;
  isOverLimit: boolean;
  daysRemainingInPeriod: number;
}
