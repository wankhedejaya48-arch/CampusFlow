# CampusFlow Supabase foundation — Stage A

This document began as the Stage A database/client setup guide. Later stages now connect authentication and application data to Supabase; consult the migration sequence below and current source before relying on any Stage A description of frontend behavior. No browser data, demo account, test upload, classroom, report, or mock record is copied to Supabase automatically.

## Current model and migration map

| Current frontend/local state | Supabase foundation |
| --- | --- |
| `User` and local/demo accounts in `CampusFlowContext` | `auth.users` identity plus `profiles` application fields |
| `Resource` metadata in context/localStorage | `resources`; file objects later move to private Supabase Storage |
| IndexedDB blobs referenced by `Resource.fileId` | Future private bucket `resources`; Stage A does not move blobs |
| `Classroom` and member IDs in context/localStorage | `classrooms` plus `classroom_members` |
| Classroom announcements and shared-resource IDs | `announcements` and `classroom_resources` join rows |
| `ResourceRequest[]` | `resource_requests` |
| `Resource.isFavorited` UI state | Per-user `favorites` join rows |
| `Notification[]` | Per-user `notifications` |
| `ResourceReport[]` | `reports` |
| `ModerationLogEntry[]` | `moderation_logs` |

Current model details were audited in `src/types.ts`, `src/data/mockData.ts`, `src/context/CampusFlowContext.tsx`, `src/utils/fileStorage.ts`, and the auth/context actions. Their existing implementations are not changed in Stage A.

## Live project baseline and migration history

The live Supabase project (`rhwoegbwmavtiltxyobs`) has already been initialized and restored. It contains 11 application tables with Row Level Security (RLS) enabled, a private `resources` Storage bucket, database functions and triggers, and existing Auth users with matching profiles.

The live project migration history records the following baseline migrations:

1. `20261010094832_campusflow_profile_schema_compat.sql` — Handles profile table compatibility, preserving existing profiles while remaining safe for fresh installations.
2. `20261010095425_campusflow_full_schema.sql` — Full schema foundation based on `schema.sql`, defining all application tables, policies, functions, triggers, grants, and private storage.
3. `20261010095830_campusflow_final_live_policy_alignment.sql` — Live policy alignment requiring active accounts for classroom membership reads, and adding foreign-key indexes added during live verification.

### Requirements for the existing live project:
- Do not apply destructive SQL merely to reconcile migration tracking.
- Do not run `supabase db push`, `supabase db reset`, or execute reset commands against the live project.
- Do not delete records, alter user roles, or mark unapplied migrations as applied without verified execution.

## Migration order for fresh installations

All migration files in `supabase/migrations/` use unique, 14-digit timestamps (`YYYYMMDDHHMMSS`). For fresh installations or local environments, apply migrations sequentially in strictly increasing timestamp order:

1. `20261010094832_campusflow_profile_schema_compat.sql` (Profile compatibility baseline)
2. `20261010095425_campusflow_full_schema.sql` (Full application schema foundation)
3. `20261010095830_campusflow_final_live_policy_alignment.sql` (Live policy alignment & FK indexes)
4. `20261010100100_auth_profile_trigger.sql` (Stage B signup trigger & profile loading)
5. `20261010100200_classroom_backend.sql` (Stage D Step 1 classroom backend & membership RPCs)
6. `20261010100300_classroom_announcements.sql` (Stage D Step 2 classroom announcements)
7. `20261010100400_resource_counter_rpc.sql` (Atomic resource view/download counters)
8. `20261010100500_resource_owner_delete.sql` (Resource owner deletion permissions)
9. `20261010100600_resource_requests.sql` (Stage D Step 3 resource requests)
10. `20261010100700_favorites.sql` (Stage D Step 4 resource favorites)
11. `20261010100800_notifications.sql` (Stage D Step 5 notifications & realtime publication)
12. `20261010100900_admin_backend.sql` (Stage E Step 1 administration moderation RPCs)
13. `20261010101000_security_audit_corrections.sql` (Stage E Step 2 security audit hardening & Data API grants)
14. `20261010101100_active_account_policy_corrections.sql` (Active-account access enforcement on private data)

## Stage B auth profile migration

If the base schema is installed, `20261010100100_auth_profile_trigger.sql` creates a profile automatically from validated Student/Teacher signup metadata, including when email confirmation is enabled. The trigger never accepts an Admin role from user metadata. This migration is safe to rerun.

The Stage B client restores Supabase sessions from tab-scoped `sessionStorage` (not `localStorage`), loads the caller's profile on startup/auth changes, and blocks disabled profiles in the UI. The Stage B migration also applies active-profile checks to application-data RLS policies. Supabase Auth may still issue a session for a disabled account because safely banning Auth users requires a trusted server/admin operation; this frontend immediately signs that session out and RLS denies access to application tables. Do not add a service-role key to the browser to automate Auth bans.

## Storage path and access

The bucket is `resources`; the object name within it is `{userId}/{uniqueId}-{safeFileName}`. Together these form the logical path `resources/{userId}/{uniqueId}-{safeFileName}`. The bucket remains private. Object insert/update is restricted to the owner's one-level folder; reads require ownership, admin access, or resource visibility/classroom authorization; delete is limited to the uploader or an admin acting on an openly reported resource. Store the object name (without the bucket prefix) in `resources.storage_path`, and use authenticated downloads or short-lived signed URLs for private previews/downloads.

## RLS summary

RLS is enabled for every application table. `auth.uid()` scopes user-owned records. Security-definer helpers with a fixed empty `search_path` check active/admin status and classroom ownership/membership without recursively invoking table policies. A profile trigger blocks self role/status changes and self-promotion to admin; normal profile inserts only accept student/teacher. Resource approval/rejection and report resolution are admin-only. Classroom membership is joined through `join_classroom_with_code`, which inserts only the signed-in student and relies on the unique `(classroom_id, user_id)` key to avoid duplicates. Never ship a Supabase service-role key to Vite/frontend code.

## Environment variables and secret hygiene

Copy `.env.example` to a local `.env` and set `VITE_SUPABASE_URL` plus `VITE_SUPABASE_PUBLISHABLE_KEY` (or the legacy client-safe `VITE_SUPABASE_ANON_KEY`).

**Critical Security Rules:**
- `.env` is strictly local-only and must never be committed to version control.
- Never place a `service_role` key or any secret administrative key in any `VITE_` environment variable or anywhere in client-side code.
- The browser must never contain a service-role key; client authorization is entirely enforced by Supabase Auth, Row Level Security (RLS) policies, and database-level security definer functions.
- The application gracefully handles unconfigured Supabase credentials with local fallbacks where applicable.

