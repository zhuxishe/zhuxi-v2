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
          audit_reason: string | null
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
          audit_reason?: string | null
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
          audit_reason?: string | null
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
      community_announcements: {
        Row: {
          body_ja: string | null
          body_zh: string | null
          created_at: string
          created_by: string | null
          display_end_at: string | null
          display_start_at: string | null
          id: string
          is_pinned: boolean
          link_text_ja: string | null
          link_text_zh: string | null
          link_url: string | null
          notified_at: string | null
          notify_on_publish: boolean
          published_at: string | null
          publisher_name: string
          sort_order: number
          status: string
          summary_ja: string | null
          summary_zh: string | null
          title_ja: string | null
          title_zh: string | null
          updated_at: string
        }
        Insert: {
          body_ja?: string | null
          body_zh?: string | null
          created_at?: string
          created_by?: string | null
          display_end_at?: string | null
          display_start_at?: string | null
          id?: string
          is_pinned?: boolean
          link_text_ja?: string | null
          link_text_zh?: string | null
          link_url?: string | null
          notified_at?: string | null
          notify_on_publish?: boolean
          published_at?: string | null
          publisher_name: string
          sort_order?: number
          status?: string
          summary_ja?: string | null
          summary_zh?: string | null
          title_ja?: string | null
          title_zh?: string | null
          updated_at?: string
        }
        Update: {
          body_ja?: string | null
          body_zh?: string | null
          created_at?: string
          created_by?: string | null
          display_end_at?: string | null
          display_start_at?: string | null
          id?: string
          is_pinned?: boolean
          link_text_ja?: string | null
          link_text_zh?: string | null
          link_url?: string | null
          notified_at?: string | null
          notify_on_publish?: boolean
          published_at?: string | null
          publisher_name?: string
          sort_order?: number
          status?: string
          summary_ja?: string | null
          summary_zh?: string | null
          title_ja?: string | null
          title_zh?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_blocks: {
        Row: {
          blocked_profile_id: string
          blocker_member_id: string
          created_at: string
        }
        Insert: {
          blocked_profile_id: string
          blocker_member_id: string
          created_at?: string
        }
        Update: {
          blocked_profile_id?: string
          blocker_member_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_blocks_blocked_profile_id_fkey"
            columns: ["blocked_profile_id"]
            isOneToOne: false
            referencedRelation: "community_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_blocks_blocker_member_id_fkey"
            columns: ["blocker_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comments: {
        Row: {
          author_profile_id: string | null
          body: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          hidden_at: string | null
          id: string
          is_anonymous_author: boolean
          parent_comment_id: string | null
          post_id: string
          removal_source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          author_profile_id?: string | null
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          hidden_at?: string | null
          id?: string
          is_anonymous_author?: boolean
          parent_comment_id?: string | null
          post_id: string
          removal_source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          author_profile_id?: string | null
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          hidden_at?: string | null
          id?: string
          is_anonymous_author?: boolean
          parent_comment_id?: string | null
          post_id?: string
          removal_source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "community_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_faqs: {
        Row: {
          answer_ja: string | null
          answer_zh: string | null
          created_at: string
          created_by: string | null
          id: string
          is_featured: boolean
          published_at: string | null
          question_ja: string | null
          question_zh: string | null
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          answer_ja?: string | null
          answer_zh?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_featured?: boolean
          published_at?: string | null
          question_ja?: string | null
          question_zh?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          answer_ja?: string | null
          answer_zh?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_featured?: boolean
          published_at?: string | null
          question_ja?: string | null
          question_zh?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_faqs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_likes: {
        Row: {
          created_at: string
          member_id: string
          post_id: string
        }
        Insert: {
          created_at?: string
          member_id: string
          post_id: string
        }
        Update: {
          created_at?: string
          member_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_likes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_moderation_actions: {
        Row: {
          action_type: string
          actor_member_id: string | null
          admin_user_id: string | null
          content_snapshot: Json | null
          created_at: string
          id: string
          internal_note: string | null
          payload_expires_at: string | null
          reason_code: string | null
          report_id: string | null
          target_comment_id: string | null
          target_member_id: string | null
          target_post_id: string | null
          target_profile_id: string | null
          target_type: string
        }
        Insert: {
          action_type: string
          actor_member_id?: string | null
          admin_user_id?: string | null
          content_snapshot?: Json | null
          created_at?: string
          id?: string
          internal_note?: string | null
          payload_expires_at?: string | null
          reason_code?: string | null
          report_id?: string | null
          target_comment_id?: string | null
          target_member_id?: string | null
          target_post_id?: string | null
          target_profile_id?: string | null
          target_type: string
        }
        Update: {
          action_type?: string
          actor_member_id?: string | null
          admin_user_id?: string | null
          content_snapshot?: Json | null
          created_at?: string
          id?: string
          internal_note?: string | null
          payload_expires_at?: string | null
          reason_code?: string | null
          report_id?: string | null
          target_comment_id?: string | null
          target_member_id?: string | null
          target_post_id?: string | null
          target_profile_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_moderation_actions_actor_member_id_fkey"
            columns: ["actor_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_moderation_actions_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_moderation_actions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "community_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_moderation_actions_target_comment_id_fkey"
            columns: ["target_comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_moderation_actions_target_member_id_fkey"
            columns: ["target_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_moderation_actions_target_post_id_fkey"
            columns: ["target_post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_moderation_actions_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "community_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_nickname_history: {
        Row: {
          changed_at: string
          changed_by_admin_id: string | null
          changed_by_member_id: string | null
          id: number
          new_nickname: string
          old_nickname: string
          profile_id: string
        }
        Insert: {
          changed_at?: string
          changed_by_admin_id?: string | null
          changed_by_member_id?: string | null
          id?: never
          new_nickname: string
          old_nickname: string
          profile_id: string
        }
        Update: {
          changed_at?: string
          changed_by_admin_id?: string | null
          changed_by_member_id?: string | null
          id?: never
          new_nickname?: string
          old_nickname?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_nickname_history_changed_by_admin_id_fkey"
            columns: ["changed_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_nickname_history_changed_by_member_id_fkey"
            columns: ["changed_by_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_nickname_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "community_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_notification_preferences: {
        Row: {
          announcements_enabled: boolean
          comments_enabled: boolean
          likes_enabled: boolean
          member_id: string
          replies_enabled: boolean
          updated_at: string
        }
        Insert: {
          announcements_enabled?: boolean
          comments_enabled?: boolean
          likes_enabled?: boolean
          member_id: string
          replies_enabled?: boolean
          updated_at?: string
        }
        Update: {
          announcements_enabled?: boolean
          comments_enabled?: boolean
          likes_enabled?: boolean
          member_id?: string
          replies_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_notification_preferences_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      community_notifications: {
        Row: {
          actor_profile_id: string | null
          announcement_id: string | null
          body_ja: string | null
          body_zh: string | null
          comment_id: string | null
          created_at: string
          expires_at: string
          group_count: number
          id: string
          notification_type: string
          post_id: string | null
          read_at: string | null
          recipient_member_id: string
          report_id: string | null
          title_ja: string | null
          title_zh: string | null
        }
        Insert: {
          actor_profile_id?: string | null
          announcement_id?: string | null
          body_ja?: string | null
          body_zh?: string | null
          comment_id?: string | null
          created_at?: string
          expires_at?: string
          group_count?: number
          id?: string
          notification_type: string
          post_id?: string | null
          read_at?: string | null
          recipient_member_id: string
          report_id?: string | null
          title_ja?: string | null
          title_zh?: string | null
        }
        Update: {
          actor_profile_id?: string | null
          announcement_id?: string | null
          body_ja?: string | null
          body_zh?: string | null
          comment_id?: string | null
          created_at?: string
          expires_at?: string
          group_count?: number
          id?: string
          notification_type?: string
          post_id?: string | null
          read_at?: string | null
          recipient_member_id?: string
          report_id?: string | null
          title_ja?: string | null
          title_zh?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_notifications_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "community_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_notifications_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "community_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_notifications_recipient_member_id_fkey"
            columns: ["recipient_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_notifications_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "community_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      community_post_images: {
        Row: {
          byte_size: number | null
          created_at: string
          height: number | null
          id: string
          mime_type: string
          post_id: string
          sort_order: number
          storage_path: string
          thumbnail_path: string
          width: number | null
        }
        Insert: {
          byte_size?: number | null
          created_at?: string
          height?: number | null
          id?: string
          mime_type: string
          post_id: string
          sort_order: number
          storage_path: string
          thumbnail_path: string
          width?: number | null
        }
        Update: {
          byte_size?: number | null
          created_at?: string
          height?: number | null
          id?: string
          mime_type?: string
          post_id?: string
          sort_order?: number
          storage_path?: string
          thumbnail_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "community_post_images_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_profile_id: string | null
          body: string | null
          comment_count: number
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          hidden_at: string | null
          id: string
          is_anonymous: boolean
          like_count: number
          post_type: string
          published_at: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          author_profile_id?: string | null
          body?: string | null
          comment_count?: number
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          hidden_at?: string | null
          id?: string
          is_anonymous?: boolean
          like_count?: number
          post_type: string
          published_at?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          author_profile_id?: string | null
          body?: string | null
          comment_count?: number
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          hidden_at?: string | null
          id?: string
          is_anonymous?: boolean
          like_count?: number
          post_type?: string
          published_at?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "community_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_profiles: {
        Row: {
          avatar_kind: string
          avatar_path: string | null
          id: string
          joined_at: string
          nickname: string
          nickname_normalized: string | null
          preset_avatar: string | null
          updated_at: string
        }
        Insert: {
          avatar_kind?: string
          avatar_path?: string | null
          id?: string
          joined_at?: string
          nickname: string
          nickname_normalized?: string | null
          preset_avatar?: string | null
          updated_at?: string
        }
        Update: {
          avatar_kind?: string
          avatar_path?: string | null
          id?: string
          joined_at?: string
          nickname?: string
          nickname_normalized?: string | null
          preset_avatar?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      community_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_comment_id: string | null
          reported_post_id: string | null
          reported_profile_id: string | null
          reporter_member_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_snapshot: Json | null
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reported_comment_id?: string | null
          reported_post_id?: string | null
          reported_profile_id?: string | null
          reporter_member_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_snapshot?: Json | null
          target_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_comment_id?: string | null
          reported_post_id?: string | null
          reported_profile_id?: string | null
          reporter_member_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_snapshot?: Json | null
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reports_reported_comment_id_fkey"
            columns: ["reported_comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_reported_post_id_fkey"
            columns: ["reported_post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_reported_profile_id_fkey"
            columns: ["reported_profile_id"]
            isOneToOne: false
            referencedRelation: "community_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_reporter_member_id_fkey"
            columns: ["reporter_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_sanctions: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          issued_by: string | null
          member_id: string
          reason: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          sanction_type: string
          starts_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          issued_by?: string | null
          member_id: string
          reason: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          sanction_type: string
          starts_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          issued_by?: string | null
          member_id?: string
          reason?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          sanction_type?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_sanctions_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_sanctions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_sanctions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_user_hides: {
        Row: {
          created_at: string
          member_id: string
          post_id: string
        }
        Insert: {
          created_at?: string
          member_id: string
          post_id: string
        }
        Update: {
          created_at?: string
          member_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_user_hides_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_user_hides_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
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
      homepage_school_stats: {
        Row: {
          featured_schools: Json
          id: number
          published_at: string
          total_members: number
          total_schools: number
          version: number
        }
        Insert: {
          featured_schools: Json
          id?: number
          published_at?: string
          total_members: number
          total_schools: number
          version?: number
        }
        Update: {
          featured_schools?: Json
          id?: number
          published_at?: string
          total_members?: number
          total_schools?: number
          version?: number
        }
        Relationships: []
      }
      homepage_school_stats_history: {
        Row: {
          action: string
          featured_schools: Json
          id: number
          published_at: string
          published_by: string | null
          published_by_name: string
          restored_from_version: number | null
          total_members: number
          total_schools: number
          version: number
        }
        Insert: {
          action: string
          featured_schools: Json
          id?: never
          published_at?: string
          published_by?: string | null
          published_by_name: string
          restored_from_version?: number | null
          total_members: number
          total_schools: number
          version: number
        }
        Update: {
          action?: string
          featured_schools?: Json
          id?: never
          published_at?: string
          published_by?: string | null
          published_by_name?: string
          restored_from_version?: number | null
          total_members?: number
          total_schools?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "homepage_school_stats_history_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_school_stats_history_restored_from_version_fkey"
            columns: ["restored_from_version"]
            isOneToOne: false
            referencedRelation: "homepage_school_stats_history"
            referencedColumns: ["version"]
          },
        ]
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
      legacy_members: {
        Row: {
          audit_reason: string | null
          canonical_member_id: string
          claim_status: string
          claimed_at: string | null
          claimed_by: string | null
          compatibility_score: number | null
          created_at: string
          department: string | null
          full_name: string
          game_mode: string | null
          gender: string | null
          id: string
          interest_tags: string[] | null
          match_history: Json | null
          member_no: string
          reviewed_at: string | null
          reviewed_by: string | null
          school: string | null
          session_count: number | null
          social_tags: string[] | null
        }
        Insert: {
          audit_reason?: string | null
          canonical_member_id: string
          claim_status?: string
          claimed_at?: string | null
          claimed_by?: string | null
          compatibility_score?: number | null
          created_at?: string
          department?: string | null
          full_name: string
          game_mode?: string | null
          gender?: string | null
          id?: string
          interest_tags?: string[] | null
          match_history?: Json | null
          member_no: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          school?: string | null
          session_count?: number | null
          social_tags?: string[] | null
        }
        Update: {
          audit_reason?: string | null
          canonical_member_id?: string
          claim_status?: string
          claimed_at?: string | null
          claimed_by?: string | null
          compatibility_score?: number | null
          created_at?: string
          department?: string | null
          full_name?: string
          game_mode?: string | null
          gender?: string | null
          id?: string
          interest_tags?: string[] | null
          match_history?: Json | null
          member_no?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          school?: string | null
          session_count?: number | null
          social_tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_members_canonical_member_id_fkey"
            columns: ["canonical_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_members_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      match_results: {
        Row: {
          audit_reason: string | null
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
          audit_reason?: string | null
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
          audit_reason?: string | null
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
          audit_reason: string | null
          availability: Json
          created_at: string | null
          game_type_pref: string
          gender_pref: string
          id: string
          import_metadata: Json | null
          interest_tags: string[] | null
          member_id: string
          message: string | null
          round_id: string
          social_style: string | null
          updated_at: string | null
        }
        Insert: {
          audit_reason?: string | null
          availability?: Json
          created_at?: string | null
          game_type_pref: string
          gender_pref: string
          id?: string
          import_metadata?: Json | null
          interest_tags?: string[] | null
          member_id: string
          message?: string | null
          round_id: string
          social_style?: string | null
          updated_at?: string | null
        }
        Update: {
          audit_reason?: string | null
          availability?: Json
          created_at?: string | null
          game_type_pref?: string
          gender_pref?: string
          id?: string
          import_metadata?: Json | null
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
          audit_reason: string | null
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
          audit_reason?: string | null
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
          audit_reason?: string | null
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
          audit_reason: string | null
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
          audit_reason?: string | null
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
          audit_reason?: string | null
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
          personal_avatar_path: string | null
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
          personal_avatar_path?: string | null
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
          personal_avatar_path?: string | null
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
          audit_reason: string | null
          created_at: string
          created_by: string | null
          id: string
          member_id: string
          note: string
        }
        Insert: {
          audit_reason?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          member_id: string
          note: string
        }
        Update: {
          audit_reason?: string | null
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
          account_linked_at: string | null
          account_status: string
          anonymized_at: string | null
          attractiveness_score: number | null
          created_at: string
          email: string | null
          id: string
          interview_date: string | null
          interviewer: string | null
          last_profile_saved_at: string | null
          line_user_id: string | null
          member_number: string | null
          membership_type: string
          onboarding_step: number
          profile_stage: string
          record_scope: string
          record_source: string
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string | null
          wechat_openid: string | null
        }
        Insert: {
          account_linked_at?: string | null
          account_status?: string
          anonymized_at?: string | null
          attractiveness_score?: number | null
          created_at?: string
          email?: string | null
          id?: string
          interview_date?: string | null
          interviewer?: string | null
          last_profile_saved_at?: string | null
          line_user_id?: string | null
          member_number?: string | null
          membership_type?: string
          onboarding_step?: number
          profile_stage?: string
          record_scope?: string
          record_source?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string | null
          wechat_openid?: string | null
        }
        Update: {
          account_linked_at?: string | null
          account_status?: string
          anonymized_at?: string | null
          attractiveness_score?: number | null
          created_at?: string
          email?: string | null
          id?: string
          interview_date?: string | null
          interviewer?: string | null
          last_profile_saved_at?: string | null
          line_user_id?: string | null
          member_number?: string | null
          membership_type?: string
          onboarding_step?: number
          profile_stage?: string
          record_scope?: string
          record_source?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string | null
          wechat_openid?: string | null
        }
        Relationships: []
      }
      mutual_reviews: {
        Row: {
          activity_id: string | null
          audit_reason: string | null
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
          audit_reason?: string | null
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
          audit_reason?: string | null
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
          audit_reason: string | null
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
          audit_reason?: string | null
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
          audit_reason?: string | null
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
      past_event_reviews: {
        Row: {
          capacity_note: string | null
          capacity_note_ja: string | null
          content: string | null
          content_ja: string | null
          cover_url: string
          created_at: string
          end_at: string | null
          event_date: string | null
          fee_note: string | null
          fee_note_ja: string | null
          gallery_urls: Json
          id: string
          is_published: boolean
          location: string | null
          location_ja: string | null
          pin_in_player_library: boolean
          player_home_order: number
          player_library_order: number
          registration_url: string | null
          show_on_player_home: boolean
          sort_order: number
          source_key: string | null
          source_url: string | null
          start_at: string | null
          status: string
          summary: string
          summary_ja: string | null
          tags: string[]
          title: string
          title_ja: string | null
          updated_at: string
        }
        Insert: {
          capacity_note?: string | null
          capacity_note_ja?: string | null
          content?: string | null
          content_ja?: string | null
          cover_url: string
          created_at?: string
          end_at?: string | null
          event_date?: string | null
          fee_note?: string | null
          fee_note_ja?: string | null
          gallery_urls?: Json
          id?: string
          is_published?: boolean
          location?: string | null
          location_ja?: string | null
          pin_in_player_library?: boolean
          player_home_order?: number
          player_library_order?: number
          registration_url?: string | null
          show_on_player_home?: boolean
          sort_order?: number
          source_key?: string | null
          source_url?: string | null
          start_at?: string | null
          status?: string
          summary: string
          summary_ja?: string | null
          tags?: string[]
          title: string
          title_ja?: string | null
          updated_at?: string
        }
        Update: {
          capacity_note?: string | null
          capacity_note_ja?: string | null
          content?: string | null
          content_ja?: string | null
          cover_url?: string
          created_at?: string
          end_at?: string | null
          event_date?: string | null
          fee_note?: string | null
          fee_note_ja?: string | null
          gallery_urls?: Json
          id?: string
          is_published?: boolean
          location?: string | null
          location_ja?: string | null
          pin_in_player_library?: boolean
          player_home_order?: number
          player_library_order?: number
          registration_url?: string | null
          show_on_player_home?: boolean
          sort_order?: number
          source_key?: string | null
          source_url?: string | null
          start_at?: string | null
          status?: string
          summary?: string
          summary_ja?: string | null
          tags?: string[]
          title?: string
          title_ja?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      personality_quiz_config: {
        Row: {
          dimensions: Json
          id: string
          questions: Json
          scoring: Json
          type_descriptions: Json
          type_labels: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          dimensions: Json
          id?: string
          questions: Json
          scoring?: Json
          type_descriptions?: Json
          type_labels: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          dimensions?: Json
          id?: string
          questions?: Json
          scoring?: Json
          type_descriptions?: Json
          type_labels?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
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
      player_activity_settings: {
        Row: {
          id: number
          social_home_limit: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          social_home_limit?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          social_home_limit?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_activity_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      player_feedback: {
        Row: {
          admin_note: string | null
          audit_reason: string | null
          category: string
          client_submission_id: string
          completed_at: string | null
          content: string
          created_at: string
          id: string
          locale: string
          member_id: string
          member_name_snapshot: string
          page_path: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          audit_reason?: string | null
          category: string
          client_submission_id: string
          completed_at?: string | null
          content: string
          created_at?: string
          id?: string
          locale?: string
          member_id: string
          member_name_snapshot: string
          page_path?: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          audit_reason?: string | null
          category?: string
          client_submission_id?: string
          completed_at?: string | null
          content?: string
          created_at?: string
          id?: string
          locale?: string
          member_id?: string
          member_name_snapshot?: string
          page_path?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_feedback_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      script_play_records: {
        Row: {
          activity_id: string | null
          audit_reason: string | null
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
          audit_reason?: string | null
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
          audit_reason?: string | null
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
          is_social_script: boolean
          language: string | null
          location: string | null
          page_count: number | null
          page_images: string[] | null
          pdf_url: string | null
          pin_in_social_library: boolean
          play_count: number
          player_activity_order: number
          player_count_max: number | null
          player_count_min: number | null
          roles: Json | null
          script_type: string | null
          show_on_player_activity: boolean
          social_library_order: number
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
          is_social_script?: boolean
          language?: string | null
          location?: string | null
          page_count?: number | null
          page_images?: string[] | null
          pdf_url?: string | null
          pin_in_social_library?: boolean
          play_count?: number
          player_activity_order?: number
          player_count_max?: number | null
          player_count_min?: number | null
          roles?: Json | null
          script_type?: string | null
          show_on_player_activity?: boolean
          social_library_order?: number
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
          is_social_script?: boolean
          language?: string | null
          location?: string | null
          page_count?: number | null
          page_images?: string[] | null
          pdf_url?: string | null
          pin_in_social_library?: boolean
          play_count?: number
          player_activity_order?: number
          player_count_max?: number | null
          player_count_min?: number | null
          roles?: Json | null
          script_type?: string | null
          show_on_player_activity?: boolean
          social_library_order?: number
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
      staff_profiles: {
        Row: {
          audit_reason: string | null
          avatar_url: string | null
          created_at: string
          id: string
          intro: string
          is_published: boolean
          major: string
          member_id: string | null
          name: string
          school: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          audit_reason?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          intro: string
          is_published?: boolean
          major: string
          member_id?: string | null
          name: string
          school: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          audit_reason?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          intro?: string
          is_published?: boolean
          major?: string
          member_id?: string | null
          name?: string
          school?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
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
          audit_reason: string | null
          created_at: string
          details: Json | null
          id: string
          member_id: string
          reason: string
          session_id: string
        }
        Insert: {
          audit_reason?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          member_id: string
          reason: string
          session_id: string
        }
        Update: {
          audit_reason?: string | null
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
      published_staff_profiles: {
        Row: {
          avatar_url: string | null
          id: string | null
          intro: string | null
          major: string | null
          name: string | null
          school: string | null
        }
        Insert: {
          avatar_url?: string | null
          id?: string | null
          intro?: string | null
          major?: string | null
          name?: string | null
          school?: string | null
        }
        Update: {
          avatar_url?: string | null
          id?: string | null
          intro?: string | null
          major?: string | null
          name?: string | null
          school?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_anonymize_member: {
        Args: { p_member_id: string; p_reason: string }
        Returns: Json
      }
      admin_clear_unmatched_diagnostics: {
        Args: { p_member_ids: string[]; p_reason: string; p_session_id: string }
        Returns: Json
      }
      admin_complete_member_auth_delete: {
        Args: { p_auth_user_id: string; p_member_id: string; p_reason: string }
        Returns: Json
      }
      admin_create_admin_whitelist: {
        Args: {
          p_email: string
          p_name?: string
          p_reason: string
          p_role: string
        }
        Returns: Json
      }
      admin_delete_activity_record: {
        Args: { p_id: string; p_reason: string }
        Returns: Json
      }
      admin_delete_admin_user: {
        Args: { p_admin_user_id: string; p_reason: string }
        Returns: Json
      }
      admin_delete_operational_record: {
        Args: { p_entity: string; p_id: string; p_reason: string }
        Returns: Json
      }
      admin_get_member_360: { Args: { p_member_id: string }; Returns: Json }
      admin_get_member_profile_audit: {
        Args: { p_limit?: number; p_member_id: string }
        Returns: Json
      }
      admin_get_member_profile_metrics: {
        Args: { p_member_id: string }
        Returns: Json
      }
      admin_hard_delete_blank_member: {
        Args: {
          p_confirm_member_id: string
          p_member_id: string
          p_reason: string
        }
        Returns: Json
      }
      admin_list_member_audit: {
        Args: { p_member_id: string; p_page?: number; p_page_size?: number }
        Returns: Json
      }
      admin_list_member_directory: {
        Args: {
          p_account_status?: string
          p_page?: number
          p_page_size?: number
          p_profile_stage?: string
          p_record_source?: string
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      admin_override_member_dynamic_stats: {
        Args: { p_member_id: string; p_payload: Json; p_reason: string }
        Returns: Json
      }
      admin_preflight_member_lifecycle: {
        Args: { p_member_id: string }
        Returns: Json
      }
      admin_recalculate_member_activity_stats: {
        Args: { p_audit_reason: string; p_member_id: string }
        Returns: Json
      }
      admin_record_member_import_event: {
        Args: {
          p_member_id: string
          p_metadata?: Json
          p_operation: string
          p_reason: string
        }
        Returns: Json
      }
      admin_resolve_member_duplicate_candidate: {
        Args: { p_candidate_id: number; p_reason: string; p_resolution: string }
        Returns: Json
      }
      admin_restore_member_event: {
        Args: { p_event_id: number; p_reason: string }
        Returns: Json
      }
      admin_set_member_account_status: {
        Args: {
          p_account_status: string
          p_member_id: string
          p_reason: string
        }
        Returns: Json
      }
      admin_update_admin_user_role: {
        Args: { p_admin_user_id: string; p_reason: string; p_role: string }
        Returns: Json
      }
      admin_update_member_number: {
        Args: {
          p_audit_reason?: string
          p_member_id: string
          p_member_number: string
        }
        Returns: string
      }
      admin_update_member_profile_metrics: {
        Args: {
          p_audit_reason: string
          p_compatibility_score: number
          p_compatibility_status: string
          p_internal_note: string
          p_level: number
          p_member_id: string
          p_score_source: string
        }
        Returns: Json
      }
      admin_update_member_section: {
        Args: {
          p_expected_updated_at?: string
          p_member_id: string
          p_payload: Json
          p_reason: string
          p_section: string
        }
        Returns: Json
      }
      admin_update_player_feedback: {
        Args: {
          p_admin_note: string
          p_expected_updated_at: string
          p_feedback_id: string
          p_reason: string
          p_status: string
        }
        Returns: Json
      }
      admin_upsert_activity_record: {
        Args: { p_id: string; p_payload: Json; p_reason: string }
        Returns: Json
      }
      admin_upsert_legacy_member: {
        Args: { p_legacy_id: string; p_payload: Json; p_reason: string }
        Returns: Json
      }
      admin_upsert_member_note: {
        Args: {
          p_member_id: string
          p_note: string
          p_note_id: string
          p_reason: string
        }
        Returns: Json
      }
      community_add_comment: {
        Args: {
          p_body: string
          p_parent_comment_id?: string
          p_post_id: string
        }
        Returns: string
      }
      community_admin_claim_media_cleanup: {
        Args: { p_limit?: number }
        Returns: {
          bucket_id: string
          cleanup_claim_token: string
          cleanup_id: number
          object_path: string
          queued_at: string
          reason: string
        }[]
      }
      community_admin_complete_media_cleanup: {
        Args: { p_claim_token: string; p_cleanup_id: number; p_error?: string }
        Returns: undefined
      }
      community_admin_get_member: {
        Args: { p_profile_id: string }
        Returns: Json
      }
      community_admin_list_content: {
        Args: {
          p_admin_user_id?: string
          p_before_at?: string
          p_before_id?: string
          p_before_rank?: number
          p_content_type?: string
          p_from?: string
          p_is_anonymous?: boolean
          p_limit?: number
          p_query?: string
          p_report_state?: string
          p_status?: string
          p_to?: string
        }
        Returns: {
          author_nickname: string
          author_profile_id: string
          body: string
          comment_count: number
          content_type: string
          edited_at: string
          id: string
          image_count: number
          is_anonymous: boolean
          like_count: number
          occurred_at: string
          parent_comment_id: string
          parent_post_title: string
          parent_post_type: string
          pending_report_count: number
          post_id: string
          source_rank: number
          status: string
          target_type: string
          title: string
          total_report_count: number
        }[]
      }
      community_admin_list_members: {
        Args: {
          p_after_joined_at?: string
          p_after_profile_id?: string
          p_limit?: number
        }
        Returns: {
          active_sanction_ends_at: string
          active_sanction_type: string
          avatar_kind: string
          avatar_path: string
          joined_at: string
          member_id: string
          member_number: string
          member_status: string
          nickname: string
          preset_avatar: string
          profile_id: string
        }[]
      }
      community_admin_moderate_content: {
        Args: {
          p_admin_user_id?: string
          p_internal_note?: string
          p_reason_code: string
          p_status: string
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      community_admin_reset_profile_avatar: {
        Args: {
          p_admin_user_id?: string
          p_profile_id: string
          p_reason: string
        }
        Returns: undefined
      }
      community_apply_sanction: {
        Args: {
          p_admin_user_id?: string
          p_duration_days?: number
          p_member_id: string
          p_reason: string
          p_sanction_type: string
        }
        Returns: string
      }
      community_block_profile: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      community_create_photo_post: {
        Args: { p_body: string; p_images: Json }
        Returns: string
      }
      community_create_treehole: {
        Args: { p_body: string; p_is_anonymous?: boolean; p_title: string }
        Returns: string
      }
      community_delete_comment: {
        Args: { p_comment_id: string }
        Returns: undefined
      }
      community_delete_post: { Args: { p_post_id: string }; Returns: undefined }
      community_dispatch_scheduled_announcements: {
        Args: never
        Returns: number
      }
      community_get_access_state: {
        Args: never
        Returns: {
          active_sanction_ends_at: string
          active_sanction_type: string
          can_interact: boolean
          can_read: boolean
          member_id: string
          profile_id: string
        }[]
      }
      community_hide_post: { Args: { p_post_id: string }; Returns: undefined }
      community_mark_all_notifications_read: { Args: never; Returns: number }
      community_mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      community_purge_expired_data: { Args: never; Returns: Json }
      community_register_processed_upload: {
        Args: {
          p_bucket_id: string
          p_byte_size: number
          p_height: number
          p_member_id: string
          p_mime_type: string
          p_storage_path: string
          p_thumbnail_path: string
          p_width: number
        }
        Returns: string
      }
      community_report_content: {
        Args: {
          p_details?: string
          p_reason: string
          p_target_id: string
          p_target_type: string
        }
        Returns: string
      }
      community_resolve_report: {
        Args: {
          p_admin_user_id?: string
          p_internal_note: string
          p_report_id: string
          p_resolution_status: string
        }
        Returns: undefined
      }
      community_reveal_comment_author: {
        Args: { p_comment_id: string; p_reason: string; p_report_id: string }
        Returns: {
          member_id: string
          member_number: string
          nickname: string
          profile_id: string
        }[]
      }
      community_reveal_post_author: {
        Args: { p_post_id: string; p_reason: string; p_report_id: string }
        Returns: {
          member_id: string
          member_number: string
          nickname: string
          profile_id: string
        }[]
      }
      community_revoke_sanction: {
        Args: {
          p_admin_user_id?: string
          p_reason: string
          p_sanction_id: string
        }
        Returns: undefined
      }
      community_service_media_evidence_exists: {
        Args: { p_bucket_id: string; p_object_path: string }
        Returns: boolean
      }
      community_set_content_status: {
        Args: {
          p_admin_user_id?: string
          p_reason: string
          p_report_id?: string
          p_status: string
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      community_toggle_post_like: {
        Args: { p_post_id: string }
        Returns: {
          like_count: number
          liked: boolean
        }[]
      }
      community_unblock_profile: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      community_unhide_post: { Args: { p_post_id: string }; Returns: undefined }
      community_update_comment: {
        Args: { p_body: string; p_comment_id: string }
        Returns: undefined
      }
      community_update_notification_preferences: {
        Args: {
          p_announcements_enabled: boolean
          p_comments_enabled: boolean
          p_likes_enabled: boolean
          p_replies_enabled: boolean
        }
        Returns: {
          announcements_enabled: boolean
          comments_enabled: boolean
          likes_enabled: boolean
          member_id: string
          replies_enabled: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_notification_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      community_update_post: {
        Args: {
          p_body: string
          p_images?: Json
          p_post_id: string
          p_title: string
        }
        Returns: undefined
      }
      community_upsert_profile: {
        Args: {
          p_avatar_kind?: string
          p_avatar_path?: string
          p_nickname: string
          p_preset_avatar?: string
        }
        Returns: {
          avatar_kind: string
          avatar_path: string | null
          id: string
          joined_at: string
          nickname: string
          nickname_normalized: string | null
          preset_avatar: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_my_member_record: { Args: never; Returns: Json }
      get_community_member_profile_metrics: {
        Args: { p_profile_id: string }
        Returns: Json
      }
      get_my_profile_summary: { Args: never; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      my_email: { Args: never; Returns: string }
      profile_service_queue_avatar_cleanup: {
        Args: { p_object_path: string; p_reason?: string }
        Returns: undefined
      }
      publish_homepage_school_stats: {
        Args: {
          p_expected_version: number
          p_featured_schools: Json
          p_total_members: number
          p_total_schools: number
        }
        Returns: number
      }
      request_my_match_cancellation: {
        Args: { p_reason?: string; p_result_id: string }
        Returns: Json
      }
      restore_homepage_school_stats: {
        Args: { p_expected_version: number; p_history_id: number }
        Returns: number
      }
      save_my_onboarding_step: {
        Args: { p_payload: Json; p_step: number }
        Returns: Json
      }
      service_set_member_line_identity: {
        Args: { p_line_user_id: string; p_operation: string; p_user_id: string }
        Returns: Json
      }
      submit_my_onboarding: { Args: never; Returns: Json }
      update_my_profile: {
        Args: {
          p_department?: string
          p_full_name: string
          p_gender: string
          p_nickname?: string
          p_personal_avatar_path?: string
          p_school_name?: string
        }
        Returns: Json
      }
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
