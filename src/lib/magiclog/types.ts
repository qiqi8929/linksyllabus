export type CompetenceType = "mandatory" | "optional";
export type WorkOrderStatus = "draft" | "completed" | "signed";

export type MagicLogAiStep = {
  /** Row id in `steps` — used for /play/[id] and work-order QR codes. */
  id?: string;
  step_number: number;
  title: string;
  description: string;
  start_time?: number;
  end_time?: number;
};

export type MagicLogCreationMode = "learn" | "steps_only" | "quick_log" | "type_it";

export type MagicLogVideoRef = {
  videoId: string;
  url: string;
  title: string;
  channel?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  /** Set on quick-log / type-it work orders (metadata, not a real video). */
  quickLog?: boolean;
  typeIt?: boolean;
  workedDate?: string;
  creationMode?: MagicLogCreationMode;
  notes?: string;
  signingToken?: string;
  signingTokenExpires?: string;
  mentorPhone?: string;
};

export type MagicLogUserProfile = {
  id: string;
  email: string | null;
  ait_id: string | null;
  trade: string | null;
  current_period: number;
  apprenticeship_start_date: string | null;
  sponsor_name: string | null;
  sponsor_phone: string | null;
  province: string;
  bluebook_onboarding_complete: boolean;
  is_journeyman?: boolean;
  journeyman_certificate_number?: string | null;
  default_mentor_name?: string | null;
  default_mentor_phone?: string | null;
};

export type MagicLogWorkOrder = {
  id: string;
  user_id: string;
  competence_name: string;
  competence_type: CompetenceType;
  period: number;
  task_name: string | null;
  ai_steps: MagicLogAiStep[] | null;
  video_urls: MagicLogVideoRef[] | null;
  include_video: boolean;
  mentor_name: string | null;
  mentor_signature_url: string | null;
  signed_at: string | null;
  hours: number | null;
  status: WorkOrderStatus;
  created_at: string;
};

export type PeriodProgressRow = {
  period: number;
  total_hours: number;
  mandatory_completed: number;
  optional_completed: number;
  period_complete: boolean;
};
