/* =============================================
   SOU + BLU – Database v3
   Supabase (online) com fallback localStorage
   Master vê TUDO; Admin vê só sua equipe
   ============================================= */

   const DB = {
    get online() { return SUPABASE_CONFIGURED; },
    LK: {
      users:'soublu_users', products:'soublu_products',
      transactions:'soublu_transactions', orders:'soublu_orders', withdrawals:'soublu_withdrawals',
      clients:'soublu_clients', proposals:'soublu_proposals', tickets:'soublu_tickets',
      meetings:'soublu_meetings', partners:'soublu_partners',
    },
    _genId(p='x') { return p+Date.now().toString(36)+Math.random().toString(36).slice(2,7); },
    _lget(k)      { try{return JSON.parse(localStorage.getItem(k)||'[]');}catch{return[];} },
    _lset(k,d)    { localStorage.setItem(k,JSON.stringify(d)); },

    normalizeEmail(email) {
      return String(email || '').trim().toLowerCase();
    },

    formatUserDbError(err) {
      const msg = String(err?.message || err || '');
      if (/23505/.test(msg) && /users_email|email/i.test(msg)) {
        return 'Este e-mail já está cadastrado. Use outro e-mail ou edite o usuário existente.';
      }
      if (/23505/.test(msg) && /matricula/i.test(msg)) {
        return 'Esta matrícula já está em uso. Informe outra matrícula.';
      }
      if (/23505/.test(msg)) return 'Já existe um cadastro com estes dados. Verifique e-mail e matrícula.';
      return msg.replace(/^POST users:\s*/i, '').replace(/^PATCH users:\s*/i, '') || 'Não foi possível salvar.';
    },

    async isEmailTaken(email, excludeUserId = null) {
      const em = this.normalizeEmail(email);
      if (!em) return false;
      const found = await this.getUserByEmail(em);
      if (!found) return false;
      if (excludeUserId && String(found.id) === String(excludeUserId)) return false;
      return true;
    },
  
    async init() {
      if (this.online) {
        await this._ensureOnlineUsersOnce();
        return;
      }

      const SEED_VERSION = 'v22';
      const storedVersion = localStorage.getItem('soublu_seed_version');
      if (storedVersion !== SEED_VERSION) {
        console.log('[DB] Seed offline (localStorage)');
        localStorage.setItem('soublu_seed_version', SEED_VERSION);
        this._lset(this.LK.users, this._seedUsers());
        this._lset(this.LK.products, this._seedProducts());
        this._lset(this.LK.transactions, this._seedTransactions());
        this._lset(this.LK.orders, []);
        this._lset(this.LK.withdrawals, []);
        this._lset(this.LK.clients, this._seedClients());
        this._lset(this.LK.proposals, []);
        this._lset(this.LK.tickets, []);
      }
    },

    /** Só popula usuários demo quando o Supabase está vazio — nunca re-insere após exclusão. */
    async _ensureOnlineUsersOnce() {
      const flag = localStorage.getItem('soublu_supabase_seeded');
      if (flag === '1') return;
      try {
        const existing = await supaReq('GET', 'users', null, '?select=id&limit=1');
        if (existing && existing.length > 0) {
          localStorage.setItem('soublu_supabase_seeded', '1');
          return;
        }
        console.log('[DB] Banco vazio — seed inicial (uma vez)');
        await this._seedOnline();
        localStorage.setItem('soublu_supabase_seeded', '1');
      } catch (e) {
        console.warn('[DB] Não foi possível verificar usuários:', e);
      }
    },

    async _seedOnline() {
      try {
        const users = this._seedUsers();
        for (const u of users) {
          try {
            const exists = await supaReq('GET', 'users', null, `?id=eq.${encodeURIComponent(u.id)}&select=id&limit=1`);
            if (exists && exists.length) continue;
            await supaReq('POST', 'users', u);
          } catch (e) {
            console.warn('[DB] seed user', u.id, e.message || e);
          }
        }
        console.log('[DB] Seed inicial concluído');
      } catch (e) {
        console.warn('[DB] Erro ao inserir seed:', e);
      }
    },
  
    /* ══ USERS ══ */
    async getUsers() {
      if (this.online) return await supaReq('GET','users',null,'?select=*&order=name.asc');
      return this._lget(this.LK.users);
    },
  
    async getAdmins() {
      const adminRoles = ['master','fundador','desenvolvedor','gerente','financeiro','financial','supervisor','sup_backoffice','rh','gerencia','operacional','juridico','diretoria','backoffice','ouvidoria','admin'];
      if (this.online) return await supaReq('GET','users',null,`?role=in.(${adminRoles.join(',')})&select=*&order=name.asc`);
      return this._lget(this.LK.users).filter(u => adminRoles.includes(u.role));
    },
  
    async getUser(id) {
      if (this.online) { const r=await supaReq('GET','users',null,`?id=eq.${id}&select=*&limit=1`); return r[0]||null; }
      return this._lget(this.LK.users).find(u=>u.id===id)||null;
    },
  
    async getUserByEmail(email) {
      const em = (email || '').trim().toLowerCase();
      if (!em) return null;
      if (this.online) {
        try {
          const rows = await supaReq('GET', 'users', null,
            `?email=ilike.${encodeURIComponent(em)}&select=*&limit=20`);
          const matches = (rows || []).filter(u =>
            (u.email || '').trim().toLowerCase() === em
          );
          if (matches.length) return this._pickPreferredEmailUser(matches);
        } catch (e) {
          console.warn('[DB] getUserByEmail:', e);
        }
        return this._findUserInList(u => (u.email || '').trim().toLowerCase() === em);
      }
      const local = this._lget(this.LK.users).filter(u =>
        (u.email || '').trim().toLowerCase() === em
      );
      return local.length ? this._pickPreferredEmailUser(local) : null;
    },

    /** Em e-mails duplicados (caixa alta/baixa), prioriza parceiro ativo da rede. */
    _pickPreferredEmailUser(users) {
      const list = users || [];
      if (!list.length) return null;
      const score = (u) => {
        let s = 0;
        if (u.active !== false) s += 4;
        const role = String(u.role || '').trim().toLowerCase();
        if (role === 'parceiro') s += 8;
        if (this.PARTNER_TEAM_ROLES.includes(role)) s += 2;
        return s;
      };
      return list.slice().sort((a, b) => score(b) - score(a))[0];
    },
  
    async getUserByMatricula(mat) {
      const m = (mat || '').trim();
      if (!m) return null;
      if (this.online) {
        try {
          for (const op of ['eq', 'ilike']) {
            const r = await supaReq('GET', 'users', null, `?matricula=${op}.${encodeURIComponent(m)}&select=*&limit=1`);
            if (r[0]) return r[0];
          }
        } catch (e) {
          console.warn('[DB] getUserByMatricula:', e);
        }
        const low = m.toLowerCase();
        return this._findUserInList(u => (u.matricula || '').trim().toLowerCase() === low);
      }
      const low = m.toLowerCase();
      return this._lget(this.LK.users).find(u => (u.matricula || '').trim().toLowerCase() === low) || null;
    },
  
    async findUserByIdentifier(identifier) {
      const id = (identifier || '').trim();
      if (!id) return null;
      if (id.includes('@')) {
        const byEmail = await this.getUserByEmail(id);
        if (byEmail) return byEmail;
      }
      const byMat = await this.getUserByMatricula(id);
      if (byMat) return byMat;
      if (!id.includes('@')) {
        const byEmail = await this.getUserByEmail(id);
        if (byEmail) return byEmail;
      }
      const low = id.toLowerCase();
      return this._findUserInList(u =>
        (u.email || '').trim().toLowerCase() === low ||
        (u.matricula || '').trim().toLowerCase() === low
      );
    },
  
    async _findUserInList(matchFn) {
      try {
        const all = this.online ? await this.getUsers() : this._lget(this.LK.users);
        return all.find(matchFn) || null;
      } catch {
        return null;
      }
    },
  
    /** Colaboradores da equipe de um parceiro (vendedor, operacional, RH, financeiro, etc.) */
    PARTNER_TEAM_ROLES: ['vendedor', 'backoffice', 'operacional', 'sup_backoffice', 'rh', 'financeiro', 'financial', 'employee'],

    async getPartnerTeamIds(partnerRootId) {
      if (!partnerRootId) return new Set();
      const team = await this.getPartnerTeam(partnerRootId).catch(() => []);
      const ids = new Set([String(partnerRootId)]);
      (team || []).forEach(u => { if (u?.id) ids.add(String(u.id)); });
      return ids;
    },

    async getPartnerTeam(partnerRootId) {
      if (!partnerRootId) return [];
      const roles = this.PARTNER_TEAM_ROLES.join(',');
      if (this.online) {
        return await supaReq('GET', 'users', null,
          `?admin_id=eq.${encodeURIComponent(partnerRootId)}&role=in.(${roles})&select=*&order=name.asc&limit=500`);
      }
      return this._lget(this.LK.users).filter(u =>
        u.admin_id === partnerRootId && this.PARTNER_TEAM_ROLES.includes(u.role)
      );
    },

    /** ID do parceiro dono da equipe (usuário parceiro ou chefe com role parceiro) */
    async getPartnerRootForUser(userId) {
      const u = await this.getUser(userId);
      if (!u) return null;
      if (u.role === 'parceiro') return u.id;
      if (u.admin_id) {
        const boss = await this.getUser(u.admin_id);
        if (boss?.role === 'parceiro') return boss.id;
      }
      return null;
    },

    /* Funcionários de um admin específico (supervisor: vendedores) */
    async getEmployeesByAdmin(adminId) {
      if (this.online) return await supaReq('GET','users',null,`?admin_id=eq.${adminId}&role=in.(employee,vendedor)&select=*&order=name.asc`);
      return this._lget(this.LK.users).filter(u=>(u.role==='employee'||u.role==='vendedor')&&u.admin_id===adminId);
    },

    /** IDs do time de um supervisor/parceiro (consulta leve). */
    async getTeamMemberIds(adminId) {
      if (!adminId) return [];
      if (this.online) {
        try {
          const rows = await supaReq('GET', 'users', null,
            `?admin_id=eq.${encodeURIComponent(adminId)}&select=id&limit=300`);
          return (rows || []).map(r => r.id).filter(Boolean);
        } catch (e) {
          console.warn('[DB] getTeamMemberIds:', e.message);
          return [];
        }
      }
      return this._lget(this.LK.users)
        .filter(u => u.admin_id === adminId)
        .map(u => u.id);
    },
  
    async getEmployeesByDepartment(department) {
      if (this.online) return await supaReq('GET','users',null,`?department=eq.${department}&role=in.(employee,vendedor)&select=*&order=name.asc`);
      return this._lget(this.LK.users).filter(u=>(u.role==='employee'||u.role==='vendedor')&&u.department===department);
    },
  
    /* Todos os funcionários (master) */
    async getAllEmployees() {
      /* Inclui supervisores/sup_backoffice/backoffice/desenvolvedor para listagens admin. */
      if (this.online) {
        return await supaReq('GET','users',null,'?role=in.(employee,vendedor,supervisor,sup_backoffice,backoffice,desenvolvedor)&select=*&order=name.asc&limit=500');
      }
      return this._lget(this.LK.users).filter(u =>
        ['employee','vendedor','supervisor','sup_backoffice','backoffice','desenvolvedor'].includes(u.role)
      );
    },
  
    /** Papéis que podem ser marcados em reunião (gerente para baixo na hierarquia). */
    MEETING_PARTICIPANT_ROLES: [
      'gerente', 'gerencia', 'supervisor', 'sup_backoffice', 'backoffice',
      'vendedor', 'employee', 'operacional', 'juridico', 'ouvidoria', 'admin',
    ],

    /** Colaboradores ativos convocáveis em reunião (gerente ↓; equipe ou todos conforme escopo). */
    async getMeetingParticipants(adminId = null) {
      const roles = this.MEETING_PARTICIPANT_ROLES;
      const cols = 'id,name,email,role,matricula,department,active,admin_id';
      if (this.online) {
        let params = `?role=in.(${roles.join(',')})&active=eq.true&select=${cols}&order=name.asc&limit=500`;
        if (adminId) {
          params = `?admin_id=eq.${encodeURIComponent(adminId)}&role=in.(${roles.join(',')})&active=eq.true&select=${cols}&order=name.asc&limit=500`;
        }
        try {
          return await supaReq('GET', 'users', null, params);
        } catch (e) {
          console.warn('[DB] getMeetingParticipants:', e);
          return [];
        }
      }
      const all = this._lget(this.LK.users);
      return all.filter(u =>
        roles.includes(u.role) &&
        u.active !== false &&
        (!adminId || u.admin_id === adminId)
      );
    },

    /** @deprecated use getMeetingParticipants */
    async getMeetingVendors(adminId = null) {
      return this.getMeetingParticipants(adminId);
    },

    /** Lista leve de vendedores para selects (evita timeout em GET users completo) */
    async getVendorsForSelect(adminId = null) {
      const cols = 'id,name,email,role,active';
      if (this.online) {
        let params = `?role=in.(employee,vendedor)&active=eq.true&select=${cols}&order=name.asc&limit=500`;
        if (adminId) {
          params = `?admin_id=eq.${encodeURIComponent(adminId)}&role=in.(employee,vendedor)&active=eq.true&select=${cols}&order=name.asc&limit=500`;
        }
        try {
          return await supaReq('GET', 'users', null, params);
        } catch (e) {
          console.warn('[DB] getVendorsForSelect:', e);
          return [];
        }
      }
      const all = this._lget(this.LK.users);
      return all.filter(u =>
        (u.role === 'employee' || u.role === 'vendedor') &&
        u.active !== false &&
        (!adminId || u.admin_id === adminId)
      );
    },
  
    /* Todos os usuários sem filtro (master panel) */
    async getAllUsers() {
      if (this.online) {
        return await supaReq('GET','users',null,'?select=id,name,email,role,matricula,department,admin_id,balance,points,active,photo_url,show_points,created_at&order=name.asc&limit=1000');
      }
      return this._lget(this.LK.users);
    },
  
    async addUser(data) {
      const email = this.normalizeEmail(data.email);
      if (!email) throw new Error('E-mail obrigatório.');
      if (await this.isEmailTaken(email)) {
        throw new Error('Este e-mail já está cadastrado. Use outro e-mail ou edite o usuário existente.');
      }
      const matricula = (data.matricula || '').trim() || ('F' + Math.floor(10000 + Math.random() * 90000));
      if (await this.getUserByMatricula(matricula)) {
        throw new Error('Esta matrícula já está em uso. Informe outra matrícula.');
      }
      const user = {
        id:          data.id || this._genId('u'),
        name:        data.name,
        email,
        password:    data.password || '123456',
        matricula,
        department:  data.department || 'Geral',
        role:        data.role || 'employee',
        admin_id:    data.admin_id || null,
        balance:     parseFloat(data.balance) || 0,
        points:      parseInt(data.points) || parseInt(data.balance) || 0,
        photo_url:   data.photo_url || '',
        face_hash:   data.face_hash || '',
        doc_verified: data.doc_verified || false,
        show_points: data.show_points !== undefined ? data.show_points : true,
        active:      true,
        created_at:  new Date().toISOString(),
      };
      try {
        if (this.online) { _cacheDel('users'); const r = await supaReq('POST', 'users', user); return r[0] || user; }
        const list = this._lget(this.LK.users);
        if (list.some(u => this.normalizeEmail(u.email) === email)) {
          throw new Error('Este e-mail já está cadastrado. Use outro e-mail ou edite o usuário existente.');
        }
        list.push(user);
        this._lset(this.LK.users, list);
        return user;
      } catch (e) {
        throw new Error(this.formatUserDbError(e));
      }
    },
  
    async updateUser(id, updates) {
      const patch = { ...updates };
      if (patch.email != null) {
        patch.email = this.normalizeEmail(patch.email);
        if (!patch.email) throw new Error('E-mail obrigatório.');
        if (await this.isEmailTaken(patch.email, id)) {
          throw new Error('Este e-mail já está cadastrado. Use outro e-mail ou edite o usuário existente.');
        }
      }
      if (patch.matricula != null) {
        patch.matricula = String(patch.matricula).trim();
        const other = await this.getUserByMatricula(patch.matricula);
        if (other && String(other.id) !== String(id)) {
          throw new Error('Esta matrícula já está em uso. Informe outra matrícula.');
        }
      }
      try {
        if (this.online) { _cacheDel('users'); const r = await supaReq('PATCH', 'users', patch, `?id=eq.${id}`); return r[0] || null; }
        const list = this._lget(this.LK.users), idx = list.findIndex(u => u.id === id);
        if (idx === -1) return null;
        list[idx] = { ...list[idx], ...patch };
        this._lset(this.LK.users, list);
        return list[idx];
      } catch (e) {
        throw new Error(this.formatUserDbError(e));
      }
    },

    async verifyCurrentPassword(userId, password) {
      const user = await this.getUser(userId);
      return !!(user && user.password === password);
    },

    /* ── PARCEIROS (dados empresa + permissões; login em users.role=parceiro) ── */
    async getPartners() {
      if (this.online) {
        try {
          return await supaReq('GET', 'partners', null, '?select=*&order=razao_social.asc');
        } catch (e) {
          console.warn('[DB] partners online:', e.message);
        }
      }
      return this._lget(this.LK.partners);
    },

    async getPartner(id) {
      if (!id) return null;
      if (this.online) {
        try {
          const r = await supaReq('GET', 'partners', null, `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
          return r[0] || null;
        } catch (e) {
          console.warn('[DB] getPartner:', e.message);
        }
      }
      return this._lget(this.LK.partners).find(p => p.id === id) || null;
    },

    async getPartnerByUserId(userId) {
      if (!userId) return null;
      if (this.online) {
        try {
          const r = await supaReq('GET', 'partners', null, `?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`);
          return r[0] || null;
        } catch (e) {
          console.warn('[DB] getPartnerByUserId:', e.message);
        }
      }
      return this._lget(this.LK.partners).find(p => p.user_id === userId) || null;
    },

    async savePartner(data) {
      const perms = typeof PartnerPerms !== 'undefined'
        ? PartnerPerms.merge(data.permissions)
        : { ...(data.permissions || {}) };
      const row = {
        id: data.id || this._genId('prt'),
        user_id: data.user_id,
        cnpj: (data.cnpj || '').trim(),
        razao_social: (data.razao_social || '').trim(),
        endereco: (data.endereco || '').trim(),
        contato: (data.contato || '').trim(),
        email: (data.email || '').trim(),
        permissions: perms,
        active: data.active !== false,
        created_at: data.created_at || new Date().toISOString(),
      };
      if (this.online) {
        try {
          _cacheDel('partners');
          if (data.id) {
            const r = await supaReq('PATCH', 'partners', row, `?id=eq.${encodeURIComponent(data.id)}`);
            return r[0] || row;
          }
          const r = await supaReq('POST', 'partners', row);
          return r[0] || row;
        } catch (e) {
          console.warn('[DB] savePartner online, usando local:', e.message);
        }
      }
      const list = this._lget(this.LK.partners);
      const idx = list.findIndex(p => p.id === row.id);
      if (idx === -1) list.push(row);
      else list[idx] = { ...list[idx], ...row };
      this._lset(this.LK.partners, list);
      return row;
    },

    async deletePartner(id) {
      if (!id) return false;
      if (this.online) {
        try {
          _cacheDel('partners');
          await supaReq('DELETE', 'partners', null, `?id=eq.${encodeURIComponent(id)}`);
          return true;
        } catch (e) {
          console.warn('[DB] deletePartner:', e.message);
        }
      }
      this._lset(this.LK.partners, this._lget(this.LK.partners).filter(p => p.id !== id));
      return true;
    },
  
    async deleteUser(id) {
      if (!id) throw new Error('ID do usuário inválido');
      if (this.online) {
        _cacheDel('users');
        const eq = encodeURIComponent(id);
        const wipe = async (table, params) => {
          try { await supaReq('DELETE', table, null, params); }
          catch (e) { console.warn(`[DB] deleteUser: limpar ${table}:`, e.message); }
        };
        for (const t of ['transactions', 'orders', 'withdrawals', 'feedbacks', 'proposals', 'tickets']) {
          await wipe(t, `?employee_id=eq.${eq}`);
        }
        await wipe('proposals', `?or=(vendor_id.eq.${eq},vendorId.eq.${eq})`);
        await wipe('clients', `?supervisorId=eq.${eq}`);
        try {
          const prt = await this.getPartnerByUserId(id);
          if (prt?.id) await this.deletePartner(prt.id);
        } catch (_) { /* noop */ }
        await supaReq('DELETE', 'users', null, `?id=eq.${eq}`);
        const still = await supaReq('GET', 'users', null, `?id=eq.${eq}&select=id&limit=1`);
        if (still && still.length) {
          throw new Error('Não foi possível excluir: ainda existem vínculos com este usuário.');
        }
        _cacheDel('users');
        return true;
      }
      this._lset(this.LK.users, this._lget(this.LK.users).filter(u => u.id !== id));
      return true;
    },
  
    _moneyAmt(amount) {
      if (typeof parseMoneyAmount === 'function') return parseMoneyAmount(amount);
      const n = Number(amount);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
    },

    _ptsAmt(amount) {
      const n = Math.floor(Number(amount));
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    },

    _isPartnerWalletUser(emp) {
      if (!emp) return false;
      if (emp.role === 'parceiro') return true;
      const ids = typeof window !== 'undefined' ? window._PARTNER_ROOT_USER_IDS : null;
      return ids && emp.admin_id && ids.has(String(emp.admin_id));
    },

    _walletAmt(amount, emp, forSet) {
      if (this._isPartnerWalletUser(emp)) {
        if (forSet) {
          const n = this._moneyAmt(amount);
          return Number.isFinite(n) ? Math.max(0, n) : NaN;
        }
        const v = this._moneyAmt(amount);
        return Number.isFinite(v) && v > 0 ? v : NaN;
      }
      if (forSet) return this._ptsAmt(amount);
      const n = this._ptsAmt(amount);
      return n > 0 ? n : NaN;
    },

    /* ── SALDO ── */
    async addBalance(empId, amount, reason, byId, meta) {
      const emp=await this.getUser(empId); if(!emp)return null;
      const amt = this._walletAmt(amount, emp, false);
      if (!Number.isFinite(amt) || amt <= 0) return null;
      const current = this._isPartnerWalletUser(emp)
        ? this._moneyAmt(emp.points || emp.balance || 0)
        : this._ptsAmt(emp.points || emp.balance || 0);
      const nb = this._isPartnerWalletUser(emp)
        ? Math.round((current + amt) * 100) / 100
        : current + amt;
      await this.updateUser(empId,{balance:nb, points:nb});
      await this.addTransaction({employee_id:empId,type:'credit',amount:amt,reason,by_user:byId||'admin',meta});
      return nb;
    },
    async deductBalance(empId, amount, reason) {
      const emp=await this.getUser(empId); if(!emp)return null;
      const amt = this._walletAmt(amount, emp, false);
      if (!Number.isFinite(amt) || amt <= 0) return null;
      const money = this._isPartnerWalletUser(emp);
      const current = money
        ? this._moneyAmt(emp.points || emp.balance || 0)
        : this._ptsAmt(emp.points || emp.balance || 0);
      const nb = money
        ? Math.max(0, Math.round((current - amt) * 100) / 100)
        : Math.max(0, current - amt);
      await this.updateUser(empId,{balance:nb, points:nb});
      await this.addTransaction({employee_id:empId,type:'debit',amount:amt,reason,by_user:empId});
      return nb;
    },
    async setBalance(empId, newAmt, reason, byId) {
      const emp=await this.getUser(empId); if(!emp)return null;
      const money = this._isPartnerWalletUser(emp);
      const cur = money
        ? this._moneyAmt(emp.points || emp.balance || 0)
        : this._ptsAmt(emp.points || emp.balance || 0);
      const nb = this._walletAmt(newAmt, emp, true);
      if (!Number.isFinite(nb)) return null;
      const diff = nb - cur;
      await this.updateUser(empId,{balance:nb, points:nb});
      await this.addTransaction({employee_id:empId,type:diff>=0?'credit':'debit',amount:Math.abs(diff),reason,by_user:byId||'admin'});
      return nb;
    },
  
    /* ══ PRODUCTS ══ */
    async getProducts(adminId=null) {
      if (this.online) {
        const q=adminId?`?admin_id=eq.${adminId}&select=*&order=created_at.desc`:'?select=*&order=created_at.desc';
        return await supaReq('GET','products',null,q);
      }
      const all=this._lget(this.LK.products); return adminId?all.filter(p=>p.admin_id===adminId):all;
    },
    /** Catálogo completo (loja do funcionário + painéis globais): todos os produtos, sem filtrar por admin. */
    async getCatalogProducts() {
      return await this.getProducts(null);
    },
    async getProduct(id) {
      if (this.online) { const r=await supaReq('GET','products',null,`?id=eq.${id}&select=*&limit=1`); return r[0]||null; }
      return this._lget(this.LK.products).find(p=>p.id===id)||null;
    },
    async addProduct(data) {
      const prod={id:data.id||this._genId('p'),admin_id:data.admin_id,name:data.name,description:data.description||'',category:data.category||'Geral',price:parseFloat(data.price)||0,stock:parseInt(data.stock)||0,image_url:data.image_url||'',emoji:data.emoji||'🎁',active:true,featured:data.featured||false};
      if (this.online) { _cacheDel('products'); const r=await supaReq('POST','products',prod); return r[0]||prod; }
      const list=this._lget(this.LK.products); list.push(prod); this._lset(this.LK.products,list); return prod;
    },
    async updateProduct(id, updates) {
      if (this.online) { _cacheDel('products'); const r=await supaReq('PATCH','products',updates,`?id=eq.${id}`); return r[0]||null; }
      const list=this._lget(this.LK.products), idx=list.findIndex(p=>p.id===id);
      if(idx===-1)return null; list[idx]={...list[idx],...updates}; this._lset(this.LK.products,list); return list[idx];
    },
    async deleteProduct(id) {
      if (this.online) { _cacheDel('products'); return await supaReq('DELETE','products',null,`?id=eq.${encodeURIComponent(id)}`); }
      this._lset(this.LK.products, this._lget(this.LK.products).filter(p=>p.id!==id));
    },
    async decrementStock(id, qty=1) {
      const p=await this.getProduct(id); if(!p)return null;
      return await this.updateProduct(id,{stock:Math.max(0,p.stock-qty)});
    },
  
    /* ══ TRANSACTIONS ══ */
    async getTransactions(empId=null) {
      if (this.online) {
        const q=empId?`?employee_id=eq.${empId}&select=*&order=created_at.desc`:'?select=*&order=created_at.desc&limit=300';
        return await supaReq('GET','transactions',null,q);
      }
      const all=this._lget(this.LK.transactions);
      return empId?all.filter(t=>t.employee_id===empId).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)):all;
    },
    async getTransactionsByAdmin(adminId) {
      const emps=await this.getEmployeesByAdmin(adminId);
      const ids=new Set(emps.map(e=>e.id));
      if (adminId) ids.add(adminId);
      const all=await this.getTransactions();
      return all.filter(t=>ids.has(t.employee_id));
    },
    async addTransaction(data) {
      const amountVal = this._moneyAmt(data.amount);
      const tx={
        id:this._genId('tx'),
        employee_id:data.employee_id,
        type:data.type,
        amount:Number.isFinite(amountVal) ? amountVal : 0,
        reason:data.reason??'',
        by_user:data.by_user||null,
        created_at:new Date().toISOString(),
      };
      if (data.meta != null && typeof data.meta === 'object' && !Array.isArray(data.meta)) {
        tx.meta = data.meta;
      }
      if (this.online) {
        _cacheDel('transactions');
        try {
          await supaReq('POST','transactions',tx);
        } catch (e) {
          if (tx.meta != null && typeof tx.meta === 'object') {
            const msg = String(e.message || e || '');
            const likelyMissingMeta = /\bmeta\b|could not find|column.*does not|undefined column|PGRST|schema/i.test(msg);
            if (likelyMissingMeta) {
              const tx2 = { ...tx };
              delete tx2.meta;
              await supaReq('POST','transactions',tx2);
              console.warn('[DB] Falha ao gravar campo meta na transação. Aplique migração `transactions.meta` (jsonb) no Supabase. Lançamento salvo sem auditoria estruturada.', msg);
              return tx2;
            }
          }
          throw e;
        }
        return tx;
      }
      const list=this._lget(this.LK.transactions); list.push(tx); this._lset(this.LK.transactions,list); return tx;
    },
  
    /* ══ ORDERS ══ */
    async getOrders(empId=null) {
      if (this.online) {
        const q=empId
          ? `?employee_id=eq.${empId}&select=*&order=created_at.desc`
          : '?select=id,employee_id,status,total_points,total_price,created_at,order_code&order=created_at.desc&limit=300';
        return await supaReq('GET','orders',null,q);
      }
      const all=this._lget(this.LK.orders);
      return empId?all.filter(o=>o.employee_id===empId).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)):all;
    },
    async getOrdersByAdmin(adminId) {
      const emps=await this.getEmployeesByAdmin(adminId);
      const ids=new Set(emps.map(e=>e.id));
      if (adminId) ids.add(adminId);
      const all=await this.getOrders();
      return all.filter(o=>ids.has(o.employee_id));
    },
    /** IDs do time de um departamento (inclui o próprio líder — mesmo vínculo employee_id). */
    async getDepartmentTeamIds(leaderId, department = 'Desenvolvimento') {
      const all = await this.getAllEmployees();
      const ids = new Set();
      if (leaderId) ids.add(leaderId);
      all.filter(e => e.department === department || e.role === 'desenvolvedor')
        .forEach(e => ids.add(e.id));
      return ids;
    },
    async getOrdersByDepartment(leaderId, department = 'Desenvolvimento') {
      const ids = await this.getDepartmentTeamIds(leaderId, department);
      const all = await this.getOrders();
      return all.filter(o => ids.has(o.employee_id));
    },
    async getTransactionsByDepartment(leaderId, department = 'Desenvolvimento') {
      const ids = await this.getDepartmentTeamIds(leaderId, department);
      const all = await this.getTransactions();
      return all.filter(t => ids.has(t.employee_id));
    },
    async placeOrder(empId, items) {
      if (!items?.length) return { ok: false, msg: 'Carrinho vazio.' };

      const total = Math.round(items.reduce((s, i) => s + (i.points_price || i.price || 0) * i.qty, 0));
      if (!Number.isFinite(total) || total <= 0) return { ok: false, msg: 'Valor do pedido inválido.' };

      const emp = await this.getUser(empId);
      const prevPts = Math.round(Number(emp?.points ?? emp?.balance ?? 0));
      if (!emp || prevPts < total) return { ok: false, msg: 'Saldo insuficiente.' };

      for (const item of items) {
        const p = await this.getProduct(item.productId);
        if (!p || p.stock < item.qty) return { ok: false, msg: `Estoque insuficiente: ${item.name}` };
      }

      const orderCode = 'ORD-' + Date.now().toString(36).toUpperCase();
      const primary = items[0];
      const order = {
        id: this._genId('ord'),
        order_code: orderCode,
        employee_id: empId,
        product_id: primary.productId,
        quantity: items.reduce((s, i) => s + (i.qty || 1), 0),
        items,
        total_points: total,
        total_price: total,
        status: 'pendente',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let debited = false;
      const restocked = [];

      try {
        const nb = Math.max(0, prevPts - total);
        await this.updateUser(empId, { points: nb, balance: nb });
        debited = true;
        await this.addTransaction({
          employee_id: empId,
          type: 'debit',
          amount: total,
          reason: `Compra — ${orderCode}`,
          by_user: empId,
          meta: { kind: 'compra_loja', order_code: orderCode, itens: items.length },
        });
        for (const item of items) {
          await this.decrementStock(item.productId, item.qty);
          restocked.push({ productId: item.productId, qty: item.qty });
        }
        if (this.online) {
          _cacheDel('orders');
          await supaReq('POST', 'orders', order);
        } else {
          const list = this._lget(this.LK.orders);
          list.push(order);
          this._lset(this.LK.orders, list);
        }
        return { ok: true, order };
      } catch (e) {
        console.error('[placeOrder]', e);
        if (debited) {
          try {
            await this.updateUser(empId, { points: prevPts, balance: prevPts });
            await this.addTransaction({
              employee_id: empId,
              type: 'credit',
              amount: total,
              reason: `Estorno — falha ao registrar pedido ${orderCode}`,
              by_user: 'sistema',
              meta: { kind: 'estorno_pedido_falha', order_code: orderCode },
            });
          } catch (rollbackErr) {
            console.error('[placeOrder] estorno falhou:', rollbackErr);
          }
        }
        for (const s of restocked) {
          try {
            const p = await this.getProduct(s.productId);
            if (p) await this.updateProduct(s.productId, { stock: (p.stock || 0) + s.qty });
          } catch (_) { /* noop */ }
        }
        const raw = String(e.message || e || '');
        if (/product_id|null value|violates not-null|PGRST/i.test(raw)) {
          return { ok: false, msg: 'Erro ao registrar pedido no sistema. Tente novamente.' };
        }
        return { ok: false, msg: 'Não foi possível finalizar a compra. Tente novamente.' };
      }
    },
    async updateOrderStatus(id, status) {
      if(this.online){_cacheDel('orders');const r=await supaReq('PATCH','orders',{status},`?id=eq.${id}`);return r[0]||null;}
      const list=this._lget(this.LK.orders),idx=list.findIndex(o=>o.id===id);
      if(idx===-1)return null;list[idx].status=status;this._lset(this.LK.orders,list);return list[idx];
    },
    async deleteOrder(id) {
      if(this.online){_cacheDel('orders');return await supaReq('DELETE','orders',null,`?id=eq.${id}`);}
      this._lset(this.LK.orders, this._lget(this.LK.orders).filter(o=>o.id!==id));
    },
  
    /* ══ WITHDRAWALS ══ */
    async getWithdrawals(empId=null) {
      if(this.online){const q=empId?`?employee_id=eq.${empId}&select=*&order=created_at.desc`:'?select=*&order=created_at.desc';return await supaReq('GET','withdrawals',null,q);}
      const all=this._lget(this.LK.withdrawals);return empId?all.filter(w=>w.employee_id===empId):all;
    },
    async getWithdrawalsByAdmin(adminId) {
      const emps=await this.getEmployeesByAdmin(adminId);
      const ids=new Set(emps.map(e=>e.id));
      const all=await this.getWithdrawals();
      return all.filter(w=>ids.has(w.employee_id));
    },
    async requestWithdrawal(empId, amount, pixData) {
      const emp=await this.getUser(empId);
      if(!emp)return{ok:false,msg:'Funcionário não encontrado.'};
      const money = this._isPartnerWalletUser(emp);
      const amt = this._walletAmt(amount, emp, false);
      if(!Number.isFinite(amt) || amt<=0)return{ok:false,msg:'Valor inválido.'};
      const _bal = typeof userWalletBalance === 'function'
        ? userWalletBalance(emp)
        : (money ? this._moneyAmt(emp.points || emp.balance || 0) : this._ptsAmt(emp.points || emp.balance || 0));
      const tol = money ? 0.001 : 0;
      if (_bal < amt - tol) {
        const lbl = typeof formatCurrency === 'function' ? formatCurrency(_bal, emp) : String(_bal);
        return { ok:false, msg:`Saldo insuficiente. Você tem ${lbl}.` };
      }
      if(!pixData?.pix_key)return{ok:false,msg:'Dados PIX obrigatórios.'};
      const pixType = String(pixData.pix_key_type || 'cpf').toLowerCase();
      const reason = `Saque PIX — ${pixType.toUpperCase()} ${pixData.pix_key}`;
      await this.deductBalance(empId, amt, reason);
      const wd={
        id:this._genId('wdw'),
        employee_id:empId,
        amount:amt,
        method:'pix',
        pix_key_type:pixType,
        pix_key:pixData.pix_key,
        holder_name:pixData.holder_name,
        bank_name:pixData.bank_name||'',
        status:'solicitado',
        approved_by_master:false,
        approved_by_financial:false,
        master_approved_at:null,
        financial_approved_at:null,
        admin_note:'',
        notes:'',
        created_at:new Date().toISOString(),
      };
      try {
        if(this.online){_cacheDel('withdrawals');await supaReq('POST','withdrawals',wd);}
        else{const list=this._lget(this.LK.withdrawals);list.push(wd);this._lset(this.LK.withdrawals,list);}
        return{ok:true,withdrawal:wd};
      } catch (e) {
        console.error('[requestWithdrawal]', e);
        try {
          await this.addBalance(empId, amt, 'Estorno — falha ao registrar saque', 'sistema', { kind:'estorno_saque_falha' });
        } catch (rollbackErr) {
          console.error('[requestWithdrawal] estorno falhou:', rollbackErr);
        }
        const raw = String(e.message || e || '');
        let msg = 'Não foi possível registrar o saque. Tente novamente.';
        if (/method/i.test(raw)) msg = 'Erro de configuração do saque (método PIX). Avise o administrador.';
        else if (/null value|violates not-null/i.test(raw)) msg = 'Dados incompletos para o saque. Avise o administrador.';
        else if (/permission|policy|RLS|401|403/i.test(raw)) msg = 'Sem permissão para registrar saque. Avise o administrador.';
        return { ok:false, msg };
      }
    },
    async updateWithdrawalStatus(id, status, adminNote='') {
      return this._patchWd(id, { status, admin_note: adminNote, processed_at: new Date().toISOString() });
    },
  
    async _pixRemoteFetch(mode, body) {
      const cfg = window.SOUBLU_CONFIG || {};
      const gw = String(cfg.PIX_GATEWAY_URL || '').trim().replace(/\/+$/, '');
      const bearer = String(cfg.PIX_GATEWAY_BEARER || '').trim();
      const phpUrl = String(cfg.PIX_PHP_PAY_URL || '').trim();
      const pixToken = String(cfg.PIX_INTERNAL_TOKEN || '').trim();

      const parseRes = async function (res) {
        const txt = await res.text();
        let data = {};
        try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }
        const ok = res.ok && (data.ok !== false);
        return { ok, error: data.error, ...data };
      };

      if (gw && bearer) {
        const path = mode === 'status' ? '/internal/payout/status' : '/internal/payout';
        try {
          return await parseRes(await fetch(`${gw}${path}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${bearer}`,
            },
            body: JSON.stringify(body),
          }));
        } catch (e) {
          return { ok: false, error: (e && e.message) ? e.message : String(e) };
        }
      }

      /* Hostinger / PHP only: chama api/pix_api.php direto (sem Node gateway). */
      if (phpUrl && pixToken) {
        const sep = phpUrl.indexOf('?') >= 0 ? '&' : '?';
        const action = mode === 'status' ? 'status' : 'pay';
        try {
          return await parseRes(await fetch(`${phpUrl}${sep}action=${action}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-PIX-Token': pixToken,
            },
            body: JSON.stringify(body),
          }));
        } catch (e) {
          return { ok: false, error: (e && e.message) ? e.message : String(e) };
        }
      }

      return { skipped: true, reason: 'pix_not_configured' };
    },

    /** @deprecated alias interno */
    async _pixGatewayFetch(path, body) {
      const mode = String(path || '').indexOf('status') >= 0 ? 'status' : 'pay';
      return this._pixRemoteFetch(mode, body);
    },

    /** Dispara payout PIX (gateway Node ou PHP direto) após dupla aprovação. */
    async _maybeTriggerPixGateway(wd) {
      if (!wd?.id || typeof window === 'undefined') return null;
      if (!(wd.approved_by_master && wd.approved_by_financial)) return null;
      if (typeof window.PIX_AUTO_ON_APPROVAL !== 'undefined' && !window.PIX_AUTO_ON_APPROVAL) {
        return { skipped: true, reason: 'PIX_AUTO_OFF' };
      }
      return this._pixRemoteFetch('pay', { withdrawal_id: wd.id });
    },

    /** Consulta status PIX na Efi via gateway ou PHP action=status. */
    async refreshWithdrawalPixStatus(id) {
      _cacheDel('withdrawals');
      return this._pixRemoteFetch('status', { withdrawal_id: id });
    },

    async _finalizeWithdrawalApproval(patchPromise) {
      const row = await patchPromise;
      if (!row) return null;
      if (!(row.approved_by_master && row.approved_by_financial)) return row;
      try {
        const pixResult = await this._maybeTriggerPixGateway(row);
        if (pixResult == null || (pixResult.skipped && (pixResult.reason === 'gateway_not_configured' || pixResult.reason === 'pix_not_configured'))) return row;
        return { ...row, _pixResult: pixResult };
      } catch (e) {
        console.warn('[DB] Falha ao disparar PIX após aprovação:', e);
        return { ...row, _pixResult: { ok: false, error: (e && e.message) ? e.message : String(e) } };
      }
    },

    /* Aprovação pelo Master */
    async approveWdMaster(id, note='') {
      const wd = await this._getWd(id); if(!wd) return null;
      const bothApproved = wd.approved_by_financial;
      const newStatus = bothApproved ? 'pago' : 'aprovado_master';
      const upd = {
        approved_by_master: true,
        master_approved_at: new Date().toISOString(),
        status: newStatus,
        admin_note: note,
        ...(bothApproved ? {processed_at: new Date().toISOString()} : {}),
      };
      return this._finalizeWithdrawalApproval(this._patchWd(id, upd));
    },
  
    /* Aprovação pelo Financeiro */
    async approveWdFinancial(id, note='') {
      const wd = await this._getWd(id); if(!wd) return null;
      const bothApproved = wd.approved_by_master;
      const newStatus = bothApproved ? 'pago' : 'aprovado_financeiro';
      const upd = {
        approved_by_financial: true,
        financial_approved_at: new Date().toISOString(),
        status: newStatus,
        admin_note: note,
        ...(bothApproved ? {processed_at: new Date().toISOString()} : {}),
      };
      return this._finalizeWithdrawalApproval(this._patchWd(id, upd));
    },
  
    async rejectWd(id, note='') {
      // Buscar o saque para devolver os pontos ao funcionário
      const wd = await this._getWd(id);
      if (wd && wd.employee_id && wd.amount && wd.status !== 'rejeitado' && wd.status !== 'pago') {
        const estorno = Math.round(Number(wd.amount || 0) * 100) / 100;
        await this.addBalance(wd.employee_id, estorno, `Estorno de saque rejeitado`, 'sistema', { kind:'estorno_saque_rejeitado', withdrawal_id: wd.id||null });
      }
      return this._patchWd(id, {status:'rejeitado', admin_note:note, processed_at:new Date().toISOString()});
    },

    async markWdPaid(id, note='') {
      return this._patchWd(id, {
        status: 'pago',
        admin_note: note,
        processed_at: new Date().toISOString(),
      });
    },
  
    /* Verifica se é o primeiro saque do funcionário */
    async isFirstWithdrawal(empId) {
      const wds = await this.getWithdrawals(empId);
      return wds.length === 0;
    },

    async getWithdrawalById(id) {
      return this._getWd(id);
    },
  
    async _getWd(id) {
      if(this.online){const r=await supaReq('GET','withdrawals',null,`?id=eq.${id}&select=*&limit=1`);return r[0]||null;}
      return this._lget(this.LK.withdrawals).find(w=>w.id===id)||null;
    },
    async _patchWd(id, upd) {
      const applyLocal = (payload) => {
        const list = this._lget(this.LK.withdrawals);
        const idx = list.findIndex(w => w.id === id);
        if (idx === -1) return null;
        list[idx] = { ...list[idx], ...payload };
        this._lset(this.LK.withdrawals, list);
        return list[idx];
      };

      const patchOnline = async (payload) => {
        _cacheDel('withdrawals');
        const r = await supaReq('PATCH', 'withdrawals', payload, `?id=eq.${id}`);
        return r[0] || null;
      };

      if (!this.online) return applyLocal(upd);

      try {
        return await patchOnline(upd);
      } catch (e) {
        const msg = String(e.message || e || '');
        const missingCol = /could not find|PGRST204|column.*does not/i.test(msg);
        if (missingCol && upd.processed_at) {
          const { processed_at, ...rest } = upd;
          console.warn('[DB] withdrawals.processed_at ausente — PATCH sem esse campo.', msg);
          return await patchOnline(rest);
        }
        throw e;
      }
    },
  
    /* ══ CLIENTS ══ */
    _CLIENTS_LIST_COLS: 'id,cpf,name,phone1,phone2,email,rg,supervisorId,supervisor_id,civilState,address,created_at,updatedAt,updated_at',

    async getClients(opts = {}) {
      const limit = opts.pageSize ? Math.min(Number(opts.pageSize) || 500, 800) : 500;
      const cols = opts.full ? '*' : this._CLIENTS_LIST_COLS;
      let ids = Array.isArray(opts.supervisorIds)
        ? opts.supervisorIds.filter(Boolean).map(String).slice(0, 60)
        : [];
      if (opts.partnerRootId && !ids.length) {
        const teamSet = await this.getPartnerTeamIds(opts.partnerRootId);
        ids = [...teamSet].slice(0, 60);
      }
      let list;
      if (this.online) {
        try {
          let params;
          if (opts.supervisorId) {
            params = `?supervisorId=eq.${encodeURIComponent(opts.supervisorId)}&select=${cols}&order=created_at.desc&limit=${limit}`;
          } else if (ids.length) {
            const inList = ids.map(encodeURIComponent).join(',');
            params = `?supervisorId=in.(${inList})&select=${cols}&order=created_at.desc&limit=${limit}`;
          } else {
            params = `?select=${cols}&order=created_at.desc&limit=${limit}`;
          }
          list = await supaReq('GET', 'clients', null, params);
        } catch (e) {
          const msg = String(e.message || e || '');
          if (ids.length && /supervisorId|column|PGRST/i.test(msg)) {
            try {
              list = await supaReq('GET', 'clients', null, `?select=${cols}&order=created_at.desc&limit=${limit}`);
            } catch (e2) {
              console.warn('[DB] getClients fallback:', e2.message);
              list = this._lget(this.LK.clients);
            }
          } else {
            console.warn('[DB] Erro ao buscar clientes no Supabase, usando local:', msg);
            list = this._lget(this.LK.clients);
          }
        }
      } else {
        list = this._lget(this.LK.clients);
      }
      if (!Array.isArray(list)) list = [];
      if (opts.supervisorId) {
        const sid = String(opts.supervisorId);
        list = list.filter(c => String(c.supervisorId || c.supervisor_id || '') === sid);
      }
      if (ids.length && (!this.online || list.length > limit)) {
        const set = new Set(ids);
        list = list.filter(c => set.has(String(c.supervisorId || c.supervisor_id || '')));
      }
      if (limit) list = list.slice(0, limit);
      return list;
    },
    async getClientByCpf(cpf) {
      if(this.online){
        try {
          const r=await supaReq('GET','clients',null,`?cpf=eq.${cpf}&select=*&limit=1`);
          return r[0]||null;
        } catch (e) {
          console.warn('[DB] Erro ao buscar cliente por CPF no Supabase, usando local:', e.message);
        }
      }
      return this._lget(this.LK.clients).find(c=>c.cpf===cpf)||null;
    },
    async addClient(data) {
      const client = { id: this._genId('cli'), ...data, created_at: new Date().toISOString() };
      if(this.online){_cacheDel('clients');await supaReq('POST','clients',client);}
      else{const list=this._lget(this.LK.clients);list.push(client);this._lset(this.LK.clients,list);}
      return client;
    },
    async updateClient(id, updates) {
      if(this.online){_cacheDel('clients');const r=await supaReq('PATCH','clients',updates,`?id=eq.${id}`);return r[0]||null;}
      const list=this._lget(this.LK.clients),idx=list.findIndex(c=>c.id===id);
      if(idx===-1)return null;list[idx]={...list[idx],...updates};this._lset(this.LK.clients,list);return list[idx];
    },
  
    /* Colunas leves — evita timeout ao buscar attachments/history em massa */
    _PROPOSALS_LIST_COLS: 'id,numero,vendorId,vendor_id,vendorName,vendor_name,clientName,client_name,clientCpf,client_cpf,product,convenio,entidade,valor,valorFinal,valor_final,status,statusOp,status_op,matricula,protocolo,createdAt,created_at,employee_id',
  
    _proposalsListQuery(extra = '') {
      return `?select=${this._PROPOSALS_LIST_COLS}&order=created_at.desc&limit=500${extra}`;
    },
  
    _normVendorName(n) {
      return String(n || '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    },

    _proposalVendorIds(p) {
      const o = p || {};
      return [o.employee_id, o.vendorId, o.vendor_id]
        .map(v => String(v || '').trim())
        .filter(Boolean);
    },
  
    _matchProposalToVendor(p, user) {
      if (!p || !user || !user.id) return false;
      const uid = String(user.id).trim();
      if (this._proposalVendorIds(p).some(vid => vid === uid)) return true;
      if (user.name) {
        const vn = this._normVendorName(p.vendorName || p.vendor_name);
        const un = this._normVendorName(user.name);
        if (vn && un && vn === un) return true;
      }
      return false;
    },
  
    async _getVendorClientCpfs(userId) {
      if (!userId) return new Set();
      try {
        if (this.online) {
          const rows = await supaReq('GET', 'clients', null, `?supervisorId=eq.${encodeURIComponent(userId)}&select=cpf,id`);
          return new Set((rows || []).map(c => String(c.cpf || c.id || '').replace(/\D/g, '')).filter(Boolean));
        }
        return new Set(
          this._lget(this.LK.clients)
            .filter(c => String(c.supervisorId || '') === String(userId))
            .map(c => String(c.cpf || c.id || '').replace(/\D/g, ''))
            .filter(Boolean)
        );
      } catch (e) {
        console.warn('[DB] _getVendorClientCpfs:', e.message);
        return new Set();
      }
    },
  
    /* ══ PROPOSALS ══ */
    async getProposals(empId = null, user = null, opts = {}) {
      const vendor = user || (empId ? { id: empId } : null);
      const uid = (vendor && vendor.id) ? vendor.id : empId;
      const partnerRootId = opts.partnerRootId || null;

      if (this.online) {
        if (!uid && partnerRootId) {
          const teamIds = await this.getPartnerTeamIds(partnerRootId);
          const all = await supaReq('GET', 'proposals', null, this._proposalsListQuery()).catch(() => []);
          return (all || []).filter(p => {
            const vids = this._proposalVendorIds(p);
            return vids.some(id => id && teamIds.has(String(id)));
          }).sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));
        }
        if (!uid) {
          return await supaReq('GET', 'proposals', null, this._proposalsListQuery());
        }
  
        const seen = new Set();
        const rows = [];
        const push = (list) => {
          for (const p of list || []) {
            if (!p || !p.id || seen.has(p.id)) continue;
            seen.add(p.id);
            rows.push(p);
          }
        };
  
        const base = this._proposalsListQuery();
        for (const col of ['employee_id', 'vendorId', 'vendor_id']) {
          try {
            const part = await supaReq('GET', 'proposals', null, `${base}&${col}=eq.${encodeURIComponent(uid)}`);
            push(part);
          } catch (e) {
            console.warn(`[DB] getProposals ${col}:`, e.message);
          }
        }
  
        if (rows.length === 0) {
          try {
            const all = await supaReq('GET', 'proposals', null, base);
            push((all || []).filter(p => this._matchProposalToVendor(p, vendor)));
          } catch (e) {
            console.warn('[DB] getProposals name fallback:', e.message);
          }
        }
  
        if (rows.length === 0) {
          const cpfs = await this._getVendorClientCpfs(uid);
          if (cpfs.size) {
            try {
              const all = await supaReq('GET', 'proposals', null, base);
              push((all || []).filter(p => cpfs.has(String(p.clientCpf || p.client_cpf || '').replace(/\D/g, ''))));
            } catch (e) {
              console.warn('[DB] getProposals client fallback:', e.message);
            }
          }
        }
  
        return rows.sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));
      }
  
      const all = this._lget(this.LK.proposals);
      if (!uid) return all;
  
      const cpfs = await this._getVendorClientCpfs(uid);
      return all.filter(p => {
        if (this._matchProposalToVendor(p, vendor)) return true;
        if (!cpfs.size) return false;
        return cpfs.has(String(p.clientCpf || p.client_cpf || '').replace(/\D/g, ''));
      }).sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));
    },
    async addProposal(data) {
      const prop = { id: this._genId('prop'), ...data, created_at: new Date().toISOString() };
      if(this.online){_cacheDel('proposals');await supaReq('POST','proposals',prop);}
      else{const list=this._lget(this.LK.proposals);list.push(prop);this._lset(this.LK.proposals,list);}
      return prop;
    },
    async updateProposal(id, updates) {
      if(this.online){_cacheDel('proposals');const r=await supaReq('PATCH','proposals',updates,`?id=eq.${encodeURIComponent(id)}`);return r[0]||null;}
      const list=this._lget(this.LK.proposals),idx=list.findIndex(p=>p.id===id);
      if(idx===-1)return null;list[idx]={...list[idx],...updates};this._lset(this.LK.proposals,list);return list[idx];
    },

    /** PATCH limpo — evita enviar campos inválidos que quebram status/histórico. */
    async saveProposal(proposal) {
      if (!proposal?.id) throw new Error('ID da proposta é obrigatório.');
      const p = proposal;
      const payload = {
        status: p.status,
        statusOp: p.statusOp ?? p.status_op ?? p.status,
        status_op: p.statusOp ?? p.status_op ?? p.status,
        history: p.history,
        attachments: p.attachments,
        numero: p.numero,
        valor: p.valor,
        desconto: p.desconto,
        valorFinal: p.valorFinal ?? p.valor_final,
        valor_final: p.valorFinal ?? p.valor_final,
        tabela: p.tabela,
        obs: p.obs,
        product: p.product,
        convenio: p.convenio,
        entidade: p.entidade,
        matricula: p.matricula,
        protocolo: p.protocolo,
        senhaContracheque: p.senhaContracheque,
        senhaConsignacao: p.senhaConsignacao,
        senha_contracheque: p.senhaContracheque,
        senha_consignacao: p.senhaConsignacao,
        compraDivida: p.compraDivida,
        compra_divida: p.compraDivida,
        bancoComprado: p.bancoComprado,
        banco_comprado: p.bancoComprado,
        solicitouBoleto: p.solicitouBoleto,
        solicitou_boleto: p.solicitouBoleto,
        dataSolicitacao: p.dataSolicitacao,
        data_solicitacao: p.dataSolicitacao,
        bacen: p.bacen,
        protocoloBacen: p.protocoloBacen,
        protocolo_bacen: p.protocoloBacen,
        dataSolicitacaoBacen: p.dataSolicitacaoBacen,
        data_solicitacao_bacen: p.dataSolicitacaoBacen,
        assinou: p.assinou,
        posVenda: p.posVenda,
        pos_venda: p.posVenda,
        nuvidio: p.nuvidio,
        fases: p.fases,
        employee_id: p.employee_id || p.vendorId || p.vendor_id,
        vendor_id: p.vendor_id || p.vendorId || p.employee_id,
        vendorId: p.vendorId || p.vendor_id || p.employee_id,
        vendorName: p.vendorName || p.vendor_name,
        vendor_name: p.vendorName || p.vendor_name,
      };
      Object.keys(payload).forEach(k => {
        if (payload[k] === undefined) delete payload[k];
      });
      if (this.online) {
        _cacheDel('proposals');
        const r = await supaReq('PATCH', 'proposals', payload, `?id=eq.${encodeURIComponent(p.id)}`);
        return r[0] || null;
      }
      const list = this._lget(this.LK.proposals);
      const idx = list.findIndex(x => x.id === p.id);
      if (idx === -1) return null;
      list[idx] = { ...list[idx], ...payload };
      this._lset(this.LK.proposals, list);
      return list[idx];
    },

    /** Uma proposta completa (select=*) — lista parcial não traz attachments/history. */
    async getProposal(id) {
      if (!id) return null;
      return this.get('proposals', id);
    },

    /** Compatível com Proposals.openAdminModal — anexos vêm da própria linha. */
    async getProposalAttachments(id) {
      const p = await this.getProposal(id);
      if (!p) return null;
      return { attachments: p.attachments };
    },

    async deleteProposal(id) {
      if (!id) return;
      if (this.online) {
        _cacheDel('proposals');
        return await supaReq('DELETE', 'proposals', null, `?id=eq.${encodeURIComponent(id)}`);
      }
      this._lset(this.LK.proposals, this._lget(this.LK.proposals).filter(p => p.id !== id));
    },

    /** Leitura local (FileReader) — usada quando Storage não está disponível. */
    _fileToDataURL(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error || new Error('Não foi possível ler o arquivo.'));
        r.readAsDataURL(file);
      });
    },

    /**
     * Upload de anexo da proposta: tenta bucket Supabase `proposal-attachments` (público);
     * se falhar (bucket inexistente, CORS, file://, etc.), grava data URL na proposta.
     */
    async uploadProposalFile(file, proposalId, grupo) {
      if (!file || !(file instanceof Blob)) {
        throw new Error('Arquivo inválido.');
      }
      const bucket = 'proposal-attachments';
      const safePid = String(proposalId || 'new').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
      const safeGrp = String(grupo || 'doc').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
      const origName = file.name || 'arquivo';
      const extRaw = origName.includes('.') ? origName.split('.').pop() : '';
      const ext = (extRaw && /^[a-zA-Z0-9]+$/.test(extRaw)) ? extRaw.toLowerCase().slice(0, 12) : 'bin';
      const path = `${safePid}/${safeGrp}_${Date.now()}.${ext}`;
      const contentType = file.type || (ext === 'pdf' ? 'application/pdf' : 'application/octet-stream');

      if (this.online && typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_KEY !== 'undefined') {
        try {
          const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': contentType,
              'x-upsert': 'true',
            },
            body: file,
          });
          if (res.ok) {
            return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
          }
          const txt = await res.text().catch(() => '');
          console.warn('[DB] proposal-attachments storage:', res.status, txt);
        } catch (e) {
          console.warn('[DB] uploadProposalFile:', e);
        }
      }
      return this._fileToDataURL(file);
    },
  
    /* ══ TICKETS ══ */
    async getTickets(empId=null, department=null) {
      if(this.online){
        let q = '?select=*&order=created_at.desc';
        if(empId) q = `?employee_id=eq.${empId}&select=*&order=created_at.desc`;
        else if(department) q = `?department=eq.${department}&select=*&order=created_at.desc`;
        return await supaReq('GET','tickets',null,q);
      }
      const all=this._lget(this.LK.tickets);
      if(empId) return all.filter(t=>t.employee_id===empId).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      if(department) return all.filter(t=>t.department===department).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      return all.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    },
    async addTicket(data) {
      const ticket = { id: this._genId('tkt'), ...data, status: 'aberto', created_at: new Date().toISOString() };
      if(this.online){_cacheDel('tickets');await supaReq('POST','tickets',ticket);}
      else{const list=this._lget(this.LK.tickets);list.push(ticket);this._lset(this.LK.tickets,list);}
      return ticket;
    },
    async updateTicket(id, updates) {
      if(this.online){_cacheDel('tickets');const r=await supaReq('PATCH','tickets',updates,`?id=eq.${id}`);return r[0]||null;}
      const list=this._lget(this.LK.tickets),idx=list.findIndex(t=>t.id===id);
      if(idx===-1)return null;list[idx]={...list[idx],...updates};this._lset(this.LK.tickets,list);return list[idx];
    },

    /* ══ MEETINGS (convocações + termo de ciência da ata) ══ */
    _meetingsLS() {
      let list = this._lget(this.LK.meetings);
      if (!Array.isArray(list)) {
        list = [];
        this._lset(this.LK.meetings, list);
      }
      return list;
    },

    _normMeetingRow(row) {
      if (!row || typeof row !== 'object') return row;
      let pids = row.participant_ids;
      if (typeof pids === 'string') {
        try { pids = JSON.parse(pids); } catch { pids = []; }
      }
      if (!Array.isArray(pids)) pids = [];
      let ack = row.acknowledgements;
      if (typeof ack === 'string') {
        try { ack = JSON.parse(ack); } catch { ack = {}; }
      }
      if (!ack || typeof ack !== 'object' || Array.isArray(ack)) ack = {};
      return { ...row, participant_ids: pids.map(String), acknowledgements: ack };
    },

    async getMeeting(id) {
      if (!id) return null;
      if (this.online) {
        try {
          const r = await supaReq('GET', 'meetings', null, `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
          return this._normMeetingRow(r[0]) || null;
        } catch (e) {
          console.warn('[DB] getMeeting:', e.message);
          return null;
        }
      }
      const row = this._meetingsLS().find(m => m.id === id);
      return row ? this._normMeetingRow(row) : null;
    },

    /** Agenda criada pelo gestor (supervisor vê só a própria; perfil master-like vê todas). */
    async listMeetingsForAdmin(adminId, scopeMaster) {
      if (this.online) {
        try {
          const q = scopeMaster
            ? '?select=*&order=scheduled_at.desc&limit=400'
            : `?created_by=eq.${encodeURIComponent(adminId)}&select=*&order=scheduled_at.desc&limit=300`;
          const rows = await supaReq('GET', 'meetings', null, q);
          return (rows || []).map(r => this._normMeetingRow(r));
        } catch (e) {
          console.warn('[DB] listMeetingsForAdmin:', e.message);
          return [];
        }
      }
      let all = this._meetingsLS().map(r => this._normMeetingRow(r));
      if (!scopeMaster) all = all.filter(m => m.created_by === adminId);
      return all.sort((a, b) => new Date(b.scheduled_at || 0) - new Date(a.scheduled_at || 0));
    },

    /** Convocações em que o usuário é participante. */
    async listMeetingsForParticipant(userId) {
      const uid = String(userId || '');
      if (!uid) return [];
      if (this.online) {
        try {
          const rows = await supaReq('GET', 'meetings', null, '?select=*&order=scheduled_at.desc&limit=400');
          return (rows || [])
            .map(r => this._normMeetingRow(r))
            .filter(m => (m.participant_ids || []).map(String).includes(uid));
        } catch (e) {
          console.warn('[DB] listMeetingsForParticipant:', e.message);
          return [];
        }
      }
      return this._meetingsLS()
        .map(r => this._normMeetingRow(r))
        .filter(m => (m.participant_ids || []).map(String).includes(uid))
        .sort((a, b) => new Date(b.scheduled_at || 0) - new Date(a.scheduled_at || 0));
    },

    /** Pendentes de ciência para badge / alerta. */
    async countPendingMeetingInvites(userId) {
      const uid = String(userId || '');
      if (!uid) return 0;
      const list = await this.listMeetingsForParticipant(uid);
      return list.filter(m => !(m.acknowledgements || {})[uid]).length;
    },

    async createMeeting({ subject, scheduled_at, participant_ids, created_by }) {
      const pids = Array.isArray(participant_ids)
        ? [...new Set(participant_ids.map(String).filter(Boolean))]
        : [];
      const row = {
        id: this._genId('mtg'),
        subject: String(subject || '').trim(),
        scheduled_at: scheduled_at ? new Date(scheduled_at).toISOString() : new Date().toISOString(),
        created_by: String(created_by || ''),
        participant_ids: pids,
        acknowledgements: {},
        created_at: new Date().toISOString(),
      };
      if (!row.subject) throw new Error('Informe o assunto da reunião.');
      if (!pids.length) throw new Error('Selecione pelo menos um participante.');
      if (this.online) {
        _cacheDel('meetings');
        await supaReq('POST', 'meetings', row);
        return row;
      }
      const list = this._meetingsLS();
      list.push(row);
      this._lset(this.LK.meetings, list);
      return row;
    },

    async acknowledgeMeeting(meetingId, userId) {
      const uid = String(userId || '');
      const mtg = await this.getMeeting(meetingId);
      if (!mtg) return null;
      const prev = mtg.acknowledgements && typeof mtg.acknowledgements === 'object' ? mtg.acknowledgements : {};
      const acknowledgements = { ...prev, [uid]: new Date().toISOString() };
      if (this.online) {
        _cacheDel('meetings');
        const r = await supaReq('PATCH', 'meetings', { acknowledgements }, `?id=eq.${encodeURIComponent(meetingId)}`);
        return this._normMeetingRow(r[0]) || null;
      }
      const list = this._meetingsLS();
      const idx = list.findIndex(m => m.id === meetingId);
      if (idx === -1) return null;
      list[idx] = { ...list[idx], acknowledgements };
      this._lset(this.LK.meetings, list);
      return this._normMeetingRow(list[idx]);
    },
  
    /* ══ GENERIC METHODS FOR NEW COLLECTIONS (CLIENTS, PROPOSALS) ══ */
    async list(collection) {
      if (this.online) {
        if (collection === 'proposals') {
          try {
            return await supaReq('GET', 'proposals', null, this._proposalsListQuery());
          } catch (e) {
            console.warn('[DB] list(proposals) leve falhou, tentando id only:', e.message);
            const ids = await supaReq('GET', 'proposals', null, '?select=id&order=created_at.desc&limit=500');
            return ids || [];
          }
        }
        return await supaReq('GET', collection, null, '?select=*&order=created_at.desc&limit=500');
      }
      return this._lget(`soublu_${collection}`);
    },
  
    async get(collection, id) {
      if (this.online) {
        const r = await supaReq('GET', collection, null, `?id=eq.${id}&select=*&limit=1`);
        return r[0] || null;
      }
      const data = this._lget(`soublu_${collection}`);
      return data.find(i => i.id === id) || null;
    },
  
    async save(collection, data) {
      if (this.online) {
        _cacheDel(collection);
        const existing = await this.get(collection, data.id);
        if (existing) {
           const r = await supaReq('PATCH', collection, data, `?id=eq.${encodeURIComponent(data.id)}`);
           return r[0] || data;
        } else {
           const r = await supaReq('POST', collection, data);
           return r[0] || data;
        }
      } else {
        const list = this._lget(`soublu_${collection}`);
        const idx = list.findIndex(i => i.id === data.id);
        if (idx > -1) {
          list[idx] = { ...list[idx], ...data };
        } else {
          list.push(data);
        }
        this._lset(`soublu_${collection}`, list);
        return data;
      }
    },

    async delete(collection, id) {
      if (!id) return false;
      if (this.online) {
        _cacheDel(collection);
        await supaReq('DELETE', collection, null, `?id=eq.${encodeURIComponent(id)}`);
        return true;
      }
      const key = this.LK[collection] || `soublu_${collection}`;
      const list = this._lget(key).filter(i => i.id !== id);
      this._lset(key, list);
      return true;
    },
  
    /* ══ SEEDS ══ */
    _seedUsers(){
      return[
        {id:'fund_rodrigo',name:'Rodrigo Orlando',email:'rodrigo.orlando@soublu.com',password:'rodrigo123',matricula:'ROD001',department:'Direção',role:'fundador',admin_id:null,balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'dev_owner',name:'Desenvolvedor',email:'desenvolvedor@soublu.com',password:'dev123456',matricula:'DEV001',department:'Desenvolvimento',role:'desenvolvedor',admin_id:'fund_rodrigo',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'master_sak01',name:'Lucas SAK',email:'lucas@sakpromotora.com.br',password:'master123',matricula:'SAK001',department:'Administracao',role:'master',admin_id:null,balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'ger_sak01',name:'Gerente Geral',email:'gerente@sakpromotora.com.br',password:'gerente123',matricula:'GRN001',department:'Gerência',role:'gerente',admin_id:null,balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'master01',name:'Master SOU+BLU',email:'master@soublu.com',password:'master123',matricula:'MST001',department:'Administração',role:'master',admin_id:null,balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'back01',name:'Backoffice OP',email:'backoffice@empresa.com',password:'123456',matricula:'BCK001',department:'Operacional',role:'backoffice',admin_id:'master01',balance:100,points:100,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'ger01',name:'Gerência Geral',email:'gerencia@empresa.com',password:'123456',matricula:'GER001',department:'Gerência',role:'gerencia',admin_id:'master01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'fin01',name:'Financeiro F',email:'financeiro@empresa.com',password:'123456',matricula:'FIN001',department:'Financeiro',role:'financeiro',admin_id:'master01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'rh01',name:'RH Human',email:'rh@empresa.com',password:'123456',matricula:'RHH001',department:'RH',role:'rh',admin_id:'master01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'oper01',name:'Operacional O',email:'operacional@empresa.com',password:'123456',matricula:'OPR001',department:'Operacional',role:'operacional',admin_id:'master01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'jur01',name:'Jurídico J',email:'juridico@empresa.com',password:'123456',matricula:'JUR001',department:'Jurídico',role:'juridico',admin_id:'master01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'dir01',name:'Diretoria D',email:'diretoria@empresa.com',password:'123456',matricula:'DIR001',department:'Diretoria',role:'diretoria',admin_id:'master01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'ouv01',name:'Ouvidoria O',email:'ouvidoria@empresa.com',password:'123456',matricula:'OUV001',department:'Ouvidoria',role:'ouvidoria',admin_id:'master01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
      ];
    },
    _seedProducts(){return[
      {id:'p001',admin_id:'master01',name:'Camiseta SOU+BLU',description:'Algodão com logo bordado.',category:'Vestuário',points_price:90,price:89.90,stock:30,image_url:'',emoji:'👕',active:true,featured:true,created_at:new Date().toISOString()},
      {id:'p002',admin_id:'master01',name:'Fone Bluetooth',description:'Sem fio, 20h bateria.',category:'Tecnologia',points_price:350,price:349.90,stock:15,image_url:'',emoji:'🎧',active:true,featured:true,created_at:new Date().toISOString()},
      {id:'p003',admin_id:'master01',name:'Vale-Presente R$50',description:'Loja parceira.',category:'Vale-Presente',price:50,stock:100,image_url:'',emoji:'🎁',active:true,featured:false,created_at:new Date().toISOString()},
      {id:'p004',admin_id:'master01',name:'Mochila Executiva',description:'Para notebook.',category:'Acessórios',points_price:190,price:189.90,stock:8,image_url:'',emoji:'🎒',active:true,featured:true,created_at:new Date().toISOString()},
      {id:'p005',admin_id:'master01',name:'Caneca Personalizada',description:'Cerâmica.',category:'Utilidades',points_price:40,price:39.90,stock:50,image_url:'',emoji:'☕',active:true,featured:false,created_at:new Date().toISOString()},
      {id:'p006',admin_id:'master01',name:'Dia de Folga',description:'Combinado com gestor.',category:'Benefício',price:300,stock:5,image_url:'',emoji:'🏖️',active:true,featured:true,created_at:new Date().toISOString()},
    ];},
    _seedTransactions(){return[];},
    _seedClients(){return [
      {id:'01419319140',cpf:'01419319140',name:'Paulo Roberto de Souza Coelho',supervisorId:'',phone1:'62982796369',phone2:'',rg:'5174184',civilState:'Casado',address:'Rua das Flores, 123',email:'paulorscoelho@gmail.com',motherName:'Maria Silva',fatherName:'Roberto Coelho',documents:{rgFront:{name:'rg_frente.pdf',size:245000,type:'application/pdf'},rgBack:{name:'rg_verso.pdf',size:230000,type:'application/pdf'},address:{name:'comprovante.pdf',size:150000,type:'application/pdf'}},updatedAt:new Date().toISOString()},
      {id:'12345678901',cpf:'12345678901',name:'Elielton Ferreira de França',supervisorId:'',phone1:'62987654321',phone2:'',rg:'1234567',civilState:'Solteiro',address:'Av. Principal, 456',email:'elielton@gmail.com',motherName:'Ana França',fatherName:'João França',documents:{rgFront:{name:'rg_frente.pdf',size:240000,type:'application/pdf'},rgBack:{name:'rg_verso.pdf',size:235000,type:'application/pdf'},address:{name:'comprovante.pdf',size:155000,type:'application/pdf'}},updatedAt:new Date().toISOString()},
      {id:'98765432101',cpf:'98765432101',name:'Ana Bela Moreira Santos',supervisorId:'',phone1:'62999998888',phone2:'',rg:'9876543',civilState:'Casada',address:'Rua do Comércio, 789',email:'anabela@gmail.com',motherName:'Carla Santos',fatherName:'Carlos Moreira',documents:{rgFront:{name:'rg_frente.pdf',size:250000,type:'application/pdf'},rgBack:{name:'rg_verso.pdf',size:238000,type:'application/pdf'},address:{name:'comprovante.pdf',size:160000,type:'application/pdf'}},updatedAt:new Date().toISOString()},
    ];},
  };

  if (typeof window !== 'undefined') {
    window.DB = DB;
  }

  