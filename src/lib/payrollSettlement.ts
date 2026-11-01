// Settle the final salary in whole rupiah, matching the displayed payment amount.
// Keep source commissions, loan balances, and recorded payments unchanged.
export function payrollSettlement(gross:number,deductions:number,paid:number){
  const net=Math.max(0,Math.round(gross-deductions))
  const remaining=Math.max(0,Math.round(net-paid))
  return {net,remaining}
}
