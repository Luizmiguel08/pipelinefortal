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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      corretores: {
        Row: {
          ativo: boolean
          c2s_agent_id: string | null
          created_at: string
          email: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          c2s_agent_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          c2s_agent_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      lead_events: {
        Row: {
          created_at: string
          de: Database["public"]["Enums"]["lead_stage"] | null
          id: string
          lead_id: string
          origem: string
          para: Database["public"]["Enums"]["lead_stage"]
        }
        Insert: {
          created_at?: string
          de?: Database["public"]["Enums"]["lead_stage"] | null
          id?: string
          lead_id: string
          origem?: string
          para: Database["public"]["Enums"]["lead_stage"]
        }
        Update: {
          created_at?: string
          de?: Database["public"]["Enums"]["lead_stage"] | null
          id?: string
          lead_id?: string
          origem?: string
          para?: Database["public"]["Enums"]["lead_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          c2s_contact_id: string | null
          corretor_id: string | null
          created_at: string
          data_c2s: string | null
          documentacao_ok: boolean
          email: string | null
          entrada: number
          estagio_imovel: string | null
          finalidade: string | null
          id: string
          imovel: string | null
          last_synced_at: string | null
          nome: string
          observacoes: string | null
          origem: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
          stage_since: string
          telefone: string | null
          ultima_interacao: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          c2s_contact_id?: string | null
          corretor_id?: string | null
          created_at?: string
          data_c2s?: string | null
          documentacao_ok?: boolean
          email?: string | null
          entrada?: number
          estagio_imovel?: string | null
          finalidade?: string | null
          id?: string
          imovel?: string | null
          last_synced_at?: string | null
          nome: string
          observacoes?: string | null
          origem?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          stage_since?: string
          telefone?: string | null
          ultima_interacao?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          c2s_contact_id?: string | null
          corretor_id?: string | null
          created_at?: string
          data_c2s?: string | null
          documentacao_ok?: boolean
          email?: string | null
          entrada?: number
          estagio_imovel?: string | null
          finalidade?: string | null
          id?: string
          imovel?: string | null
          last_synced_at?: string | null
          nome?: string
          observacoes?: string | null
          origem?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          stage_since?: string
          telefone?: string | null
          ultima_interacao?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "leads_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          atualizados: number
          corretores_criados: number
          created_at: string
          criados: number
          duracao_ms: number | null
          erro: string | null
          finished_at: string | null
          id: string
          movidos: number
          origem: string
          started_at: string
          status: string
          total: number
        }
        Insert: {
          atualizados?: number
          corretores_criados?: number
          created_at?: string
          criados?: number
          duracao_ms?: number | null
          erro?: string | null
          finished_at?: string | null
          id?: string
          movidos?: number
          origem?: string
          started_at?: string
          status?: string
          total?: number
        }
        Update: {
          atualizados?: number
          corretores_criados?: number
          created_at?: string
          criados?: number
          duracao_ms?: number | null
          erro?: string | null
          finished_at?: string | null
          id?: string
          movidos?: number
          origem?: string
          started_at?: string
          status?: string
          total?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      escalate_stale_leads: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_my_corretor: { Args: { _corretor_id: string }; Returns: boolean }
      owns_lead: { Args: { _lead_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "gestor" | "corretor"
      lead_stage:
        | "novo"
        | "atendimento"
        | "negociacao"
        | "documentacao"
        | "fechamento"
        | "dia1"
        | "dia2"
        | "dia3"
        | "lista_fria"
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
    Enums: {
      app_role: ["gestor", "corretor"],
      lead_stage: [
        "novo",
        "atendimento",
        "negociacao",
        "documentacao",
        "fechamento",
        "dia1",
        "dia2",
        "dia3",
        "lista_fria",
      ],
    },
  },
} as const
