import type { Classroom, Resource, User } from '../types';

/** Visibility is optional so resources created before Phase 5 remain public. */
export function canAccessResource(resource: Resource, user: User, classrooms: Classroom[]): boolean {
  const isUploader = resource.uploadedById === user.id || (!resource.uploadedById && resource.uploadedBy === user.name);
  if (resource.verified !== 'verified') return user.role === 'admin' || isUploader;
  if (!resource.visibility || resource.visibility === 'public') return true;
  if (isUploader) return true;
  const sharedRooms = classrooms.filter((room) => room.sharedResourceIds?.includes(resource.id));
  if (user.role !== 'admin' && sharedRooms.some((room) => room.teacherId === user.id || room.createdBy === user.id || room.memberIds?.includes(user.id) || room.joinedBy?.includes(user.id))) return true;
  if (resource.visibility === 'department') return user.role === 'admin' || resource.department === user.department;
  if (user.role === 'admin') return false;

  const linkedRooms = classrooms.filter((room) => room.id === resource.classroomId
    || room.sharedResourceIds?.includes(resource.id));
  return linkedRooms.some((room) => room.teacherId === user.id
    || room.createdBy === user.id
    || room.memberIds?.includes(user.id)
    || room.joinedBy?.includes(user.id));
}
