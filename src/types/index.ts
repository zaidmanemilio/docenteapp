// src/types/index.ts

export type GlobalRole = 'admin' | 'teacher' | 'guest'
export type Permission = 'full' | 'edit' | 'read'
export type CourseStatus = 'draft' | 'active' | 'closed'
export type SessionType = 'teorica' | 'practica' | 'taller' | 'invitado' | 'parcial' | 'recuperatorio' | 'exposicion' | 'proyecto'
export type SessionModality = 'presencial' | 'virtual'
export type SessionStatus = 'pendiente' | 'dada' | 'reprogramada' | 'cancelada'
export type TodoPriority = 'low' | 'medium' | 'high'
export type TodoStatus = 'open' | 'closed'

export type ProfileStatus = 'activo' | 'pendiente' | 'inactivo'

export interface Profile {
  id: string
  full_name: string
  global_role: GlobalRole
  created_at: string
  // Campos administrativos (sub-paso B). Opcionales: los usuarios
  // existentes pueden no tenerlos cargados todavía.
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  dni?: string | null
  status?: ProfileStatus
  auth_user_id?: string | null
  updated_at?: string
}

export interface Subject {
  id: string
  name: string
  description?: string
}

export interface Course {
  id: string
  subject_id?: string
  name: string
  year: number
  description?: string
  status: CourseStatus
  expected_sessions: number
  created_at: string
  updated_at: string
  subjects?: Subject
}

export interface Commission {
  id: string
  course_id: string
  name: string
  description?: string
}

export interface UserCoursePermission {
  id: string
  user_id: string
  course_id: string
  commission_id?: string | null
  permission: Permission
  profiles?: Profile
  courses?: Course
  commissions?: Commission
}

export interface AdditionalLink {
  label: string
  url: string
}

export interface Session {
  id: string
  course_id: string
  class_number?: number
  date: string
  title: string
  type: SessionType
  responsible: string
  modality: SessionModality
  status: SessionStatus
  commission_scope: string  // 'all' | commission_id
  canva_url?: string
  partial_file_url?: string
  additional_links: AdditionalLink[]
  guest_bio_url?: string
  workshop_brief_url?: string
  shared_notes?: string
  private_notes?: string
  created_at: string
  updated_at: string
}

export interface Todo {
  id: string
  course_id: string
  session_id?: string | null
  title: string
  description?: string
  responsible?: string
  due_date?: string | null
  status: TodoStatus
  priority: TodoPriority
  created_by?: string
  created_at: string
  updated_at: string
  sessions?: Pick<Session, 'id' | 'class_number' | 'title'>
}

// Contexto de usuario activo con permisos
export interface UserContext {
  profile: Profile
  permissions: UserCoursePermission[]
}

// Helpers
export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  teorica: 'Teórica',
  practica: 'Práctica',
  taller: 'Taller',
  invitado: 'Invitado',
  parcial: 'Parcial',
  recuperatorio: 'Recuperatorio',
  exposicion: 'Exposición',
  proyecto: 'Proyecto',
}

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  pendiente: 'Pendiente',
  dada: 'Dada',
  reprogramada: 'Reprogramada',
  cancelada: 'Cancelada',
}

export const TODO_PRIORITY_LABELS: Record<TodoPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
}
