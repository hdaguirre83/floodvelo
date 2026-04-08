import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qfobadmakzahoejydsdy.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmb2JhZG1ha3phaG9lanlkc2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDAxMTQsImV4cCI6MjA5MDY3NjExNH0.kjNDzBjLgAPYum9M150i0my_LrxtU7JQGuAWZF8E5Zc' // ⚠️ Reemplazá con tu clave real

export const supabase = createClient(supabaseUrl, supabaseAnonKey)