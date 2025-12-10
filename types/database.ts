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

