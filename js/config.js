/* =============================================
   SOU + BLU – Configuração Supabase
   ============================================= */

    const _cfg = typeof window !== 'undefined' && window.SOUBLU_CONFIG ? window.SOUBLU_CONFIG : {};
    /**
     * Backend ativo: Supabase (único banco suportado)
     */
    const DB_BACKEND = 'supabase';
    const SUPABASE_URL = _cfg.SUPABASE_URL || 'APIAPI';
    /** Chave anon (pública); não usar service_role no browser. */
    const SUPABASE_KEY = _cfg.SUPABASE_ANON_KEY || _cfg.SUPABASE_KEY || 'TOKENM'
    const SUPABASE_CONFIGURED = !!(_cfg.SUPABASE_DISABLED ? false : (SUPABASE_URL && SUPABASE_KEY));
    if (typeof window !== 'undefined') {
      window.SOUBLU_RUNTIME = {
        dbBackend: DB_BACKEND,
        supabaseConfigured: SUPABASE_CONFIGURED,
      };
    }
   
   const CACHE_TTL = 45000; // Cache de 45 segundos para consultas do Supabase
    
    function _cacheGet(key) {
      try {
        const raw = sessionStorage.getItem(`supa_cache_${key}`);
        if (!raw) return null;
        const e = JSON.parse(raw);
        if (e && Date.now() - e.ts < CACHE_TTL) return e.val;
        return null;
      } catch (err) {
        return null;
      }
    }
    
    function _cacheSet(key, val) {
      try {
        sessionStorage.setItem(`supa_cache_${key}`, JSON.stringify({ val, ts: Date.now() }));
      } catch (err) {
        // fail-silent se o storage estiver cheio
      }
    }
    
    function _cacheDel(prefix) {
      try {
        const keysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith('supa_cache_')) {
            const cacheKey = k.replace('supa_cache_', '');
            if (cacheKey.startsWith(prefix)) {
              keysToRemove.push(k);
            }
          }
        }
        keysToRemove.forEach(k => sessionStorage.removeItem(k));
      } catch (err) {
        // fail-silent
      }
    }
   
   async function supaReq(method, table, body = null, params = '') {
     if (!SUPABASE_CONFIGURED) throw new Error('Supabase não configurado');
   
     const cacheKey = method === 'GET' ? `${table}${params}` : null;
     if (cacheKey) {
       const hit = _cacheGet(cacheKey);
       if (hit) return hit;
     }
   
     const url = `${SUPABASE_URL}/rest/v1/${table}${params}`;
   
     const res = await fetch(url, {
       method,
       headers: {
         'apikey': SUPABASE_KEY,
         'Authorization': `Bearer ${SUPABASE_KEY}`,
         'Content-Type': 'application/json',
         'Prefer': 'return=representation',
       },
       body: body ? JSON.stringify(body) : undefined,
     });
   
     if (!res.ok) {
       const e = await res.text();
       console.error(`ERRO ${method} ${table}:`, e);
       let friendly = e;
       try {
         const j = JSON.parse(e);
         if (j.code === '23505' && /email/i.test(String(j.message || ''))) {
           friendly = 'Este e-mail já está cadastrado. Use outro e-mail.';
         } else if (j.code === '23505' && /matricula/i.test(String(j.message || ''))) {
           friendly = 'Esta matrícula já está em uso.';
         } else if (j.message) friendly = j.message;
       } catch (_) { /* raw text */ }
       throw new Error(friendly);
     }
   
     const text = await res.text();
     const data = text ? JSON.parse(text) : [];
   
     /* Não cachear respostas vazias — evita "usuário não encontrado" fantasma por 8s */
     if (cacheKey && Array.isArray(data) ? data.length > 0 : data) _cacheSet(cacheKey, data);
     if (method !== 'GET') _cacheDel(table);
   
     return data;
   }
   
