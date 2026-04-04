import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = "https://qfobadmakzahoejydsdy.supabase.co"
const SUPABASE_KEY = "sb_publishable_S0V-8iTwWAY5xydsj2CFDQ_tJ2d9ubF"

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)