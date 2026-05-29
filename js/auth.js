/* SOU + BLU – Auth v3 */

const Auth = {
  SESSION_KEY: 'soublu_session',

  /** Detecta se o HTML atual está em /pages/ (file:// e http, com ou sem \\ no path). */
  _isInPagesDir() {
    try {
      const href = decodeURIComponent(String(window.location.href || ''));
      if (/[\\/]pages[\\/]/i.test(href)) return true;
      const path = String(window.location.pathname || '').replace(/\\/g, '/');
      return /(^|\/)pages(\/|$)/i.test(path);
    } catch (e) {
      return false;
    }
  },

  /**
   * Resolve caminho relativo usando a URL completa do documento (file:// com espaços, etc.).
   * Evita ERR_FILE_NOT_FOUND ao sair / expirar sessão quando <base> ou pathname falham.
   */
  resolveHref(rel) {
    try {
      return new URL(rel, window.location.href).href;
    } catch (e) {
      return rel;
    }
  },

  loginPageHref() {
    const rel = this._isInPagesDir() ? '../index.html' : 'index.html';
    return this.resolveHref(rel);
  },

  employeePageHref() {
    const rel = this._isInPagesDir() ? 'employee.html' : 'pages/employee.html';
    return this.resolveHref(rel);
  },

  adminPageHref() {
    const rel = this._isInPagesDir() ? 'admin.html' : 'pages/admin.html';
    return this.resolveHref(rel);
  },

  /** Roles que entram no painel admin (gestão). Vendedor → área do colaborador. */
  ADMIN_PANEL_ROLES: [
    'master', 'fundador', 'desenvolvedor', 'gerente', 'financeiro', 'financial',
    'supervisor', 'sup_backoffice', 'parceiro', 'rh', 'gerencia', 'operacional', 'juridico',
    'diretoria', 'backoffice', 'ouvidoria', 'admin',
  ],

  isParceiro() {
    const s = this.getSession();
    return !!(s && s.role === 'parceiro');
  },

  usesAdminPanel(role) {
    return this.ADMIN_PANEL_ROLES.includes(String(role || ''));
  },

  /** Painel Master (Dashboard + Painel Master) — master e fundador. */
  hasMasterPanel() {
    const s = this.getSession();
    return !!(s && (s.role === 'master' || s.role === 'fundador'));
  },

  defaultAppHref() {
    const s = this.getSession();
    return this.usesAdminPanel(s?.role) ? this.adminPageHref() : this.employeePageHref();
  },

  requireMasterPanel() {
    if (!this.hasMasterPanel()) {
      window.location.replace(this.employeePageHref());
      throw new Error('AUTH_REDIRECT');
    }
  },

  _writeSession(session) {
    const data = JSON.stringify(session);
    localStorage.setItem(this.SESSION_KEY, data);
    sessionStorage.setItem(this.SESSION_KEY, data);
  },

  _sessionFromUser(user, loginAt) {
    const role = String(user.role || '').trim().toLowerCase();
    return {
      id: user.id,
      role,
      name: user.name,
      adminId: user.admin_id || user.id,
      loginAt: loginAt || Date.now(),
    };
  },

  /**
   * Atualiza sessão com o banco (evita PC com role/id antigo — ex.: parceiro virando "colaborador").
   * Se o e-mail tiver cadastro duplicado, prioriza conta parceiro ativa (mesma regra do login).
   */
  async syncSessionFromDb() {
    const s = this.getSession();
    if (!s?.id) return null;
    try {
      let user = await DB.getUser(s.id);
      if (!user || user.active === false) {
        this._clear();
        return null;
      }
      const email = (user.email || '').trim().toLowerCase();
      if (email && typeof DB.getUserByEmail === 'function') {
        const preferred = await DB.getUserByEmail(email);
        if (preferred && preferred.active !== false && preferred.id !== user.id) {
          const curRole = String(user.role || '').trim().toLowerCase();
          const prefRole = String(preferred.role || '').trim().toLowerCase();
          if (prefRole === 'parceiro' && curRole !== 'parceiro') {
            user = preferred;
          } else if (typeof DB._pickPreferredEmailUser === 'function') {
            const best = DB._pickPreferredEmailUser([user, preferred]);
            if (best?.id && best.id !== user.id) user = best;
          }
        }
      }
      const next = this._sessionFromUser(user, s.loginAt);
      const changed = next.id !== s.id || next.role !== s.role || next.name !== s.name;
      this._writeSession(next);
      if (changed) {
        try { sessionStorage.setItem('soublu_session_synced', String(Date.now())); } catch (_) { /* noop */ }
      }
      return next;
    } catch (e) {
      console.warn('[Auth] syncSessionFromDb:', e);
      return s;
    }
  },

  async login(identifier, password) {
    const user = await DB.findUserByIdentifier(identifier);
    if (!user) return { ok:false, msg:'Usuário não encontrado.' };
    if (!user.active) return { ok:false, msg:'Conta desativada. Fale com o RH.' };
    if (user.password !== password) return { ok:false, msg:'Senha incorreta.' };

    const session = this._sessionFromUser(user, Date.now());
    this._writeSession(session);
    return { ok:true, user };
  },

  logout() {
    this._clear();
    window.location.replace(this.loginPageHref());
  },

  getSession() {
    const raw = sessionStorage.getItem(this.SESSION_KEY) || localStorage.getItem(this.SESSION_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (s && s.role != null) s.role = String(s.role).trim().toLowerCase();
      return s;
    } catch (e) { return null; }
  },

  async isLoggedIn() {
    const s = this.getSession();
    if (!s) return false;
    try {
      const user = await DB.getUser(s.id);
      if (!user || !user.active) { this._clear(); return false; }
      return true;
    } catch (e) { return !!s; }
  },

  /* master, admin, supervisor ou financial, etc (todos que tem visão de admin) */
  isAdmin() {
    const s = this.getSession();
    return !!(s && this.usesAdminPanel(s.role));
  },

  /* master ou fundador (Rodrigo / topo da hierarquia) — mesmo poder no painel e propostas */
  isMaster() {
    const s = this.getSession();
    return !!(s && (s.role === 'master' || s.role === 'fundador'));
  },

  isFundador() {
    const s = this.getSession();
    return !!(s && s.role === 'fundador');
  },

  async requireLogin() {
    const ok = await this.isLoggedIn();
    if (!ok) {
      this._clear();
      window.location.replace(this.loginPageHref());
      throw new Error('AUTH_REDIRECT');
    }
    await this.syncSessionFromDb();
    if (window.location.protocol !== 'file:') {
      window.history.pushState(null,'',window.location.href);
      window.addEventListener('popstate',()=>window.history.pushState(null,'',window.location.href));
    }
  },

  requireAdmin() {
    const s = this.getSession();
    if (!s || !this.usesAdminPanel(s.role)) {
      window.location.replace(this.employeePageHref());
      throw new Error('AUTH_REDIRECT');
    }
  },

  /* ══ REGRAS DE NEGÓCIO DE CHAMADOS ══ */
  canOpenTicketTo(department) {
    const s = this.getSession();
    if (!s) return false;
    const role = s.role;
    // Baseado na tabela de "quem abre"
    if (['vendedor','backoffice'].includes(role)) {
      return ['Financeiro', 'RH', 'Operacional', 'Supervisão', 'Ouvidoria', 'Desenvolvimento'].includes(department);
    }
    if (role === 'supervisor') {
      return ['Financeiro', 'RH', 'Operacional', 'Supervisão', 'Gerência', 'Ouvidoria', 'Desenvolvimento'].includes(department);
    }
    if (role === 'parceiro') {
      try {
        if (typeof window !== 'undefined' && window._PARTNER_PERMS && typeof PartnerPerms !== 'undefined'
          && !PartnerPerms.can(window._PARTNER_PERMS, 'abrir_chamados_operacional')) {
          return false;
        }
      } catch (_) { /* noop */ }
      return department === 'Operacional';
    }
    // Gerência / Master / Fundador / Financeiro / RH / Jurídico / Diretoria / Desenvolvimento podem direcionar para estes deptos.
    return ['Financeiro', 'RH', 'Operacional', 'Supervisão', 'Gerência', 'Jurídico', 'Diretoria', 'Ouvidoria', 'Desenvolvimento'].includes(department);
  },

  canReplyToTicket(department) {
    const s = this.getSession();
    if (!s) return false;
    const role = s.role;
    if (role === 'master' || role === 'fundador' || role === 'diretoria') return true;

    // "quem trata (responde)"
    switch (department) {
      case 'RH': return ['rh', 'gerencia', 'juridico'].includes(role);
      case 'Financeiro': return role === 'financeiro';
      case 'Operacional': return ['backoffice', 'gerencia', 'operacional'].includes(role);
      case 'Supervisão': return ['supervisor', 'gerencia'].includes(role);
      case 'Ouvidoria': return role === 'rh' || role === 'ouvidoria';
      case 'Gerência': return role === 'gerencia';
      case 'Jurídico': return role === 'juridico';
      case 'Diretoria': return role === 'diretoria';
      case 'Desenvolvimento':
        return ['desenvolvedor', 'fundador', 'master', 'diretoria'].includes(role);
      default: return false;
    }
  },

  async getCurrentUser() {
    const s = this.getSession();
    if (!s) return null;
    try { return await DB.getUser(s.id); } catch (e) { return null; }
  },

  _clear() {
    localStorage.removeItem(this.SESSION_KEY);
    sessionStorage.removeItem(this.SESSION_KEY);
    try {
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith('supa_cache_')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => sessionStorage.removeItem(k));
    } catch (_) {}
  },
};
