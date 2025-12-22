export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      blind_problems: {
        Row: {
          id: string
          title: string
          prompt: string
          example: string | null
          constraints: string[]
          pattern: string
          key_idea: string
          detailed_hint: string | null
          skeleton: string
          time_complexity: string
          space_complexity: string
          steps: string[]
          expected_edge_cases: string[]
          topics: string[]
          difficulty: 'easy' | 'medium' | 'hard'
          leetcode_number: number | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          prompt: string
          example?: string | null
          constraints?: string[]
          pattern: string
          key_idea: string
          detailed_hint?: string | null
          skeleton: string
          time_complexity: string
          space_complexity: string
          steps?: string[]
          expected_edge_cases?: string[]
          topics?: string[]
          difficulty: 'easy' | 'medium' | 'hard'
          leetcode_number?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          prompt?: string
          example?: string | null
          constraints?: string[]
          pattern?: string
          key_idea?: string
          detailed_hint?: string | null
          skeleton?: string
          time_complexity?: string
          space_complexity?: string
          steps?: string[]
          expected_edge_cases?: string[]
          topics?: string[]
          difficulty?: 'easy' | 'medium' | 'hard'
          leetcode_number?: number | null
          created_at?: string
        }
      }
      saved_items: {
        Row: {
          id: string
          user_id: string
          title: string
          content: string
          type: 'script' | 'response' | 'tip' | 'improvement' | 'highlight' | 'drill'
          created_at: string
          category?: string
          rewrite?: string
          explanation?: string
          question?: string
          human_rewrite?: string
          report_data?: Json
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          content: string
          type: 'script' | 'response' | 'tip' | 'improvement' | 'highlight' | 'drill'
          created_at?: string
          category?: string
          rewrite?: string
          explanation?: string
          question?: string
          human_rewrite?: string
          report_data?: Json
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          content?: string
          type?: 'script' | 'response' | 'tip' | 'improvement' | 'highlight' | 'drill'
          created_at?: string
          category?: string
          rewrite?: string
          explanation?: string
          question?: string
          human_rewrite?: string
          report_data?: Json
        }
      }
      saved_reports: {
        Row: {
          id: string
          user_id: string
          title: string
          type: 'coach' | 'rehearsal'
          rating: number
          report_data: Json
          created_at: string
          report_date: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          type: 'coach' | 'rehearsal'
          rating: number
          report_data: Json
          created_at?: string
          report_date?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          type?: 'coach' | 'rehearsal'
          rating?: number
          report_data?: Json
          created_at?: string
          report_date?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

