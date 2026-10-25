
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "public": {
          Tables: {
            "cash_movements": {
                  Row: {
                    "amount": number,"created_at": string,"id": string,"kind": string,"operator_id": string,"reason": string,"session_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"id"?: string,"kind": string,"operator_id": string,"reason": string,"session_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"id"?: string,"kind"?: string,"operator_id"?: string,"reason"?: string,"session_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_movements_operator_id_fkey"
      columns: ["operator_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_movements_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "cash_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"cash_order_cancellations": {
                  Row: {
                    "actor_id": string | null,"amount": number,"business_date": string,"legacy": boolean,"occurred_at": string,"order_id": string,"order_type": string,"rejected": boolean,"session_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"amount": number,"business_date": string,"legacy"?: boolean,"occurred_at"?: string,"order_id": string,"order_type": string,"rejected": boolean,"session_id"?: string | null
                  }
                  Update: {
                    "actor_id"?: string | null,"amount"?: number,"business_date"?: string,"legacy"?: boolean,"occurred_at"?: string,"order_id"?: string,"order_type"?: string,"rejected"?: boolean,"session_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_order_cancellations_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_order_cancellations_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_order_cancellations_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "cash_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"cash_session_events": {
                  Row: {
                    "action": string,"actor_id": string,"created_at": string,"id": string,"payload": NonNullable<Json>,"request_id": string,"result": NonNullable<Json>,"session_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id": string,"created_at"?: string,"id"?: string,"payload": NonNullable<Json>,"request_id": string,"result": NonNullable<Json>,"session_id": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string,"created_at"?: string,"id"?: string,"payload"?: NonNullable<Json>,"request_id"?: string,"result"?: NonNullable<Json>,"session_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_session_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_session_events_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "cash_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"cash_session_policy": {
                  Row: {
                    "blind_count": boolean,"id": boolean,"require_open_session": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "blind_count"?: boolean,"id"?: boolean,"require_open_session"?: boolean
                  }
                  Update: {
                    "blind_count"?: boolean,"id"?: boolean,"require_open_session"?: boolean
                  }
                  Relationships: [

                  ]
                },"cash_sessions": {
                  Row: {
                    "blind_count": boolean,"business_date": string,"closed_at": string | null,"closed_report": Json | null,"counted_amount": number | null,"day_start": string,"denominations": Json | null,"difference": number | null,"expected_amount": number | null,"id": string,"notes": string | null,"opened_at": string,"opening_amount": number,"operator_id": string,"revision": number,"status": string,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blind_count": boolean,"business_date": string,"closed_at"?: string | null,"closed_report"?: Json | null,"counted_amount"?: number | null,"day_start": string,"denominations"?: Json | null,"difference"?: number | null,"expected_amount"?: number | null,"id"?: string,"notes"?: string | null,"opened_at"?: string,"opening_amount": number,"operator_id": string,"revision"?: number,"status"?: string,"timezone": string
                  }
                  Update: {
                    "blind_count"?: boolean,"business_date"?: string,"closed_at"?: string | null,"closed_report"?: Json | null,"counted_amount"?: number | null,"day_start"?: string,"denominations"?: Json | null,"difference"?: number | null,"expected_amount"?: number | null,"id"?: string,"notes"?: string | null,"opened_at"?: string,"opening_amount"?: number,"operator_id"?: string,"revision"?: number,"status"?: string,"timezone"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_sessions_operator_id_fkey"
      columns: ["operator_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"cashier_order_submissions": {
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
                },"counter_daily_numbers": {
                  Row: {
                    "business_date": string,"last_ticket": number
                  }
                  ComputedFields: never
                  Insert: {
                    "business_date": string,"last_ticket": number
                  }
                  Update: {
                    "business_date"?: string,"last_ticket"?: number
                  }
                  Relationships: [

                  ]
                },"counter_order_submissions": {
                  Row: {
                    "actor_id": string,"created_at": string,"lines": NonNullable<Json>,"order_id": string | null,"payload": NonNullable<Json>,"request_id": string,"result": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"created_at"?: string,"lines": NonNullable<Json>,"order_id"?: string | null,"payload": NonNullable<Json>,"request_id": string,"result"?: Json | null
                  }
                  Update: {
                    "actor_id"?: string,"created_at"?: string,"lines"?: NonNullable<Json>,"order_id"?: string | null,"payload"?: NonNullable<Json>,"request_id"?: string,"result"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "counter_order_submissions_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "counter_order_submissions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_addresses": {
                  Row: {
                    "city": string | null,"complement": string | null,"created_at": string,"customer_id": string,"id": string,"label": string | null,"neighborhood": string | null,"number": string | null,"reference": string | null,"state": string | null,"street": string | null,"zip_code": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"complement"?: string | null,"created_at"?: string,"customer_id": string,"id"?: string,"label"?: string | null,"neighborhood"?: string | null,"number"?: string | null,"reference"?: string | null,"state"?: string | null,"street"?: string | null,"zip_code"?: string | null
                  }
                  Update: {
                    "city"?: string | null,"complement"?: string | null,"created_at"?: string,"customer_id"?: string,"id"?: string,"label"?: string | null,"neighborhood"?: string | null,"number"?: string | null,"reference"?: string | null,"state"?: string | null,"street"?: string | null,"zip_code"?: string | null
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
                },"exchange_rates": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"rate": number,"rounding": string,"sequence": number,"valid_from": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"id"?: string,"rate": number,"rounding": string,"sequence"?: never,"valid_from"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"rate"?: number,"rounding"?: string,"sequence"?: never,"valid_from"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exchange_rates_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"kitchen_action_submissions": {
                  Row: {
                    "action": string,"actor_id": string,"created_at": string,"order_id": string,"request_id": string,"result": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id": string,"created_at"?: string,"order_id": string,"request_id": string,"result"?: Json | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string,"created_at"?: string,"order_id"?: string,"request_id"?: string,"result"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "kitchen_action_submissions_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "kitchen_action_submissions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"kitchen_print_jobs": {
                  Row: {
                    "claim_token": string | null,"claimed_at": string | null,"claimed_by": string | null,"created_at": string,"dispatched_at": string | null,"error_message": string | null,"id": string,"order_id": string,"status": string,"terminal_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "claim_token"?: string | null,"claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"dispatched_at"?: string | null,"error_message"?: string | null,"id"?: string,"order_id": string,"status"?: string,"terminal_id"?: string | null
                  }
                  Update: {
                    "claim_token"?: string | null,"claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"dispatched_at"?: string | null,"error_message"?: string | null,"id"?: string,"order_id"?: string,"status"?: string,"terminal_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "kitchen_print_jobs_claimed_by_fkey"
      columns: ["claimed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "kitchen_print_jobs_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"kitchen_printer_lease": {
                  Row: {
                    "expires_at": string,"id": boolean,"terminal_id": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "expires_at"?: string,"id"?: boolean,"terminal_id"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "expires_at"?: string,"id"?: boolean,"terminal_id"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "kitchen_printer_lease_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
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
                },"order_payment_submissions": {
                  Row: {
                    "actor_id": string,"order_id": string,"payload": NonNullable<Json>,"request_id": string,"result": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"order_id": string,"payload": NonNullable<Json>,"request_id": string,"result"?: Json | null
                  }
                  Update: {
                    "actor_id"?: string,"order_id"?: string,"payload"?: NonNullable<Json>,"request_id"?: string,"result"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_payment_submissions_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_payment_submissions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "cancel_reason": string | null,"cash_change_for": number | null,"closed_at": string | null,"confirmed_at": string | null,"counter_business_date": string | null,"counter_name": string | null,"counter_payment_timing": string | null,"counter_ready_at": string | null,"counter_ticket": number | null,"created_at": string,"customer_id": string | null,"customer_name": string | null,"customer_phone": string | null,"delivery_address": Json | null,"delivery_fee": number,"id": string,"is_counter": boolean,"notes": string | null,"order_number": number,"order_type": Database["public"]['Enums']["order_type"],"payment_method": Database["public"]['Enums']["payment_method"] | null,"payment_status": Database["public"]['Enums']["payment_status"],"public_token": string,"source": Database["public"]['Enums']["order_source"],"status": Database["public"]['Enums']["order_status"],"table_id": string | null,"total_amount": number,"waiter_id": string | null,"can_update_order": boolean | null
                  }
                  ComputedFields: "can_update_order"
                  Insert: {
                    "cancel_reason"?: string | null,"cash_change_for"?: number | null,"closed_at"?: string | null,"confirmed_at"?: string | null,"counter_business_date"?: string | null,"counter_name"?: string | null,"counter_payment_timing"?: string | null,"counter_ready_at"?: string | null,"counter_ticket"?: number | null,"created_at"?: string,"customer_id"?: string | null,"customer_name"?: string | null,"customer_phone"?: string | null,"delivery_address"?: Json | null,"delivery_fee"?: number,"id"?: string,"is_counter"?: boolean,"notes"?: string | null,"order_number"?: number,"order_type": Database["public"]['Enums']["order_type"],"payment_method"?: Database["public"]['Enums']["payment_method"] | null,"payment_status"?: Database["public"]['Enums']["payment_status"],"public_token"?: string,"source": Database["public"]['Enums']["order_source"],"status"?: Database["public"]['Enums']["order_status"],"table_id"?: string | null,"total_amount"?: number,"waiter_id"?: string | null
                  }
                  Update: {
                    "cancel_reason"?: string | null,"cash_change_for"?: number | null,"closed_at"?: string | null,"confirmed_at"?: string | null,"counter_business_date"?: string | null,"counter_name"?: string | null,"counter_payment_timing"?: string | null,"counter_ready_at"?: string | null,"counter_ticket"?: number | null,"created_at"?: string,"customer_id"?: string | null,"customer_name"?: string | null,"customer_phone"?: string | null,"delivery_address"?: Json | null,"delivery_fee"?: number,"id"?: string,"is_counter"?: boolean,"notes"?: string | null,"order_number"?: number,"order_type"?: Database["public"]['Enums']["order_type"],"payment_method"?: Database["public"]['Enums']["payment_method"] | null,"payment_status"?: Database["public"]['Enums']["payment_status"],"public_token"?: string,"source"?: Database["public"]['Enums']["order_source"],"status"?: Database["public"]['Enums']["order_status"],"table_id"?: string | null,"total_amount"?: number,"waiter_id"?: string | null
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
                },"payments": {
                  Row: {
                    "business_date": string | null,"cash_session_id": string | null,"change_pyg": number,"created_at": string,"currency": string,"delivery_fee_pyg": number | null,"equivalent_pyg": number,"exchange_rate": number | null,"exchange_rate_id": string | null,"id": string,"idempotency_key": string,"line_number": number,"method": Database["public"]['Enums']["payment_method"],"operator_id": string,"order_id": string,"original_amount": number,"rounding": string | null,"rounding_adjustment_pyg": number,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_date"?: string | null,"cash_session_id"?: string | null,"change_pyg"?: number,"created_at"?: string,"currency": string,"delivery_fee_pyg"?: number | null,"equivalent_pyg": number,"exchange_rate"?: number | null,"exchange_rate_id"?: string | null,"id"?: string,"idempotency_key": string,"line_number": number,"method": Database["public"]['Enums']["payment_method"],"operator_id": string,"order_id": string,"original_amount": number,"rounding"?: string | null,"rounding_adjustment_pyg"?: number,"status"?: string
                  }
                  Update: {
                    "business_date"?: string | null,"cash_session_id"?: string | null,"change_pyg"?: number,"created_at"?: string,"currency"?: string,"delivery_fee_pyg"?: number | null,"equivalent_pyg"?: number,"exchange_rate"?: number | null,"exchange_rate_id"?: string | null,"id"?: string,"idempotency_key"?: string,"line_number"?: number,"method"?: Database["public"]['Enums']["payment_method"],"operator_id"?: string,"order_id"?: string,"original_amount"?: number,"rounding"?: string | null,"rounding_adjustment_pyg"?: number,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_cash_session_id_fkey"
      columns: ["cash_session_id"]
isOneToOne: false
      referencedRelation: "cash_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_exchange_rate_id_fkey"
      columns: ["exchange_rate_id"]
isOneToOne: false
      referencedRelation: "exchange_rates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_idempotency_key_fkey"
      columns: ["idempotency_key"]
isOneToOne: false
      referencedRelation: "order_payment_submissions"
      referencedColumns: ["request_id"]
    },{
      foreignKeyName: "payments_operator_id_fkey"
      columns: ["operator_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"print_destinations": {
                  Row: {
                    "device_id": string,"name": string,"receipt_timing": string
                  }
                  ComputedFields: never
                  Insert: {
                    "device_id": string,"name": string,"receipt_timing"?: string
                  }
                  Update: {
                    "device_id"?: string,"name"?: string,"receipt_timing"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_destinations_device_id_fkey"
      columns: ["device_id"]
isOneToOne: false
      referencedRelation: "print_devices"
      referencedColumns: ["id"]
    }
                  ]
                },"print_devices": {
                  Row: {
                    "codepage": string,"codepage_number": number,"columns": number,"driver": string,"id": string,"last_success_at": string | null,"locale": string,"name": string,"paper_mm": number
                  }
                  ComputedFields: never
                  Insert: {
                    "codepage"?: string,"codepage_number"?: number,"columns"?: number,"driver"?: string,"id"?: string,"last_success_at"?: string | null,"locale"?: string,"name": string,"paper_mm"?: number
                  }
                  Update: {
                    "codepage"?: string,"codepage_number"?: number,"columns"?: number,"driver"?: string,"id"?: string,"last_success_at"?: string | null,"locale"?: string,"name"?: string,"paper_mm"?: number
                  }
                  Relationships: [

                  ]
                },"print_item_state": {
                  Row: {
                    "forwarded_quantity": number,"item_id": string,"job_id": string,"printed_at": string | null,"printed_copies": number
                  }
                  ComputedFields: never
                  Insert: {
                    "forwarded_quantity": number,"item_id": string,"job_id": string,"printed_at"?: string | null,"printed_copies"?: number
                  }
                  Update: {
                    "forwarded_quantity"?: number,"item_id"?: string,"job_id"?: string,"printed_at"?: string | null,"printed_copies"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_item_state_item_id_fkey"
      columns: ["item_id"]
isOneToOne: true
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_item_state_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "print_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"print_job_reviews": {
                  Row: {
                    "actor_id": string,"created_at": string,"decision": string,"id": string,"job_id": string,"reprint_job_id": string | null,"request_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"created_at"?: string,"decision": string,"id"?: string,"job_id": string,"reprint_job_id"?: string | null,"request_id": string
                  }
                  Update: {
                    "actor_id"?: string,"created_at"?: string,"decision"?: string,"id"?: string,"job_id"?: string,"reprint_job_id"?: string | null,"request_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_job_reviews_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_job_reviews_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "print_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_job_reviews_reprint_job_id_fkey"
      columns: ["reprint_job_id"]
isOneToOne: false
      referencedRelation: "print_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"print_jobs": {
                  Row: {
                    "additional": boolean,"archived_at": string | null,"cash_session_id": string | null,"claim_token": string | null,"claimed_at": string | null,"created_at": string,"created_by": string | null,"delivery_counted": boolean,"destination": string,"device": NonNullable<Json>,"error_message": string | null,"id": string,"kind": string,"order_id": string | null,"original_job_id": string | null,"owner_id": string | null,"reprint": boolean,"request_id": string | null,"review_decision": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"sent_at": string | null,"snapshot": NonNullable<Json>,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "additional"?: boolean,"archived_at"?: string | null,"cash_session_id"?: string | null,"claim_token"?: string | null,"claimed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"delivery_counted"?: boolean,"destination": string,"device": NonNullable<Json>,"error_message"?: string | null,"id"?: string,"kind": string,"order_id"?: string | null,"original_job_id"?: string | null,"owner_id"?: string | null,"reprint"?: boolean,"request_id"?: string | null,"review_decision"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sent_at"?: string | null,"snapshot": NonNullable<Json>,"status"?: string
                  }
                  Update: {
                    "additional"?: boolean,"archived_at"?: string | null,"cash_session_id"?: string | null,"claim_token"?: string | null,"claimed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"delivery_counted"?: boolean,"destination"?: string,"device"?: NonNullable<Json>,"error_message"?: string | null,"id"?: string,"kind"?: string,"order_id"?: string | null,"original_job_id"?: string | null,"owner_id"?: string | null,"reprint"?: boolean,"request_id"?: string | null,"review_decision"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sent_at"?: string | null,"snapshot"?: NonNullable<Json>,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_jobs_cash_session_id_fkey"
      columns: ["cash_session_id"]
isOneToOne: false
      referencedRelation: "cash_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_jobs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_jobs_destination_fkey"
      columns: ["destination"]
isOneToOne: false
      referencedRelation: "print_destinations"
      referencedColumns: ["name"]
    },{
      foreignKeyName: "print_jobs_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_jobs_original_job_id_fkey"
      columns: ["original_job_id"]
isOneToOne: false
      referencedRelation: "print_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_jobs_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"print_processor_lease": {
                  Row: {
                    "expires_at": string,"id": boolean,"owner_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "expires_at"?: string,"id"?: boolean,"owner_id"?: string | null
                  }
                  Update: {
                    "expires_at"?: string,"id"?: boolean,"owner_id"?: string | null
                  }
                  Relationships: [

                  ]
                },"print_settings": {
                  Row: {
                    "id": boolean,"stall_seconds": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: boolean,"stall_seconds"?: number
                  }
                  Update: {
                    "id"?: boolean,"stall_seconds"?: number
                  }
                  Relationships: [

                  ]
                },"print_worker_heartbeats": {
                  Row: {
                    "driver": string,"instance_id": string,"last_seen_at": string,"user_id": string | null,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "driver": string,"instance_id": string,"last_seen_at"?: string,"user_id"?: string | null,"version": string
                  }
                  Update: {
                    "driver"?: string,"instance_id"?: string,"last_seen_at"?: string,"user_id"?: string | null,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_worker_heartbeats_user_id_fkey"
      columns: ["user_id"]
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
                    "business_day_start": string,"business_timezone": string,"counter_green_minutes": number,"counter_payment_timing": string,"counter_yellow_minutes": number,"default_phone_country": string,"delivery_distance_step_fee": number,"delivery_distance_step_km": number,"delivery_enabled": boolean,"delivery_fee": number,"delivery_fee_mode": string,"delivery_origin_latitude": number | null,"delivery_origin_longitude": number | null,"dine_in_qr_enabled": boolean,"enabled_payment_methods": (Database["public"]['Enums']["payment_method"])[],"estimated_delivery_minutes": number,"estimated_pickup_minutes": number,"id": boolean,"is_accepting_orders": boolean,"kitchen_auto_print_enabled": boolean,"min_delivery_order": number,"pickup_enabled": boolean,"require_confirmation_for_qr": boolean,"restaurant_name": string,"whatsapp_enabled": boolean,"delivery_pricing_snapshot": Json | null
                  }
                  ComputedFields: "delivery_pricing_snapshot"
                  Insert: {
                    "business_day_start"?: string,"business_timezone"?: string,"counter_green_minutes"?: number,"counter_payment_timing"?: string,"counter_yellow_minutes"?: number,"default_phone_country"?: string,"delivery_distance_step_fee"?: number,"delivery_distance_step_km"?: number,"delivery_enabled"?: boolean,"delivery_fee"?: number,"delivery_fee_mode"?: string,"delivery_origin_latitude"?: number | null,"delivery_origin_longitude"?: number | null,"dine_in_qr_enabled"?: boolean,"enabled_payment_methods"?: (Database["public"]['Enums']["payment_method"])[],"estimated_delivery_minutes"?: number,"estimated_pickup_minutes"?: number,"id"?: boolean,"is_accepting_orders"?: boolean,"kitchen_auto_print_enabled"?: boolean,"min_delivery_order"?: number,"pickup_enabled"?: boolean,"require_confirmation_for_qr"?: boolean,"restaurant_name"?: string,"whatsapp_enabled"?: boolean
                  }
                  Update: {
                    "business_day_start"?: string,"business_timezone"?: string,"counter_green_minutes"?: number,"counter_payment_timing"?: string,"counter_yellow_minutes"?: number,"default_phone_country"?: string,"delivery_distance_step_fee"?: number,"delivery_distance_step_km"?: number,"delivery_enabled"?: boolean,"delivery_fee"?: number,"delivery_fee_mode"?: string,"delivery_origin_latitude"?: number | null,"delivery_origin_longitude"?: number | null,"dine_in_qr_enabled"?: boolean,"enabled_payment_methods"?: (Database["public"]['Enums']["payment_method"])[],"estimated_delivery_minutes"?: number,"estimated_pickup_minutes"?: number,"id"?: boolean,"is_accepting_orders"?: boolean,"kitchen_auto_print_enabled"?: boolean,"min_delivery_order"?: number,"pickup_enabled"?: boolean,"require_confirmation_for_qr"?: boolean,"restaurant_name"?: string,"whatsapp_enabled"?: boolean
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
                    "context": NonNullable<Json>,"last_message_at": string,"lease_token": string | null,"lease_until": string | null,"needs_human": boolean,"opted_out": boolean,"phone": string,"provider_recipient": string | null,"provider_recipient_at": string | null,"state": string
                  }
                  ComputedFields: never
                  Insert: {
                    "context"?: NonNullable<Json>,"last_message_at"?: string,"lease_token"?: string | null,"lease_until"?: string | null,"needs_human"?: boolean,"opted_out"?: boolean,"phone": string,"provider_recipient"?: string | null,"provider_recipient_at"?: string | null,"state"?: string
                  }
                  Update: {
                    "context"?: NonNullable<Json>,"last_message_at"?: string,"lease_token"?: string | null,"lease_until"?: string | null,"needs_human"?: boolean,"opted_out"?: boolean,"phone"?: string,"provider_recipient"?: string | null,"provider_recipient_at"?: string | null,"state"?: string
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
"counter_business_date": string | null,
"counter_name": string | null,
"counter_payment_timing": string | null,
"counter_ready_at": string | null,
"counter_ticket": number | null,
"created_at": string,
"customer_id": string | null,
"customer_name": string | null,
"customer_phone": string | null,
"delivery_address": Json | null,
"delivery_fee": number,
"id": string,
"is_counter": boolean,
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
"advance_kitchen_order":
{ Args: { "p_action": string,"p_order_id": string,"p_request_id": string }; Returns: Json
                           },
"assert_print_document_idle":
{ Args: { "p_job_id"?: string,"p_kind": string,"p_order_id": string }; Returns: undefined
                           },
"attend_service_request":
{ Args: { "p_request_id": string }; Returns: undefined
                           },
"brl_cents_for":
{ Args: { "p_pyg": number,"p_rate": number,"p_rounding": string }; Returns: number
                           },
"business_day_for":
{ Args: { "p_at": string,"p_start": string,"p_zone": string }; Returns: string
                           },
"business_day_window":
{ Args: { "p_at"?: string }; Returns: Json
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
"capture_print_order":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"cash_day_report":
{ Args: { "p_day"?: string }; Returns: Json
                           },
"cash_payment_summary":
{ Args: { "p_day": string,"p_session": string }; Returns: Json
                           },
"cash_session_command":
{ Args: { "p_action": string,"p_payload": Json,"p_request_id": string }; Returns: Json
                           },
"cash_session_full_report":
{ Args: { "p_session": string }; Returns: Json
                           },
"cash_session_report":
{ Args: { "p_session": string }; Returns: Json
                           },
"claim_kitchen_print_job":
{ Args: { "p_terminal_id": string }; Returns: Json
                           },
"claim_print_job":
{ Args: { "p_driver": string,"p_owner_id": string }; Returns: Json
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
"counter_business_date": string | null,
"counter_name": string | null,
"counter_payment_timing": string | null,
"counter_ready_at": string | null,
"counter_ticket": number | null,
"created_at": string,
"customer_id": string | null,
"customer_name": string | null,
"customer_phone": string | null,
"delivery_address": Json | null,
"delivery_fee": number,
"id": string,
"is_counter": boolean,
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
"counter_business_date": string | null,
"counter_name": string | null,
"counter_payment_timing": string | null,
"counter_ready_at": string | null,
"counter_ticket": number | null,
"created_at": string,
"customer_id": string | null,
"customer_name": string | null,
"customer_phone": string | null,
"delivery_address": Json | null,
"delivery_fee": number,
"id": string,
"is_counter": boolean,
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
"count_print_delivery":
{ Args: { "p_job_id": string }; Returns: undefined
                           },
"create_cashier_order":
{ Args: { "p_actor_id": string,"p_payload": Json,"p_request_id": string }; Returns: {
              "cancel_reason": string | null,
"cash_change_for": number | null,
"closed_at": string | null,
"confirmed_at": string | null,
"counter_business_date": string | null,
"counter_name": string | null,
"counter_payment_timing": string | null,
"counter_ready_at": string | null,
"counter_ticket": number | null,
"created_at": string,
"customer_id": string | null,
"customer_name": string | null,
"customer_phone": string | null,
"delivery_address": Json | null,
"delivery_fee": number,
"id": string,
"is_counter": boolean,
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
"create_counter_order":
{ Args: { "p_lines": Json,"p_payload": Json,"p_request_id": string }; Returns: Json
                           },
"create_customer_order":
{ Args: { "p_payload": Json }; Returns: {
              "cancel_reason": string | null,
"cash_change_for": number | null,
"closed_at": string | null,
"confirmed_at": string | null,
"counter_business_date": string | null,
"counter_name": string | null,
"counter_payment_timing": string | null,
"counter_ready_at": string | null,
"counter_ticket": number | null,
"created_at": string,
"customer_id": string | null,
"customer_name": string | null,
"customer_phone": string | null,
"delivery_address": Json | null,
"delivery_fee": number,
"id": string,
"is_counter": boolean,
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
"decide_print_job":
{ Args: { "p_decision": string,"p_job_id": string,"p_request_id": string }; Returns: string
                           },
"deliver_counter_order":
{ Args: { "p_order_id": string }; Returns: {
              "cancel_reason": string | null,
"cash_change_for": number | null,
"closed_at": string | null,
"confirmed_at": string | null,
"counter_business_date": string | null,
"counter_name": string | null,
"counter_payment_timing": string | null,
"counter_ready_at": string | null,
"counter_ticket": number | null,
"created_at": string,
"customer_id": string | null,
"customer_name": string | null,
"customer_phone": string | null,
"delivery_address": Json | null,
"delivery_fee": number,
"id": string,
"is_counter": boolean,
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
"delivery_pricing_snapshot":
{ Args: { "settings": Omit<Database["public"]['Tables']["restaurant_settings"]['Row'], Database["public"]['Tables']["restaurant_settings"]['ComputedFields']> }; Returns: Json
                           },
"finish_kitchen_print_job":
{ Args: { "p_claim_token": string,"p_error"?: string,"p_job_id": string,"p_terminal_id": string }; Returns: undefined
                           },
"finish_print_job":
{ Args: { "p_error"?: string,"p_job_id": string,"p_owner_id": string,"p_status": string,"p_token": string }; Returns: undefined
                           },
"mark_manual_kitchen_print":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"next_counter_ticket":
{ Args: { "p_day": string }; Returns: number
                           },
"open_table":
{ Args: { "p_table_id": string }; Returns: {
              "cancel_reason": string | null,
"cash_change_for": number | null,
"closed_at": string | null,
"confirmed_at": string | null,
"counter_business_date": string | null,
"counter_name": string | null,
"counter_payment_timing": string | null,
"counter_ready_at": string | null,
"counter_ticket": number | null,
"created_at": string,
"customer_id": string | null,
"customer_name": string | null,
"customer_phone": string | null,
"delivery_address": Json | null,
"delivery_fee": number,
"id": string,
"is_counter": boolean,
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
"payment_configuration":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"phone_identity":
{ Args: { "p_country"?: string,"p_value": string }; Returns: string
                           },
"preview_print_order":
{ Args: { "p_kind": string,"p_order_id": string }; Returns: Json
                           },
"print_issue_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"print_order_snapshot":
{ Args: { "p_items"?: Json,"p_order_id": string }; Returns: Json
                           },
"print_worker_health":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"print_worker_heartbeat":
{ Args: { "p_driver": string,"p_instance": string,"p_version": string }; Returns: undefined
                           },
"recompute_order_total":
{ Args: { "p_order_id": string }; Returns: number
                           },
"record_order_payments":
{ Args: { "p_lines": Json,"p_order_id": string,"p_request_id": string }; Returns: Json
                           },
"release_kitchen_printer":
{ Args: { "p_terminal_id": string }; Returns: undefined
                           },
"remember_whatsapp_recipient":
{ Args: { "p_at": string,"p_phone": string,"p_recipient": string }; Returns: undefined
                           },
"request_cash_session_print":
{ Args: { "p_request_id": string,"p_session": string }; Returns: string
                           },
"request_print":
{ Args: { "p_destination"?: string,"p_job_id"?: string,"p_kind"?: string,"p_order_id"?: string,"p_request_id": string }; Returns: string
                           },
"require_pyg":
{ Args: { "p_value": string }; Returns: number
                           },
"resolve_whatsapp_handoff":
{ Args: { "p_phone": string }; Returns: undefined
                           },
"review_print_job":
{ Args: { "p_job_id": string }; Returns: undefined
                           },
"review_table_order":
{ Args: { "p_accept": boolean,"p_order_id": string }; Returns: undefined
                           },
"rotate_table_token":
{ Args: { "p_table_id": string }; Returns: string
                           },
"set_exchange_rate":
{ Args: { "p_rate": string,"p_rounding": string }; Returns: string
                           },
"set_payment_methods":
{ Args: { "p_methods": (string)[] }; Returns: undefined
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
            "order_item_status": "pending"|"preparing"|"ready"|"delivered","order_source": "waiter"|"qr"|"nfc"|"whatsapp"|"web","order_status": "pending_confirmation"|"open"|"ready"|"out_for_delivery"|"closed"|"cancelled","order_type": "dine_in"|"pickup"|"delivery","payment_method": "cash"|"card"|"pix"|"transfer","payment_status": "pending"|"paid","table_status": "available"|"occupied"|"closing","user_role": "admin"|"waiter"|"kitchen"|"cashier"
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
            "order_item_status": ["pending", "preparing", "ready", "delivered"],"order_source": ["waiter", "qr", "nfc", "whatsapp", "web"],"order_status": ["pending_confirmation", "open", "ready", "out_for_delivery", "closed", "cancelled"],"order_type": ["dine_in", "pickup", "delivery"],"payment_method": ["cash", "card", "pix", "transfer"],"payment_status": ["pending", "paid"],"table_status": ["available", "occupied", "closing"],"user_role": ["admin", "waiter", "kitchen", "cashier"]
          }
        }
} as const
