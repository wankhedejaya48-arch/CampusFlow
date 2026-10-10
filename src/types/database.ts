/** Database-layer types for the planned Supabase schema (Stage A only). */
export type DatabaseRole = 'student' | 'teacher' | 'admin';
export type DatabaseAccountStatus = 'active' | 'disabled';
export type DatabaseResourceStatus = 'pending' | 'approved' | 'rejected';
export type DatabaseResourceVisibility = 'public' | 'department' | 'classroom';
export type DatabaseResourceRequestStatus = 'open' | 'fulfilled' | 'closed';
export type DatabaseReportStatus = 'open' | 'dismissed' | 'removed';
export type DatabaseNotificationType = 'upload' | 'request' | 'classroom' | 'verification' | 'download' | 'announcement';
export type DatabaseClassroomMemberRole = 'teacher' | 'student';

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row & Record<string, unknown>;
  Insert: Insert & Record<string, unknown>;
  Update: Update & Record<string, unknown>;
  Relationships: [];
};

type ResourceRequiredOnInsert = 'title' | 'subject' | 'semester' | 'department' | 'resource_type' | 'uploader_id';
type ResourceInsertRow = Pick<ResourceRow, ResourceRequiredOnInsert> & Partial<Omit<ResourceRow, ResourceRequiredOnInsert>>;
type ResourceUpdateRow = Partial<Omit<ResourceRow, 'id' | 'uploader_id' | 'created_at'>>;
type ProfileInsertRow = Pick<ProfileRow, 'id' | 'name' | 'email'>
  & Partial<Omit<ProfileRow, 'id' | 'name' | 'email' | 'role' | 'account_status'>>
  & { role?: Exclude<DatabaseRole, 'admin'>; account_status?: 'active' };
type ProfileUpdateRow = Partial<Pick<ProfileRow, 'name' | 'department' | 'semester' | 'teaching_designation' | 'bio'>>;

export interface ProfileRow {
  id: string;
  name: string;
  email: string;
  role: DatabaseRole;
  department: string | null;
  semester: number | null;
  teaching_designation: string | null;
  bio: string | null;
  account_status: DatabaseAccountStatus;
  created_at: string;
  updated_at: string;
}

