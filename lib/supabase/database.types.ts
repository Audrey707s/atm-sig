// T-003 — Tipe database ATM berdasarkan docs/05-data-model.md
// File ini di-generate ulang via: npx supabase gen types typescript --linked > lib/supabase/database.types.ts
// Jangan edit manual — edit skema di supabase/migrations/ lalu generate ulang.

export type Database = {
  public: {
    Tables: {
      task_state_events: {
        Row: {
          id: string
          task_id: string
          occurred_at: string
          actor_id: string | null
          old_status: Database['public']['Enums']['task_status'] | null
          new_status: Database['public']['Enums']['task_status']
          old_owner_id: string | null
          new_owner_id: string
          old_completed_at: string | null
          new_completed_at: string | null
          new_start_date: string
          new_due_date: string
          is_baseline: boolean
        }
        Insert: {
          id?: string
          task_id: string
          occurred_at?: string
          actor_id?: string | null
          old_status?: Database['public']['Enums']['task_status'] | null
          new_status: Database['public']['Enums']['task_status']
          old_owner_id?: string | null
          new_owner_id: string
          old_completed_at?: string | null
          new_completed_at?: string | null
          new_start_date: string
          new_due_date: string
          is_baseline?: boolean
        }
        Update: {
          id?: string
          task_id?: string
          occurred_at?: string
          actor_id?: string | null
          old_status?: Database['public']['Enums']['task_status'] | null
          new_status?: Database['public']['Enums']['task_status']
          old_owner_id?: string | null
          new_owner_id?: string
          old_completed_at?: string | null
          new_completed_at?: string | null
          new_start_date?: string
          new_due_date?: string
          is_baseline?: boolean
        }
        Relationships: []
      }
      roles: {
        Row: {
          id: number
          name: string
          level: number
        }
        Insert: {
          id?: number
          name: string
          level: number
        }
        Update: {
          id?: number
          name?: string
          level?: number
        }
        Relationships: []
      }
      org_units: {
        Row: {
          id: number
          parent_id: number | null
          name: string
          type: 'department' | 'unit' | 'section'
        }
        Insert: {
          id?: number
          parent_id?: number | null
          name: string
          type: 'department' | 'unit' | 'section'
        }
        Update: {
          id?: number
          parent_id?: number | null
          name?: string
          type?: 'department' | 'unit' | 'section'
        }
        Relationships: [
          {
            foreignKeyName: 'org_units_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'org_units'
            referencedColumns: ['id']
          },
        ]
      }
      users: {
        Row: {
          id: string
          name: string
          email: string
          role_id: number
          org_unit_id: number
          supervisor_id: string | null
          status: 'aktif' | 'nonaktif'
        }
        Insert: {
          id: string
          name: string
          email: string
          role_id: number
          org_unit_id: number
          supervisor_id?: string | null
          status?: 'aktif' | 'nonaktif'
        }
        Update: {
          id?: string
          name?: string
          email?: string
          role_id?: number
          org_unit_id?: number
          supervisor_id?: string | null
          status?: 'aktif' | 'nonaktif'
        }
        Relationships: [
          {
            foreignKeyName: 'users_org_unit_id_fkey'
            columns: ['org_unit_id']
            isOneToOne: false
            referencedRelation: 'org_units'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'users_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'users_supervisor_id_fkey'
            columns: ['supervisor_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      tasks: {
        Row: {
          id: string
          owner_id: string
          assigner_id: string
          reviewer_id: string | null
          org_unit_id: number
          parent_task_id: string | null
          category_id: string | null
          title: string
          priority: 'rendah' | 'sedang' | 'tinggi'
          status: 'To do' | 'In progress' | 'Blocked' | 'Review' | 'Revisi' | 'Done'
          progress_pct: number
          start_date: string
          due_date: string
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          assigner_id: string
          reviewer_id?: string | null
          org_unit_id: number
          parent_task_id?: string | null
          category_id?: string | null
          title: string
          priority: 'rendah' | 'sedang' | 'tinggi'
          status?: 'To do' | 'In progress' | 'Blocked' | 'Review' | 'Revisi' | 'Done'
          progress_pct?: number
          start_date: string
          due_date: string
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          assigner_id?: string
          reviewer_id?: string | null
          org_unit_id?: number
          parent_task_id?: string | null
          category_id?: string | null
          title?: string
          priority?: 'rendah' | 'sedang' | 'tinggi'
          status?: 'To do' | 'In progress' | 'Blocked' | 'Review' | 'Revisi' | 'Done'
          progress_pct?: number
          start_date?: string
          due_date?: string
          completed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'tasks_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'task_categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_assigner_id_fkey'
            columns: ['assigner_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_org_unit_id_fkey'
            columns: ['org_unit_id']
            isOneToOne: false
            referencedRelation: 'org_units'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_parent_task_id_fkey'
            columns: ['parent_task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_reviewer_id_fkey'
            columns: ['reviewer_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      task_categories: {
        Row: { id: string; org_unit_id: number; name: string; is_active: boolean; created_at: string }
        Insert: { id?: string; org_unit_id: number; name: string; is_active?: boolean; created_at?: string }
        Update: { id?: string; org_unit_id?: number; name?: string; is_active?: boolean }
        Relationships: [{
          foreignKeyName: 'task_categories_org_unit_id_fkey'
          columns: ['org_unit_id']
          isOneToOne: false
          referencedRelation: 'org_units'
          referencedColumns: ['id']
        }]
      }
      task_templates: {
        Row: {
          id: string; org_unit_id: number; category_id: string; name: string; title: string
          priority: 'rendah' | 'sedang' | 'tinggi'; owner_id: string; reviewer_id: string | null
          recurrence: 'weekly' | 'monthly'; recurrence_day: number; start_offset_days: number
          due_offset_days: number; is_active: boolean; next_run_at: string; created_by: string
          created_at: string; updated_at: string
        }
        Insert: {
          id?: string; org_unit_id: number; category_id: string; name: string; title: string
          priority?: 'rendah' | 'sedang' | 'tinggi'; owner_id: string; reviewer_id?: string | null
          recurrence: 'weekly' | 'monthly'; recurrence_day: number; start_offset_days?: number
          due_offset_days: number; is_active?: boolean; next_run_at?: string; created_by: string
          created_at?: string; updated_at?: string
        }
        Update: {
          id?: string; org_unit_id?: number; category_id?: string; name?: string; title?: string
          priority?: 'rendah' | 'sedang' | 'tinggi'; owner_id?: string; reviewer_id?: string | null
          recurrence?: 'weekly' | 'monthly'; recurrence_day?: number; start_offset_days?: number
          due_offset_days?: number; is_active?: boolean; next_run_at?: string; updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'task_templates_category_id_fkey'; columns: ['category_id']; isOneToOne: false; referencedRelation: 'task_categories'; referencedColumns: ['id'] },
          { foreignKeyName: 'task_templates_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] },
          { foreignKeyName: 'task_templates_org_unit_id_fkey'; columns: ['org_unit_id']; isOneToOne: false; referencedRelation: 'org_units'; referencedColumns: ['id'] },
          { foreignKeyName: 'task_templates_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] },
          { foreignKeyName: 'task_templates_reviewer_id_fkey'; columns: ['reviewer_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] },
        ]
      }
      task_template_runs: {
        Row: { id: string; template_id: string; scheduled_for: string; task_id: string | null; outcome: 'created' | 'skipped'; created_at: string }
        Insert: { id?: string; template_id: string; scheduled_for: string; task_id?: string | null; outcome: 'created' | 'skipped'; created_at?: string }
        Update: { id?: string; template_id?: string; scheduled_for?: string; task_id?: string | null; outcome?: 'created' | 'skipped' }
        Relationships: [
          { foreignKeyName: 'task_template_runs_task_id_fkey'; columns: ['task_id']; isOneToOne: true; referencedRelation: 'tasks'; referencedColumns: ['id'] },
          { foreignKeyName: 'task_template_runs_template_id_fkey'; columns: ['template_id']; isOneToOne: false; referencedRelation: 'task_templates'; referencedColumns: ['id'] },
        ]
      }
      task_reassignments: {
        Row: {
          id: string
          task_id: string
          from_user_id: string
          to_user_id: string
          reason: string
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          from_user_id: string
          to_user_id: string
          reason: string
          created_at?: string
        }
        Update: never
        Relationships: [
          {
            foreignKeyName: 'task_reassignments_from_user_id_fkey'
            columns: ['from_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_reassignments_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_reassignments_to_user_id_fkey'
            columns: ['to_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      task_supports: {
        Row: {
          id: string
          task_id: string
          needed_from_id: string
          description: string
          status: 'diminta' | 'diberikan'
        }
        Insert: {
          id?: string
          task_id: string
          needed_from_id: string
          description: string
          status?: 'diminta' | 'diberikan'
        }
        Update: {
          id?: string
          task_id?: string
          needed_from_id?: string
          description?: string
          status?: 'diminta' | 'diberikan'
        }
        Relationships: [
          {
            foreignKeyName: 'task_supports_needed_from_id_fkey'
            columns: ['needed_from_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_supports_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
        ]
      }
      task_comments: {
        Row: {
          id: string
          task_id: string
          user_id: string
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          user_id: string
          body: string
          created_at?: string
        }
        Update: never
        Relationships: [
          {
            foreignKeyName: 'task_comments_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_comments_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      evidence_requirements: {
        Row: {
          id: string
          task_id: string
          description: string
          mandatory: boolean
        }
        Insert: {
          id?: string
          task_id: string
          description: string
          mandatory?: boolean
        }
        Update: {
          id?: string
          task_id?: string
          description?: string
          mandatory?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'evidence_requirements_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
        ]
      }
      task_evidence: {
        Row: {
          id: string
          requirement_id: string
          uploader_id: string
          file_or_link: string
          uploaded_at: string
        }
        Insert: {
          id?: string
          requirement_id: string
          uploader_id: string
          file_or_link: string
          uploaded_at?: string
        }
        Update: never
        Relationships: [
          {
            foreignKeyName: 'task_evidence_requirement_id_fkey'
            columns: ['requirement_id']
            isOneToOne: false
            referencedRelation: 'evidence_requirements'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_evidence_uploader_id_fkey'
            columns: ['uploader_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      task_progress_history: {
        Row: {
          id: string
          task_id: string
          changed_by: string
          progress_pct: number
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          changed_by: string
          progress_pct: number
          created_at?: string
        }
        Update: never
        Relationships: [
          {
            foreignKeyName: 'task_progress_history_changed_by_fkey'
            columns: ['changed_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_progress_history_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
        ]
      }
      task_reminders: {
        Row: {
          id: string
          task_id: string
          checkpoint_pct: 50 | 80 | 90
          sent_at: string
          response: string | null
          responded_at: string | null
          due_date_version: string
        }
        Insert: {
          id?: string
          task_id: string
          checkpoint_pct: 50 | 80 | 90
          sent_at?: string
          response?: string | null
          responded_at?: string | null
          due_date_version: string
        }
        Update: {
          response?: string | null
          responded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'task_reminders_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
        ]
      }
      deadline_change_requests: {
        Row: {
          id: string
          task_id: string
          requested_by: string
          old_due_date: string
          new_due_date: string
          reason: string
          status: 'Menunggu approval' | 'Disetujui' | 'Ditolak'
          approver_id: string | null
          decided_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          requested_by: string
          old_due_date: string
          new_due_date: string
          reason: string
          status?: 'Menunggu approval' | 'Disetujui' | 'Ditolak'
          approver_id?: string | null
          decided_at?: string | null
          created_at?: string
        }
        Update: {
          status?: 'Menunggu approval' | 'Disetujui' | 'Ditolak'
          approver_id?: string | null
          decided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'deadline_change_requests_approver_id_fkey'
            columns: ['approver_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'deadline_change_requests_requested_by_fkey'
            columns: ['requested_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'deadline_change_requests_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          task_id: string | null
          reminder_id: string | null
          type: string
          title: string
          body: string
          sent_at: string
          read_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          task_id?: string | null
          reminder_id?: string | null
          type: string
          title: string
          body: string
          sent_at?: string
          read_at?: string | null
        }
        Update: {
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'notifications_reminder_id_fkey'
            columns: ['reminder_id']
            isOneToOne: false
            referencedRelation: 'task_reminders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notifications_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notifications_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string
          action: string
          object: string
          old_value: string | null
          new_value: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          action: string
          object: string
          old_value?: string | null
          new_value?: string | null
          created_at?: string
        }
        Update: never
        Relationships: [
          {
            foreignKeyName: 'audit_logs_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      role_change_requests: {
        Row: {
          id: string
          target_user_id: string
          requested_by: string
          requested_role_id: number
          requested_org_unit_id: number
          requested_supervisor_id: string | null
          status: 'pending' | 'approved' | 'rejected'
          decided_by: string | null
          decided_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          target_user_id: string
          requested_by: string
          requested_role_id: number
          requested_org_unit_id: number
          requested_supervisor_id?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          decided_by?: string | null
          decided_at?: string | null
          created_at?: string
        }
        Update: {
          status?: 'pending' | 'approved' | 'rejected'
          decided_by?: string | null
          decided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'role_change_requests_target_user_id_fkey'
            columns: ['target_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'role_change_requests_requested_by_fkey'
            columns: ['requested_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'role_change_requests_requested_role_id_fkey'
            columns: ['requested_role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'role_change_requests_requested_org_unit_id_fkey'
            columns: ['requested_org_unit_id']
            isOneToOne: false
            referencedRelation: 'org_units'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'role_change_requests_requested_supervisor_id_fkey'
            columns: ['requested_supervisor_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'role_change_requests_decided_by_fkey'
            columns: ['decided_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      wbs_items: {
        Row: {
          id: string
          task_id: string
          parent_id: string | null
          title: string
          weight: number
          is_done: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          task_id: string
          parent_id?: string | null
          title: string
          weight?: number
          is_done?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          parent_id?: string | null
          title?: string
          weight?: number
          is_done?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'wbs_items_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'wbs_items_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'wbs_items'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      update_my_profile: { Args: { p_name: string }; Returns: string }
      add_wbs_item_r03: { Args: {p_task_id:string;p_title:string;p_weight:number;p_parent_id?:string|null}; Returns:string }
      toggle_wbs_item_r03: { Args: {p_task_id:string;p_wbs_item_id:string;p_is_done:boolean}; Returns:number }
      recalculate_task_wbs_progress_r03: { Args: {p_task_id:string}; Returns:number }
      create_task_bundle_r03: {
        Args: {
          p_owner_id: string
          p_reviewer_id: string | null
          p_org_unit_id: number
          p_parent_task_id: string | null
          p_title: string
          p_priority: 'rendah' | 'sedang' | 'tinggi'
          p_start_date: string
          p_due_date: string
          p_category_id?: string | null
          p_evidence?: {description:string;mandatory:boolean}[]
          p_wbs?: {title:string;weight:number;parentIndex:number|null}[]
          p_support?: {neededFromId:string;description:string}[]
        }
        Returns: string
      }
      reassign_task: {
        Args: {
          p_task_id: string
          p_new_owner_id: string
          p_reason: string
        }
        Returns: string
      }
      review_task: {
        Args: {
          p_task_id: string
          p_decision: 'Done' | 'Revisi'
          p_comment?: string | null
        }
        Returns: string
      }
      decide_deadline_change: {
        Args: {
          p_request_id: string
          p_decision: 'Disetujui' | 'Ditolak'
        }
        Returns: string
      }
      process_task_reminder_checkpoints: {
        Args: { p_now?: string }
        Returns: {
          reminder_id: string
          task_id: string
          owner_id: string
          checkpoint_pct: number
        }[]
      }
      process_task_template_runs: {
        Args: { p_now?: string }
        Returns: { created_count: number; skipped_count: number }[]
      }
      claim_due_reminder_emails: {
        Args: { p_now?: string; p_batch_size?: number }
        Returns: {
          reminder_id: string
          task_id: string
          owner_id: string
          owner_email: string
          task_title: string
          checkpoint_pct: number
        }[]
      }
      mark_reminder_email_sent: {
        Args: { p_reminder_id: string; p_sent_at?: string }
        Returns: boolean
      }
    }
    Enums: {
      role_name: 'Spectator' | 'Staff/PIC' | 'Manager' | 'SM' | 'GM' | 'Super Admin'
      task_status: 'To do' | 'In progress' | 'Blocked' | 'Review' | 'Revisi' | 'Done'
      org_unit_type: 'department' | 'unit' | 'section'
      support_status: 'diminta' | 'diberikan'
      deadline_request_status: 'Menunggu approval' | 'Disetujui' | 'Ditolak'
    }
  }
}
