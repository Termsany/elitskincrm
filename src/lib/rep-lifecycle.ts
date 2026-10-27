export function canConfirmRepReset(repName:string, enteredName:string, phrase:string):boolean {
  return repName.length>0 && enteredName===repName && phrase==="تصفير";
}
