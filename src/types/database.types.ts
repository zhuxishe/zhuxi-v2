export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_records: {
        Row: {
          activity_date: string
          activity_type: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          id: string
          late_member_ids: string[]
          location: string | null
          no_show_member_ids: string[]
          notes: string | null
          participant_count: number
          participant_ids: string[]
          script_id: string | null
          title: string
        }
        Insert: {
          activity_date: string
          activity_type?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          late_member_ids?: string[]
          location?: string | null
          no_show_member_ids?: string[]
          notes?: string | null
          participant_count?: number
          participant_ids?: string[]
          script_id?: string | null
          title: string
        }
        Update: {
          activity_date?: string
          activity_type?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          late_member_ids?: string[]
          location?: string | null
          no_show_member_ids?: string[]
          notes?: string | null
          participant_count?: number
          participant_ids?: string[]
          script_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_records_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          role?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: string
          user_id?: string | null
        }
        Relationships: []
      }
      contact_submissions: {
        Row: {
          created_at: string | null
          email: string
          id: string
          message: string
          name: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          message: string
          name: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          message?: string
          name?: string
        }
        Relationships: []
      }
      interview_evaluations: {
        Row: {
          articulation: number
          attractiveness_score: number | null
          boundary_respect: number
          communication: number
          created_at: string
          emotional_stability: number
          enthusiasm: number
          first_impression: number
          humor: number
          id: string
          interest_alignment: number
          interviewer_id: string
          interviewer_name: string | null
          interviewer_notes: string | null
          japanese_ability: number
          leadership_potential: number
          member_id: string
          openness: number
          overall_recommendation: number
          responsibility: number
          risk_level: string
          risk_notes: string | null
          sincerity: number
          social_comfort: number
          team_orientation: number
          time_commitment: number
          updated_at: string
        }
        Insert: {
          articulation: number
          attractiveness_score?: number | null
          boundary_respect: number
          communication: number
          created_at?: string
          emotional_stability: number
          enthusiasm: number
          first_impression: number
          humor: number
          id?: string
          interest_alignment: number
          interviewer_id: string
          interviewer_name?: string | null
          interviewer_notes?: string | null
          japanese_ability: number
          leadership_potential: number
          member_id: string
          openness: number
          overall_recommendation: number
          responsibility: number
          risk_level?: string
          risk_notes?: string | null
          sincerity: number
          social_comfort: number
          team_orientation: number
          time_commitment: number
          updated_at?: string
        }
        Update: {
          articulation?: number
          attractiveness_score?: number | null
          boundary_respect?: number
          communication?: number
          created_at?: string
          emotional_stability?: number
          enthusiasm?: number
          first_impression?: number
          humor?: number
          id?: string
          interest_alignment?: number
          interviewer_id?: string
          interviewer_name?: string | null
          interviewer_notes?: string | null
          japanese_ability?: number
          leadership_potential?: number
          member_id?: string
          openness?: number
          overall_recommendation?: number
          responsibility?: number
          risk_level?: string
          risk_notes?: string | null
          sincerity?: number
          social_comfort?: number
          team_orientation?: number
          time_commitment?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_evaluations_interviewer_id_fkey"
            columns: ["interviewer_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_evaluations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      match_results: {
        Row: {
          best_slot: string | null
          cancellation_reason: string | null
          cancellation_requested_at: string | null
          cancellation_requested_by: string | null
          cancellation_reviewed_at: string | null
          cancellation_reviewed_by: string | null
          cancellation_status: string | null
          created_at: string
          group_members: string[] | null
          id: string
          locked_at: string | null
          locked_by: string | null
          member_a_id: string
          member_b_id: string | null
          rank: number | null
          score_breakdown: Json | null
          session_id: string
          status: string
          total_score: number
        }
        Insert: {
          best_slot?: string | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          cancellation_requested_by?: string | null
          cancellation_reviewed_at?: string | null
          cancellation_reviewed_by?: string | null
          cancellation_status?: string | null
          created_at?: string
          group_members?: string[] | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          member_a_id: string
          member_b_id?: string | null
          rank?: number | null
          score_breakdown?: Json | null
          session_id: string
          status?: string
          total_score?: number
        }
        Update: {
          best_slot?: string | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          cancellation_requested_by?: string | null
          cancellation_reviewed_at?: string | null
          cancellation_reviewed_by?: string | null
          cancellation_status?: string | null
          created_at?: string
          group_members?: string[] | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          member_a_id?: string
          member_b_id?: string | null
          rank?: number | null
          score_breakdown?: Json | null
          session_id?: string
          status?: string
          total_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_results_cancellation_reviewed_by_fkey"
            columns: ["cancellation_reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_member_a_id_fkey"
            columns: ["member_a_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_member_b_id_fkey"
            columns: ["member_b_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "match_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      match_round_submissions: {
        Row: {
          availability: Json
          created_at: string | null
          game_type_pref: string
          gender_pref: string
          id: string
          interest_tags: string[] | null
          member_id: string
          message: string | null
          round_id: string
          social_style: string | null
          updated_at: string | null
        }
        Insert: {
          availability?: Json
          created_at?: string | null
          game_type_pref: string
          gender_pref: string
          id?: string
          interest_tags?: string[] | null
          member_id: string
          message?: string | null
          round_id: string
          social_style?: string | null
          updated_at?: string | null
        }
        Update: {
          availability?: Json
          created_at?: string | null
          game_type_pref?: string
          gender_pref?: string
          id?: string
          interest_tags?: string[] | null
          member_id?: string
          message?: string | null
          round_id?: string
          social_style?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_round_submissions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_round_submissions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "match_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      match_rounds: {
        Row: {
          activity_end: string
          activity_start: string
          created_at: string | null
          created_by: string | null
          id: string
          round_name: string
          status: string
          survey_end: string
          survey_start: string
        }
        Insert: {
          activity_end: string
          activity_start: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          round_name: string
          status?: string
          survey_end: string
          survey_start: string
        }
        Update: {
          activity_end?: string
          activity_start?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          round_name?: string
          status?: string
          survey_end?: string
          survey_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_rounds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      match_sessions: {
        Row: {
          algorithm: string
          config: Json
          created_at: string
          created_by: string | null
          group_size: number
          id: string
          round_id: string | null
          session_name: string | null
          status: string
          total_candidates: number
          total_matched: number
          total_unmatched: number
        }
        Insert: {
          algorithm?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          group_size?: number
          id?: string
          round_id?: string | null
          session_name?: string | null
          status?: string
          total_candidates?: number
          total_matched?: number
          total_unmatched?: number
        }
        Update: {
          algorithm?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          group_size?: number
          id?: string
          round_id?: string | null
          session_name?: string | null
          status?: string
          total_candidates?: number
          total_matched?: number
          total_unmatched?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_sessions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "match_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      member_boundaries: {
        Row: {
          boundary_notes: string | null
          created_at: string
          deal_breakers: string[]
          id: string
          member_id: string
          preferred_age_range: string | null
          preferred_gender_mix: string | null
          taboo_tags: string[]
          updated_at: string
        }
        Insert: {
          boundary_notes?: string | null
          created_at?: string
          deal_breakers?: string[]
          id?: string
          member_id: string
          preferred_age_range?: string | null
          preferred_gender_mix?: string | null
          taboo_tags?: string[]
          updated_at?: string
        }
        Update: {
          boundary_notes?: string | null
          created_at?: string
          deal_breakers?: string[]
          id?: string
          member_id?: string
          preferred_age_range?: string | null
          preferred_gender_mix?: string | null
          taboo_tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_boundaries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_dynamic_stats: {
        Row: {
          activity_count: number
          avg_review_score: number | null
          complaint_count: number
          created_at: string
          id: string
          last_activity_at: string | null
          late_count: number
          member_id: string
          no_show_count: number
          recent5_avg_score: number | null
          reliability_score: number
          replay_willing_rate: number | null
          review_count: number
          updated_at: string
        }
        Insert: {
          activity_count?: number
          avg_review_score?: number | null
          complaint_count?: number
          created_at?: string
          id?: string
          last_activity_at?: string | null
          late_count?: number
          member_id: string
          no_show_count?: number
          recent5_avg_score?: number | null
          reliability_score?: number
          replay_willing_rate?: number | null
          review_count?: number
          updated_at?: string
        }
        Update: {
          activity_count?: number
          avg_review_score?: number | null
          complaint_count?: number
          created_at?: string
          id?: string
          last_activity_at?: string | null
          late_count?: number
          member_id?: string
          no_show_count?: number
          recent5_avg_score?: number | null
          reliability_score?: number
          replay_willing_rate?: number | null
          review_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_dynamic_stats_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_identity: {
        Row: {
          activity_type_tags: string[]
          age_range: string
          course_language: string | null
          created_at: string
          current_city: string
          degree_level: string | null
          department: string | null
          enrollment_year: number | null
          full_name: string
          gender: string
          height_weight: string | null
          hobby_tags: string[]
          id: string
          member_id: string
          nationality: string
          nickname: string | null
          personality_self_tags: string[]
          phone: string | null
          school_name: string | null
          sns_accounts: Json | null
          taboo_tags: string[]
          updated_at: string
        }
        Insert: {
          activity_type_tags?: string[]
          age_range: string
          course_language?: string | null
          created_at?: string
          current_city: string
          degree_level?: string | null
          department?: string | null
          enrollment_year?: number | null
          full_name: string
          gender: string
          height_weight?: string | null
          hobby_tags?: string[]
          id?: string
          member_id: string
          nationality: string
          nickname?: string | null
          personality_self_tags?: string[]
          phone?: string | null
          school_name?: string | null
          sns_accounts?: Json | null
          taboo_tags?: string[]
          updated_at?: string
        }
        Update: {
          activity_type_tags?: string[]
          age_range?: string
          course_language?: string | null
          created_at?: string
          current_city?: string
          degree_level?: string | null
          department?: string | null
          enrollment_year?: number | null
          full_name?: string
          gender?: string
          height_weight?: string | null
          hobby_tags?: string[]
          id?: string
          member_id?: string
          nationality?: string
          nickname?: string | null
          personality_self_tags?: string[]
          phone?: string | null
          school_name?: string | null
          sns_accounts?: Json | null
          taboo_tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_identity_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_interests: {
        Row: {
          accept_beginners: boolean | null
          accept_cross_school: boolean | null
          activity_area: string | null
          activity_frequency: string | null
          budget_range: string | null
          created_at: string
          game_type_pref: string | null
          graduation_year: number | null
          id: string
          ideal_group_size: string | null
          member_id: string
          nearest_station: string | null
          non_script_preference: string[]
          preferred_time_slots: string[]
          scenario_mode_pref: string[]
          scenario_theme_tags: string[]
          script_preference: string[]
          social_goal_primary: string | null
          social_goal_secondary: string | null
          travel_radius: string | null
          updated_at: string
        }
        Insert: {
          accept_beginners?: boolean | null
          accept_cross_school?: boolean | null
          activity_area?: string | null
          activity_frequency?: string | null
          budget_range?: string | null
          created_at?: string
          game_type_pref?: string | null
          graduation_year?: number | null
          id?: string
          ideal_group_size?: string | null
          member_id: string
          nearest_station?: string | null
          non_script_preference?: string[]
          preferred_time_slots?: string[]
          scenario_mode_pref?: string[]
          scenario_theme_tags?: string[]
          script_preference?: string[]
          social_goal_primary?: string | null
          social_goal_secondary?: string | null
          travel_radius?: string | null
          updated_at?: string
        }
        Update: {
          accept_beginners?: boolean | null
          accept_cross_school?: boolean | null
          activity_area?: string | null
          activity_frequency?: string | null
          budget_range?: string | null
          created_at?: string
          game_type_pref?: string | null
          graduation_year?: number | null
          id?: string
          ideal_group_size?: string | null
          member_id?: string
          nearest_station?: string | null
          non_script_preference?: string[]
          preferred_time_slots?: string[]
          scenario_mode_pref?: string[]
          scenario_theme_tags?: string[]
          script_preference?: string[]
          social_goal_primary?: string | null
          social_goal_secondary?: string | null
          travel_radius?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_interests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_language: {
        Row: {
          communication_language_pref: string[]
          created_at: string
          id: string
          japanese_level: string | null
          member_id: string
          updated_at: string
        }
        Insert: {
          communication_language_pref?: string[]
          created_at?: string
          id?: string
          japanese_level?: string | null
          member_id: string
          updated_at?: string
        }
        Update: {
          communication_language_pref?: string[]
          created_at?: string
          id?: string
          japanese_level?: string | null
          member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_language_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          member_id: string
          note: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          member_id: string
          note: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          member_id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_notes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_personality: {
        Row: {
          boundary_strength: string | null
          coop_compete_tendency: string | null
          created_at: string
          emotional_stability: number
          expression_style_tags: string[]
          extroversion: number
          group_role_tags: string[]
          id: string
          initiative: number
          member_id: string
          planning_style: string | null
          reply_speed: string | null
          updated_at: string
          warmup_speed: string | null
        }
        Insert: {
          boundary_strength?: string | null
          coop_compete_tendency?: string | null
          created_at?: string
          emotional_stability?: number
          expression_style_tags?: string[]
          extroversion?: number
          group_role_tags?: string[]
          id?: string
          initiative?: number
          member_id: string
          planning_style?: string | null
          reply_speed?: string | null
          updated_at?: string
          warmup_speed?: string | null
        }
        Update: {
          boundary_strength?: string | null
          coop_compete_tendency?: string | null
          created_at?: string
          emotional_stability?: number
          expression_style_tags?: string[]
          extroversion?: number
          group_role_tags?: string[]
          id?: string
          initiative?: number
          member_id?: string
          planning_style?: string | null
          reply_speed?: string | null
          updated_at?: string
          warmup_speed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_personality_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_verification: {
        Row: {
          created_at: string
          id: string
          member_id: string
          photo_verified: boolean
          student_id_verified: boolean
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          photo_verified?: boolean
          student_id_verified?: boolean
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          photo_verified?: boolean
          student_id_verified?: boolean
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_verification_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_verification_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          attractiveness_score: number | null
          created_at: string
          email: string | null
          id: string
          interview_date: string | null
          interviewer: string | null
          line_user_id: string | null
          member_number: string | null
          membership_type: string
          status: string
          updated_at: string
          user_id: string | null
          wechat_openid: string | null
        }
        Insert: {
          attractiveness_score?: number | null
          created_at?: string
          email?: string | null
          id?: string
          interview_date?: string | null
          interviewer?: string | null
          line_user_id?: string | null
          member_number?: string | null
          membership_type?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          wechat_openid?: string | null
        }
        Update: {
          attractiveness_score?: number | null
          created_at?: string
          email?: string | null
          id?: string
          interview_date?: string | null
          interviewer?: string | null
          line_user_id?: string | null
          member_number?: string | null
          membership_type?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          wechat_openid?: string | null
        }
        Relationships: []
      }
      mutual_reviews: {
        Row: {
          activity_id: string | null
          comment: string | null
          communication_score: number
          created_at: string
          fun_score: number
          id: string
          match_result_id: string | null
          negative_tags: string[]
          overall_score: number
          positive_tags: string[]
          punctuality_score: number
          reviewee_id: string
          reviewer_id: string
          teamwork_score: number
          would_play_again: boolean
        }
        Insert: {
          activity_id?: string | null
          comment?: string | null
          communication_score: number
          created_at?: string
          fun_score: number
          id?: string
          match_result_id?: string | null
          negative_tags?: string[]
          overall_score: number
          positive_tags?: string[]
          punctuality_score: number
          reviewee_id: string
          reviewer_id: string
          teamwork_score: number
          would_play_again?: boolean
        }
        Update: {
          activity_id?: string | null
          comment?: string | null
          communication_score?: number
          created_at?: string
          fun_score?: number
          id?: string
          match_result_id?: string | null
          negative_tags?: string[]
          overall_score?: number
          positive_tags?: string[]
          punctuality_score?: number
          reviewee_id?: string
          reviewer_id?: string
          teamwork_score?: number
          would_play_again?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "mutual_reviews_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mutual_reviews_match_result_id_fkey"
            columns: ["match_result_id"]
            isOneToOne: false
            referencedRelation: "match_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mutual_reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mutual_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      pair_relationships: {
        Row: {
          avg_score: number | null
          created_at: string
          feedback_a: Json | null
          feedback_b: Json | null
          id: string
          last_matched_at: string | null
          member_a_id: string
          member_b_id: string
          notes: string | null
          pair_count: number
          status: string
          updated_at: string
        }
        Insert: {
          avg_score?: number | null
          created_at?: string
          feedback_a?: Json | null
          feedback_b?: Json | null
          id?: string
          last_matched_at?: string | null
          member_a_id: string
          member_b_id: string
          notes?: string | null
          pair_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          avg_score?: number | null
          created_at?: string
          feedback_a?: Json | null
          feedback_b?: Json | null
          id?: string
          last_matched_at?: string | null
          member_a_id?: string
          member_b_id?: string
          notes?: string | null
          pair_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pair_relationships_member_a_id_fkey"
            columns: ["member_a_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_relationships_member_b_id_fkey"
            columns: ["member_b_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      personality_quiz_results: {
        Row: {
          answers: Json
          completed_at: string
          created_at: string
          id: string
          member_id: string
          personality_type: string | null
          score_a: number
          score_c: number
          score_e: number
          score_n: number
          score_o: number
          updated_at: string
        }
        Insert: {
          answers: Json
          completed_at?: string
          created_at?: string
          id?: string
          member_id: string
          personality_type?: string | null
          score_a?: number
          score_c?: number
          score_e?: number
          score_n?: number
          score_o?: number
          updated_at?: string
        }
        Update: {
          answers?: Json
          completed_at?: string
          created_at?: string
          id?: string
          member_id?: string
          personality_type?: string | null
          score_a?: number
          score_c?: number
          score_e?: number
          score_n?: number
          score_o?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personality_quiz_results_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      script_play_records: {
        Row: {
          activity_id: string | null
          can_view_full: boolean
          comment: string | null
          created_at: string
          id: string
          member_id: string
          played_at: string | null
          rating: number | null
          script_id: string
        }
        Insert: {
          activity_id?: string | null
          can_view_full?: boolean
          comment?: string | null
          created_at?: string
          id?: string
          member_id: string
          played_at?: string | null
          rating?: number | null
          script_id: string
        }
        Update: {
          activity_id?: string | null
          can_view_full?: boolean
          comment?: string | null
          created_at?: string
          id?: string
          member_id?: string
          played_at?: string | null
          rating?: number | null
          script_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_play_records_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_play_records_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_play_records_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          author: string | null
          budget: string | null
          content_html: string | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          difficulty: string | null
          duration_minutes: number | null
          genre_tags: string[]
          id: string
          is_featured: boolean
          is_published: boolean
          language: string | null
          location: string | null
          page_count: number | null
          page_images: string[] | null
          pdf_url: string | null
          play_count: number
          player_count_max: number | null
          player_count_min: number | null
          roles: Json | null
          script_type: string | null
          theme_tags: string[]
          title: string
          title_ja: string | null
          updated_at: string
          warnings: string[]
        }
        Insert: {
          author?: string | null
          budget?: string | null
          content_html?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty?: string | null
          duration_minutes?: number | null
          genre_tags?: string[]
          id?: string
          is_featured?: boolean
          is_published?: boolean
          language?: string | null
          location?: string | null
          page_count?: number | null
          page_images?: string[] | null
          pdf_url?: string | null
          play_count?: number
          player_count_max?: number | null
          player_count_min?: number | null
          roles?: Json | null
          script_type?: string | null
          theme_tags?: string[]
          title: string
          title_ja?: string | null
          updated_at?: string
          warnings?: string[]
        }
        Update: {
          author?: string | null
          budget?: string | null
          content_html?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty?: string | null
          duration_minutes?: number | null
          genre_tags?: string[]
          id?: string
          is_featured?: boolean
          is_published?: boolean
          language?: string | null
          location?: string | null
          page_count?: number | null
          page_images?: string[] | null
          pdf_url?: string | null
          play_count?: number
          player_count_max?: number | null
          player_count_min?: number | null
          roles?: Json | null
          script_type?: string | null
          theme_tags?: string[]
          title?: string
          title_ja?: string | null
          updated_at?: string
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "scripts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          created_at: string | null
          id: string
          is_published: boolean | null
          name: string
          quote: string
          school: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          name: string
          quote: string
          school?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          name?: string
          quote?: string
          school?: string | null
          sort_order?: number | null
        }
        Relationships: []
      }
      unmatched_diagnostics: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          member_id: string
          reason: string
          session_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          member_id: string
          reason: string
          session_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          member_id?: string
          reason?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unmatched_diagnostics_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unmatched_diagnostics_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "match_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
