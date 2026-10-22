export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: Database["public"]["Enums"]["user_role"];
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          created_at?: string;
        };
        Relationships: [];
      };
      tables: {
        Row: {
          id: string;
          table_number: number;
          capacity: number;
          status: Database["public"]["Enums"]["table_status"];
          qr_token: string;
        };
        Insert: {
          id?: string;
          table_number: number;
          capacity: number;
          status?: Database["public"]["Enums"]["table_status"];
          qr_token?: string;
        };
        Update: {
          id?: string;
          table_number?: number;
          capacity?: number;
          status?: Database["public"]["Enums"]["table_status"];
          qr_token?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: { id: string; name: string; sort_order: number };
        Insert: { id?: string; name: string; sort_order?: number };
        Update: { id?: string; name?: string; sort_order?: number };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          category_id: string;
          name: string;
          price: number;
          description: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          category_id: string;
          name: string;
          price: number;
          description?: string | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          category_id?: string;
          name?: string;
          price?: number;
          description?: string | null;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: { id: string; phone: string; name: string | null; created_at: string };
        Insert: { id?: string; phone: string; name?: string | null; created_at?: string };
        Update: { id?: string; phone?: string; name?: string | null; created_at?: string };
        Relationships: [];
      };
      customer_addresses: {
        Row: {
          id: string;
          customer_id: string;
          label: string | null;
          street: string;
          number: string;
          complement: string | null;
          neighborhood: string;
          city: string;
          state: string;
          zip_code: string;
          reference: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          label?: string | null;
          street: string;
          number: string;
          complement?: string | null;
          neighborhood: string;
          city: string;
          state: string;
          zip_code: string;
          reference?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          label?: string | null;
          street?: string;
          number?: string;
          complement?: string | null;
          neighborhood?: string;
          city?: string;
          state?: string;
          zip_code?: string;
          reference?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      restaurant_settings: {
        Row: {
          id: boolean;
          is_accepting_orders: boolean;
          dine_in_qr_enabled: boolean;
          require_confirmation_for_qr: boolean;
          pickup_enabled: boolean;
          delivery_enabled: boolean;
          delivery_fee: number;
          min_delivery_order: number;
          estimated_pickup_minutes: number;
          estimated_delivery_minutes: number;
          whatsapp_enabled: boolean;
        };
        Insert: {
          id?: boolean;
          is_accepting_orders?: boolean;
          dine_in_qr_enabled?: boolean;
          require_confirmation_for_qr?: boolean;
          pickup_enabled?: boolean;
          delivery_enabled?: boolean;
          delivery_fee?: number;
          min_delivery_order?: number;
          estimated_pickup_minutes?: number;
          estimated_delivery_minutes?: number;
          whatsapp_enabled?: boolean;
        };
        Update: {
          id?: boolean;
          is_accepting_orders?: boolean;
          dine_in_qr_enabled?: boolean;
          require_confirmation_for_qr?: boolean;
          pickup_enabled?: boolean;
          delivery_enabled?: boolean;
          delivery_fee?: number;
          min_delivery_order?: number;
          estimated_pickup_minutes?: number;
          estimated_delivery_minutes?: number;
          whatsapp_enabled?: boolean;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          order_number: number;
          public_token: string;
          order_type: Database["public"]["Enums"]["order_type"];
          source: Database["public"]["Enums"]["order_source"];
          table_id: string | null;
          waiter_id: string | null;
          customer_id: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          delivery_address: Json | null;
          delivery_fee: number;
          total_amount: number;
          notes: string | null;
          payment_method: Database["public"]["Enums"]["payment_method"] | null;
          payment_status: Database["public"]["Enums"]["payment_status"];
          cash_change_for: number | null;
          status: Database["public"]["Enums"]["order_status"];
          cancel_reason: string | null;
          created_at: string;
          confirmed_at: string | null;
          closed_at: string | null;
        };
        Insert: {
          id?: string;
          order_number?: number;
          public_token?: string;
          order_type: Database["public"]["Enums"]["order_type"];
          source: Database["public"]["Enums"]["order_source"];
          table_id?: string | null;
          waiter_id?: string | null;
          customer_id?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivery_address?: Json | null;
          delivery_fee?: number;
          total_amount?: number;
          notes?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          cash_change_for?: number | null;
          status?: Database["public"]["Enums"]["order_status"];
          cancel_reason?: string | null;
          created_at?: string;
          confirmed_at?: string | null;
          closed_at?: string | null;
        };
        Update: {
          id?: string;
          order_number?: number;
          public_token?: string;
          order_type?: Database["public"]["Enums"]["order_type"];
          source?: Database["public"]["Enums"]["order_source"];
          table_id?: string | null;
          waiter_id?: string | null;
          customer_id?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivery_address?: Json | null;
          delivery_fee?: number;
          total_amount?: number;
          notes?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          cash_change_for?: number | null;
          status?: Database["public"]["Enums"]["order_status"];
          cancel_reason?: string | null;
          created_at?: string;
          confirmed_at?: string | null;
          closed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_waiter_id_fkey";
            columns: ["waiter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          status: Database["public"]["Enums"]["order_item_status"];
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          quantity: number;
          unit_price?: number;
          status?: Database["public"]["Enums"]["order_item_status"];
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          quantity?: number;
          unit_price?: number;
          status?: Database["public"]["Enums"]["order_item_status"];
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      close_order: {
        Args: { p_order_id: string; p_payment_method: string };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      create_customer_order: {
        Args: { p_payload: Json };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["user_role"];
      };
      open_table: {
        Args: { p_table_id: string };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
    };
    Enums: {
      user_role: "admin" | "waiter" | "kitchen" | "cashier";
      table_status: "available" | "occupied" | "closing";
      order_type: "dine_in" | "pickup" | "delivery";
      order_source: "waiter" | "qr" | "nfc" | "whatsapp" | "web";
      order_status:
        | "pending_confirmation"
        | "open"
        | "ready"
        | "out_for_delivery"
        | "closed"
        | "cancelled";
      payment_method: "cash" | "card" | "pix";
      payment_status: "pending" | "paid";
      order_item_status: "pending" | "preparing" | "ready" | "delivered";
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<
  TableName extends keyof Database["public"]["Tables"],
> = Database["public"]["Tables"][TableName]["Row"];

export type TablesInsert<
  TableName extends keyof Database["public"]["Tables"],
> = Database["public"]["Tables"][TableName]["Insert"];

export type TablesUpdate<
  TableName extends keyof Database["public"]["Tables"],
> = Database["public"]["Tables"][TableName]["Update"];

export type Enums<
  EnumName extends keyof Database["public"]["Enums"],
> = Database["public"]["Enums"][EnumName];
