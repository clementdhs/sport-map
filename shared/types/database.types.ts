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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      collection_routes: {
        Row: {
          added_at: string
          collection_id: string
          route_id: string
        }
        Insert: {
          added_at?: string
          collection_id: string
          route_id: string
        }
        Update: {
          added_at?: string
          collection_id?: string
          route_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_routes_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_routes_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_positions: {
        Row: {
          accuracy_m: number | null
          fixed_at: string
          lat: number
          lng: number
          share_id: string
        }
        Insert: {
          accuracy_m?: number | null
          fixed_at: string
          lat: number
          lng: number
          share_id: string
        }
        Update: {
          accuracy_m?: number | null
          fixed_at?: string
          lat?: number
          lng?: number
          share_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_positions_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "live_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      live_shares: {
        Row: {
          expires_at: string
          id: string
          route_id: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          expires_at?: string
          id?: string
          route_id?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          expires_at?: string
          id?: string
          route_id?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_shares_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      osm_route_elevations: {
        Row: {
          computed_at: string
          distance_m: number
          gain_m: number
          loss_m: number
          relation_id: number
          version: number
        }
        Insert: {
          computed_at?: string
          distance_m: number
          gain_m: number
          loss_m: number
          relation_id: number
          version: number
        }
        Update: {
          computed_at?: string
          distance_m?: number
          gain_m?: number
          loss_m?: number
          relation_id?: number
          version?: number
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          count: number
          key: string
          started_at: string
        }
        Insert: {
          count?: number
          key: string
          started_at?: string
        }
        Update: {
          count?: number
          key?: string
          started_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      review_reports: {
        Row: {
          created_at: string
          reporter_id: string
          review_id: string
        }
        Insert: {
          created_at?: string
          reporter_id: string
          review_id: string
        }
        Update: {
          created_at?: string
          reporter_id?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "route_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      route_activity: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          completed_at: string | null
          created_at: string
          duration_s: number | null
          id: string
          moving_s: number | null
          route_id: string
          started_at: string | null
          user_id: string
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          completed_at?: string | null
          created_at?: string
          duration_s?: number | null
          id?: string
          moving_s?: number | null
          route_id: string
          started_at?: string | null
          user_id: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          completed_at?: string | null
          created_at?: string
          duration_s?: number | null
          id?: string
          moving_s?: number | null
          route_id?: string
          started_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_activity_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      route_outings: {
        Row: {
          created_at: string
          distance_m: number
          duration_s: number
          has_track: boolean | null
          id: string
          moving_s: number
          route_id: string
          started_at: string
          track: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          distance_m: number
          duration_s: number
          has_track?: boolean | null
          id?: string
          moving_s: number
          route_id: string
          started_at: string
          track?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          distance_m?: number
          duration_s?: number
          has_track?: boolean | null
          id?: string
          moving_s?: number
          route_id?: string
          started_at?: string
          track?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_outings_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_outings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      route_photos: {
        Row: {
          created_at: string
          id: string
          route_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          route_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          route_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_photos_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      route_reviews: {
        Row: {
          comment: string | null
          created_at: string
          hidden_at: string | null
          hidden_reason: string | null
          id: string
          rating: number
          route_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          rating: number
          route_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          rating?: number
          route_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_reviews_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          distance_m: number
          editor_state: Json | null
          elevation_gain_m: number | null
          elevation_loss_m: number | null
          elevation_profile: Json | null
          geom: unknown
          id: string
          is_loop: boolean
          is_public: boolean
          name: string
          owner_id: string
          pois: Json
          rating_avg: number | null
          rating_count: number
          source: Database["public"]["Enums"]["route_source"]
          sport_type: Database["public"]["Enums"]["sport_type"]
          start_point: unknown
          updated_at: string
          way_info: Json | null
          route_geojson: Json | null
          route_preview: Json | null
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          distance_m?: number
          editor_state?: Json | null
          elevation_gain_m?: number | null
          elevation_loss_m?: number | null
          elevation_profile?: Json | null
          geom: unknown
          id?: string
          is_loop?: boolean
          is_public?: boolean
          name: string
          owner_id: string
          pois?: Json
          rating_avg?: number | null
          rating_count?: number
          source?: Database["public"]["Enums"]["route_source"]
          sport_type?: Database["public"]["Enums"]["sport_type"]
          start_point?: unknown
          updated_at?: string
          way_info?: Json | null
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          distance_m?: number
          editor_state?: Json | null
          elevation_gain_m?: number | null
          elevation_loss_m?: number | null
          elevation_profile?: Json | null
          geom?: unknown
          id?: string
          is_loop?: boolean
          is_public?: boolean
          name?: string
          owner_id?: string
          pois?: Json
          rating_avg?: number | null
          rating_count?: number
          source?: Database["public"]["Enums"]["route_source"]
          sport_type?: Database["public"]["Enums"]["sport_type"]
          start_point?: unknown
          updated_at?: string
          way_info?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      routing_usage: {
        Row: {
          count: number
          day: string
          user_id: string
        }
        Insert: {
          count?: number
          day: string
          user_id: string
        }
        Update: {
          count?: number
          day?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routing_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_login_attempt: {
        Args: {
          ip_key: string
          ip_limit: number
          username_key: string
          username_limit: number
          window_seconds: number
        }
        Returns: boolean
      }
      consume_routing_quota: { Args: { daily_limit: number }; Returns: number }
      login_email: { Args: { login_username: string }; Returns: string }
      route_geojson: {
        Args: { "": Database["public"]["Tables"]["routes"]["Row"] }
        Returns: {
          error: true
        } & "the function public.route_geojson with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
      }
      route_preview: {
        Args: { "": Database["public"]["Tables"]["routes"]["Row"] }
        Returns: {
          error: true
        } & "the function public.route_preview with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
      }
      search_routes: {
        Args: {
          loops_only?: boolean
          max_distance_m?: number
          max_gain_m?: number
          max_lat: number
          max_lng: number
          max_results?: number
          min_distance_m?: number
          min_gain_m?: number
          min_lat: number
          min_lng: number
          passing_through?: boolean
          sort?: string
          sport?: Database["public"]["Enums"]["sport_type"]
          text_query?: string
        }
        Returns: {
          created_at: string
          distance_m: number
          elevation_gain_m: number
          id: string
          is_loop: boolean
          marker_lat: number
          marker_lng: number
          name: string
          owner_name: string
          rating_avg: number
          rating_count: number
          sport_type: Database["public"]["Enums"]["sport_type"]
        }[]
      }
      search_text: { Args: { value: string }; Returns: string }
      set_review_hidden: {
        Args: { hidden: boolean; review_id: string }
        Returns: boolean
      }
    }
    Enums: {
      activity_type: "saved" | "completed"
      route_source: "drawn" | "gpx_import" | "recorded"
      sport_type:
        | "running"
        | "trail"
        | "hiking"
        | "cycling"
        | "road_cycling"
        | "mountain_biking"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_type: ["saved", "completed"],
      route_source: ["drawn", "gpx_import", "recorded"],
      sport_type: [
        "running",
        "trail",
        "hiking",
        "cycling",
        "road_cycling",
        "mountain_biking",
      ],
    },
  },
} as const
