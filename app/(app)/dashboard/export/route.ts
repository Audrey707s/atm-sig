import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { resolveDashboardMonth } from '@/lib/dashboard/month'
import { getTasksPerluPerhatian } from '@/lib/dashboard/queries'

const labels:Record<string,string>={total:'Task Perlu Perhatian',todo:'Belum Dimulai',overdue:'Melewati Tenggat',blocked:'Blocked',review:'Menunggu Review',done:'Selesai',deadline:'Pengajuan Deadline'}
const escapeXml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
const safeAscii=(value:string)=>value.normalize('NFKD').replace(/[^\x20-\x7e]/g,'?').replace(/[()\\]/g,' ')
function makePdf(lines:string[]):Uint8Array {
  const pages:string[][]=[]
  for(let i=0;i<lines.length;i+=44)pages.push(lines.slice(i,i+44))
  if(!pages.length)pages.push([])
  const objects:string[]=['','<< /Type /Catalog /Pages 2 0 R >>','','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const pageRefs:number[]=[]
  for(const page of pages){
    const pageId=objects.length
    const streamId=pageId+1
    pageRefs.push(pageId)
    const stream='BT /F1 10 Tf 44 790 Td 14 TL '+page.map((line,i)=>(i?'T* ':'')+'('+safeAscii(line).slice(0,115)+') Tj').join(' ')+' ET'
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents '+streamId+' 0 R >>')
    objects.push('<< /Length '+new TextEncoder().encode(stream).length+' >>\nstream\n'+stream+'\nendstream')
  }
  objects[2]='<< /Type /Pages /Kids ['+pageRefs.map(id=>id+' 0 R').join(' ')+'] /Count '+pageRefs.length+' >>'
  let pdf='%PDF-1.4\n'
  const offsets=[0]
  for(let i=1;i<objects.length;i++){offsets.push(new TextEncoder().encode(pdf).length);pdf+=i+' 0 obj\n'+objects[i]+'\nendobj\n'}
  const xref=new TextEncoder().encode(pdf).length
  pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n'
  for(let i=1;i<objects.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n'
  pdf+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF'
  return new TextEncoder().encode(pdf)
}
export async function GET(request:NextRequest){
  const user=await getSessionUser()
  const params=request.nextUrl.searchParams
  const month=resolveDashboardMonth(params.get('month')??undefined)
  const attention=params.get('attention')==='month'?'month':'all'
  const card=Object.hasOwn(labels,params.get('card')??'')?params.get('card')!:'total'
  const format=params.get('format')==='pdf'?'pdf':'xls'
  const [year,mon]=month.split('-').map(Number)
  const next=mon===12?`${year+1}-01`:`${year}-${String(mon+1).padStart(2,'0')}`
  const from=attention==='month'?`${month}-01T00:00:00+07:00`:undefined
  const to=attention==='month'?`${next}-01T00:00:00+07:00`:undefined
  const tasks=await getTasksPerluPerhatian(user,100000,from,to,card)
  const scope=attention==='all'?'Akumulatif':month
  const heading=`ATM-SIG | ${labels[card]} | ${scope} | ${tasks.length} task`
  const columns=['Task','PIC','Tenggat','Progress','Status']
  const rows=tasks.map(t=>[t.title,t.ownerName,t.dueDate,String(t.progressPct)+'%',t.status])
  const filename=`atm-dashboard-${card}-${attention==='all'?'akumulatif':month}`
  if(format==='pdf'){
    const lines=[heading,'',columns.join(' | '),...rows.map(row=>row.map((s,i)=>i===0?s.slice(0,40):s.slice(0,20)).join(' | '))]
    const bytes=makePdf(lines)
    return new NextResponse(bytes as BodyInit,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${filename}.pdf"`,'Cache-Control':'private, no-store'}})
  }
  const xml='<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Dashboard"><Table>'+
    [[heading],columns,...rows].map(row=>'<Row>'+row.map(value=>'<Cell><Data ss:Type="String">'+escapeXml(value)+'</Data></Cell>').join('')+'</Row>').join('')+
    '</Table></Worksheet></Workbook>'
  return new NextResponse('\uFEFF'+xml,{headers:{'Content-Type':'application/vnd.ms-excel; charset=utf-8','Content-Disposition':`attachment; filename="${filename}.xls"`,'Cache-Control':'private, no-store'}})
}
