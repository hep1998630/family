// lib/supabase/types.ts
// Typed to match our 001_initial_schema.sql migration exactly.
// You can regenerate this automatically by running:
//   npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/supabase/types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      roots: {
        Row: {
          id: string
          name: string
          canvas_x: number
          canvas_y: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          canvas_x?: number
          canvas_y?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          canvas_x?: number
          canvas_y?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          id: string
          name: string
          nickname: string | null
          birth_date: string | null
          bio: string | null
          photo_url: string | null
          mother_id: string | null
          root_id: string
          gender: 'male' | 'female' | null
          is_shortcut: boolean
          original_person_id: string | null
          canvas_x: number
          canvas_y: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          nickname?: string | null
          birth_date?: string | null
          bio?: string | null
          photo_url?: string | null
          mother_id?: string | null
          root_id: string
          gender?: 'male' | 'female' | null
          is_shortcut?: boolean
          original_person_id?: string | null
          canvas_x?: number
          canvas_y?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          nickname?: string | null
          birth_date?: string | null
          bio?: string | null
          photo_url?: string | null
          mother_id?: string | null
          root_id?: string
          gender?: 'male' | 'female' | null
          is_shortcut?: boolean
          original_person_id?: string | null
          canvas_x?: number
          canvas_y?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      partnerships: {
        Row: {
          id: string
          person_a_id: string
          person_b_id: string
          created_at: string
        }
        Insert: {
          id?: string
          person_a_id: string
          person_b_id: string
          created_at?: string
        }
        Update: {
          id?: string
          person_a_id?: string
          person_b_id?: string
          created_at?: string
        }
        Relationships: []
      }
      parent_child: {
        Row: {
          id: string
          parent_id: string
          child_id: string
          created_at: string
        }
        Insert: {
          id?: string
          parent_id: string
          child_id: string
          created_at?: string
        }
        Update: {
          id?: string
          parent_id?: string
          child_id?: string
          created_at?: string
        }
        Relationships: []
      }
      admins: {
        Row: {
          id: string
          role: 'owner' | 'editor'
          name: string | null
          created_at: string
        }
        Insert: {
          id: string
          role: 'owner' | 'editor'
          name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          role?: 'owner' | 'editor'
          name?: string | null
          created_at?: string
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          id: string
          name: string
          top_person_id: string
          /** Generations below the top person; null = all. */
          depth: number | null
          /** Only this marriage of the top person; null = all partners. */
          partner_id: string | null
          sort_order: number
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          top_person_id: string
          depth?: number | null
          partner_id?: string | null
          sort_order?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          top_person_id?: string
          depth?: number | null
          partner_id?: string | null
          sort_order?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      people_with_root: {
        Row: {
          id: string
          name: string
          nickname: string | null
          birth_date: string | null
          bio: string | null
          photo_url: string | null
          mother_id: string | null
          root_id: string
          root_name: string
          is_shortcut: boolean
          original_person_id: string | null
          canvas_x: number
          canvas_y: number
          created_at: string
          updated_at: string
        }
        Relationships: []
      }
      partnerships_detail: {
        Row: {
          id: string
          person_a_id: string
          person_a_name: string
          person_b_id: string
          person_b_name: string
          created_at: string
        }
        Relationships: []
      }
      parent_child_detail: {
        Row: {
          id: string
          parent_id: string
          parent_name: string
          child_id: string
          child_name: string
          created_at: string
        }
        Relationships: []
      }
    }
    Functions: {
      // From 003_add_auth_roles.sql — callable by anyone, answer for the caller.
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_owner: { Args: Record<PropertyKey, never>; Returns: boolean }
      // From 007_delete_person.sql — the owner deletes a person and their links at once.
      delete_person: { Args: { p_id: string }; Returns: undefined }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

// ── Convenience type aliases ──────────────────────────────────────────────────

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row']

// Row types
export type RootRow = Tables<'roots'>
export type PersonRow = Tables<'people'>
export type PartnershipRow = Tables<'partnerships'>
export type ParentChildRow = Tables<'parent_child'>
export type AdminRow = Tables<'admins'>
export type SavedViewRow = Tables<'saved_views'>

// Insert types
export type InsertRoot = InsertTables<'roots'>
export type InsertPerson = InsertTables<'people'>
export type InsertPartnership = InsertTables<'partnerships'>
export type InsertParentChild = InsertTables<'parent_child'>
export type InsertSavedView = InsertTables<'saved_views'>

// Update types
export type UpdatePerson = UpdateTables<'people'>
export type UpdateRoot = UpdateTables<'roots'>
