import {formatRupiah} from './format'
import {normalizeWhatsApp} from './whatsapp'
import {fetchOrderRelated} from './orderSearch'
import {businessDateTimeLabel} from './businessTime'
import {statusLabels} from './order'
import type {OrderRow} from '../types/order'

export type ReceiptItem={service_name:string;quantity:number;unit:string;price:number|null;subtotal:number|null}
export type ReceiptCharge={charge_name:string;amount:number}
export const escapeReceiptHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const quantityText=(value:number)=>Number(value).toLocaleString('id-ID',{maximumFractionDigits:3})
const money=(value:number|null)=>value===null||value===undefined?'Harga tidak tersedia':formatRupiah(Number(value))
export function receiptItemsText(items:ReceiptItem[],charges:ReceiptCharge[]=[]){
  return ['Rincian layanan:',...items.map(item=>`${item.service_name}\n${quantityText(item.quantity)} ${item.unit} × ${money(item.price)} = ${money(item.subtotal)}`),
    ...(!items.length?['Rincian layanan tidak tersedia.']:[]),
    ...(charges.length?['Biaya tambahan:',...charges.map(c=>`${c.charge_name}: ${formatRupiah(Number(c.amount))}`)]:[])].join('\n')
}
export function receiptItemsHtml(items:ReceiptItem[],showPrice=true){
  return items.map(item=>`<div class="service-row"><span>${escapeReceiptHtml(item.service_name)}<small style="display:block;margin-top:3px">${escapeReceiptHtml(quantityText(item.quantity))} ${escapeReceiptHtml(item.unit)}${showPrice?` × ${escapeReceiptHtml(money(item.price))}`:''}</small></span><b>${escapeReceiptHtml(money(item.subtotal))}</b></div>`).join('')
}
export function paymentSummaryText(row:{subtotal:number;discount:number;total:number;paid_amount:number}){
  return `Ringkasan pembayaran:\nSubtotal: ${money(row.subtotal)}\nDiskon: ${money(row.discount)}\nTotal: ${money(row.total)}\nSudah dibayar: ${money(row.paid_amount)}\nSisa tagihan: ${formatRupiah(Math.max(0,Number(row.total)-Number(row.paid_amount)))}`
}
export function composeReceiptWhatsApp(template:string,values:Record<string,string>,items:ReceiptItem[],charges:ReceiptCharge[],row:{subtotal:number;discount:number;total:number;paid_amount:number}){
  const details=receiptItemsText(items,charges),summary=paymentSummaryText(row)
  const all:Record<string,string>={nama:values.pelanggan||'',...values,rincian:details,ringkasan:summary,subtotal:money(row.subtotal),diskon:money(row.discount),dibayar:money(row.paid_amount),sisa:formatRupiah(Math.max(0,Number(row.total)-Number(row.paid_amount)))}
  // Support both existing {{pelanggan}} and legacy {nama} templates.
  const base=template.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g,(match,double,single)=>all[double||single]??match)
  return [base,!/\{\{?rincian\}?\}/.test(template)?details:'',!/\{\{?ringkasan\}?\}/.test(template)?summary:''].filter(Boolean).join('\n\n')
}
export async function loadOrderReceipt(orderId:string){
  const [items,charges]=await Promise.all([
    fetchOrderRelated<ReceiptItem>('v100_order_items','service_name,quantity,unit,price,subtotal',[orderId],'created_at'),
    fetchOrderRelated<ReceiptCharge>('v113099_order_extra_charges','charge_name,amount',[orderId],'created_at')
  ])
  return {items,charges}
}
export async function openOrderReceiptWhatsApp(row:OrderRow,template:string,business='HappyLaundry Babakan'){
  const phone=normalizeWhatsApp(row.customer_phone||'')
  if(!phone)throw new Error('Nomor WhatsApp pelanggan belum tersedia.')
  // Open immediately on tap so iOS does not block the window after the database read.
  const draft=window.open('','_blank')
  if(!draft)throw new Error('Izinkan pop-up untuk membuka draf WhatsApp, lalu coba lagi.')
  draft.opener=null
  draft.document.body.textContent='Menyiapkan rincian nota...'
  try{
    const {items,charges}=await loadOrderReceipt(row.id)
    const message=composeReceiptWhatsApp(template,{
      pelanggan:row.customer_name,nama:row.customer_name,order:row.order_no,total:formatRupiah(Number(row.total)),
      estimasi:row.due_at?businessDateTimeLabel(row.due_at):'-',usaha:business,status:statusLabels[row.status]
    },items,charges,row)
    const tracking=`${window.location.origin}/track/${encodeURIComponent(row.order_no)}`
    draft.location.replace(`https://wa.me/${phone}?text=${encodeURIComponent(`${message}\n\nCek status laundry:\n${tracking}`)}`)
  }catch(error){draft.close();throw error}
}
