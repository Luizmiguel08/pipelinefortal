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
      agenda_appointments: {
        Row: {
          agenda_atualizado_em: string | null
          agenda_criado_em: string | null
          cliente_nome: string
          cliente_telefone: string | null
          corretor_email: string | null
          corretor_id: string | null
          corretor_nome: string | null
          created_at: string
          empreendimento: string | null
          encontrado_c2s: boolean
          id: string
          lead_id: string | null
          motivo: string | null
          status: string
          synced_at: string
          updated_at: string
          visita_em: string | null
        }
        Insert: {
          agenda_atualizado_em?: string | null
          agenda_criado_em?: string | null
          cliente_nome: string
          cliente_telefone?: string | null
          corretor_email?: string | null
          corretor_id?: string | null
          corretor_nome?: string | null
          created_at?: string
          empreendimento?: string | null
          encontrado_c2s?: boolean
          id: string
          lead_id?: string | null
          motivo?: string | null
          status: string
          synced_at?: string
          updated_at?: string
          visita_em?: string | null
        }
        Update: {
          agenda_atualizado_em?: string | null
          agenda_criado_em?: string | null
          cliente_nome?: string
          cliente_telefone?: string | null
          corretor_email?: string | null
          corretor_id?: string | null
          corretor_nome?: string | null
          created_at?: string
          empreendimento?: string | null
          encontrado_c2s?: boolean
          id?: string
          lead_id?: string | null
          motivo?: string | null
          status?: string
          synced_at?: string
          updated_at?: string
          visita_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agenda_appointments_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_sync_runs: {
        Row: {
          atualizados: number
          corretores_nao_reconhecidos: number
          created_at: string
          criados: number
          erro: string | null
          finished_at: string | null
          id: string
          nao_encontrados_c2s: number
          origem: string
          started_at: string
          status: string
          total: number
          vinculados_c2s: number
        }
        Insert: {
          atualizados?: number
          corretores_nao_reconhecidos?: number
          created_at?: string
          criados?: number
          erro?: string | null
          finished_at?: string | null
          id?: string
          nao_encontrados_c2s?: number
          origem?: string
          started_at?: string
          status?: string
          total?: number
          vinculados_c2s?: number
        }
        Update: {
          atualizados?: number
          corretores_nao_reconhecidos?: number
          created_at?: string
          criados?: number
          erro?: string | null
          finished_at?: string | null
          id?: string
          nao_encontrados_c2s?: number
          origem?: string
          started_at?: string
          status?: string
          total?: number
          vinculados_c2s?: number
        }
        Relationships: []
      }
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
      integration_settings: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          valor: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          valor: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          valor?: string
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
      lead_stage_alerts: {
        Row: {
          canal: string
          enviado_em: string
          erro: string | null
          id: string
          lead_id: string
          stage: Database["public"]["Enums"]["lead_stage"]
        }
        Insert: {
          canal?: string
          enviado_em?: string
          erro?: string | null
          id?: string
          lead_id: string
          stage: Database["public"]["Enums"]["lead_stage"]
        }
        Update: {
          canal?: string
          enviado_em?: string
          erro?: string | null
          id?: string
          lead_id?: string
          stage?: Database["public"]["Enums"]["lead_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_stage_alerts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          agenda_appointment_id: string | null
          agenda_synced_at: string | null
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
          visita_em: string | null
          visita_motivo: string | null
          visita_projeto: string | null
          visita_realizada: boolean
          visita_status: string | null
        }
        Insert: {
          agenda_appointment_id?: string | null
          agenda_synced_at?: string | null
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
          visita_em?: string | null
          visita_motivo?: string | null
          visita_projeto?: string | null
          visita_realizada?: boolean
          visita_status?: string | null
        }
        Update: {
          agenda_appointment_id?: string | null
          agenda_synced_at?: string | null
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
          visita_em?: string | null
          visita_motivo?: string | null
          visita_projeto?: string | null
          visita_realizada?: boolean
          visita_status?: string | null
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
      board_cards: {
        Row: {
          agenda_record: boolean | null
          c2s_contact_id: string | null
          corretor_agenda_nome: string | null
          corretor_id: string | null
          created_at: string | null
          data_c2s: string | null
          data_entrada: string | null
          documentacao_ok: boolean | null
          email: string | null
          encontrado_c2s: boolean | null
          entrada: number | null
          estagio_imovel: string | null
          finalidade: string | null
          id: string | null
          imovel: string | null
          lead_id: string | null
          nome: string | null
          observacoes: string | null
          ordem: string | null
          origem: string | null
          stage: string | null
          stage_since: string | null
          telefone: string | null
          ultima_interacao: string | null
          valor: number | null
          visita_em: string | null
          visita_motivo: string | null
          visita_projeto: string | null
          visita_realizada: boolean | null
          visita_status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      atividade_corretores: {
        Args: { p_dias?: number }
        Returns: {
          ativo: boolean
          automaticas: number
          corretor_id: string
          hoje: number
          leads_qualificados: number
          leads_total: number
          manuais: number
          movimentacoes: number
          nome: string
          ultima_edicao: string
          ultima_movimentacao: string
        }[]
      }
      atividade_eventos: {
        Args: { p_corretor?: string; p_dias?: number; p_limit?: number }
        Returns: {
          automatico: boolean
          corretor_id: string
          corretor_nome: string
          created_at: string
          de: string
          id: string
          lead_id: string
          lead_nome: string
          para: string
        }[]
      }
      board_cards_page: {
        Args: {
          p_busca?: string
          p_corretor?: string
          p_fim?: string
          p_inicio?: string
          p_limit?: number
          p_offset?: number
          p_stage: string
        }
        Returns: {
          agenda_record: boolean | null
          c2s_contact_id: string | null
          corretor_agenda_nome: string | null
          corretor_id: string | null
          created_at: string | null
          data_c2s: string | null
          data_entrada: string | null
          documentacao_ok: boolean | null
          email: string | null
          encontrado_c2s: boolean | null
          entrada: number | null
          estagio_imovel: string | null
          finalidade: string | null
          id: string | null
          imovel: string | null
          lead_id: string | null
          nome: string | null
          observacoes: string | null
          ordem: string | null
          origem: string | null
          stage: string | null
          stage_since: string | null
          telefone: string | null
          ultima_interacao: string | null
          valor: number | null
          visita_em: string | null
          visita_motivo: string | null
          visita_projeto: string | null
          visita_realizada: boolean | null
          visita_status: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "board_cards"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      board_resumo: {
        Args: {
          p_busca?: string
          p_corretor?: string
          p_fim?: string
          p_inicio?: string
        }
        Returns: {
          soma: number
          stage: string
          total: number
        }[]
      }
      board_resumo_corretor: {
        Args: {
          p_busca?: string
          p_corretor?: string
          p_fim?: string
          p_inicio?: string
        }
        Returns: {
          corretor_id: string
          soma: number
          total: number
        }[]
      }
      escalate_stale_leads: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_my_corretor: { Args: { _corretor_id: string }; Returns: boolean }
      normalize_phone: { Args: { _phone: string }; Returns: string }
      owns_lead: { Args: { _lead_id: string }; Returns: boolean }
      valor_projeto: { Args: { _imovel: string }; Returns: number }
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
        | "visita"
        | "visita_realizada"
        | "nao_respondeu"
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
        "visita",
        "visita_realizada",
        "nao_respondeu",
      ],
    },
  },
} as const
