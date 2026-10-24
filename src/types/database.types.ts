
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "public": {
          Tables: {
            "cashier_order_submissions": {
                  Row: {
                    "actor_id": string,"created_at": string,"order_id": string | null,"payload": NonNullable<Json>,"request_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"created_at"?: string,"order_id"?: string | null,"payload": NonNullable<Json>,"request_id": string
                  }
                  Update: {
                    "actor_id"?: string,"created_at"?: string,"order_id"?: string | null,"payload"?: NonNullable<Json>,"request_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cashier_order_submissions_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cashier_order_submissions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "id": string,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "id"?: string,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [

                  ]
                },"customer_addresses": {
                  Row: {
                    "city": string,"complement": string | null,"created_at": string,"customer_id": string,"id": string,"label": string | null,"neighborhood": string,"number": string,"reference": string | null,"state": string,"street": string,"zip_code": string
                  }
                  ComputedFields: never
                  Insert: {
                    "city": string,"complement"?: string | null,"created_at"?: string,"customer_id": string,"id"?: string,"label"?: string | null,"neighborhood": string,"number": string,"reference"?: string | null,"state": string,"street": string,"zip_code": string
                  }
                  Update: {
                    "city"?: string,"complement"?: string | null,"created_at"?: string,"customer_id"?: string,"id"?: string,"label"?: string | null,"neighborhood"?: string,"number"?: string,"reference"?: string | null,"state"?: string,"street"?: string,"zip_code"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_addresses_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "created_at": string,"id": string,"name": string | null,"phone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name"?: string | null,"phone": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string | null,"phone"?: string
                  }
                  Relationships: [

                  ]
                },"delivery_quotes": {
                  Row: {
                    "created_at": string,"distance_meters": number,"expires_at": string,"fee": number,"id": string,"location_url": string,"pricing": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"distance_meters": number,"expires_at"?: string,"fee": number,"id"?: string,"location_url": string,"pricing": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"distance_meters"?: number,"expires_at"?: string,"fee"?: number,"id"?: string,"location_url"?: string,"pricing"?: NonNullable<Json>
                  }
                  Relationships: [

                  ]
                },"order_items": {
                  Row: {
                    "created_at": string,"id": string,"notes": string | null,"order_id": string,"product_id": string,"quantity": number,"status": Database["public"]['Enums']["order_item_status"],"unit_price": number,"updated_at": string,"can_update_order_item": boolean | null
                  }
                  ComputedFields: "can_update_order_item"
                  Insert: {
                    "created_at"?: string,"id"?: string,"notes"?: string | null,"order_id": string,"product_id": string,"quantity": number,"status"?: Database["public"]['Enums']["order_item_status"],"unit_price"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"notes"?: string | null,"order_id"?: string,"product_id"?: string,"quantity"?: number,"status"?: Database["public"]['Enums']["order_item_status"],"unit_price"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "cancel_reason": string | null,"cash_change_for": number | null,"closed_at": string | null,"confirmed_at": string | null,"created_at": string,"customer_id": string | null,"customer_name": string | null,"customer_phone": string | null,"delivery_address": Json | null,"delivery_fee": number,"id": string,"notes": string | null,"order_number": number,"order_type": Database["public"]['Enums']["order_type"],"payment_method": Database["public"]['Enums']["payment_method"] | null,"payment_status": Database["public"]['Enums']["payment_status"],"public_token": string,"source": Database["public"]['Enums']["order_source"],"status": Database["public"]['Enums']["order_status"],"table_id": string | null,"total_amount": number,"waiter_id": string | null,"can_update_order": boolean | null
                  }
                  ComputedFields: "can_update_order"
                  Insert: {
                    "cancel_reason"?: string | null,"cash_change_for"?: number | null,"closed_at"?: string | null,"confirmed_at"?: string | null,"created_at"?: string,"customer_id"?: string | null,"customer_name"?: string | null,"customer_phone"?: string | null,"delivery_address"?: Json | null,"delivery_fee"?: number,"id"?: string,"notes"?: string | null,"order_number"?: number,"order_type": Database["public"]['Enums']["order_type"],"payment_method"?: Database["public"]['Enums']["payment_method"] | null,"payment_status"?: Database["public"]['Enums']["payment_status"],"public_token"?: string,"source": Database["public"]['Enums']["order_source"],"status"?: Database["public"]['Enums']["order_status"],"table_id"?: string | null,"total_amount"?: number,"waiter_id"?: string | null
                  }
                  Update: {
                    "cancel_reason"?: string | null,"cash_change_for"?: number | null,"closed_at"?: string | null,"confirmed_at"?: string | null,"created_at"?: string,"customer_id"?: string | null,"customer_name"?: string | null,"customer_phone"?: string | null,"delivery_address"?: Json | null,"delivery_fee"?: number,"id"?: string,"notes"?: string | null,"order_number"?: number,"order_type"?: Database["public"]['Enums']["order_type"],"payment_method"?: Database["public"]['Enums']["payment_method"] | null,"payment_status"?: Database["public"]['Enums']["payment_status"],"public_token"?: string,"source"?: Database["public"]['Enums']["order_source"],"status"?: Database["public"]['Enums']["order_status"],"table_id"?: string | null,"total_amount"?: number,"waiter_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_table_id_fkey"
      columns: ["table_id"]
isOneToOne: false
      referencedRelation: "tables"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_waiter_id_fkey"
      columns: ["waiter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"product_photos": {
                  Row: {
                    "content": string,"product_id": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"product_id": string,"version"?: string
                  }
                  Update: {
                    "content"?: string,"product_id"?: string,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_photos_product_id_fkey"
      columns: ["product_id"]
isOneToOne: true
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "category_id": string,"description": string | null,"id": string,"image_version": string | null,"is_active": boolean,"is_archived": boolean,"name": string,"price": number
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id": string,"description"?: string | null,"id"?: string,"image_version"?: string | null,"is_active"?: boolean,"is_archived"?: boolean,"name": string,"price": number
                  }
                  Update: {
                    "category_id"?: string,"description"?: string | null,"id"?: string,"image_version"?: string | null,"is_active"?: boolean,"is_archived"?: boolean,"name"?: string,"price"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"full_name": string | null,"id": string,"is_active": boolean,"role": Database["public"]['Enums']["user_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name"?: string | null,"id": string,"is_active"?: boolean,"role"?: Database["public"]['Enums']["user_role"]
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string | null,"id"?: string,"is_active"?: boolean,"role"?: Database["public"]['Enums']["user_role"]
                  }
                  Relationships: [

                  ]
                },"public_rate_limits": {
                  Row: {
                    "hits": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "hits": number,"key": string,"window_start": string
                  }
                  Update: {
                    "hits"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [

                  ]
                },"restaurant_settings": {
                  Row: {
                    "delivery_distance_step_fee": number,"delivery_distance_step_km": number,"delivery_enabled": boolean,"delivery_fee": number,"delivery_fee_mode": string,"delivery_origin_latitude": number | null,"delivery_origin_longitude": number | null,"dine_in_qr_enabled": boolean,"estimated_delivery_minutes": number,"estimated_pickup_minutes": number,"id": boolean,"is_accepting_orders": boolean,"min_delivery_order": number,"pickup_enabled": boolean,"require_confirmation_for_qr": boolean,"whatsapp_enabled": boolean,"delivery_pricing_snapshot": Json | null
                  }
                  ComputedFields: "delivery_pricing_snapshot"
                  Insert: {
                    "delivery_distance_step_fee"?: number,"delivery_distance_step_km"?: number,"delivery_enabled"?: boolean,"delivery_fee"?: number,"delivery_fee_mode"?: string,"delivery_origin_latitude"?: number | null,"delivery_origin_longitude"?: number | null,"dine_in_qr_enabled"?: boolean,"estimated_delivery_minutes"?: number,"estimated_pickup_minutes"?: number,"id"?: boolean,"is_accepting_orders"?: boolean,"min_delivery_order"?: number,"pickup_enabled"?: boolean,"require_confirmation_for_qr"?: boolean,"whatsapp_enabled"?: boolean
                  }
                  Update: {
                    "delivery_distance_step_fee"?: number,"delivery_distance_step_km"?: number,"delivery_enabled"?: boolean,"delivery_fee"?: number,"delivery_fee_mode"?: string,"delivery_origin_latitude"?: number | null,"delivery_origin_longitude"?: number | null,"dine_in_qr_enabled"?: boolean,"estimated_delivery_minutes"?: number,"estimated_pickup_minutes"?: number,"id"?: boolean,"is_accepting_orders"?: boolean,"min_delivery_order"?: number,"pickup_enabled"?: boolean,"require_confirmation_for_qr"?: boolean,"whatsapp_enabled"?: boolean
                  }
                  Relationships: [

                  ]
                },"service_requests": {
                  Row: {
                    "created_at": string,"id": string,"status": string,"table_id": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"status"?: string,"table_id": string,"type": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"status"?: string,"table_id"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_requests_table_id_fkey"
      columns: ["table_id"]
isOneToOne: false
      referencedRelation: "tables"
      referencedColumns: ["id"]
    }
                  ]
                },"tables": {
                  Row: {
                    "capacity": number,"id": string,"qr_token": string,"status": Database["public"]['Enums']["table_status"],"table_number": number,"can_update_table": boolean | null
                  }
                  ComputedFields: "can_update_table"
                  Insert: {
                    "capacity": number,"id"?: string,"qr_token"?: string,"status"?: Database["public"]['Enums']["table_status"],"table_number": number
                  }
                  Update: {
                    "capacity"?: number,"id"?: string,"qr_token"?: string,"status"?: Database["public"]['Enums']["table_status"],"table_number"?: number
                  }
                  Relationships: [

                  ]
                },"whatsapp_conversations": {
                  Row: {
                    "context": NonNullable<Json>,"last_message_at": string,"lease_token": string | null,"lease_until": string | null,"needs_human": boolean,"opted_out": boolean,"phone": string,"state": string
                  }
                  ComputedFields: never
                  Insert: {
                    "context"?: NonNullable<Json>,"last_message_at"?: string,"lease_token"?: string | null,"lease_until"?: string | null,"needs_human"?: boolean,"opted_out"?: boolean,"phone": string,"state"?: string
                  }
                  Update: {
                    "context"?: NonNullable<Json>,"last_message_at"?: string,"lease_token"?: string | null,"lease_until"?: string | null,"needs_human"?: boolean,"opted_out"?: boolean,"phone"?: string,"state"?: string
                  }
                  Relationships: [

                  ]
                },"whatsapp_messages": {
                  Row: {
                    "attempts": number,"created_at": string,"direction": string,"id": string,"lease_token": string | null,"lease_until": string | null,"payload": NonNullable<Json>,"phone": string,"provider_id": string | null,"sequence": number,"status": string,"wa_message_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"direction": string,"id"?: string,"lease_token"?: string | null,"lease_until"?: string | null,"payload": NonNullable<Json>,"phone": string,"provider_id"?: string | null,"sequence"?: never,"status"?: string,"wa_message_id": string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"direction"?: string,"id"?: string,"lease_token"?: string | null,"lease_until"?: string | null,"payload"?: NonNullable<Json>,"phone"?: string,"provider_id"?: string | null,"sequence"?: never,"status"?: string,"wa_message_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "whatsapp_messages_phone_fkey"
      columns: ["phone"]
isOneToOne: false
      referencedRelation: "whatsapp_conversations"
      referencedColumns: ["phone"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "advance_hub_order":
{ Args: { "p_action": string,"p_order_id": string,"p_payment_method"?: string,"p_reason"?: string }; Returns: {
              "cancel_reason": string | null,
"cash_change_for": number | null,
"closed_at": string | null,
"confirmed_at": string | null,
"created_at": string,
"customer_id": string | null,
"customer_name": string | null,
"customer_phone": string | null,
"delivery_address": Json | null,
"delivery_fee": number,
"id": string,
"notes": string | null,
"order_number": number,
"order_type": Database["public"]['Enums']["order_type"],
"payment_method": Database["public"]['Enums']["payment_method"] | null,
"payment_status": Database["public"]['Enums']["payment_status"],
"public_token": string,
"source": Database["public"]['Enums']["order_source"],
"status": Database["public"]['Enums']["order_status"],
"table_id": string | null,
"total_amount": number,
"waiter_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"attend_service_request":
{ Args: { "p_request_id": string }; Returns: undefined
                           },
"can_update_order":
{ Args: { "p_new": Omit<Database["public"]['Tables']["orders"]['Row'], Database["public"]['Tables']["orders"]['ComputedFields']> }; Returns: boolean
                           },
"can_update_order_item":
{ Args: { "p_new": Omit<Database["public"]['Tables']["order_items"]['Row'], Database["public"]['Tables']["order_items"]['ComputedFields']> }; Returns: boolean
                           },
"can_update_table":
{ Args: { "p_new": Omit<Database["public"]['Tables']["tables"]['Row'], Database["public"]['Tables']["tables"]['ComputedFields']> }; Returns: boolean
                           },
"claim_whatsapp_message":
{ Args: { "p_direction": string }; Returns: {
              "attempts": number,
"created_at": string,
"direction": string,
"id": string,
"lease_token": string | null,
"lease_until": string | null,
"payload": NonNullable<Json>,
"phone": string,
"provider_id": string | null,
"sequence": number,
"status": string,
"wa_message_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "whatsapp_messages"
        isOneToOne: true
        isSetofReturn: false
      } },
"close_order":
{ Args: { "p_order_id": string,"p_payment_method": string }; Returns: {
              "cancel_reason": string | null,
"cash_change_for": number | null,
"closed_at": string | null,
"confirmed_at": string | null,
"created_at": string,
"customer_id": string | null,
"customer_name": string | null,
"customer_phone": string | null,
"delivery_address": Json | null,
"delivery_fee": number,
"id": string,
"notes": string | null,
"order_number": number,
"order_type": Database["public"]['Enums']["order_type"],
"payment_method": Database["public"]['Enums']["payment_method"] | null,
"payment_status": Database["public"]['Enums']["payment_status"],
"public_token": string,
"source": Database["public"]['Enums']["order_source"],
"status": Database["public"]['Enums']["order_status"],
"table_id": string | null,
"total_amount": number,
"waiter_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"commit_whatsapp_turn":
{ Args: { "p_lease": string,"p_message_id": string,"p_order"?: Json,"p_replies": Json,"p_session": Json }; Returns: {
              "cancel_reason": string | null,
"cash_change_for": number | null,
"closed_at": string | null,
"confirmed_at": string | null,
"created_at": string,
"customer_id": string | null,
"customer_name": string | null,
"customer_phone": string | null,
"delivery_address": Json | null,
"delivery_fee": number,
"id": string,
"notes": string | null,
"order_number": number,
"order_type": Database["public"]['Enums']["order_type"],
"payment_method": Database["public"]['Enums']["payment_method"] | null,
"payment_status": Database["public"]['Enums']["payment_status"],
"public_token": string,
"source": Database["public"]['Enums']["order_source"],
"status": Database["public"]['Enums']["order_status"],
"table_id": string | null,
"total_amount": number,
"waiter_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"consume_public_rate_limit":
{ Args: { "p_key": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"create_cashier_order":
{ Args: { "p_actor_id": string,"p_payload": Json,"p_request_id": string }; Returns: {
              "cancel_reason": string | null,
"cash_change_for": number | null,
"closed_at": string | null,
"confirmed_at": string | null,
"created_at": string,
"customer_id": string | null,
"customer_name": string | null,
"customer_phone": string | null,
"delivery_address": Json | null,
"delivery_fee": number,
"id": string,
"notes": string | null,
"order_number": number,
"order_type": Database["public"]['Enums']["order_type"],
"payment_method": Database["public"]['Enums']["payment_method"] | null,
"payment_status": Database["public"]['Enums']["payment_status"],
"public_token": string,
"source": Database["public"]['Enums']["order_source"],
"status": Database["public"]['Enums']["order_status"],
"table_id": string | null,
"total_amount": number,
"waiter_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_customer_order":
{ Args: { "p_payload": Json }; Returns: {
              "cancel_reason": string | null,
"cash_change_for": number | null,
"closed_at": string | null,
"confirmed_at": string | null,
"created_at": string,
"customer_id": string | null,
"customer_name": string | null,
"customer_phone": string | null,
"delivery_address": Json | null,
"delivery_fee": number,
"id": string,
"notes": string | null,
"order_number": number,
"order_type": Database["public"]['Enums']["order_type"],
"payment_method": Database["public"]['Enums']["payment_method"] | null,
"payment_status": Database["public"]['Enums']["payment_status"],
"public_token": string,
"source": Database["public"]['Enums']["order_source"],
"status": Database["public"]['Enums']["order_status"],
"table_id": string | null,
"total_amount": number,
"waiter_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_table_service_request":
{ Args: { "p_token": string,"p_type": string }; Returns: string
                           },
"current_user_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["user_role"]
                           },
"delivery_pricing_snapshot":
{ Args: { "settings": Omit<Database["public"]['Tables']["restaurant_settings"]['Row'], Database["public"]['Tables']["restaurant_settings"]['ComputedFields']> }; Returns: Json
                           },
"open_table":
{ Args: { "p_table_id": string }; Returns: {
              "cancel_reason": string | null,
"cash_change_for": number | null,
"closed_at": string | null,
"confirmed_at": string | null,
"created_at": string,
"customer_id": string | null,
"customer_name": string | null,
"customer_phone": string | null,
"delivery_address": Json | null,
"delivery_fee": number,
"id": string,
"notes": string | null,
"order_number": number,
"order_type": Database["public"]['Enums']["order_type"],
"payment_method": Database["public"]['Enums']["payment_method"] | null,
"payment_status": Database["public"]['Enums']["payment_status"],
"public_token": string,
"source": Database["public"]['Enums']["order_source"],
"status": Database["public"]['Enums']["order_status"],
"table_id": string | null,
"total_amount": number,
"waiter_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"recompute_order_total":
{ Args: { "p_order_id": string }; Returns: number
                           },
"resolve_whatsapp_handoff":
{ Args: { "p_phone": string }; Returns: undefined
                           },
"review_table_order":
{ Args: { "p_accept": boolean,"p_order_id": string }; Returns: undefined
                           },
"rotate_table_token":
{ Args: { "p_table_id": string }; Returns: string
                           },
"set_product_photo":
{ Args: { "p_content": string,"p_product_id": string }; Returns: string
                           },
"sync_offsite_ready":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"whatsapp_handoffs":
{ Args: Record<PropertyKey, never>; Returns: {
              "last_message_at": string,"phone": string
            }[]
                           }
          }
          Enums: {
            "order_item_status": "pending"|"preparing"|"ready"|"delivered","order_source": "waiter"|"qr"|"nfc"|"whatsapp"|"web","order_status": "pending_confirmation"|"open"|"ready"|"out_for_delivery"|"closed"|"cancelled","order_type": "dine_in"|"pickup"|"delivery","payment_method": "cash"|"card"|"pix","payment_status": "pending"|"paid","table_status": "available"|"occupied"|"closing","user_role": "admin"|"waiter"|"kitchen"|"cashier"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "order_item_status": ["pending", "preparing", "ready", "delivered"],"order_source": ["waiter", "qr", "nfc", "whatsapp", "web"],"order_status": ["pending_confirmation", "open", "ready", "out_for_delivery", "closed", "cancelled"],"order_type": ["dine_in", "pickup", "delivery"],"payment_method": ["cash", "card", "pix"],"payment_status": ["pending", "paid"],"table_status": ["available", "occupied", "closing"],"user_role": ["admin", "waiter", "kitchen", "cashier"]
          }
        }
} as const
