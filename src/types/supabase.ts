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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activation_rules: {
        Row: {
          active: boolean | null
          conditions: Json | null
          created_at: string | null
          form_template_id: string | null
          id: string
          service_type_id: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          conditions?: Json | null
          created_at?: string | null
          form_template_id?: string | null
          id?: string
          service_type_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          conditions?: Json | null
          created_at?: string | null
          form_template_id?: string | null
          id?: string
          service_type_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activation_rules_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activation_rules_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changed_at: string | null
          changed_by: string | null
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          record_id: string
          table_name: string
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
          table_name: string
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
          table_name?: string
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          created_at: string | null
          id: string
          status: string | null
          tenant_id: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          status?: string | null
          tenant_id?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          id?: string
          status?: string | null
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          active: boolean | null
          address: string | null
          city: string | null
          complement: string | null
          created_at: string | null
          document: string | null
          email: string | null
          id: string
          name: string
          neighborhood: string | null
          notes: string | null
          number: string | null
          phone: string | null
          state: string | null
          tenant_id: string
          type: string | null
          updated_at: string | null
          whatsapp: string | null
          zip_code: string | null
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string | null
          document?: string | null
          email?: string | null
          id?: string
          name: string
          neighborhood?: string | null
          notes?: string | null
          number?: string | null
          phone?: string | null
          state?: string | null
          tenant_id: string
          type?: string | null
          updated_at?: string | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Update: {
          active?: boolean | null
          address?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string | null
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          neighborhood?: string | null
          notes?: string | null
          number?: string | null
          phone?: string | null
          state?: string | null
          tenant_id?: string
          type?: string | null
          updated_at?: string | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      equipments: {
        Row: {
          active: boolean | null
          brand: string | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          description: string | null
          family_id: string | null
          family_name: string | null
          id: string
          metadata: Json | null
          model: string | null
          name: string | null
          qr_code: string | null
          serial_number: string | null
          status: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          brand?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          description?: string | null
          family_id?: string | null
          family_name?: string | null
          id: string
          metadata?: Json | null
          model?: string | null
          name?: string | null
          qr_code?: string | null
          serial_number?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          brand?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          description?: string | null
          family_id?: string | null
          family_name?: string | null
          id?: string
          metadata?: Json | null
          model?: string | null
          name?: string | null
          qr_code?: string | null
          serial_number?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          schema: Json
          tenant_id: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          schema?: Json
          tenant_id?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          schema?: Json
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean | null
          tenant_id: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          tenant_id?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          tenant_id?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          assigned_to: string | null
          billing_status: string | null
          checkin_location: Json | null
          checkout_location: Json | null
          client_ip_address: unknown
          client_signature_name: string | null
          client_signature_url: string | null
          client_signed_at: string | null
          created_at: string | null
          customer_address: string | null
          customer_id: string | null
          customer_name: string | null
          description: string | null
          display_id: string | null
          end_date: string | null
          equipment_code: string | null
          equipment_family: string | null
          equipment_id: string | null
          equipment_model: string | null
          equipment_name: string | null
          equipment_serial: string | null
          form_data: Json | null
          form_id: string | null
          id: string
          items: Json | null
          linked_quotes: Json | null
          location_coords: unknown
          operation_type: string | null
          pause_reason: string | null
          priority: Database["public"]["Enums"]["order_priority"] | null
          public_token: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          sequence_number: number | null
          show_value_to_client: boolean | null
          signature_data: Json | null
          signature_url: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          tenant_id: string
          timeline: Json | null
          title: string
          total_value: number | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          billing_status?: string | null
          checkin_location?: Json | null
          checkout_location?: Json | null
          client_ip_address?: unknown
          client_signature_name?: string | null
          client_signature_url?: string | null
          client_signed_at?: string | null
          created_at?: string | null
          customer_address?: string | null
          customer_id?: string | null
          customer_name?: string | null
          description?: string | null
          display_id?: string | null
          end_date?: string | null
          equipment_code?: string | null
          equipment_family?: string | null
          equipment_id?: string | null
          equipment_model?: string | null
          equipment_name?: string | null
          equipment_serial?: string | null
          form_data?: Json | null
          form_id?: string | null
          id: string
          items?: Json | null
          linked_quotes?: Json | null
          location_coords?: unknown
          operation_type?: string | null
          pause_reason?: string | null
          priority?: Database["public"]["Enums"]["order_priority"] | null
          public_token?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          sequence_number?: number | null
          show_value_to_client?: boolean | null
          signature_data?: Json | null
          signature_url?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          tenant_id: string
          timeline?: Json | null
          title: string
          total_value?: number | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          billing_status?: string | null
          checkin_location?: Json | null
          checkout_location?: Json | null
          client_ip_address?: unknown
          client_signature_name?: string | null
          client_signature_url?: string | null
          client_signed_at?: string | null
          created_at?: string | null
          customer_address?: string | null
          customer_id?: string | null
          customer_name?: string | null
          description?: string | null
          display_id?: string | null
          end_date?: string | null
          equipment_code?: string | null
          equipment_family?: string | null
          equipment_id?: string | null
          equipment_model?: string | null
          equipment_name?: string | null
          equipment_serial?: string | null
          form_data?: Json | null
          form_id?: string | null
          id?: string
          items?: Json | null
          linked_quotes?: Json | null
          location_coords?: unknown
          operation_type?: string | null
          pause_reason?: string | null
          priority?: Database["public"]["Enums"]["order_priority"] | null
          public_token?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          sequence_number?: number | null
          show_value_to_client?: boolean | null
          signature_data?: Json | null
          signature_url?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          tenant_id?: string
          timeline?: Json | null
          title?: string
          total_value?: number | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          client_name_signed: string | null
          client_signature: string | null
          created_at: string | null
          customer_id: string | null
          display_id: string | null
          id: string
          ip_address_signed: unknown
          items: Json | null
          public_token: string | null
          rejection_reason: string | null
          sequence_number: number | null
          signed_at: string | null
          status: string | null
          tenant_id: string
          total_amount: number | null
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          client_name_signed?: string | null
          client_signature?: string | null
          created_at?: string | null
          customer_id?: string | null
          display_id?: string | null
          id?: string
          ip_address_signed?: unknown
          items?: Json | null
          public_token?: string | null
          rejection_reason?: string | null
          sequence_number?: number | null
          signed_at?: string | null
          status?: string | null
          tenant_id: string
          total_amount?: number | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          client_name_signed?: string | null
          client_signature?: string | null
          created_at?: string | null
          customer_id?: string | null
          display_id?: string | null
          id?: string
          ip_address_signed?: unknown
          items?: Json | null
          public_token?: string | null
          rejection_reason?: string | null
          sequence_number?: number | null
          signed_at?: string | null
          status?: string | null
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_types: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          name: string
          tenant_id: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          name: string
          tenant_id?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          active: boolean | null
          category: string | null
          code: string | null
          cost_price: number | null
          created_at: string | null
          description: string | null
          id: string
          location: string | null
          min_quantity: number | null
          name: string
          quantity: number | null
          sell_price: number | null
          tenant_id: string
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          code?: string | null
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          location?: string | null
          min_quantity?: number | null
          name: string
          quantity?: number | null
          sell_price?: number | null
          tenant_id: string
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          category?: string | null
          code?: string | null
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          location?: string | null
          min_quantity?: number | null
          name?: string
          quantity?: number | null
          sell_price?: number | null
          tenant_id?: string
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string | null
          id: string
          item_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          tenant_id: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          tenant_id: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          tenant_id?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_notification_reads: {
        Row: {
          notification_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "system_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_notification_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_notifications: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          tenant_id: string | null
          title: string
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          tenant_id?: string | null
          title: string
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tech_stock: {
        Row: {
          created_at: string | null
          id: string
          quantity: number
          stock_item_id: string
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          quantity?: number
          stock_item_id: string
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          quantity?: number
          stock_item_id?: string
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tech_stock_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_stock_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_stock_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_location_history: {
        Row: {
          accuracy: number | null
          battery_level: number | null
          heading: number | null
          id: string
          latitude: number
          longitude: number
          recorded_at: string | null
          speed: number | null
          technician_id: string
          tenant_id: string | null
        }
        Insert: {
          accuracy?: number | null
          battery_level?: number | null
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          recorded_at?: string | null
          speed?: number | null
          technician_id: string
          tenant_id?: string | null
        }
        Update: {
          accuracy?: number | null
          battery_level?: number | null
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string | null
          speed?: number | null
          technician_id?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      technicians: {
        Row: {
          accuracy: number | null
          active: boolean | null
          avatar: string | null
          battery_level: number | null
          created_at: string | null
          email: string | null
          heading: number | null
          id: string
          last_latitude: number | null
          last_longitude: number | null
          last_seen: string | null
          name: string
          phone: string | null
          speed: number | null
          tenant_id: string | null
        }
        Insert: {
          accuracy?: number | null
          active?: boolean | null
          avatar?: string | null
          battery_level?: number | null
          created_at?: string | null
          email?: string | null
          heading?: number | null
          id: string
          last_latitude?: number | null
          last_longitude?: number | null
          last_seen?: string | null
          name: string
          phone?: string | null
          speed?: number | null
          tenant_id?: string | null
        }
        Update: {
          accuracy?: number | null
          active?: boolean | null
          avatar?: string | null
          battery_level?: number | null
          created_at?: string | null
          email?: string | null
          heading?: number | null
          id?: string
          last_latitude?: number | null
          last_longitude?: number | null
          last_seen?: string | null
          name?: string
          phone?: string | null
          speed?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "technicians_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technicians_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_sequences: {
        Row: {
          last_order_id: number | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          last_order_id?: number | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          last_order_id?: number | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          admin_email: string | null
          cep: string | null
          city: string | null
          cnpj: string | null
          company_name: string | null
          complement: string | null
          created_at: string | null
          document: string | null
          email: string | null
          enabled_modules: Json | null
          id: string
          logo_url: string | null
          metadata: Json | null
          name: string
          neighborhood: string | null
          number: string | null
          os_prefix: string | null
          os_start_number: number | null
          phone: string | null
          plan: string | null
          slug: string
          state: string | null
          state_registration: string | null
          status: Database["public"]["Enums"]["tenant_status"] | null
          street: string | null
          trading_name: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          admin_email?: string | null
          cep?: string | null
          city?: string | null
          cnpj?: string | null
          company_name?: string | null
          complement?: string | null
          created_at?: string | null
          document?: string | null
          email?: string | null
          enabled_modules?: Json | null
          id?: string
          logo_url?: string | null
          metadata?: Json | null
          name: string
          neighborhood?: string | null
          number?: string | null
          os_prefix?: string | null
          os_start_number?: number | null
          phone?: string | null
          plan?: string | null
          slug: string
          state?: string | null
          state_registration?: string | null
          status?: Database["public"]["Enums"]["tenant_status"] | null
          street?: string | null
          trading_name?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          admin_email?: string | null
          cep?: string | null
          city?: string | null
          cnpj?: string | null
          company_name?: string | null
          complement?: string | null
          created_at?: string | null
          document?: string | null
          email?: string | null
          enabled_modules?: Json | null
          id?: string
          logo_url?: string | null
          metadata?: Json | null
          name?: string
          neighborhood?: string | null
          number?: string | null
          os_prefix?: string | null
          os_start_number?: number | null
          phone?: string | null
          plan?: string | null
          slug?: string
          state?: string | null
          state_registration?: string | null
          status?: Database["public"]["Enums"]["tenant_status"] | null
          street?: string | null
          trading_name?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      user_groups: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_system: boolean | null
          name: string
          permissions: Json | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          permissions?: Json | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          permissions?: Json | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_tokens: {
        Row: {
          created_at: string | null
          id: string
          platform: string | null
          tenant_id: string | null
          token: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform?: string | null
          tenant_id?: string | null
          token: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string | null
          tenant_id?: string | null
          token?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          active: boolean | null
          avatar: string | null
          avatar_url: string | null
          created_at: string | null
          email: string
          group_id: string | null
          id: string
          last_seen_at: string | null
          metadata: Json | null
          name: string | null
          permissions: Json | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          avatar?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email: string
          group_id?: string | null
          id: string
          last_seen_at?: string | null
          metadata?: Json | null
          name?: string | null
          permissions?: Json | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          avatar?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          group_id?: string | null
          id?: string
          last_seen_at?: string | null
          metadata?: Json | null
          name?: string | null
          permissions?: Json | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      order_stats_by_tenant: {
        Row: {
          cancelled_orders: number | null
          completed_orders: number | null
          in_progress_orders: number | null
          pending_orders: number | null
          tenant_id: string | null
          total_orders: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      overdue_orders: {
        Row: {
          days_overdue: number | null
          id: string | null
          scheduled_date: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          tenant_id: string | null
          title: string | null
        }
        Insert: {
          days_overdue?: never
          id?: string | null
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          tenant_id?: string | null
          title?: string | null
        }
        Update: {
          days_overdue?: never
          id?: string | null
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          tenant_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      view_history_storage_size: {
        Row: {
          row_count: number | null
          total_size: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      clean_old_audit_logs: { Args: never; Returns: number }
      delete_old_location_history: { Args: never; Returns: undefined }
      ensure_default_service_types: {
        Args: { payload?: Json }
        Returns: undefined
      }
      get_next_order_id: { Args: { p_tenant_id: string }; Returns: number }
      get_public_document: {
        Args: { doc_token: string; doc_type: string }
        Returns: Json
      }
      get_user_tenant_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      public_sign_document: {
        Args: {
          client_name: string
          doc_token: string
          doc_type: string
          signature_base64: string
        }
        Returns: boolean
      }
      rpc_ensure_service_types: { Args: { payload?: Json }; Returns: undefined }
      update_tech_location_v2: {
        Args: {
          p_accuracy?: number
          p_battery?: number
          p_heading?: number
          p_lat: number
          p_lng: number
          p_speed?: number
        }
        Returns: Json
      }
    }
    Enums: {
      order_priority: "BAIXA" | "MÉDIA" | "ALTA" | "CRÍTICA"
      order_status:
        | "PENDENTE"
        | "ATRIBUÍDO"
        | "EM ANDAMENTO"
        | "CONCLUÍDO"
        | "CANCELADO"
        | "IMPEDIDO"
        | "EM DESLOCAMENTO"
        | "NO LOCAL"
        | "PAUSADO"
        | "CANCELED"
        | "PENDING"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "ASSIGNED"
      tenant_status: "active" | "suspended" | "trial" | "cancelled"
      user_role: "ADMIN" | "TECHNICIAN" | "MANAGER" | "OPERATOR"
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
      order_priority: ["BAIXA", "MÉDIA", "ALTA", "CRÍTICA"],
      order_status: [
        "PENDENTE",
        "ATRIBUÍDO",
        "EM ANDAMENTO",
        "CONCLUÍDO",
        "CANCELADO",
        "IMPEDIDO",
        "EM DESLOCAMENTO",
        "NO LOCAL",
        "PAUSADO",
        "CANCELED",
        "PENDING",
        "IN_PROGRESS",
        "COMPLETED",
        "ASSIGNED",
      ],
      tenant_status: ["active", "suspended", "trial", "cancelled"],
      user_role: ["ADMIN", "TECHNICIAN", "MANAGER", "OPERATOR"],
    },
  },
} as const
