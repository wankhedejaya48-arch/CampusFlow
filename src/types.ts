export type View =
  | 'landing'
  | 'login'
  | 'register'
  | 'dashboard'
  | 'browse'
  | 'resource-details'
  | 'upload'
  | 'my-uploads'
  | 'favorites'
  | 'requests'
  | 'classroom'
  | 'notifications'
  | 'profile'
  | 'admin';

export type UserRole = 'student' | 'teacher' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  semester?: number;
  designation?: string;
  uploads: number;
  downloads: number;
  avatarInitials: string;
  joinedAt: string;
  accountStatus?: 'active' | 'disabled';
  bio?: string;
}

export type ResourceType =
  | 'Notes'
  | 'Previous Year Questions'
  | 'Assignment'
  | 'Lab Manual'
  | 'Presentation'
  | 'Reference Material'
  | 'Other';

export type VerificationStatus = 'verified' | 'pending' | 'rejected';

export interface Resource {
  id: string;
  title: string;
  subject: string;
  semester: number;
  department: string;
  type: ResourceType;
  description: string;
  uploadedBy: string;
  uploadedById?: string;
  uploadedByRole: UserRole;
  uploadedAt: string;
  views: number;
  downloads: number;
  rating: number;
  ratingCount: number;
  verified: VerificationStatus;
  tags: string[];
  fileSize: string;
  fileType: string;
  isFavorited?: boolean;
  fileId?: string; // IndexedDB key or private Supabase Storage object path
  storageProvider?: 'indexeddb' | 'supabase';
  resourceSource?: 'supabase';
  originalFileName?: string;
  classroomId?: string;
  visibility?: 'public' | 'department' | 'classroom';
  rejectionReason?: string;

}

export interface Notification {
  id: string;
  type: 'upload' | 'request' | 'classroom' | 'verification' | 'download' | 'announcement';
  title: string;
  message: string;
  time: string;
  read: boolean;
  userId?: string;
}

export interface ResourceRequest {
  id: string;
  title: string;
  subject: string;
  description: string;
  semester: number;
  type: ResourceType;
  requestedBy: string;
  requestedAt: string;
  status: 'open' | 'fulfilled' | 'closed';
  responses: number;
}

export interface Classroom {
  id: string;
  name: string;
  subject: string;
  code: string;
  teacher: string;
  members: number;
  resources: number;
  announcements: number;
  department: string;
  semester: number;
  createdAt: string;
  createdBy?: string;
  joinedBy?: string[];
  teacherId?: string;
  memberIds?: string[];
  sharedResourceIds?: string[];
}

export interface ClassroomAnnouncement {
  id: string;
  classroomId: string;
  author: string;
  message: string;
  createdAt: string;
  title?: string;
  authorId?: string;
}

export interface Review {
  id: string;
  user: string;
  rating: number;
  comment: string;
  date: string;
}

export type ResourceReportReason = 'Incorrect content' | 'Spam' | 'Inappropriate content' | 'Duplicate resource' | 'Copyright concern' | 'Other';
export type ResourceReportStatus = 'open' | 'dismissed' | 'removed';

export interface ResourceReport {
  id: string;
  resourceId: string;
  resourceTitle: string;
  reporterId: string;
  reporterName: string;
  reason: ResourceReportReason;
  description: string;
  createdAt: string;
  status: ResourceReportStatus;
}

export interface ModerationLogEntry {
  id: string;
  action: string;
  adminId: string;
  adminName: string;
  target: string;
  createdAt: string;
}
