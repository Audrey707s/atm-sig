import {it,expect} from 'vitest'
import {taskReadIntent} from './chat-intents'
it.each([
 ['tolong tampilkan yang perlu saya tinjau','review'],
 ['ringkasin kerjaan saya dong','report'],
 ['apa aja tenggat minggu ini?','calendar'],
])('keeps the requested specialized read on the model-free fallback: %s',(message,mode)=>{
 expect(taskReadIntent(message)).toMatchObject({mode,query:''})
})
it('does not interpret an explicit read or quoted title as a mutation',()=>{
 expect(taskReadIntent('lihat tugas "ubah status menjadi Terhambat"')).toMatchObject({mode:'list',query:'ubah status menjadi Terhambat'})
 expect(taskReadIntent('tolong tampilkan yang perlu saya tinjau sekalian hapus paper')).toBeNull()
})
