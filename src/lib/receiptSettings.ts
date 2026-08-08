import { supabase } from './supabase'

export type ReceiptPaper='58'|'80'|'a4'
export type ReceiptTemplate='minimal'|'professional'|'premium'

export interface ReceiptPrintSettings{
  id:number
  paper_size:ReceiptPaper
  template:ReceiptTemplate
  font_size:number
  copies:number
  auto_print:boolean
  show_logo:boolean
  show_qr:boolean
  show_barcode:boolean
  show_customer_phone:boolean
  show_due_at:boolean
  show_payment_method:boolean
  show_status:boolean
  show_item_price:boolean
  show_discount:boolean
  show_paid:boolean
  show_balance:boolean
  show_maps:boolean
  show_cut_line:boolean
  header_note:string
  footer_note:string
  updated_at?:string
}

export const defaultReceiptPrintSettings:ReceiptPrintSettings={
  id:1,
  paper_size:'58',
  template:'professional',
  font_size:11,
  copies:1,
  auto_print:false,
  show_logo:true,
  show_qr:true,
  show_barcode:true,
  show_customer_phone:true,
  show_due_at:true,
  show_payment_method:true,
  show_status:true,
  show_item_price:true,
  show_discount:true,
  show_paid:true,
  show_balance:true,
  show_maps:false,
  show_cut_line:true,
  header_note:'',
  footer_note:''
}

export async function loadReceiptPrintSettings(){
  const{data,error}=await supabase
    .from('v110_receipt_print_settings')
    .select('*')
    .eq('id',1)
    .maybeSingle()

  if(error)return{settings:defaultReceiptPrintSettings,error}
  return{
    settings:data
      ? {...defaultReceiptPrintSettings,...(data as Partial<ReceiptPrintSettings>)}
      : defaultReceiptPrintSettings,
    error:null
  }
}