export interface ResourceRow {
  id: string;
  title: string;
  description: string;
  subject: string;
  semester: number;
  department: string;
  resource_type: ResourceType;
  tags: string[];
  uploader_id: string;
  status: DatabaseResourceStatus;
  visibility: DatabaseResourceVisibility;
  classroom_id: string | null;
  storage_path: string | null;
  original_file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  views: number;
  downloads: number;
  rating: number;
  rating_count: number;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClassroomRow {
  id: string;
  name: string;
  subject: string;
  department: string;
  semester: number;
  teacher_id: string;
  share_code: string;
  created_at: string;
  updated_at: string;
}

export interface ClassroomMemberRow { classroom_id: string; user_id: string; role: DatabaseClassroomMemberRole; joined_at: string }
export interface ClassroomMemberDirectoryRow extends ClassroomMemberRow { name: string }
export interface AnnouncementRow { id: string; classroom_id: string; teacher_id: string; title: string; message: string; created_at: string; updated_at: string }
type AnnouncementInsert = Pick<AnnouncementRow, 'classroom_id' | 'teacher_id' | 'title' | 'message'>
  & Partial<Pick<AnnouncementRow, 'id' | 'created_at' | 'updated_at'>>;
type AnnouncementUpdate = Partial<Pick<AnnouncementRow, 'title' | 'message'>>;
export interface ClassroomResourceRow { classroom_id: string; resource_id: string; shared_by: string; shared_at: string }
export interface ResourceRequestRow {
  id: string; requester_id: string; requester_name: string; title: string; subject: string; semester: number;
  resource_type: ResourceType; description: string; status: DatabaseResourceRequestStatus; responses: number;
  created_at: string; updated_at: string;
}
type ResourceRequestInsert = Pick<ResourceRequestRow, 'requester_id' | 'title' | 'subject' | 'semester' | 'resource_type'>
  & Partial<Pick<ResourceRequestRow, 'id' | 'description' | 'status' | 'responses' | 'created_at' | 'updated_at'>>;
type ResourceRequestUpdate = Partial<Pick<ResourceRequestRow, 'title' | 'subject' | 'semester' | 'resource_type' | 'description'>>;
export interface FavoriteRow { id: string; user_id: string; resource_id: string; created_at: string }
type FavoriteInsert = Pick<FavoriteRow, 'user_id' | 'resource_id'> & Partial<Pick<FavoriteRow, 'id' | 'created_at'>>;
export interface NotificationRow {
  id: string; user_id: string; type: DatabaseNotificationType; title: string; message: string;
  related_resource_id: string | null; related_classroom_id: string | null; read: boolean; created_at: string;
}
type NotificationInsert = Pick<NotificationRow, 'user_id' | 'type' | 'title' | 'message'>
  & Partial<Pick<NotificationRow, 'id' | 'related_resource_id' | 'related_classroom_id' | 'read' | 'created_at'>>;
export interface ReportRow {
  id: string; resource_id: string | null; resource_title: string; reporter_id: string; reason: string; description: string;
  status: DatabaseReportStatus; created_at: string; resolved_at: string | null; resolved_by: string | null;
}
type ReportInsertRow = Pick<ReportRow, 'resource_id' | 'reporter_id' | 'reason'> & Partial<Pick<ReportRow, 'description'>>;
export interface ModerationLogRow {
  id: string; admin_id: string; action: string; target_type: string; target_id: string;
  details: Record<string, unknown>; created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow, ProfileInsertRow, ProfileUpdateRow>;
      resources: Table<ResourceRow, ResourceInsertRow, ResourceUpdateRow>;
      classrooms: Table<ClassroomRow>;
      classroom_members: Table<ClassroomMemberRow>;
      announcements: Table<AnnouncementRow, AnnouncementInsert, AnnouncementUpdate>;
      classroom_resources: Table<ClassroomResourceRow>;
      resource_requests: Table<ResourceRequestRow, ResourceRequestInsert, ResourceRequestUpdate>;
      favorites: Table<FavoriteRow, FavoriteInsert, never>;
      notifications: Table<NotificationRow, NotificationInsert>;
      reports: Table<ReportRow, ReportInsertRow>;
      moderation_logs: Table<ModerationLogRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_classroom_member: { Args: { target_classroom_id: string }; Returns: boolean };
      owns_classroom: { Args: { target_classroom_id: string }; Returns: boolean };
      join_classroom_with_code: { Args: { requested_share_code: string }; Returns: string };
      create_classroom: { Args: { classroom_name: string; classroom_subject: string; classroom_department: string; classroom_semester: number }; Returns: string };
      leave_classroom: { Args: { target_classroom_id: string }; Returns: undefined };
      get_classroom_member_directory: { Args: { target_classroom_ids: string[] }; Returns: ClassroomMemberDirectoryRow[] };
      increment_resource_counter: { Args: { target_resource_id: string; counter_name: 'views' | 'downloads' }; Returns: number };
      create_admin_verification_notification: {
        Args: { target_user_id: string; notification_title: string; notification_message: string };
        Returns: NotificationRow;
      };
      admin_set_account_status: { Args: { target_user_id: string; next_status: DatabaseAccountStatus }; Returns: ProfileRow };
      admin_moderate_resource: {
        Args: { target_resource_id: string; target_status: Extract<DatabaseResourceStatus, 'approved' | 'rejected'>; target_rejection_reason: string | null };
        Returns: ResourceRow;
      };
      admin_resolve_report: {
        Args: { target_report_id: string; target_status: Extract<DatabaseReportStatus, 'dismissed'> };
        Returns: ReportRow;
      };
      admin_remove_reported_resource: { Args: { target_resource_id: string }; Returns: string | null };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

export type ResourceInsert = Database['public']['Tables']['resources']['Insert'];
export type ResourceUpdate = Database['public']['Tables']['resources']['Update'];
import type { ResourceType } from '../types';
