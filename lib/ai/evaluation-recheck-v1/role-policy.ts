import type {Operation,Plan} from './contracts'
const shared=['tasks','wbs','supports','requirements','comments','organizations','notifications','reminders']
const profiles={
 1:{name:'Spectator',scope:'Data sesuai cakupan baca ATM. Tidak boleh mengubah tugas atau master data; hanya pengaturan profil dan notifikasi milik sendiri yang tersedia.'},
 2:{name:'Staff/PIC',scope:'Baca tugas sesuai cakupan ATM. Buat tugas untuk diri sendiri dan kelola pekerjaan pribadi, WBS, bukti, support serta tugas berulang sesuai aturan PIC. Tidak boleh menghapus tugas atau mengelola master organisasi.'},
 3:{name:'Manager',scope:'Kelola tugas dan kategori dalam seksi yang dikelola; jangan mengakses atau mengubah tugas seksi di luar cakupan. Keputusan review tetap mengikuti penugasan reviewer dan aturan ATM.'},
 4:{name:'SM',scope:'Kelola tugas/kategori dalam unit sendiri dan seksi langsung di bawahnya. Persetujuan tenggat mengikuti cakupan dan aturan ATM. Jangan memperluas akses ke unit lain.'},
 5:{name:'GM',scope:'Kelola tugas lintas unit sesuai cakupan GM di ATM, termasuk review/persetujuan yang diizinkan server. Tidak boleh melakukan CRUD struktur organisasi yang khusus Super Admin.'},
 6:{name:'Super Admin',scope:'Kelola tugas lintas unit dan master struktur organisasi sesuai aturan ATM. Jangan membatasi pencarian ke tugas pribadi kecuali diminta. Aturan PIC, bukti, review dan konfirmasi tetap berlaku.'},
} as const
export function aiRolePolicy(level:number){
 if(!Number.isInteger(level)||!Object.hasOwn(profiles,level))return null
 const profile=profiles[level as keyof typeof profiles]
 return {...profile,entities:[...shared,...(level>=2?['categories','templates']:[]),...(level>=3?['users','audit']:[]),...(level>=4?['approvals']:[])]}
}
export function aiRoleOperations(level:number,catalog:Record<string,Operation>){
 if(!aiRolePolicy(level))return {}
 return Object.fromEntries(Object.entries(catalog).filter(([,operation])=>operation.minimumRole<=level))
}
export function aiRoleReadAllowed(level:number,plan:Plan){return plan.kind!=='read'||Boolean(aiRolePolicy(level)?.entities.includes(plan.entity??''))}
