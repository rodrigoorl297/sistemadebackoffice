/* =============================================
   SOU + BLU – Admin/Master Dashboard v3
   Master: vê tudo (todos admins, equipes, saques)
   Admin:  vê só sua equipe
   ============================================= */

const _DB_LOAD_ERROR =
  'Scripts da camada de dados não carregaram (ex.: js/db.js). Pressione F12 → Rede e Console: verifique 404 ou erros em js/db.js e js/config.js e atualize com Ctrl+F5. Abrir arquivo direto no disco exige servidor local ou publicação (ex.: soumaisblu.com.br).';

function _peekDB() {
  if (window.DB && typeof window.DB.init === 'function') return window.DB;
  if (typeof DB !== 'undefined' && DB && typeof DB.init === 'function') {
    window.DB = DB;
    return DB;
  }
  return null;
}

async function _requireDB(maxWaitMs = 9000) {
  const deadline = Date.now() + maxWaitMs;
  let db = _peekDB();
  if (db) return db;
  while (Date.now() < deadline) {
    db = _peekDB();
    if (db) return db;
    await new Promise(r => setTimeout(r, 50));
  }
  if (typeof window._SOUBLU_injectDbIfMissing === 'function') {
    try { await window._SOUBLU_injectDbIfMissing(); } catch (e) { /* noop */ }
  }
  const d2 = Date.now() + 6000;
  while (Date.now() < d2) {
    db = _peekDB();
    if (db) return db;
    await new Promise(r => setTimeout(r, 50));
  }
  return null;
}

let ADMIN_ID         = null;
let IS_MASTER        = false;
let IS_GERENTE       = false; // master restrito sem financeiro
let IS_SUPERVISOR    = false;
let IS_SUP_BACKOFFICE= false; // supervisor de backoffice
let IS_FINANCIAL     = false;
let IS_RH            = false;
let IS_BACKOFFICE    = false;
let IS_OPERACIONAL   = false;
let IS_VENDEDOR_ADM  = false; // vendedor que acessa admin por privilégio
let IS_DIRETORIA     = false;
let IS_JURIDICO      = false;
let IS_OUVIDORIA     = false;
let IS_FUNDA         = false; // Rodrigo Orlando / fundador
let IS_DESENVOLVEDOR = false; // líder técnico do departamento Desenvolvimento
let IS_PARCEIRO      = false; // parceiro externo — supervisor limitado + equipe própria
let PARTNER_ROOT_ID  = null; // id do usuário parceiro dono da equipe
let IS_PARTNER_STAFF = false; // vendedor/rh/financeiro/operacional sob um parceiro
let CAN_EMPLOYEES_PANEL = false; // master, dev, RH, financeiro (+ sup. backoffice)

function partnerCan(key) {
  if (!IS_PARCEIRO || typeof PartnerPerms === 'undefined') return false;
  return PartnerPerms.can(window._PARTNER_PERMS, key);
}

/** Papéis da equipe vinculada a um parceiro (não SOU+BLU interno). */
function isPartnerOrgStaffRole(role) {
  const r = String(role || '').toLowerCase();
  return ['vendedor', 'backoffice', 'operacional', 'sup_backoffice', 'rh', 'financeiro', 'financial', 'employee'].includes(r);
}

function partnerOrgCan(key) {
  if (!PARTNER_ROOT_ID) return false;
  if (typeof PartnerPerms === 'undefined') return false;
  return PartnerPerms.can(window._PARTNER_PERMS, key);
}

/** Parceiro ou supervisor backoffice da equipe com permissão de cadastro */
function canManagePartnerTeam() {
  if (!PARTNER_ROOT_ID) return false;
  if (IS_PARCEIRO) return partnerOrgCan('cadastrar_funcionario');
  const s = Auth.getSession();
  const r = String(s?.role || '').toLowerCase();
  if (r === 'sup_backoffice' && partnerOrgCan('cadastrar_funcionario')) return true;
  if ((r === 'operacional' || r === 'backoffice') && partnerOrgCan('cadastrar_funcionario')) return true;
  return false;
}

/** Aplica visibilidade do menu lateral (Gestão / Relatórios) conforme permissões calculadas no boot. */
function _applyAdminNavVisibility(cfg) {
  if (!cfg) return;
  document.querySelectorAll('.master-only').forEach(el => {
    el.style.display = cfg.canMasterPanel ? '' : 'none';
  });
  document.querySelectorAll('.partner-dash-nav').forEach(el => {
    el.style.display = (cfg.canMasterPanel || cfg.canPartnerDashboard) ? '' : 'none';
  });
  document.querySelectorAll('.financial-only').forEach(el => {
    el.style.display = cfg.canSaques ? '' : 'none';
  });
  document.querySelectorAll('.not-supervisor').forEach(el => {
    el.style.display = (IS_SUPERVISOR && !PARTNER_ROOT_ID) ? 'none' : '';
  });
  document.querySelectorAll('.partners-master-only').forEach(el => {
    el.style.display = (IS_MASTER || IS_FUNDA) ? '' : 'none';
  });
  document.querySelectorAll('.employees-panel-only').forEach(el => {
    el.style.display = CAN_EMPLOYEES_PANEL ? '' : 'none';
  });
  document.querySelectorAll('.supervisor-panel-only').forEach(el => {
    el.style.display = cfg.canSupervisorPanel ? '' : 'none';
  });
  document.querySelectorAll('.meetings-nav').forEach(el => {
    el.style.display = cfg._inPartnerOrg ? 'none' : '';
  });
  document.querySelectorAll('.rh-financial-only').forEach(el => {
    el.style.display = cfg.canCadFunc ? '' : 'none';
  });
  document.querySelectorAll('.ranking-nav').forEach(el => {
    el.style.display = cfg.canRanking ? '' : 'none';
  });
  const navProp = document.getElementById('navManageProposals');
  if (navProp) navProp.style.display = cfg.canProposta ? '' : 'none';
  document.querySelectorAll('.partner-ops-nav').forEach(el => {
    el.style.display = cfg.canPartnerOpsHub ? '' : 'none';
  });
  const navSim = document.getElementById('navSimulacao');
  if (navSim) navSim.style.display = cfg.canSimulacao ? '' : 'none';
  const navCli = document.getElementById('navClients');
  if (navCli) navCli.style.display = cfg.canClientes ? '' : 'none';
  document.querySelectorAll('.store-shop-nav').forEach(el => {
    el.style.display = cfg.canLoja ? '' : 'none';
    if (cfg.canLoja && el.tagName === 'BUTTON') el.type = 'button';
  });
  document.querySelectorAll('.store-nav').forEach(el => {
    el.style.display = cfg.canMasterPanel ? '' : 'none';
  });
  document.querySelectorAll('.view-as-employee-only').forEach(el => {
    el.style.display = (IS_PARCEIRO || cfg._inPartnerOrg) ? 'none' : '';
  });
  const navTkt = document.getElementById('navManageTickets');
  if (navTkt) navTkt.style.display = cfg.canChamados ? '' : 'none';
  const showReportsSection = Array.from(document.querySelectorAll(
    '.sidebar-nav button[data-section="secRanking"], .sidebar-nav button[data-section="secFeedback"], .sidebar-nav button[data-section="secMeetings"], .sidebar-nav button[data-section="secReport"]'
  )).some(el => el.style.display !== 'none');
  document.querySelectorAll('.reports-section').forEach(el => {
    el.style.display = showReportsSection ? '' : 'none';
  });
  const gestaoBtns = document.querySelectorAll(
    '.sidebar-nav .nav-item[data-section="secEmployees"], .sidebar-nav .nav-item[data-section="secBalance"], .sidebar-nav .nav-item[data-section="secProducts"], .sidebar-nav .nav-item[data-section="secOrders"], .sidebar-nav .store-shop-nav, .sidebar-nav .nav-item[data-section="secWithdrawals"], .sidebar-nav #navClients, .sidebar-nav #navManageProposals, .sidebar-nav #navPartnerOps, .sidebar-nav #navSimulacao, .sidebar-nav #navManageTickets'
  );
  const hasGestao = Array.from(gestaoBtns).some(el => el.style.display !== 'none');
  document.querySelectorAll('.sidebar-nav .sidebar-section-label').forEach(lbl => {
    if (lbl.textContent.trim().toUpperCase() === 'GESTÃO') {
      lbl.style.display = hasGestao ? '' : 'none';
    }
  });
}

function _syncEmpDeptFromTeamRole() {
  const sel = document.getElementById('empTeamRole');
  const dept = document.getElementById('empDept');
  if (!sel || !dept || typeof PartnerPerms === 'undefined') return;
  dept.value = PartnerPerms.roleDept(sel.value);
}

function _togglePartnerTeamRoleField(show) {
  const g = document.getElementById('empTeamRoleGroup');
  if (g) g.style.display = show ? '' : 'none';
  if (show && typeof PartnerPerms !== 'undefined') {
    PartnerPerms.fillTeamRoleSelect('empTeamRole');
  }
}
let _prodImgUrl      = '';

/** Campo de quantidade conforme operações adicionar / remover / definir */
function syncBalanceAmountByOperation() {
  const opEl = document.getElementById('balanceOperation');
  const amtEl = document.getElementById('balanceAmount');
  if (!opEl || !amtEl) return;
  amtEl.removeAttribute('readonly');
  const op = opEl.value;
  if (op === 'set') {
    amtEl.min = '0';
    amtEl.step = '1';
    amtEl.placeholder = 'Saldo total em pontos';
  } else {
    amtEl.min = '1';
    amtEl.step = '1';
    amtEl.placeholder = 'Ex: 500';
  }
}

function wireBalanceOperationField() {
  const opEl = document.getElementById('balanceOperation');
  if (opEl) opEl.addEventListener('change', syncBalanceAmountByOperation);
  syncBalanceAmountByOperation();
}

/** Pontos (BLU interna) ou R$ (rede parceiro). */
function _parseBalanceFormAmount(op, rawAmt, useMoneyWallet) {
  if (useMoneyWallet) {
    const v = typeof parseMoneyAmount === 'function'
      ? parseMoneyAmount(rawAmt)
      : parseFloat(rawAmt);
    if (op === 'set') {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : NaN;
    }
    return v;
  }
  if (op === 'set') return Math.max(0, Math.floor(Number(rawAmt)));
  return Math.max(0, Math.floor(Number(rawAmt)));
}

function _balanceAmountValidationMessage(op, amt, useMoneyWallet) {
  if (!Number.isFinite(amt)) return 'Informe um valor válido.';
  if (op === 'set' && amt < 0) return 'Saldo definido não pode ser negativo.';
  if (op !== 'set' && amt <= 0) {
    return useMoneyWallet
      ? 'Informe um valor em R$ maior que zero.'
      : 'Informe pontos válidos (≥ 1).';
  }
  return null;
}

async function applyBalanceAdjustment(empId, op, amt, reason, metaExtra) {
  const emp = await DB.getUser(empId);
  if (!emp) throw new Error('Usuário não encontrado.');
  const meta = {
    kind: 'credito_manual',
    screen: metaExtra?.screen || 'gerenciar_saldo',
    valor_reais: amt,
    ...(metaExtra || {}),
  };
  if (op === 'add') {
    return DB.addBalance(empId, amt, reason, ADMIN_ID, meta);
  }
  if (op === 'remove') {
    if (userPts(emp) < amt) throw new Error('Saldo insuficiente.');
    return DB.deductBalance(empId, amt, reason);
  }
  if (op === 'set') {
    return DB.setBalance(empId, amt, reason, ADMIN_ID);
  }
  throw new Error('Operação inválida.');
}

function _partnerBalanceRoleLabel(role) {
  if (role === 'parceiro') return 'Parceiro (gestor)';
  return _PARTNER_ROLE_LABELS[role] || role || 'Colaborador';
}

async function _partnerOrgUserRows(partnerRootId) {
  const root = partnerRootId ? await DB.getUser(partnerRootId).catch(() => null) : null;
  const team = partnerRootId ? await DB.getPartnerTeam(partnerRootId).catch(() => []) : [];
  const rows = [];
  if (root) rows.push({ ...root, _roleLabel: 'Parceiro (gestor)' });
  (team || []).forEach(e => {
    if (e.id === partnerRootId) return;
    rows.push({ ...e, _roleLabel: _partnerBalanceRoleLabel(e.role) });
  });
  return rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
}

async function populatePartnerBalanceSelect(partnerRootId) {
  const sel = document.getElementById('partnerBalanceEmployee');
  if (!sel || !partnerRootId) return;
  const rows = await _partnerOrgUserRows(partnerRootId);
  sel.innerHTML = '<option value="">Selecione...</option>' +
    rows.map(e => {
      const bal = formatCurrency(userPts(e), e);
      return `<option value="${e.id}">${e.name} — ${e._roleLabel} (${bal})</option>`;
    }).join('');
}

async function renderPartnerBalanceTeamList(partnerRootId) {
  const box = document.getElementById('partnerBalanceTeamList');
  if (!box) return;
  const rows = await _partnerOrgUserRows(partnerRootId);
  if (!rows.length) {
    box.innerHTML = '<div class="text-muted">Nenhum membro na equipe.</div>';
    return;
  }
  box.innerHTML = rows.map(e => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--color-border);"><div style="min-width:0;"><div style="font-weight:700;font-size:13px;">${e.name}</div><div style="font-size:11px;color:var(--color-text-muted);">${e._roleLabel}</div></div><div style="display:flex;align-items:center;gap:8px;flex-shrink:0;"><span style="font-weight:800;font-size:13px;color:var(--color-success);">${formatCurrency(userPts(e), e)}</span><button type="button" class="btn btn-outline btn-sm" onclick="prefillPartnerBalanceRecipient('${e.id}')">Usar</button></div></div>`).join('');
}

async function renderPartnerBalanceHistory(partnerRootId) {
  const box = document.getElementById('partnerBalanceHistory');
  if (!box || !partnerRootId) return;
  const rows = await _partnerOrgUserRows(partnerRootId);
  const ids = new Set(rows.map(r => r.id));
  let txs = [];
  try {
    txs = await DB.getTransactions();
  } catch (_) { txs = []; }
  txs = (txs || [])
    .filter(t => ids.has(t.employee_id))
    .sort((a, b) => new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0))
    .slice(0, 15);
  if (!txs.length) {
    box.innerHTML = '<div class="text-muted text-center" style="padding:12px;">Nenhuma movimentação nesta rede.</div>';
    return;
  }
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  box.innerHTML = txs.map(t => {
    const emp = byId[t.employee_id];
    const isCr = t.type === 'credit';
    const fmt = formatCurrency(t.amount, emp);
    return `<div class="tx-item" style="padding:8px 0;border-bottom:1px solid var(--color-border);"><div style="font-weight:700;font-size:12px;">${emp?.name || '–'}</div><div style="font-size:11px;color:var(--color-text-muted);">${t.reason || '—'} · ${timeAgo(t.created_at || t.date)}</div><div style="font-weight:800;font-size:12px;color:${isCr ? 'var(--color-success)' : 'var(--color-danger)'};">${isCr ? '+' : '−'}${fmt}</div></div>`;
  }).join('');
}

function prefillPartnerBalanceRecipient(userId) {
  const sel = document.getElementById('partnerBalanceEmployee');
  if (sel && userId) sel.value = userId;
}

async function openPartnerBalanceModal(partnerRootId) {
  if (!IS_MASTER && !IS_FUNDA && !IS_FINANCIAL && !IS_RH) {
    showToast('Sem permissão para distribuir saldo.', 'error');
    return;
  }
  if (!partnerRootId) return;
  const p = await DB.getPartnerByUserId(partnerRootId).catch(() => null);
  const u = await DB.getUser(partnerRootId).catch(() => null);
  const title = document.getElementById('partnerBalanceModalTitle');
  const rootInp = document.getElementById('partnerBalanceRootId');
  if (rootInp) rootInp.value = partnerRootId;
  if (title) {
    title.textContent = ` Distribuir saldo — ${p?.razao_social || u?.name || 'Parceiro'}`;
  }
  document.getElementById('partnerBalanceForm')?.reset();
  await Promise.all([
    populatePartnerBalanceSelect(partnerRootId),
    renderPartnerBalanceTeamList(partnerRootId),
    renderPartnerBalanceHistory(partnerRootId),
  ]);
  openModal('partnerBalanceModal');
}
window.openPartnerBalanceModal = openPartnerBalanceModal;
window.prefillPartnerBalanceRecipient = prefillPartnerBalanceRecipient;

/** Executa tarefas de boot sem derrubar o painel se uma falhar (ex.: timeout Supabase). */
async function _bootSettle(tasks) {
  const list = (Array.isArray(tasks) ? tasks : [tasks]).filter(Boolean);
  const results = await Promise.allSettled(list);
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.warn('[admin boot task', i, ']', r.reason);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  showLoading('Carregando painel...');
  let landingSection = 'secEmployees';
  const _urlOpen = new URLSearchParams(window.location.search).get('open');
  if (_urlOpen === 'loja') landingSection = 'secStore';
  try {
    const db = await _requireDB();
    if (!db) throw new Error(_DB_LOAD_ERROR);
    await db.init();
    if (typeof refreshPartnerRootIdsCache === 'function') await refreshPartnerRootIdsCache();
    await Auth.requireLogin();
    Auth.requireAdmin();
    await Auth.syncSessionFromDb();

    const s = Auth.getSession();
    if (s) s.role = String(s.role || '').trim().toLowerCase();
    ADMIN_ID          = s.id;
    const me = await Auth.getCurrentUser();

    IS_PARCEIRO       = (s.role === 'parceiro');
    PARTNER_ROOT_ID = await DB.getPartnerRootForUser(s.id).catch(() => null);
    if (PARTNER_ROOT_ID) {
      const prt = await DB.getPartnerByUserId(PARTNER_ROOT_ID);
      window._PARTNER_PERMS = typeof PartnerPerms !== 'undefined'
        ? PartnerPerms.merge(prt?.permissions)
        : PartnerPerms.merge(null);
    } else {
      window._PARTNER_PERMS = null;
    }
    IS_PARTNER_STAFF = !!PARTNER_ROOT_ID && !IS_PARCEIRO;
    window.PARTNER_ROOT_ID = PARTNER_ROOT_ID;
    window.USER_DEPT     = me?.department || '';
    window.USER_ADMIN_ID = PARTNER_ROOT_ID || me?.admin_id || s.id;

    IS_MASTER         = Auth.isMaster();
    IS_GERENTE        = ['gerente', 'gerencia', 'admin'].includes(s.role);
    IS_SUP_BACKOFFICE = (s.role === 'sup_backoffice');
    IS_SUPERVISOR     = (s.role === 'supervisor') || (IS_SUP_BACKOFFICE && !PARTNER_ROOT_ID);
    IS_FINANCIAL      = (s.role === 'financeiro' || s.role === 'financial');
    IS_RH             = (s.role === 'rh');
    IS_BACKOFFICE     = (s.role === 'backoffice');
    IS_OPERACIONAL    = (s.role === 'operacional');
    IS_VENDEDOR_ADM   = (s.role === 'vendedor');
    IS_DIRETORIA      = (s.role === 'diretoria');
    IS_JURIDICO       = (s.role === 'juridico');
    IS_OUVIDORIA      = (s.role === 'ouvidoria');
    IS_FUNDA          = (typeof Auth.isFundador === 'function' ? Auth.isFundador() : s.role === 'fundador');
    IS_DESENVOLVEDOR  = (s.role === 'desenvolvedor');

    if (typeof renderAdminSidebar === 'function') renderAdminSidebar(me);
    const empSub = document.getElementById('empPageSubtitle');
    if (empSub && PARTNER_ROOT_ID) {
      empSub.textContent = 'Equipe ELEVAN: vendedores, backoffice, operacional e supervisor backoffice (somente esta organização)';
    }

    // ── Permissões por planilha ───────────────────────────────────────
    // GERENTE     = master restrito sem financeiro (não vê Gerenciar Pontos/Financeiro)
    // FINANCEIRO  = master completo
    // RH          = master (feedbacks, funcionários)
    // SUPERVISOR  = propostas, chamados, clientes, ranking, loja (sem lista global de pontos)
    // VENDEDOR    = ranking, proposta/cliente, chamados, pontos, loja
    // BACKOFFICE  = chamados, esteira proposta/edita, clientes, pontos, loja
    // SUP_BACKOFFICE = backoffice + cadastro funcionários

    // canMasterPanel = perfis com visão global (sem saque para gerente/RH)
    const canMasterPanel = IS_MASTER || IS_GERENTE || IS_FINANCIAL || IS_RH || IS_DESENVOLVEDOR || IS_DIRETORIA;
    /** Saques: aprovação só Financeiro + Master SOU+BLU (parceiros não aprovam na rede). */
    const canSaques      = (IS_MASTER || IS_FUNDA || IS_FINANCIAL || IS_RH) && !PARTNER_ROOT_ID;
    const canFinanceiro  = canSaques;
    const _globalRhFin = (IS_RH || IS_FINANCIAL) && !PARTNER_ROOT_ID;
    const canCadFunc     = IS_MASTER || _globalRhFin || IS_GERENTE || IS_SUP_BACKOFFICE || IS_DIRETORIA
      || canManagePartnerTeam();
    const _partnerStaff = PARTNER_ROOT_ID && (IS_PARCEIRO || isPartnerOrgStaffRole(s.role));
    const _partnerProp = _partnerStaff && (partnerOrgCan('cadastrar_proposta') || partnerOrgCan('visualizar_propostas'));
    const canProposta    = canMasterPanel || IS_SUPERVISOR || IS_BACKOFFICE || IS_OPERACIONAL || IS_SUP_BACKOFFICE || IS_VENDEDOR_ADM
      || (_partnerStaff && (partnerOrgCan('cadastrar_proposta') || partnerOrgCan('visualizar_propostas')));
    const canClientes    = canMasterPanel || IS_SUPERVISOR || IS_BACKOFFICE || IS_OPERACIONAL || IS_SUP_BACKOFFICE || IS_VENDEDOR_ADM
      || (_partnerStaff && (partnerOrgCan('cadastrar_cliente') || partnerOrgCan('visualizar_propostas')));
    const _inPartnerOrg  = !!PARTNER_ROOT_ID;
    const canPartnerOpsHub = !_inPartnerOrg && (
      IS_OPERACIONAL || IS_BACKOFFICE || IS_MASTER || IS_FUNDA || IS_GERENTE
      || IS_DESENVOLVEDOR || IS_DIRETORIA || IS_FINANCIAL || IS_RH
    );
    window.CAN_PARTNER_OPS_HUB = canPartnerOpsHub;
    const canRanking     = (canProposta || IS_JURIDICO || IS_OUVIDORIA) && !_inPartnerOrg && !IS_PARCEIRO;
    const canLoja        = canProposta || (PARTNER_ROOT_ID && IS_VENDEDOR_ADM);
    const canSimulacao   = canProposta && (!_inPartnerOrg || partnerOrgCan('simulador'));
    const canChamados    = _inPartnerOrg
      ? (IS_PARCEIRO && partnerOrgCan('abrir_chamados_operacional'))
        || (_partnerStaff && !IS_PARCEIRO && (partnerOrgCan('abrir_chamados_operacional') || ['backoffice', 'operacional', 'sup_backoffice'].includes(s.role)))
      : true;
    const canSupervisorPanel = IS_MASTER || IS_FUNDA || IS_FINANCIAL || IS_RH || IS_DESENVOLVEDOR;
    CAN_EMPLOYEES_PANEL = canSupervisorPanel || IS_SUP_BACKOFFICE
      || canManagePartnerTeam()
      || (PARTNER_ROOT_ID && IS_PARCEIRO)
      || (PARTNER_ROOT_ID && ['sup_backoffice', 'operacional', 'backoffice'].includes(s.role) && partnerOrgCan('cadastrar_funcionario'));

    const canPartnerDashboard = IS_PARCEIRO || (PARTNER_ROOT_ID && _partnerStaff && (
      partnerOrgCan('visualizar_propostas') || ['backoffice', 'operacional', 'sup_backoffice', 'vendedor'].includes(s.role)
    ));
    const _adminNavCfg = {
      canMasterPanel, canSaques, canCadFunc, canProposta, canClientes, _inPartnerOrg,
      canPartnerOpsHub, canRanking, canLoja, canSimulacao, canChamados, canSupervisorPanel,
      canPartnerDashboard,
    };
    window.__ADMIN_NAV_CFG__ = _adminNavCfg;
    _applyAdminNavVisibility(_adminNavCfg);

    const propSub = document.getElementById('manageProposalsSubtitle');
    if (propSub) {
      if (_inPartnerOrg) {
        propSub.textContent = 'Propostas da sua organização parceira (equipe e vendedores vinculados)';
      } else if (canPartnerOpsHub) {
        propSub.textContent = 'Propostas SOU+BLU — equipe interna (rede de parceiros na aba Gestão de Parceiros)';
      } else {
        propSub.textContent = 'Área Operacional (Backoffice)';
      }
    }

    initSidebarToggle(); initNav();

    if (canMasterPanel) {
      landingSection = 'secDashboard';
      const tasks = [
        renderEmployeesTable(),
        renderAdminRanking(),
        renderDashboard(),
        renderTeamBillingChart(),
        renderMasterPanel(),
        (IS_MASTER || IS_FUNDA) ? renderPartnersPanel() : Promise.resolve(),
        typeof renderMeetingsAdmin === 'function' ? renderMeetingsAdmin() : Promise.resolve(),
        renderBalanceHistory(),
        populateBalanceSelect(),
        renderProductsTable(),
        renderOrdersTable(),
      ];
      if (canSupervisorPanel) tasks.push(renderFeedbackSection());
      if (canSaques) tasks.push(renderWithdrawalsTable());
      await _bootSettle(tasks);
      try { updatePendingBadge(); } catch (_) { /* noop */ }
      try { if (typeof updateMeetingsBadge === 'function') updateMeetingsBadge(); } catch (_) { /* noop */ }
      if (canSaques) { try { updateWithdrawalsBadge(); } catch (_) { /* noop */ } }
      _startAdminLiveRefresh();

    } else if (IS_PARCEIRO || IS_PARTNER_STAFF) {
      const _staffRole = s.role;
      const _canPropPartner = partnerOrgCan('visualizar_propostas') || partnerOrgCan('cadastrar_proposta')
        || ['backoffice', 'operacional', 'sup_backoffice', 'vendedor'].includes(_staffRole);
      if (IS_PARCEIRO) {
        landingSection = _canPropPartner ? 'secManageProposals'
          : (canManagePartnerTeam() ? 'secEmployees' : (canChamados ? 'secManageTickets' : 'secMyProfile'));
      } else if (_canPropPartner) {
        landingSection = 'secManageProposals';
      } else if (canChamados) {
        landingSection = 'secManageTickets';
      } else if (CAN_EMPLOYEES_PANEL) {
        landingSection = 'secEmployees';
      } else {
        landingSection = 'secMyProfile';
      }
      const bootTasks = [];
      if (CAN_EMPLOYEES_PANEL) bootTasks.push(renderEmployeesTable());
      if (landingSection === 'secDashboard') {
        bootTasks.push(renderDashboard().catch(e => console.warn('[dashboard boot]', e)));
      }
      if (landingSection === 'secManageProposals' && window.Proposals) {
        bootTasks.push(Proposals.renderAdminList().catch(e => console.warn('[proposals boot]', e)));
      }
      if (landingSection === 'secManageTickets' && window.Tickets) {
        bootTasks.push(Promise.resolve().then(() => { try { Tickets.init(); } catch (_) { /* noop */ } }));
      }
      await _bootSettle(bootTasks);

    } else if (IS_SUPERVISOR || IS_JURIDICO || IS_OUVIDORIA) {
      landingSection = IS_SUPERVISOR && !IS_SUP_BACKOFFICE ? 'secManageProposals' : 'secRanking';
      const bootTasks = [renderAdminRanking(), typeof renderMeetingsAdmin === 'function' ? renderMeetingsAdmin() : Promise.resolve()];
      if (CAN_EMPLOYEES_PANEL) bootTasks.unshift(renderEmployeesTable());
      if (landingSection === 'secManageProposals' && window.Proposals) {
        bootTasks.push(Proposals.renderAdminList().catch(e => console.warn('[proposals boot]', e)));
      }
      await _bootSettle(bootTasks);
      try { if (typeof updateMeetingsBadge === 'function') updateMeetingsBadge(); } catch (_) { /* noop */ }

    } else if (IS_BACKOFFICE) {
      landingSection = 'secManageProposals';
      if (window.Proposals) await Proposals.renderAdminList().catch(e => console.warn('[proposals boot]', e));
      try { if (typeof updateMeetingsBadge === 'function') updateMeetingsBadge(); } catch (_) { /* noop */ }

    } else if (IS_OPERACIONAL) {
      landingSection = 'secManageProposals';
      if (window.Proposals) await Proposals.renderAdminList().catch(e => console.warn('[proposals boot]', e));
      try { if (typeof updateMeetingsBadge === 'function') updateMeetingsBadge(); } catch (_) { /* noop */ }

    } else if (IS_VENDEDOR_ADM) {
      landingSection = 'secRanking';
      await _bootSettle([renderEmployeesTable(), renderAdminRanking()]);

    } else {
      landingSection = 'secEmployees';
      await _bootSettle([renderEmployeesTable()]);
    }

    document.querySelectorAll('[data-section]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sec = btn.dataset.section;
        if (sec==='secEmployees') {
          if (!CAN_EMPLOYEES_PANEL) return;
          await renderEmployeesTable();
        }
        if (sec==='secProducts')    await renderProductsTable();
        if (sec==='secOrders')      await renderOrdersTable();
        if (sec==='secWithdrawals') await renderWithdrawalsTable();
        if (sec==='secDashboard')   { await renderDashboard(); if (IS_MASTER || IS_FUNDA || IS_GERENTE || IS_FINANCIAL || IS_RH) await renderTeamBillingChart(); }
        if (sec==='secRanking')     await renderAdminRanking();
        if (sec==='secBalance')     { await populateBalanceSelect(); await renderBalanceHistory(); }
        if (sec==='secMaster')      await renderMasterPanel();
        if (sec==='secPartners')    if (window.PartnerOps) PartnerOps.invalidate();
    await renderPartnersPanel();
        if (sec==='secMyProfile') {
          showLoading('Carregando perfil…');
          try { await renderMyProfile(); } finally { hideLoading(); }
        }
        if (sec==='secFeedback')    await renderFeedbackSection();
        if (sec==='secReport')      await renderReportSection();
        if (sec==='secClients')     await renderClientsTable();
        if (sec==='secCreateProposal') { if(window.masterProposalManager) window.masterProposalManager.init(); }
        if (sec==='secManageProposals') { if(window.Proposals) await Proposals.renderAdminList(); }
        if (sec==='secPartnerOps') { if (window.PartnerOps) await PartnerOps.renderPanel(); }
        if (sec==='secSimulacao') { if (window.SimulacaoTroco) SimulacaoTroco.init(); }
        if (sec==='secManageTickets')   { if(window.Tickets) await Tickets.renderAdminList(); }
        if (sec==='secMeetings')       { if (typeof renderMeetingsAdmin === 'function') await renderMeetingsAdmin(); }
        if (sec==='secStore')          { if (typeof renderAdminPrizeStore === 'function') await renderAdminPrizeStore(); }
      });
    });

    document.getElementById('addBalanceForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const empId  = document.getElementById('balanceEmployee').value;
      const op     = document.getElementById('balanceOperation').value;
      const rawAmt = document.getElementById('balanceAmount').value;
      const amt = _parseBalanceFormAmount(op, rawAmt, false);
      const reason = document.getElementById('balanceReason').value.trim();
      if (!empId || !reason) { showToast('Preencha todos os campos.', 'warning'); return; }
      const valMsg = _balanceAmountValidationMessage(op, amt, false);
      if (valMsg) { showToast(valMsg, 'warning'); return; }

      const emp = await DB.getUser(empId);
      if (!emp) { showToast('Funcionário não encontrado.', 'error'); return; }
      if (typeof isUserInPartnerNetworkSync === 'function' && isUserInPartnerNetworkSync(emp)) {
        showToast('Rede parceira usa saldo em R$. Use Parceiros → Distribuir saldo.', 'warning');
        return;
      }
      if (IS_SUPERVISOR || PARTNER_ROOT_ID) { showToast('Sem permissão para alterar saldo.', 'error'); return; }
      if (!IS_MASTER && !IS_FINANCIAL && !IS_GERENTE && !IS_RH && emp.admin_id !== ADMIN_ID) {
        showToast('Acesso negado.', 'error');
        return;
      }

      showLoading('Atualizando saldo...');
      try {
        const nb = await applyBalanceAdjustment(empId, op, amt, reason, { screen: 'gerenciar_saldo' });
        invalidateSouBluCaches();
        document.getElementById('addBalanceForm').reset();
        syncBalanceAmountByOperation();
        await Promise.all([
          renderBalanceHistory(),
          renderEmployeesTable(),
          renderDashboard(),
          populateBalanceSelect(),
          renderMasterPanel(),
        ]);
        showToast(`${emp.name}: ${formatCurrency(nb, emp)}`, 'success');
      } catch (err) {
        showToast(err.message || 'Erro ao atualizar saldo.', 'error');
      } finally { hideLoading(); }
    });

    document.getElementById('partnerBalanceForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      if (!IS_MASTER && !IS_FUNDA && !IS_FINANCIAL && !IS_RH) {
        showToast('Sem permissão para distribuir saldo.', 'error');
        return;
      }
      const partnerRootId = document.getElementById('partnerBalanceRootId')?.value;
      const empId = document.getElementById('partnerBalanceEmployee')?.value;
      const op = document.getElementById('partnerBalanceOperation')?.value;
      const rawAmt = document.getElementById('partnerBalanceAmount')?.value;
      const reason = document.getElementById('partnerBalanceReason')?.value?.trim();
      const amt = _parseBalanceFormAmount(op, rawAmt, true);
      if (!partnerRootId || !empId || !reason) {
        showToast('Preencha todos os campos.', 'warning');
        return;
      }
      const valMsg = _balanceAmountValidationMessage(op, amt, true);
      if (valMsg) { showToast(valMsg, 'warning'); return; }

      const orgRows = await _partnerOrgUserRows(partnerRootId);
      if (!orgRows.some(r => r.id === empId)) {
        showToast('Destinatário não pertence a esta rede de parceiro.', 'error');
        return;
      }

      showLoading('Distribuindo saldo...');
      try {
        const emp = await DB.getUser(empId);
        const nb = await applyBalanceAdjustment(empId, op, amt, reason, {
          screen: 'distribuir_saldo_parceiro',
          partner_root_id: partnerRootId,
        });
        invalidateSouBluCaches();
        document.getElementById('partnerBalanceReason').value = '';
        document.getElementById('partnerBalanceAmount').value = '';
        await Promise.all([
          populatePartnerBalanceSelect(partnerRootId),
          renderPartnerBalanceTeamList(partnerRootId),
          renderPartnerBalanceHistory(partnerRootId),
          renderPartnersPanel(),
        ]);
        showToast(`${emp?.name || 'Colaborador'}: ${formatCurrency(nb, emp)}`, 'success');
      } catch (err) {
        showToast(err.message || 'Erro ao distribuir saldo.', 'error');
      } finally { hideLoading(); }
    });

    wireBalanceOperationField();
  } catch(e) {
    if (e.message==='AUTH_REDIRECT') return;
    console.error('[SOU+BLU Boot Error]', e);
    showToast(`Erro: ${e.message || 'falha ao carregar'}`, 'error', 8000);
  } finally {
    if (window.__ADMIN_NAV_CFG__) _applyAdminNavVisibility(window.__ADMIN_NAV_CFG__);
    if (Auth.getSession() && typeof navigateTo === 'function') {
      navigateTo(landingSection);
    }
    hideLoading();
  }
});

/* ══════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════ */
async function _ordersForRole() {
  if (IS_MASTER || IS_GERENTE || IS_FINANCIAL || IS_RH || IS_DIRETORIA) return DB.getOrders();
  if (IS_DESENVOLVEDOR) {
    return DB.getOrdersByDepartment(ADMIN_ID, window.USER_DEPT || 'Desenvolvimento');
  }
  return DB.getOrdersByAdmin(ADMIN_ID);
}

async function _transactionsForRole() {
  if (IS_MASTER || IS_GERENTE || IS_FINANCIAL || IS_RH || IS_DIRETORIA) return DB.getTransactions();
  if (IS_DESENVOLVEDOR) {
    return DB.getTransactionsByDepartment(ADMIN_ID, window.USER_DEPT || 'Desenvolvimento');
  }
  return DB.getTransactionsByAdmin(ADMIN_ID);
}

/** Mesmo conjunto de IDs em dashboard, pedidos, pontos e perfil (sempre inclui o usuário logado). */
async function _scopedUserIds() {
  if (IS_MASTER || IS_GERENTE || IS_FINANCIAL || IS_RH || IS_DIRETORIA || IS_FUNDA) {
    const all = await DB.getAllUsers().catch(() => []);
    return new Set(all.map(u => u.id));
  }
  if (IS_DESENVOLVEDOR) {
    return await DB.getDepartmentTeamIds(ADMIN_ID, window.USER_DEPT || 'Desenvolvimento');
  }
  if (PARTNER_ROOT_ID) {
    const team = await DB.getPartnerTeam(PARTNER_ROOT_ID).catch(() => []);
    const ids = new Set(team.map(e => e.id));
    ids.add(PARTNER_ROOT_ID);
    return ids;
  }
  if (IS_SUPERVISOR || IS_SUP_BACKOFFICE) {
    const emps = await DB.getEmployeesByAdmin(ADMIN_ID).catch(() => []);
    const ids = new Set(emps.map(e => e.id));
    if (ADMIN_ID) ids.add(ADMIN_ID);
    return ids;
  }
  if (IS_BACKOFFICE || IS_OPERACIONAL || IS_VENDEDOR_ADM) {
    const ids = new Set();
    if (ADMIN_ID) ids.add(ADMIN_ID);
    return ids;
  }
  const emps = await DB.getEmployeesByAdmin(ADMIN_ID).catch(() => []);
  const ids = new Set(emps.map(e => e.id));
  if (ADMIN_ID) ids.add(ADMIN_ID);
  return ids;
}

async function _employeesForRole() {
  if (IS_MASTER || IS_FINANCIAL || IS_RH) return DB.getAllEmployees();
  if (IS_DESENVOLVEDOR) {
    const dept = window.USER_DEPT || 'Desenvolvimento';
    const all = await DB.getAllEmployees();
    return all.filter(e => e.role === 'desenvolvedor' || e.department === dept);
  }
  if (PARTNER_ROOT_ID) return DB.getPartnerTeam(PARTNER_ROOT_ID);
  if (IS_SUPERVISOR) return DB.getEmployeesByAdmin(ADMIN_ID);
  return DB.getEmployeesByAdmin(ADMIN_ID);
}

let _dashRenderInflight = null;

async function renderDashboard() {
  if (_dashRenderInflight) return _dashRenderInflight;
  _dashRenderInflight = _renderDashboardBody();
  try {
    return await _dashRenderInflight;
  } finally {
    _dashRenderInflight = null;
  }
}

async function _renderDashboardBody() {
  const _fillDashErr = (msg) => {
    const html = `<div class="text-muted text-center" style="padding:20px;">${msg}</div>`;
    const _ds = document.getElementById('dashStats');
    if (_ds) _ds.innerHTML = html;
    const _dr = document.getElementById('dashRanking');
    const _do = document.getElementById('dashOrders');
    if (_dr) _dr.innerHTML = html;
    if (_do) _do.innerHTML = html;
  };
  try {
  const _fullOrg =
    IS_MASTER || IS_GERENTE || IS_FINANCIAL || IS_RH || IS_DIRETORIA || IS_FUNDA;
  const _isMasterLike = _fullOrg || IS_DESENVOLVEDOR;

  const _globalCatalog =
    _isMasterLike ||
    IS_SUPERVISOR || PARTNER_ROOT_ID || IS_BACKOFFICE || IS_OPERACIONAL || IS_SUP_BACKOFFICE || IS_VENDEDOR_ADM;

  let scopedIds;
  let allUsersPts = null;
  if (_fullOrg) {
    if (Array.isArray(_allUsersCache) && _allUsersCache.length) {
      allUsersPts = _allUsersCache;
    } else {
      allUsersPts = await DB.getAllUsers().catch(() => []);
      _allUsersCache = allUsersPts;
    }
    scopedIds = new Set((allUsersPts || []).map(u => u.id));
  } else {
    scopedIds = await _scopedUserIds();
  }

  let emps, orders, txs, prods;
  const prodProm = _globalCatalog ? DB.getCatalogProducts() : DB.getProducts(ADMIN_ID);

  if (_fullOrg) {
    [emps, orders, txs, prods] = await Promise.all([
      DB.getAllEmployees(),
      _ordersForRole(),
      _transactionsForRole(),
      prodProm,
    ]);
  } else if (IS_DESENVOLVEDOR) {
    [emps, orders, txs, prods] = await Promise.all([
      _employeesForRole(),
      _ordersForRole(),
      _transactionsForRole(),
      prodProm,
    ]);
  } else if (IS_SUPERVISOR || PARTNER_ROOT_ID) {
    [emps, orders, txs, prods] = await Promise.all([
      _employeesForRole(),
      _ordersForRole(),
      _transactionsForRole(),
      prodProm,
    ]);
  } else {
    [emps, orders, txs, prods] = await Promise.all([
      _employeesForRole(),
      _ordersForRole(),
      _transactionsForRole(),
      prodProm,
    ]);
  }

  orders = (orders || []).filter(o => scopedIds.has(o.employee_id));
  txs = (txs || []).filter(t => scopedIds.has(t.employee_id));

  emps = emps || [];
  orders = orders || [];
  txs = txs || [];
  prods = prods || [];

  const totalD = txs.filter(t => t.type === 'credit').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const ptsPool = (_fullOrg ? (allUsersPts || []) : emps)
    .filter(e => e.active !== false && scopedIds.has(e.id));
  const totalB = ptsPool
    .filter(e => typeof isUserInPartnerNetworkSync !== 'function' || !isUserInPartnerNetworkSync(e))
    .reduce((s, e) => s + userPts(e), 0);
  if (IS_DESENVOLVEDOR && ptsPool.length === 1 && ptsPool[0]?.id === ADMIN_ID) {
    const meFresh = await DB.getUser(ADMIN_ID).catch(() => null);
    if (meFresh) ptsPool[0] = meFresh;
  }
  const empStatLabel =
    _fullOrg ? 'Total Funcionários'
      : PARTNER_ROOT_ID ? 'Equipe do parceiro'
      : IS_DESENVOLVEDOR ? 'Time Desenvolvimento' : 'Minha Equipe';

  if (PARTNER_ROOT_ID) {
    const card = document.getElementById('teamBillingCard');
    if (card) card.style.display = 'none';
  }

  const _ds = document.getElementById('dashStats');

  if (PARTNER_ROOT_ID) {
    const [rawProps, rawClients] = await Promise.all([
      DB.getProposals(null, null, { partnerRootId: PARTNER_ROOT_ID }).catch(() => []),
      DB.getClients({ partnerRootId: PARTNER_ROOT_ID, pageSize: 500 }).catch(() => []),
    ]);
    const stats = _partnerOrgStats(
      PARTNER_ROOT_ID,
      emps,
      Array.isArray(rawProps) ? rawProps : [],
      Array.isArray(rawClients) ? rawClients : [],
    );
    const fmtR = v => 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    if (_ds) {
      _ds.innerHTML = [
        statCardHtml({ icon: 'users', color: 'blue', label: empStatLabel, value: stats.activeTeam.length, sub: `${stats.team.length} cadastrados` }),
        statCardHtml({ icon: 'clients', color: 'green', label: 'Clientes', value: stats.clients.length, sub: 'da sua organização' }),
        statCardHtml({ icon: 'proposals', color: 'orange', label: 'Propostas', value: stats.proposals.length, sub: `${stats.countOpen} em aberto` }),
        statCardHtml({ icon: 'billing', color: 'yellow', label: 'Faturamento (mês)', value: fmtR(stats.monthBilling), sub: `${stats.countPaid} pagas no total`, valueStyle: 'font-size:17px;' }),
      ].join('');
    }

    const _dr = document.getElementById('dashRanking');
    if (_dr) {
      const h3 = _dr.closest('.card')?.querySelector('h3');
      if (h3) h3.textContent = ' Equipe do parceiro';
      const sub = _dr.closest('.card')?.querySelector('p');
      if (sub) sub.textContent = 'Vendedores e backoffice';
      _dr.innerHTML = !stats.activeTeam.length
        ? '<div class="text-muted text-center" style="padding:20px;">Cadastre a equipe em Funcionários.</div>'
        : stats.activeTeam.map(e => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--color-border);">
            ${avatarHtml(e.name, 'avatar-sm', e.photo_url || '')}
            <div style="flex:1;"><div style="font-weight:700;font-size:13px;">${e.name}</div><div style="font-size:11px;color:var(--color-text-muted);">${_PARTNER_ROLE_LABELS[e.role] || e.role}</div></div></div>`).join('');
    }

    const _do = document.getElementById('dashOrders');
    if (_do) {
      const h3o = _do.closest('.card')?.querySelector('h3');
      if (h3o) h3o.textContent = ' Últimas propostas';
      _do.innerHTML = !stats.recent.length
        ? '<div class="text-muted text-center" style="padding:20px;">Nenhuma proposta.</div>'
        : stats.recent.map(pr => {
          const st = pr.status || '—';
          const badge = st === 'Pago' ? 'badge-success' : st === 'Cancelado' ? 'badge-danger' : 'badge-warning';
          return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--color-border);"><div style="flex:1;"><div style="font-weight:700;font-size:13px;">${pr.numero || pr.id} · ${pr.clientName || '—'}</div><div style="font-size:11px;color:var(--color-text-muted);">${pr.vendorName || '—'}</div></div><span class="badge ${badge}">${st}</span></div>`;
        }).join('');
    }
    return;
  }

  if (!_ds) {
    _fillDashErr('Resumo indisponível nesta tela.');
    return;
  }

  _ds.innerHTML = [
    statCardHtml({ icon: 'users', color: 'blue', label: empStatLabel, value: emps.filter(e => e.active !== false).length, sub: `${emps.length} cadastrados` }),
    statCardHtml({ icon: 'balance', color: 'green', label: 'Saldos Ativos', value: formatCurrency(totalB), sub: `${formatCurrency(totalD)} distribuídos`, valueStyle: 'font-size:20px;' }),
    statCardHtml({ icon: 'products', color: 'orange', label: 'Produtos', value: prods.filter(p => p.active !== false).length, sub: `${prods.filter(p => p.stock === 0).length} sem estoque` }),
    statCardHtml({ icon: 'orders', color: 'yellow', label: 'Pedidos', value: orders.length, sub: `${orders.filter(o => o.status === 'pendente').length} pendentes` }),
  ].join('');

  const userNameById = new Map();
  [...(allUsersPts || []), ...emps].forEach(u => { if (u?.id) userNameById.set(u.id, u); });

  const top5 = [...ptsPool].filter(isRankingParticipant).sort((a, b) => userPts(b) - userPts(a)).slice(0, 5);
  const _dr=document.getElementById('dashRanking');
  if (_dr) {
    _dr.innerHTML = !top5.length
      ? '<div class="text-muted text-center" style="padding:20px;">Nenhum funcionário.</div>'
      : top5.map((e,i)=>`
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--color-border);"><span style="font-size:17px;font-weight:900;min-width:26px;color:${['#FFB800','#8c9aa8','#c17f5a'][i]||'var(--color-text-muted)'};">#${i+1}</span>
        ${avatarHtml(e.name,'avatar-sm',e.photo_url||'')}
        <div style="flex:1;"><div style="font-weight:700;font-size:13px;">${e.name}</div><div style="font-size:11px;color:var(--color-text-muted);">${e.department}</div></div></div>`).join('');
  }

  const recent = orders.slice(0, 5);
  const _do = document.getElementById('dashOrders');
  if (_do) {
    _do.innerHTML = !recent.length
      ? '<div class="text-muted text-center" style="padding:20px;">Nenhum pedido.</div>'
      : recent.map(o => {
        const emp = userNameById.get(o.employee_id);
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--color-border);"><div style="flex:1;"><div style="font-weight:700;font-size:13px;">${o.order_code || o.id}</div><div style="font-size:11px;color:var(--color-text-muted);">${emp?.name || '–'} · ${timeAgo(o.created_at)}</div></div><span class="pts-orange" style="font-weight:900;font-size:13px;">${formatCurrency(o.total_points ?? o.total_price ?? 0)}</span>
          ${orderStatusBadge(o.status)}
        </div>`;
      }).join('');
  }
  } catch (err) {
    console.warn('[renderDashboard]', err);
    _fillDashErr('Não foi possível carregar o resumo. Atualize a página (F5).');
  }
}

/* ══════════════════════════════════════════════
   GRÁFICO DE FATURAMENTO POR EQUIPE (master only)
══════════════════════════════════════════════ */
let _teamBillingFilter = 'month';
let _allProposalsCache = null;
let _allUsersCache     = null;

/** Loja de prêmios no painel admin (implementação em store-shop.js). */
async function renderAdminPrizeStore() {
  if (window.StoreShop) return StoreShop.init();
  if (typeof resolveEmployeeUser === 'function') {
    currentUser = await resolveEmployeeUser();
  } else {
    currentUser = await Auth.getCurrentUser();
  }
  if (!currentUser) return;
  const jobs = [];
  if (typeof renderBalance === 'function') jobs.push(renderBalance());
  if (typeof renderCategories === 'function') jobs.push(renderCategories());
  if (typeof renderProducts === 'function') jobs.push(renderProducts());
  await Promise.all(jobs);
}
window.renderAdminPrizeStore = renderAdminPrizeStore;

function invalidateSouBluCaches() {
  if (typeof _cacheDel === 'function') {
    _cacheDel('users');
    _cacheDel('transactions');
    _cacheDel('withdrawals');
    _cacheDel('orders');
    _cacheDel('meetings');
  }
  _allUsersCache = null;
}

function _startAdminLiveRefresh() {
  if (window.__SOUBLU_ADMIN_POLL__) return;
  window.__SOUBLU_ADMIN_POLL__ = true;
  const tick = async () => {
    if (document.hidden) return;
    invalidateSouBluCaches();
    const sec = document.querySelector('.section.active')?.id;
    const jobs = [];
    if (sec === 'secDashboard' || sec === 'secMaster') {
      jobs.push(renderDashboard(), renderMasterPanel());
      if (!PARTNER_ROOT_ID) jobs.push(renderTeamBillingChart());
    }
    if (sec === 'secPartners' && (IS_MASTER || IS_FUNDA)) jobs.push(renderPartnersPanel());
    if (sec === 'secBalance') {
      jobs.push(populateBalanceSelect(), renderBalanceHistory());
    }
    if (sec === 'secEmployees' && CAN_EMPLOYEES_PANEL) jobs.push(renderEmployeesTable());
    if (sec === 'secWithdrawals') jobs.push(renderWithdrawalsTable());
    if (sec === 'secOrders') jobs.push(renderOrdersTable());
    if (sec === 'secRanking') jobs.push(renderAdminRanking());
    if (sec === 'secMeetings' && typeof renderMeetingsAdmin === 'function') {
      jobs.push(renderMeetingsAdmin());
    }
    jobs.push(typeof updateMeetingsBadge === 'function' ? updateMeetingsBadge() : Promise.resolve());
    await Promise.all(jobs.map(p => p.catch(() => {})));
  };
  setInterval(tick, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}

async function renderTeamBillingChart() {
  const card = document.getElementById('teamBillingCard');
  const canBilling = IS_MASTER || IS_GERENTE || IS_FINANCIAL || IS_RH || IS_DIRETORIA || IS_DESENVOLVEDOR || IS_FUNDA;
  if (!card) return;
  if (!canBilling) { card.style.display = 'none'; return; }
  card.style.display = '';

  if (!_allProposalsCache) _allProposalsCache = await DB.list('proposals').catch(() => []);
  if (!_allUsersCache?.length) _allUsersCache = await DB.getAllUsers().catch(() => []);

  const proposals = _allProposalsCache || [];
  const users     = _allUsersCache     || [];
  const supervisors = users.filter(u => u.role === 'supervisor');

  // ── Calcular intervalo de datas ──────────────────────────────────────
  const now   = new Date();
  let dateFrom, dateTo;
  const f = _teamBillingFilter;

  if (f === 'day') {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    dateTo   = new Date(dateFrom.getTime() + 86400000);
  } else if (f === 'month') {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    dateTo   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (f === 'year') {
    dateFrom = new Date(now.getFullYear(), 0, 1);
    dateTo   = new Date(now.getFullYear() + 1, 0, 1);
  } else if (f === 'custom') {
    const fromVal = document.getElementById('filterDateFrom')?.value;
    const toVal   = document.getElementById('filterDateTo')?.value;
    dateFrom = fromVal ? new Date(fromVal) : new Date(0);
    dateTo   = toVal   ? new Date(new Date(toVal).getTime() + 86400000) : new Date(9999, 0);
  } else {
    dateFrom = new Date(0);
    dateTo   = new Date(9999, 0);
  }

  // ── Filtrar propostas pelo período ───────────────────────────────────
  const inRange = proposals.filter(p => {
    const d = new Date(p.createdAt || p.created_at || 0);
    return d >= dateFrom && d < dateTo;
  });

  // ── Agrupar por supervisor ────────────────────────────────────────────
  const teamData = supervisors.map(sup => {
    const team    = users.filter(u => u.admin_id === sup.id);
    const teamIds = new Set([sup.id, ...team.map(u => u.id)]);
    const props   = inRange.filter(p => {
      const vid = p.vendorId || p.vendor_id || p.employee_id;
      return teamIds.has(vid);
    });
    const total   = props.reduce((s, p) => s + (parseFloat(p.valorFinal || p.valor) || 0), 0);
    const count   = props.length;
    return { sup, team, props, total, count };
  }).sort((a, b) => b.total - a.total);

  // ── Propostas sem supervisor atribuído ───────────────────────────────
  const supIds = new Set(supervisors.map(s => s.id));
  const teamMemberIds = new Set(users.filter(u => u.admin_id && supIds.has(u.admin_id)).map(u => u.id));
  const orphanProps = inRange.filter(p => {
    const vid = p.vendorId || p.vendor_id || p.employee_id;
    return !supIds.has(vid) && !teamMemberIds.has(vid);
  });
  const orphanTotal = orphanProps.reduce((s, p) => s + (parseFloat(p.valorFinal || p.valor) || 0), 0);
  if (orphanTotal > 0 || orphanProps.length > 0) {
    teamData.push({ sup: { name: 'Sem equipe', id: null }, team: [], props: orphanProps, total: orphanTotal, count: orphanProps.length });
  }

  const fmtR = v => 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const maxTotal = Math.max(...teamData.map(d => d.total), 1);
  const grandTotal = teamData.reduce((s, d) => s + d.total, 0);
  const grandCount = teamData.reduce((s, d) => s + d.count, 0);

  // Período label
  const periodLabels = {
    day: 'Hoje', month: 'Este Mês', year: 'Este Ano', all: 'Todo o período', custom: 'Período customizado'
  };

  // ── KPIs ────────────────────────────────────────────────────────────
  document.getElementById('teamBillingKpis').innerHTML = [
    statKpiHtml({ icon: 'proposals', colorClass: 'blue', label: 'Total de Propostas', value: grandCount, valueColor: '#3b82f6' }),
    statKpiHtml({ icon: 'billing', colorClass: 'green', label: 'Faturamento Total', value: fmtR(grandTotal), valueColor: '#10b981' }),
    statKpiHtml({ icon: 'users', colorClass: 'purple', label: 'Equipes Ativas', value: teamData.filter(d => d.count > 0).length, valueColor: '#8b5cf6' }),
    statKpiHtml({ icon: 'calendar', colorClass: 'yellow', label: 'Período', value: periodLabels[f] || f, valueColor: '#f59e0b' }),
  ].join('');

  // ── Gráfico de barras ────────────────────────────────────────────────
  const colors = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#84cc16','#f97316'];
  document.getElementById('teamBillingChart').innerHTML = !teamData.length
    ? '<div style="color:var(--color-text-muted);font-size:13px;margin:auto;">Nenhuma proposta no período.</div>'
    : teamData.map((d, i) => {
        const pct = Math.round((d.total / maxTotal) * 100);
        const cor = colors[i % colors.length];
        return `
        <div style="flex:1;min-width:80px;display:flex;flex-direction:column;align-items:center;gap:4px;position:relative;"><div style="font-size:11px;font-weight:700;color:${cor};text-align:center;">${fmtR(d.total)}</div><div title="${d.sup.name}: ${fmtR(d.total)} (${d.count} prop.)"
               style="width:100%;background:${cor}22;border-radius:6px 6px 0 0;height:160px;display:flex;align-items:flex-end;cursor:pointer;"
               onclick="_toggleTeamDetail('tdetail_${i}')"><div style="width:100%;height:${Math.max(pct, 3)}%;background:${cor};border-radius:6px 6px 0 0;transition:height .4s;"></div></div><div style="font-size:10px;color:var(--color-text-muted);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px;" title="${d.sup.name}">
            ${d.sup.name.split(' ')[0]}
          </div><div style="font-size:10px;color:var(--color-text-muted);">${d.count} prop.</div></div>`;
      }).join('');

  // ── Tabela detalhada ─────────────────────────────────────────────────
  document.getElementById('teamBillingTable').innerHTML = `
    <h4 style="font-size:13px;font-weight:700;margin-bottom:10px;color:var(--color-text-muted);">Detalhes por Equipe</h4><div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="border-bottom:2px solid var(--color-border);text-align:left;"><th style="padding:8px 12px;font-weight:700;">#</th><th style="padding:8px 12px;font-weight:700;">Supervisor</th><th style="padding:8px 12px;font-weight:700;">Tamanho Equipe</th><th style="padding:8px 12px;font-weight:700;">Propostas</th><th style="padding:8px 12px;font-weight:700;">Faturamento</th><th style="padding:8px 12px;font-weight:700;">% do Total</th><th style="padding:8px 12px;font-weight:700;"></th></tr></thead><tbody>
          ${teamData.map((d, i) => {
            const cor   = colors[i % colors.length];
            const share = grandTotal > 0 ? Math.round((d.total / grandTotal) * 100) : 0;
            return `
            <tr style="border-bottom:1px solid var(--color-border);" id="trow_${i}"><td style="padding:8px 12px;"><span style="font-weight:800;color:${cor};">#${i+1}</span></td><td style="padding:8px 12px;"><span style="font-weight:700;">${d.sup.name}</span><div style="font-size:11px;color:var(--color-text-muted);">${d.team.length} funcionário(s)</div></td><td style="padding:8px 12px;">${d.team.length}</td><td style="padding:8px 12px;font-weight:700;">${d.count}</td><td style="padding:8px 12px;font-weight:800;color:${cor};">${fmtR(d.total)}</td><td style="padding:8px 12px;"><div style="display:flex;align-items:center;gap:8px;"><div style="background:var(--color-surface-2);border-radius:4px;height:6px;width:80px;overflow:hidden;"><div style="height:6px;width:${share}%;background:${cor};border-radius:4px;"></div></div><span style="font-size:12px;">${share}%</span></div></td><td style="padding:8px 12px;"><button class="btn btn-ghost btn-sm" onclick="_toggleTeamDetail('tdetail_${i}')">▼ Ver</button></td></tr><tr id="tdetail_${i}" style="display:none;background:var(--color-surface-2);"><td colspan="7" style="padding:12px 20px;">
                ${!d.props.length
                  ? '<span style="color:var(--color-text-muted);font-size:12px;">Nenhuma proposta neste período.</span>'
                  : `<div style="display:flex;flex-wrap:wrap;gap:8px;">
                      ${d.props.slice(0,20).map(p => `
                        <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;padding:8px 12px;min-width:180px;"><div style="font-weight:700;font-size:12px;">${p.numero || p.id}</div><div style="font-size:11px;color:var(--color-text-muted);">${p.clientName||'—'} · ${p.convenio||'—'}</div><div style="font-size:12px;font-weight:800;color:${cor};margin-top:4px;">${fmtR(p.valorFinal||p.valor)}</div><div style="font-size:10px;background:${cor}18;color:${cor};padding:2px 6px;border-radius:99px;display:inline-block;margin-top:3px;">${p.statusOp||p.status||'—'}</div></div>`).join('')}
                      ${d.props.length > 20 ? `<div style="font-size:12px;color:var(--color-text-muted);align-self:center;">+${d.props.length-20} mais...</div>` : ''}
                    </div>`}
              </td></tr>`;
          }).join('')}
        </tbody><tfoot><tr style="border-top:2px solid var(--color-border);font-weight:800;"><td colspan="3" style="padding:10px 12px;">TOTAL GERAL</td><td style="padding:10px 12px;">${grandCount}</td><td style="padding:10px 12px;color:var(--color-success);">${fmtR(grandTotal)}</td><td colspan="2" style="padding:10px 12px;">100%</td></tr></tfoot></table></div>`;
}

function _toggleTeamDetail(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? '' : 'none';
  const rowId = id.replace('tdetail_', 'trow_');
  const btn   = document.querySelector(`#${rowId} button`);
  if (btn) btn.textContent = el.style.display === 'none' ? '▼ Ver' : '▲ Fechar';
}

function setTeamFilter(f) {
  _teamBillingFilter = f;
  _allProposalsCache = null; // força recarga
  // Atualiza botões
  ['day','month','year','all','custom'].forEach(k => {
    const btn = document.getElementById('filterBtn' + k.charAt(0).toUpperCase() + k.slice(1));
    if (btn) {
      btn.className = k === f ? 'btn btn-primary btn-sm' : 'btn btn-sm btn-outline';
      btn.style.padding = '6px 12px';
    }
  });
  renderTeamBillingChart();
}

/* ══════════════════════════════════════════════
   PAINEL MASTER
   Master cria: supervisores, financeiro, funcionários
   Cada supervisor gerencia sua equipe (admin_id)
══════════════════════════════════════════════ */
async function renderMasterPanel() {
  if (!IS_MASTER && !IS_GERENTE && !IS_FINANCIAL && !IS_RH && !IS_DESENVOLVEDOR && !IS_DIRETORIA) return;
  const [allUsers, allOrders, allWds] = await Promise.all([
    DB.getAllUsers().catch(() => []),
    DB.getOrders().catch(() => []),
    DB.getWithdrawals().catch(() => []),
  ]);

  const supervisors    = allUsers.filter(u => u.role === 'supervisor');
  const desenvolvedores = allUsers.filter(u => u.role === 'desenvolvedor');
  const financeiros    = allUsers.filter(u => ['financial','financeiro'].includes(u.role));
  const gerentes       = allUsers.filter(u => u.role === 'gerente');
  const rhUsers        = allUsers.filter(u => u.role === 'rh');
  const supBackoffices = allUsers.filter(u => u.role === 'sup_backoffice');
  const backoffices    = allUsers.filter(u => u.role === 'backoffice');
  const employees      = allUsers.filter(u => ['employee','vendedor'].includes(u.role));
  const box = document.getElementById('masterContent');
  if (!box) return;

  const roleLabels = {
    fundador:       { label:' Fundador',        cls:'badge-accent'   },
    desenvolvedor:  { label:' Dev / TI',        cls:'badge-primary' },
    master:         { label:' Master',          cls:'badge-accent'   },
    supervisor:     { label:' Supervisor',      cls:'badge-info'     },
    financial:      { label:' Financeiro',      cls:'badge-success'  },
    financeiro:     { label:' Financeiro',      cls:'badge-success'  },
    rh:             { label:' RH',              cls:'badge-warning'  },
    gerente:        { label:' Gerente',          cls:'badge-accent'   },
    sup_backoffice: { label:' Sup. Backoffice', cls:'badge-info'     },
    backoffice:     { label:' Backoffice',      cls:'badge-muted'    },
    vendedor:       { label:' Vendedor',        cls:'badge-primary'  },
    employee:       { label:' Funcionário',     cls:'badge-muted'    },
  };

  const allEmpLike = allUsers.filter(u => ['employee','vendedor','backoffice','sup_backoffice','fundador'].includes(u.role));
  const totalPts    = allUsers.filter(u => u.active !== false).reduce((s,e)=>s+userPts(e),0);
  const wdPendTotal = allWds.filter(w=>['solicitado','aprovado_master','aprovado_financeiro'].includes(w.status)).length;

  let html = '';

  html += `<div class="stat-grid" style="margin-bottom:var(--space-lg);">${[
    statCardHtml({ icon: 'users', color: 'blue', label: 'Supervisores', value: supervisors.length }),
    statCardHtml({ icon: 'balance', color: 'green', label: 'Total Pontos', value: totalPts.toLocaleString('pt-BR'), valueStyle: 'font-size:18px;' }),
    statCardHtml({ icon: 'users', color: 'yellow', label: 'Funcionários', value: allEmpLike.filter(e => e.active).length }),
    statCardHtml({ icon: 'withdrawals', color: 'orange', label: 'Saques Pend.', value: wdPendTotal }),
  ].join('')}</div>`;

  // ── Gerentes ──
  if (gerentes.length) {
    html += `<h3 style="font-family:var(--font-display);font-weight:800;font-size:15px;margin:20px 0 12px;color:var(--color-text-muted);"> GERENTES</h3>`;
    html += gerentes.map(f => _renderUserCard(f, [], allOrders, allWds, roleLabels)).join('');
  }

  // ── Desenvolvimento / TI ──
  if (desenvolvedores.length) {
    html += `<h3 style="font-family:var(--font-display);font-weight:800;font-size:15px;margin:20px 0 12px;color:var(--color-text-muted);"> DESENVOLVIMENTO / TI</h3>`;
    html += desenvolvedores.map(f => _renderUserCard(f, [], allOrders, allWds, roleLabels)).join('');
  }

  // ── Financeiros ──
  if (financeiros.length) {
    html += `<h3 style="font-family:var(--font-display);font-weight:800;font-size:15px;margin:20px 0 12px;color:var(--color-text-muted);"> FINANCEIRO</h3>`;
    html += financeiros.map(f => _renderUserCard(f, [], allOrders, allWds, roleLabels)).join('');
  }

  // ── RH ──
  if (rhUsers.length) {
    html += `<h3 style="font-family:var(--font-display);font-weight:800;font-size:15px;margin:20px 0 12px;color:var(--color-text-muted);"> RH</h3>`;
    html += rhUsers.map(f => _renderUserCard(f, [], allOrders, allWds, roleLabels)).join('');
  }

  // ── Sup. Backoffice ──
  if (supBackoffices.length) {
    html += `<h3 style="font-family:var(--font-display);font-weight:800;font-size:15px;margin:20px 0 12px;color:var(--color-text-muted);"> SUP. BACKOFFICE</h3>`;
    html += supBackoffices.map(s => {
      const team = backoffices.filter(b => b.admin_id === s.id);
      return _renderUserCard(s, team, allOrders, allWds, roleLabels);
    }).join('');
  }

  // ── Backoffice sem sup ──
  const backSemSup = backoffices.filter(b => !b.admin_id || !supBackoffices.some(s => s.id === b.admin_id));
  if (backSemSup.length) {
    html += `<h3 style="font-family:var(--font-display);font-weight:800;font-size:15px;margin:20px 0 12px;color:var(--color-text-muted);"> BACKOFFICE (sem sup.)</h3>`;
    html += `<div class="card card-padded" style="margin-bottom:var(--space-lg);"><div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${backSemSup.map(e=>`
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--color-surface-2);border-radius:var(--radius-md);">
            ${avatarHtml(e.name,'avatar-sm',e.photo_url||'')}
            <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">${e.name}</div><div style="font-size:11px;color:var(--color-text-muted);">${e.department} ·  ${(e.points||e.balance||0).toLocaleString('pt-BR')}</div></div><button class="btn btn-primary btn-sm" onclick="quickAddPoints('${e.id}','${e.name.replace(/'/g,"\\'")}')"> Pontos</button><button class="btn btn-ghost btn-sm" onclick="masterEditUser('${e.id}')"></button><button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="masterDeleteUser('${e.id}','${e.name.replace(/'/g,"\\'")}')"></button></div>`).join('')}
      </div></div>`;
  }

  // ── Equipes por supervisor ──
  html += `<h3 style="font-family:var(--font-display);font-weight:800;font-size:15px;margin:20px 0 12px;color:var(--color-text-muted);"> EQUIPES POR SUPERVISOR</h3>`;

  if (!supervisors.length) {
    html += `<div class="card card-padded" style="text-align:center;padding:32px;color:var(--color-text-muted);">
      Nenhum supervisor cadastrado ainda.<br><button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="openCreateUserModal()"> Criar primeiro supervisor</button></div>`;
  } else {
    html += supervisors.map(sup => {
      const team = employees.filter(e => e.admin_id === sup.id);
      return _renderUserCard(sup, team, allOrders, allWds, roleLabels);
    }).join('');
  }

  // ── Funcionários sem supervisor ──
  const semSup = employees.filter(e => !e.admin_id || !supervisors.some(s => s.id === e.admin_id));
  if (semSup.length) {
    html += `<h3 style="font-family:var(--font-display);font-weight:800;font-size:15px;margin:20px 0 12px;color:var(--color-text-muted);"> SEM SUPERVISOR ATRIBUÍDO</h3>`;
    html += `<div class="card card-padded" style="margin-bottom:var(--space-lg);"><div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${semSup.map(e=>`
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--color-surface-2);border-radius:var(--radius-md);">
            ${avatarHtml(e.name,'avatar-sm',e.photo_url||'')}
            <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">${e.name}</div><div style="font-size:11px;color:var(--color-text-muted);">${e.department} ·  ${(e.points||e.balance||0).toLocaleString('pt-BR')}</div></div><button class="btn btn-primary btn-sm" onclick="quickAddPoints('${e.id}','${e.name.replace(/'/g,"\\'")}')"> Pontos</button><button class="btn btn-ghost btn-sm" onclick="masterEditUser('${e.id}')"></button><button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="masterDeleteUser('${e.id}','${e.name.replace(/'/g,"\\'")}')" title="Excluir"></button></div>`).join('')}
      </div></div>`;
  }

  box.innerHTML = html;
}

/* ══════════════════════════════════════════════
   PARCEIROS (Master / Fundador)
══════════════════════════════════════════════ */
function _formatCnpj(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const _PARTNER_ROLE_LABELS = {
  vendedor: ' Vendedor',
  operacional: ' Operacional',
  backoffice: ' Backoffice',
  rh: ' RH',
  financeiro: ' Financeiro',
  financial: ' Financeiro',
  employee: ' Colaborador',
};

function _partnerOrgIds(rootId, team) {
  const ids = new Set([String(rootId)]);
  (team || []).forEach(e => ids.add(String(e.id)));
  return ids;
}

function _proposalInPartnerOrg(p, ids) {
  const vidList = typeof DB._proposalVendorIds === 'function'
    ? DB._proposalVendorIds(p)
    : [p.vendorId, p.vendor_id, p.employee_id];
  return vidList.some(id => id && ids.has(String(id)));
}

function _clientInPartnerOrg(c, ids) {
  const sid = c.supervisorId || c.supervisor_id;
  return sid && ids.has(String(sid));
}

function _partnerOrgStats(rootId, team, proposals, clients) {
  const ids = _partnerOrgIds(rootId, team);
  const props = (proposals || []).filter(p => _proposalInPartnerOrg(p, ids));
  const clis = (clients || []).filter(c => _clientInPartnerOrg(c, ids));

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const propsMonth = props.filter(p => {
    const d = new Date(p.createdAt || p.created_at || 0);
    return d >= monthStart && d < monthEnd;
  });

  const fmtSum = arr => arr.reduce((s, p) => s + (parseFloat(p.valorFinal || p.valor) || 0), 0);
  const byStatus = {};
  props.forEach(p => {
    const st = p.status || '—';
    byStatus[st] = (byStatus[st] || 0) + 1;
  });

  const byVendor = {};
  propsMonth.forEach(p => {
    const vid = p.vendorId || p.vendor_id || p.employee_id || '—';
    if (!byVendor[vid]) {
      byVendor[vid] = { id: vid, name: p.vendorName || p.vendor_name || '—', count: 0, total: 0 };
    }
    byVendor[vid].count += 1;
    byVendor[vid].total += parseFloat(p.valorFinal || p.valor) || 0;
  });

  const activeTeam = (team || []).filter(e => e.active !== false);
  const rootInTeam = team.find(e => e.id === rootId);

  return {
    ids,
    team: team || [],
    activeTeam,
    rootInTeam,
    clients: clis,
    proposals: props,
    propsMonth,
    totalBilling: fmtSum(props),
    monthBilling: fmtSum(propsMonth),
    countPaid: props.filter(p => String(p.status).toLowerCase() === 'pago').length,
    countOpen: props.filter(p => !['pago', 'cancelado'].includes(String(p.status || '').toLowerCase())).length,
    byStatus,
    byVendor: Object.values(byVendor).sort((a, b) => b.total - a.total),
    recent: [...props].sort((a, b) =>
      new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0)
    ).slice(0, 5),
  };
}

function _renderPartnerDashboardBlock(p, u, stats) {
  const fmtR = v => 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const roleRows = ['vendedor', 'backoffice']
    .map(r => {
      const n = stats.team.filter(e => e.role === r).length;
      return n ? `<span class="badge badge-muted" style="font-size:10px;">${_PARTNER_ROLE_LABELS[r] || r}: ${n}</span>` : '';
    }).filter(Boolean).join(' ');

  const teamList = stats.activeTeam.length
    ? stats.activeTeam.map(e => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border);">
          ${avatarHtml(e.name, 'avatar-sm', e.photo_url || '')}
          <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">${e.name}</div><div style="font-size:11px;color:var(--color-text-muted);">${_PARTNER_ROLE_LABELS[e.role] || e.role} · ${e.department || '—'}</div></div><span class="badge badge-muted" style="font-size:10px;"> ${typeof formatMoney === 'function' ? formatMoney(userPts(e)) : userPts(e).toLocaleString('pt-BR')}</span></div>`).join('')
    : '<div class="text-muted text-center" style="padding:16px;font-size:13px;">Nenhum membro na equipe. Cadastre em <strong>Funcionários</strong> (vinculado a este parceiro).</div>';

  const recentHtml = stats.recent.length
    ? stats.recent.map(pr => {
        const st = pr.status || '—';
        const badge = st === 'Pago' ? 'badge-success' : st === 'Cancelado' ? 'badge-danger' : 'badge-warning';
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border);"><div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">${pr.numero || pr.id} · ${pr.clientName || '—'}</div><div style="font-size:11px;color:var(--color-text-muted);">${pr.vendorName || '—'} · ${(pr.createdAt || pr.created_at || '').slice(0, 10)}</div></div><span class="badge ${badge}" style="font-size:10px;">${st}</span><strong style="font-size:12px;color:var(--color-success);white-space:nowrap;">${fmtR(pr.valorFinal || pr.valor)}</strong></div>`;
      }).join('')
    : '<div class="text-muted text-center" style="padding:16px;font-size:13px;">Nenhuma proposta desta organização.</div>';

  const maxV = Math.max(...stats.byVendor.map(v => v.total), 1);
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
  const vendorBars = stats.byVendor.length
    ? stats.byVendor.slice(0, 6).map((v, i) => {
        const pct = Math.round((v.total / maxV) * 100);
        const cor = colors[i % colors.length];
        return `<div style="flex:1;min-width:64px;display:flex;flex-direction:column;align-items:center;gap:4px;"><div style="font-size:10px;font-weight:700;color:${cor};">${fmtR(v.total)}</div><div style="width:100%;height:72px;background:${cor}22;border-radius:6px 6px 0 0;display:flex;align-items:flex-end;"><div style="width:100%;height:${Math.max(pct, 4)}%;background:${cor};border-radius:6px 6px 0 0;"></div></div><div style="font-size:9px;color:var(--color-text-muted);text-align:center;max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${v.name}">${v.name.split(' ')[0]}</div><div style="font-size:9px;color:var(--color-text-muted);">${v.count} prop.</div></div>`;
      }).join('')
    : '<div style="color:var(--color-text-muted);font-size:12px;padding:12px;">Sem propostas no mês.</div>';

  const statusTags = Object.entries(stats.byStatus).slice(0, 6)
    .map(([k, n]) => `<span class="badge badge-info" style="font-size:10px;">${k}: ${n}</span>`).join(' ');

  return `
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--color-border);"><div style="font-size:12px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;">Dashboard da organização</div><div class="stat-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px;">${[
      statCardHtml({ icon: 'users', color: 'blue', label: 'Equipe', value: stats.activeTeam.length, sub: `${stats.team.length} cadastrados` }),
      statCardHtml({ icon: 'clients', color: 'green', label: 'Clientes', value: stats.clients.length, sub: 'da rede do parceiro' }),
      statCardHtml({ icon: 'proposals', color: 'orange', label: 'Propostas', value: stats.proposals.length, sub: `${stats.countOpen} em aberto · ${stats.countPaid} pagas` }),
      statCardHtml({ icon: 'billing', color: 'yellow', label: 'Faturamento (mês)', value: fmtR(stats.monthBilling), sub: `total ${fmtR(stats.totalBilling)}`, valueStyle: 'font-size:17px;' }),
    ].join('')}</div>
      ${roleRows ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">${roleRows}</div>` : ''}
      ${statusTags ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">${statusTags}</div>` : ''}
      <div class="card card-padded" style="margin-bottom:12px;background:var(--color-surface-2);"><h4 style="font-size:13px;font-weight:700;margin:0 0 10px;">Faturamento por vendedor — este mês</h4><div style="display:flex;align-items:flex-end;gap:8px;min-height:90px;overflow-x:auto;">${vendorBars}</div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;"><div class="card card-padded" style="padding:14px;"><h4 style="font-family:var(--font-display);font-weight:800;font-size:14px;margin:0 0 10px;"> Equipe do parceiro</h4>
          ${u && !stats.rootInTeam ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--color-border);margin-bottom:8px;"><div><div style="font-weight:700;font-size:13px;">${u.name || p.contato}</div><div style="font-size:11px;color:var(--color-text-muted);">Parceiro (gestor)</div></div><span class="badge badge-muted" style="font-size:10px;"> ${typeof formatMoney === 'function' ? formatMoney(userPts(u)) : userPts(u).toLocaleString('pt-BR')}</span></div>` : ''}
          <div>${teamList}</div></div><div class="card card-padded" style="padding:14px;"><h4 style="font-family:var(--font-display);font-weight:800;font-size:14px;margin:0 0 10px;"> Últimas propostas</h4><div>${recentHtml}</div></div></div></div>`;
}

async function renderPartnersPanel() {
  if (!IS_MASTER && !IS_FUNDA) return;
  const box = document.getElementById('partnersContent');
  if (!box) return;

  const permsEl = document.getElementById('partnerPermsCheckboxes');
  if (permsEl && typeof PartnerPerms !== 'undefined' && !permsEl.dataset.filled) {
    permsEl.innerHTML = PartnerPerms.renderCheckboxesHtml('partnerPermsCheckboxes');
    permsEl.dataset.filled = '1';
  }

  const [partners, users, rawProps, rawClients] = await Promise.all([
    DB.getPartners().catch(() => []),
    DB.getAllUsers().catch(() => []),
    DB.getProposals().catch(() => []),
    DB.getClients({ pageSize: 800 }).catch(() => []),
  ]);
  const allProposals = Array.isArray(rawProps) ? rawProps : [];
  const allClients = Array.isArray(rawClients) ? rawClients : [];

  if (!partners.length) {
    box.innerHTML = `<div class="card card-padded" style="text-align:center;padding:40px;color:var(--color-text-muted);">
      Nenhum parceiro cadastrado.<br><button class="btn btn-primary btn-sm" style="margin-top:14px;" onclick="openPartnerModal()"> Cadastrar parceiro</button></div>`;
    return;
  }

  let netProps = 0;
  let netClients = 0;
  let netBilling = 0;

  const cardsHtml = partners.map(p => {
    const u = users.find(x => x.id === p.user_id);
    const team = users.filter(e => DB.PARTNER_TEAM_ROLES.includes(e.role) && e.admin_id === p.user_id);
    const stats = _partnerOrgStats(p.user_id, team, allProposals, allClients);
    netProps += stats.proposals.length;
    netClients += stats.clients.length;
    netBilling += stats.monthBilling;

    const active = p.active !== false && u?.active !== false;
    const perms = typeof PartnerPerms !== 'undefined' ? PartnerPerms.merge(p.permissions) : (p.permissions || {});
    const permTags = Object.keys(perms).filter(k => perms[k]).slice(0, 6)
      .map(k => `<span class="badge badge-muted" style="font-size:10px;">${(PartnerPerms.LABELS[k] || k).split('—')[0].trim()}</span>`).join(' ');

    return `<div class="card card-padded" style="margin-bottom:var(--space-lg);"><div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;"><div style="flex:1;min-width:220px;"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-family:var(--font-display);font-size:17px;font-weight:800;">${p.razao_social || u?.name || 'Parceiro'}</span><span class="badge badge-info"> Parceiro</span>
            ${!active ? '<span class="badge badge-danger">Inativo</span>' : ''}
          </div><div style="font-size:13px;color:var(--color-text-muted);margin-top:6px;line-height:1.5;">
            CNPJ: <strong>${_formatCnpj(p.cnpj) || '—'}</strong><br>
            ${p.endereco || '—'}<br>
            Contato: ${p.contato || '—'} · ${p.email || u?.email || '—'}
          </div><div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">${permTags}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start;"><button class="btn btn-primary btn-sm" onclick="openPartnerBalanceModal('${p.user_id}')"> Distribuir saldo</button><button class="btn btn-ghost btn-sm" onclick="openPartnerModal('${p.id}')"> Editar</button><button class="btn btn-ghost btn-sm" onclick="partnerToggleActive('${p.id}')">${active ? ' Desativar' : ' Ativar'}</button></div></div>
      ${_renderPartnerDashboardBlock(p, u, stats)}
    </div>`;
  }).join('');

  const fmtR = v => 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const summaryHtml = `
    <div class="stat-grid" style="margin-bottom:var(--space-lg);">${[
      statCardHtml({ icon: 'partners', color: 'blue', label: 'Parceiros ativos', value: partners.filter(x => x.active !== false).length, sub: `${partners.length} cadastrados` }),
      statCardHtml({ icon: 'proposals', color: 'orange', label: 'Propostas (rede)', value: netProps, sub: 'todas as organizações' }),
      statCardHtml({ icon: 'clients', color: 'green', label: 'Clientes (rede)', value: netClients, sub: 'vinculados aos parceiros' }),
      statCardHtml({ icon: 'billing', color: 'yellow', label: 'Faturamento rede (mês)', value: fmtR(netBilling), sub: 'soma dos parceiros', valueStyle: 'font-size:17px;' }),
    ].join('')}</div>`;

  box.innerHTML = summaryHtml + cardsHtml;
}

async function openPartnerModal(partnerId) {
  if (!IS_MASTER && !IS_FUNDA) return;
  const permsEl = document.getElementById('partnerPermsCheckboxes');
  if (permsEl && typeof PartnerPerms !== 'undefined' && !permsEl.dataset.filled) {
    permsEl.innerHTML = PartnerPerms.renderCheckboxesHtml('partnerPermsCheckboxes');
    permsEl.dataset.filled = '1';
  }

  document.getElementById('partnerRecordId').value = '';
  document.getElementById('partnerUserId').value = '';
  document.getElementById('partnerCnpj').value = '';
  document.getElementById('partnerRazao').value = '';
  document.getElementById('partnerEndereco').value = '';
  document.getElementById('partnerContato').value = '';
  document.getElementById('partnerEmail').value = '';
  document.getElementById('partnerSenha').value = '123456';
  document.getElementById('partnerModalTitle').textContent = ' Cadastrar parceiro';

  if (partnerId) {
    const p = await DB.getPartner(partnerId);
    if (!p) { showToast('Parceiro não encontrado.', 'error'); return; }
    const u = p.user_id ? await DB.getUser(p.user_id, true) : null;
    document.getElementById('partnerRecordId').value = p.id;
    document.getElementById('partnerUserId').value = p.user_id || '';
    document.getElementById('partnerCnpj').value = p.cnpj || '';
    document.getElementById('partnerRazao').value = p.razao_social || '';
    document.getElementById('partnerEndereco').value = p.endereco || '';
    document.getElementById('partnerContato').value = p.contato || '';
    document.getElementById('partnerEmail').value = p.email || u?.email || '';
    document.getElementById('partnerSenha').value = u?.password || '';
    document.getElementById('partnerModalTitle').textContent = ' Editar parceiro';
    PartnerPerms.fillForm('partnerPermsCheckboxes', p.permissions);
  } else {
    PartnerPerms.fillForm('partnerPermsCheckboxes', PartnerPerms.DEFAULT);
  }
  openModal('partnerModal');
}

async function savePartner() {
  if (!IS_MASTER && !IS_FUNDA) return;
  const recordId = document.getElementById('partnerRecordId').value;
  const userId   = document.getElementById('partnerUserId').value;
  const cnpj     = document.getElementById('partnerCnpj').value.trim();
  const razao    = document.getElementById('partnerRazao').value.trim();
  const endereco = document.getElementById('partnerEndereco').value.trim();
  const contato  = document.getElementById('partnerContato').value.trim();
  const email    = document.getElementById('partnerEmail').value.trim().toLowerCase();
  const senha    = document.getElementById('partnerSenha').value;
  const perms    = PartnerPerms.readForm('partnerPermsCheckboxes');

  if (!razao || !email) { showToast('Razão social e e-mail são obrigatórios.', 'warning'); return; }
  if (!recordId && !senha) { showToast('Defina uma senha inicial.', 'warning'); return; }

  showLoading('Salvando parceiro...');
  try {
    let uid = userId;
    const loginName = contato || razao;

    if (uid) {
      const upd = {
        name: loginName,
        email,
        department: 'Parceiro',
        role: 'parceiro',
        active: true,
      };
      if (senha) upd.password = senha;
      await DB.updateUser(uid, upd);
    } else {
      const dup = await DB.findUserByIdentifier(email);
      if (dup) { showToast('E-mail já cadastrado.', 'error'); return; }
      const nu = await DB.addUser({
        name: loginName,
        email,
        password: senha,
        department: 'Parceiro',
        role: 'parceiro',
        admin_id: null,
        balance: 0,
        points: 0,
      });
      uid = nu.id;
    }

    await DB.savePartner({
      id: recordId || undefined,
      user_id: uid,
      cnpj,
      razao_social: razao,
      endereco,
      contato,
      email,
      permissions: perms,
      active: true,
    });

    closeModal('partnerModal');
    showToast(`Parceiro "${razao}" salvo!`, 'success');
    if (typeof invalidateSouBluCaches === 'function') invalidateSouBluCaches();
    if (typeof refreshPartnerRootIdsCache === 'function') await refreshPartnerRootIdsCache();
    if (window.PartnerOps) PartnerOps.invalidate();
    await Promise.all([renderPartnersPanel(), renderMasterPanel()]);
  } catch (err) {
    console.error('[savePartner]', err);
    showToast('Erro ao salvar: ' + (err.message || 'tente novamente'), 'error');
  } finally { hideLoading(); }
}

async function partnerToggleActive(partnerId) {
  const p = await DB.getPartner(partnerId);
  if (!p) return;
  const next = p.active === false;
  showLoading();
  try {
    await DB.savePartner({ ...p, active: next });
    if (p.user_id) await DB.updateUser(p.user_id, { active: next });
    showToast(next ? 'Parceiro ativado.' : 'Parceiro desativado.', 'info');
    if (window.PartnerOps) PartnerOps.invalidate();
    await renderPartnersPanel();
  } catch (e) {
    showToast('Erro: ' + (e.message || ''), 'error');
  } finally { hideLoading(); }
}

function _renderUserCard(user, team, allOrders, allWds, roleLabels) {
  const rl       = roleLabels[user.role] || { label: user.role, cls: 'badge-muted' };
  const teamOrds = allOrders.filter(o => team.some(e=>e.id===o.employee_id));
  const teamWds  = allWds.filter(w => team.some(e=>e.id===w.employee_id) || w.employee_id===user.id);
  const teamPts  = team.reduce((s,e)=>s+(e.points||e.balance||0),0);
  const wdPend   = teamWds.filter(w=>w.status==='solicitado').length;

  return `
  <div class="card card-padded" style="margin-bottom:var(--space-lg);"><div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--color-border);">
      ${avatarHtml(user.name,'avatar-lg',user.photo_url||'')}
      <div style="flex:1;"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-family:var(--font-display);font-size:17px;font-weight:800;">${user.name}</span><span class="badge ${rl.cls}">${rl.label}</span>
          ${!user.active ? '<span class="badge badge-danger">Inativo</span>' : ''}
        </div><div style="font-size:13px;color:var(--color-text-muted);margin-top:3px;">${user.email} · ${user.matricula} · ${user.department}</div></div><div style="display:flex;gap:6px;"><button class="btn btn-ghost btn-sm" onclick="masterEditUser('${user.id}')"> Editar</button><button class="btn btn-ghost btn-sm" onclick="masterToggleUser('${user.id}')">${user.active?' Desativar':' Ativar'}</button>
        ${(IS_FUNDA ? user.role !== 'fundador' : (user.role !== 'master' && user.role !== 'fundador')) ? `<button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="masterDeleteUser('${user.id}','${user.name.replace(/'/g,"\'")}')"></button>` : ''}
      </div></div>
    ${team.length ? `
    <div class="stat-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px;">${[
      statCardHtml({ icon: 'users', color: 'blue', label: 'Equipe', value: team.length }),
      statCardHtml({ icon: 'balance', color: 'green', label: 'Total Pontos', value: teamPts.toLocaleString('pt-BR'), valueStyle: 'font-size:14px;' }),
      statCardHtml({ icon: 'orders', color: 'yellow', label: 'Pedidos', value: teamOrds.length }),
      statCardHtml({ icon: 'withdrawals', color: 'orange', label: 'Saques', value: wdPend }),
    ].join('')}</div><div style="display:flex;flex-wrap:wrap;gap:8px;">
      ${team.map(e=>`
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--color-surface-2);border-radius:var(--radius-md);">
          ${avatarHtml(e.name,'avatar-sm',e.photo_url||'')}
          <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">${e.name}</div><div style="font-size:11px;color:var(--color-text-muted);">${e.department} ·  ${(e.points||e.balance||0).toLocaleString('pt-BR')}</div></div><button class="btn btn-primary btn-sm" onclick="quickAddPoints('${e.id}','${e.name.replace(/'/g,"\\'")}')"> Pontos</button><button class="btn btn-ghost btn-sm" onclick="masterEditUser('${e.id}')"></button><button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="masterDeleteUser('${e.id}','${e.name.replace(/'/g,"\\'")}')" title="Excluir"></button></div>`).join('')}
    </div>` : user.role==='supervisor' ? '<p style="font-size:13px;color:var(--color-text-muted);">Nenhum funcionário nesta equipe ainda. Crie funcionários e vincule a este supervisor.</p>' : ''}
  </div>`;
}

/* ── Modal criar / editar usuário ── */
async function openCreateUserModal() {
  document.getElementById('masterUserModalTitle').textContent = ' Criar Usuário';
  document.getElementById('masterUserId').value    = '';
  document.getElementById('masterUserName').value  = '';
  document.getElementById('masterUserEmail').value = '';
  document.getElementById('masterUserMat').value   = '';
  document.getElementById('masterUserPwd').value   = '123456';
  document.getElementById('masterUserRole').value  = 'supervisor';
  document.getElementById('masterUserDept').value  = 'Vendas';
  document.getElementById('masterUserPts').value   = '0';
  onMasterRoleChange('supervisor');
  await _populateMasterTeamSelect('');
  openModal('masterUserModal');
}

async function masterEditUser(id) {
  const u = await DB.getUser(id, true); if (!u) return;
  document.getElementById('masterUserModalTitle').textContent = ' Editar Usuário';
  document.getElementById('masterUserId').value    = u.id;
  document.getElementById('masterUserName').value  = u.name;
  document.getElementById('masterUserEmail').value = u.email;
  document.getElementById('masterUserMat').value   = u.matricula || '';
  document.getElementById('masterUserPwd').value   = u.password || '';
  document.getElementById('masterUserRole').value  = u.role;
  document.getElementById('masterUserDept').value  = u.department || 'Vendas';
  document.getElementById('masterUserPts').value   = u.points || u.balance || 0;
  onMasterRoleChange(u.role);
  await _populateMasterTeamSelect(u.admin_id || '');
  openModal('masterUserModal');
}

function onMasterRoleChange(role) {
  const isEmpLike = ['employee','vendedor','backoffice','sup_backoffice'].includes(role);
  const canHavePoints = ['employee','vendedor','backoffice','sup_backoffice','desenvolvedor','fundador'].includes(role);
  document.getElementById('masterUserPtsGroup').style.display  = canHavePoints ? '' : 'none';
  document.getElementById('masterUserTeamGroup').style.display = isEmpLike ? '' : 'none';
  // Departamento sugerido
  const deptSel = document.getElementById('masterUserDept');
  const deptMap = {
    financial:'Financeiro', financeiro:'Financeiro',
    supervisor:'Supervisor', sup_backoffice:'Backoffice',
    backoffice:'Backoffice', rh:'RH', vendedor:'Vendas',
    desenvolvedor:'Desenvolvimento',
    gerente:'Administração'
  };
  if (deptMap[role]) deptSel.value = deptMap[role];
}

async function _populateMasterTeamSelect(selected) {
  const leaders = (await DB.getAllUsers()).filter(u => ['supervisor', 'parceiro'].includes(u.role) && u.active);
  const sel = document.getElementById('masterUserTeam');
  sel.innerHTML = `<option value="">— Sem líder de equipe —</option>` +
    leaders.map(s => {
      const tag = s.role === 'parceiro' ? '' : '';
      return `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${tag} ${s.name} (${s.department})</option>`;
    }).join('');
}

async function saveMasterUser() {
  const id   = document.getElementById('masterUserId').value;
  const role = document.getElementById('masterUserRole').value;
  const name = document.getElementById('masterUserName').value.trim();
  const email= document.getElementById('masterUserEmail').value.trim();
  const pwd  = document.getElementById('masterUserPwd').value;
  const mat  = document.getElementById('masterUserMat').value.trim();
  const dept = document.getElementById('masterUserDept').value;
  const pts  = parseInt(document.getElementById('masterUserPts').value) || 0;
  const team = document.getElementById('masterUserTeam')?.value || null;

  if (!name || !email) { showToast('Nome e e-mail obrigatórios.','warning'); return; }
  if (!id && !pwd) { showToast('Senha obrigatória para novo usuário.','warning'); return; }

  const isEmpLike = ['employee','vendedor','backoffice','sup_backoffice'].includes(role);
  const canHavePoints = ['employee','vendedor','backoffice','sup_backoffice','desenvolvedor','fundador'].includes(role);
  try {
    const existing = id ? await DB.getUser(id) : null;
    const ptsGroupVisible = document.getElementById('masterUserPtsGroup')?.style.display !== 'none';

    const data = { name, email, department: dept, role, active: true };
    if (mat) data.matricula = mat;
    if (pwd || !id) data.password = pwd || '123456';

    if (id && existing) {
      // Edição: nunca zera saldo/vínculos ao mudar departamento ou papel admin
      data.admin_id = isEmpLike ? (team || null) : (existing.admin_id ?? null);
      if (ptsGroupVisible && (isEmpLike || canHavePoints)) {
        data.balance = pts;
        data.points = pts;
      } else {
        data.balance = Number(existing.balance ?? existing.points ?? 0);
        data.points = Math.round(Number(existing.points ?? existing.balance ?? 0));
      }
    } else {
      data.admin_id = isEmpLike ? (team || null) : null;
      data.balance = isEmpLike ? pts : 0;
      data.points = isEmpLike ? pts : 0;
    }

    data.email = DB.normalizeEmail(email);
    if (await DB.isEmailTaken(data.email, id || null)) {
      const dup = await DB.getUserByEmail(data.email);
      showToast(`Este e-mail já está cadastrado${dup?.name ? ` (${dup.name})` : ''}.`, 'error');
      return;
    }

    if (id) {
      await DB.updateUser(id, data);
      showToast(`${name} atualizado!`, 'success');
    } else {
      await DB.addUser(data);
      const roleNome = {
        supervisor:'Supervisor', financial:'Financeiro', financeiro:'Financeiro',
        rh:'RH', vendedor:'Vendedor', employee:'Funcionário',
        backoffice:'Backoffice', sup_backoffice:'Sup. Backoffice',
        gerente:'Gerente',
        fundador:'Fundador',
        desenvolvedor:'Desenvolvimento / TI'
      }[role] || role;
      showToast(`${roleNome} "${name}" criado!`, 'success');
    }
    closeModal('masterUserModal');
    invalidateSouBluCaches();
    await Promise.all([renderMasterPanel(), renderEmployeesTable()]);
  } catch(err) {
    console.error('[saveMasterUser]', err);
    showToast(DB.formatUserDbError ? DB.formatUserDbError(err) : (err.message || 'tente novamente'), 'error');
  } finally { hideLoading(); }
}

async function masterToggleUser(id) {
  const u = await DB.getUser(id); if (!u) return;
  showLoading();
  try {
    await DB.updateUser(id, { active: !u.active });
    await renderMasterPanel();
    showToast(`${u.name} ${!u.active ? 'ativado' : 'desativado'}.`, 'info');
  } finally { hideLoading(); }
}

async function masterDeleteUser(id, name) {
  if (!confirm(`Excluir "${name}" permanentemente?\n\nEsta ação não pode ser desfeita.`)) return;
  showLoading('Excluindo...');
  try {
    await DB.deleteUser(id);
    if (typeof invalidateSouBluCaches === 'function') invalidateSouBluCaches();
    await renderMasterPanel();
    // Atualizar tabela de funcionários se estiver visível
    if (document.getElementById('employeesTbody')) await renderEmployeesTable();
    showToast(`"${name}" excluído.`, 'success');
  } catch(err) {
    console.error('[masterDeleteUser]', err);
    showToast('Erro ao excluir: ' + (err.message||'tente novamente'), 'error');
  } finally { hideLoading(); }
}

/* ══════════════════════════════════════════════
   QUICK ADD POINTS — modal rápido de pontos
══════════════════════════════════════════════ */
async function quickAddPoints(empId, empName) {
  // Busca saldo atual
  const emp = await DB.getUser(empId);
  const saldoAtual = emp ? (emp.points||emp.balance||0) : 0;

  // Cria modal inline
  const overlay = document.createElement('div');
  overlay.id = 'quickPtsOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--color-surface);border-radius:var(--radius-lg);padding:28px;width:380px;max-width:95vw;box-shadow:var(--shadow-xl);"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;"><h3 style="font-family:var(--font-display);font-weight:800;font-size:17px;"> Pontos — ${empName}</h3><button onclick="document.getElementById('quickPtsOverlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--color-text-muted);"></button></div><div style="background:var(--color-surface-2);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:18px;text-align:center;"><div style="font-size:12px;color:var(--color-text-muted);margin-bottom:2px;">Saldo atual</div><div style="font-size:26px;font-weight:900;font-family:var(--font-display);"> ${saldoAtual.toLocaleString('pt-BR')}</div></div><div class="form-group" style="margin-bottom:12px;"><label>Operação</label><div style="display:flex;gap:8px;"><button id="qpOpAdd" class="btn btn-primary" style="flex:1;" onclick="_qpSetOp('add')">Adicionar</button><button id="qpOpRemove" class="btn btn-outline" style="flex:1;" onclick="_qpSetOp('remove')">Remover</button><button id="qpOpSet" class="btn btn-outline" style="flex:1;" onclick="_qpSetOp('set')">Definir</button></div><input type="hidden" id="qpOperation" value="add"></div><div class="form-group" style="margin-bottom:12px;"><label>Quantidade de pontos</label><input type="number" id="qpAmount" min="1" step="1" placeholder="Ex: 100" style="width:100%;" autofocus/></div><div class="form-group" style="margin-bottom:18px;"><label>Motivo</label><input type="text" id="qpReason" placeholder="Ex: Proposta faturada" style="width:100%;"/></div><div style="display:flex;gap:10px;"><button class="btn btn-outline" style="flex:1;" onclick="document.getElementById('quickPtsOverlay').remove()">Cancelar</button><button class="btn btn-primary" style="flex:1;" onclick="_qpConfirm('${empId}')">Confirmar</button></div></div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });
}

function _qpSetOp(op) {
  document.getElementById('qpOperation').value = op;
  ['add','remove','set'].forEach(o => {
    const btn = document.getElementById('qpOp'+o.charAt(0).toUpperCase()+o.slice(1));
    if(btn) btn.className = o===op ? 'btn btn-primary' : 'btn btn-outline';
    if(btn) btn.style.flex = '1';
  });
}

async function _qpConfirm(empId) {
  const op     = document.getElementById('qpOperation').value;
  const amt    = parseFloat(document.getElementById('qpAmount').value);
  const reason = document.getElementById('qpReason').value.trim() || 'Ajuste de pontos';
  if (!amt || amt <= 0) { showToast('Informe uma quantidade válida.','warning'); return; }
  showLoading('Salvando pontos...');
  try {
    if (op==='add')         await DB.addBalance(empId, Math.round(Number(amt)), reason, ADMIN_ID, { kind: 'credito_manual', origin: 'painel_rapido', pontos_total: Math.round(Number(amt)) });
    else if (op==='remove') await DB.deductBalance(empId, amt, reason);
    else if (op==='set')    await DB.setBalance(empId, amt, reason, ADMIN_ID);
    invalidateSouBluCaches();
    document.getElementById('quickPtsOverlay')?.remove();
    await Promise.all([
      renderMasterPanel(),
      renderDashboard(),
      populateBalanceSelect(),
      renderBalanceHistory(),
      document.getElementById('employeesTbody') ? renderEmployeesTable() : Promise.resolve(),
      document.getElementById('adminRankingList') ? renderAdminRanking() : Promise.resolve(),
    ]);
    showToast('Pontos atualizados!', 'success');
  } catch(err) {
    console.error('[quickAddPoints]', err);
    showToast('Erro ao salvar pontos: '+(err.message||'tente novamente'), 'error');
  } finally { hideLoading(); }
}

/* ══════════════════════════════════════════════
   MEU PERFIL (admin edita próprio e-mail/senha/foto)
══════════════════════════════════════════════ */
function _profileUsesAdminForm(role) {
  if (['vendedor', 'employee'].includes(role)) return false;
  if (typeof Auth !== 'undefined' && typeof Auth.usesAdminPanel === 'function') {
    return Auth.usesAdminPanel(role);
  }
  return ['master', 'fundador', 'desenvolvedor', 'gerente', 'gerencia', 'admin', 'financeiro', 'financial',
    'rh', 'operacional', 'supervisor', 'sup_backoffice', 'backoffice', 'juridico', 'diretoria', 'ouvidoria', 'parceiro'].includes(role);
}

function _roleProfileLabel(role) {
  const map = {
    fundador: 'Fundador', master: 'Master', desenvolvedor: 'Desenvolvimento / TI',
    gerente: 'Gerente', gerencia: 'Gerência', admin: 'Administrador',
    financeiro: 'Financeiro', financial: 'Financeiro', supervisor: 'Supervisor',
    sup_backoffice: 'Sup. Backoffice', backoffice: 'Backoffice', rh: 'RH',
    operacional: 'Operacional', juridico: 'Jurídico', diretoria: 'Diretoria',
    ouvidoria: 'Ouvidoria', parceiro: 'Parceiro',
  };
  return map[role] || 'Gestor';
}

async function renderMyProfile() {
  const masterWrap = document.getElementById('myProfileMaster');
  const employeeWrap = document.getElementById('myProfileEmployee');
  const contentEl = document.getElementById('myProfileContent');
  if (contentEl) {
    contentEl.innerHTML = '<div class="card card-padded" style="padding:32px;text-align:center;color:var(--color-text-muted);">Carregando perfil…</div>';
  }

  const me = await Auth.getCurrentUser();
  if (!me) {
    if (contentEl) contentEl.innerHTML = '<div class="card card-padded"><p class="text-muted">Sessão inválida. Faça login novamente.</p></div>';
    return;
  }

  if (_profileUsesAdminForm(me.role)) {
    if (masterWrap) masterWrap.style.display = '';
    if (employeeWrap) employeeWrap.style.display = 'none';
    const photo = me.photo_url || '';
    const safeName = String(me.name || '').replace(/[&<">]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const safeEmail = String(me.email || '').replace(/[&<">]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    if (!contentEl) return;
    contentEl.innerHTML = `
    <div class="card card-padded"><h3 style="font-family:var(--font-display);font-weight:800;margin-bottom:20px;">Meu Perfil</h3><div style="display:flex;align-items:center;gap:20px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid var(--color-border);"><div style="position:relative;">
          ${photo
            ? `<img src="${photo}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--color-primary);">`
            : `<div class="avatar avatar-lg" style="background:${avatarColor(me.name)};width:80px;height:80px;font-size:28px;">${getInitials(me.name)}</div>`}
          <label style="position:absolute;bottom:0;right:0;width:26px;height:26px;background:var(--color-primary);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;color:#fff;" title="Alterar Foto"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg><input type="file" accept="image/*" style="display:none;" onchange="uploadAdminPhoto(this)"></label></div><div><div style="font-family:var(--font-display);font-size:20px;font-weight:800;">${safeName}</div><div style="font-size:13px;color:var(--color-text-muted);">${_roleProfileLabel(me.role)} · ${me.matricula || '—'}</div></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md);"><div class="form-group"><label>Nome</label><input type="text" id="myName" value="${safeName}"/></div><div class="form-group"><label>E-mail</label><input type="email" id="myEmail" value="${safeEmail}"/></div><div class="form-group"><label>Senha atual <small style="font-weight:400;text-transform:none;">(obrigatória para trocar)</small></label><input type="password" id="myPwdCurrent" placeholder="Senha atual" autocomplete="current-password"/></div><div class="form-group"><label>Nova Senha <small style="font-weight:400;text-transform:none;">(deixe vazio para manter)</small></label><input type="password" id="myPwd" placeholder="Nova senha" autocomplete="new-password"/></div><div class="form-group"><label>Confirmar Nova Senha</label><input type="password" id="myPwdConfirm" placeholder="Repita a senha" autocomplete="new-password"/></div></div><button class="btn btn-primary" onclick="saveMyProfile()" style="margin-top:8px;">Salvar Alterações</button></div>
    `;
    return;
  }

  if (masterWrap) masterWrap.style.display = 'none';
  if (employeeWrap) employeeWrap.style.display = '';

  const toggleEl = document.getElementById('ptsToggleBlock');
  if (toggleEl) {
    toggleEl.innerHTML = '';
    toggleEl.style.display = 'none';
  }

  window.currentUser = me;
  currentUser = me;
  const headerEl = document.getElementById('profileHeader');
  if (headerEl) {
    headerEl.innerHTML = '<div class="card card-padded" style="padding:24px;text-align:center;color:var(--color-text-muted);">Carregando…</div>';
  }
  try {
    if (typeof renderProfile === 'function') await renderProfile();
  } catch (err) {
    console.error('[renderMyProfile]', err);
    if (headerEl) headerEl.innerHTML = '';
    showToast('Erro ao carregar Meu Perfil.', 'error');
  }
}

async function uploadAdminPhoto(input) {
  const file=input.files[0]; if(!file)return;
  if(file.size>3*1024*1024){showToast('Máx. 3MB.','warning');return;}
  showLoading('Salvando foto...');
  try {
    const url = await uploadImage(file, 'profile-photos', ADMIN_ID || Auth.getSession()?.id);
    const updated = await DB.updateUser(ADMIN_ID, { photo_url: url });
    _cacheDel?.('users');
    const me = updated || await DB.getUser(ADMIN_ID);
    if (typeof renderAdminSidebar === 'function') renderAdminSidebar(me);
    await renderMyProfile();
    showToast('Foto atualizada.', 'success');
  } catch(e){console.error(e);showToast('Erro ao salvar foto.','error');} finally{hideLoading();}
}

async function saveMyProfile() {
  const name  = document.getElementById('myName').value.trim();
  const email = document.getElementById('myEmail').value.trim();
  const current = document.getElementById('myPwdCurrent')?.value || '';
  const pwd   = document.getElementById('myPwd').value;
  const pwd2  = document.getElementById('myPwdConfirm').value;
  if (!name||!email) { showToast('Nome e e-mail obrigatórios.','warning'); return; }
  if (pwd) {
    if (!current) { showToast('Informe a senha atual para alterar.','warning'); return; }
    const me = await Auth.getCurrentUser();
    if (!me || !(await DB.verifyCurrentPassword(me.id, current))) { showToast('Senha atual incorreta.','error'); return; }
    if (pwd.length < 4) { showToast('Nova senha: mínimo 4 caracteres.','warning'); return; }
    if (pwd !== pwd2) { showToast('As senhas não coincidem.','error'); return; }
  }
  const updates = { name, email };
  if (pwd) updates.password = pwd;
  showLoading('Salvando...');
  try {
    await DB.updateUser(ADMIN_ID, updates);
    // Atualizar sessão
    const s = Auth.getSession();
    const newSession = JSON.stringify({...s, name});
    localStorage.setItem(Auth.SESSION_KEY, newSession);
    sessionStorage.setItem(Auth.SESSION_KEY, newSession);
    const meAfter = await DB.getUser(ADMIN_ID);
    if (typeof renderAdminSidebar === 'function') renderAdminSidebar(meAfter);
    await renderMyProfile();
    document.getElementById('myPwdCurrent').value = '';
    document.getElementById('myPwd').value = '';
    document.getElementById('myPwdConfirm').value = '';
    showToast('Perfil atualizado!','success');
  } finally { hideLoading(); }
}

/* ══════════════════════════════════════════════
   FUNCIONÁRIOS
══════════════════════════════════════════════ */
async function renderEmployeesTable() {
  if (!CAN_EMPLOYEES_PANEL) return;
  const q    = (document.getElementById('empSearch')?.value||'').toLowerCase();
  const roleShort = {
    desenvolvedor: 'Dev/TI', supervisor: 'Supervisor', sup_backoffice: 'Sup. Backoffice',
    backoffice: 'Backoffice', gerente: 'Gerente', financeiro: 'Financeiro', financial: 'Financeiro',
    rh: 'RH', operacional: 'Operacional',
    vendedor: 'Vendedor', employee: 'Funcionário', parceiro: 'Parceiro',
  };
  let emps;
  if (PARTNER_ROOT_ID) {
    emps = await DB.getPartnerTeam(PARTNER_ROOT_ID);
  } else if (IS_MASTER || ((IS_FINANCIAL || IS_RH) && !PARTNER_ROOT_ID)) {
    emps = await DB.getAllEmployees();
  } else if (IS_DESENVOLVEDOR) {
    const all = await DB.getAllEmployees();
    emps = all.filter(e => e.role === 'desenvolvedor' || e.department === 'Desenvolvimento');
  } else if (IS_SUPERVISOR) {
    emps = await DB.getEmployeesByAdmin(ADMIN_ID);
  } else {
    emps = await DB.getEmployeesByAdmin(ADMIN_ID);
  }
  if (q) emps = emps.filter(e=>e.name.toLowerCase().includes(q)||e.email.toLowerCase().includes(q)||e.matricula.toLowerCase().includes(q));
  const maxB = Math.max(...emps.map(e => userPts(e)), 1);
  const tbody = document.getElementById('employeesTbody');
  if (!emps.length) {
    tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--color-text-muted);">Nenhum funcionário. <button class="btn btn-primary btn-sm" style="margin-left:12px;" onclick="openAddEmployeeModal()">+ Adicionar</button></td></tr>`;
    return;
  }
  const empReadOnly = (IS_SUPERVISOR && !PARTNER_ROOT_ID) || (PARTNER_ROOT_ID && !canManagePartnerTeam());
  tbody.innerHTML = emps.map(e=>`<tr><td><div class="employee-avatar-cell">${avatarHtml(e.name,'avatar-sm',e.photo_url||'')}
      <div><div style="font-weight:700;">${e.name}</div><div style="font-size:12px;color:var(--color-text-muted);">${e.email}</div></div></div></td><td><code style="font-size:12px;background:var(--color-surface-2);padding:2px 6px;border-radius:4px;">${e.matricula}</code></td><td><span class="badge badge-muted">${e.department}${roleShort[e.role] ? ' · ' + roleShort[e.role] : ''}</span></td><td><span class="emp-pts-value" style="font-family:var(--font-display);font-weight:900;">${formatCurrency(userPts(e), e)}</span></td><td><div class="points-bar-wrap emp-pts-progress"><div class="points-bar"><div class="points-bar-fill" style="width:${Math.round((userPts(e)/maxB)*100)}%"></div></div></div></td><td>${e.active?'<span class="badge badge-success">Ativo</span>':'<span class="badge badge-danger">Inativo</span>'}</td><td><div style="display:flex;gap:6px;flex-wrap:wrap;">
      ${empReadOnly ? '<span style="font-size:12px;color:var(--color-text-muted);">Somente leitura</span>' : `
        <button class="btn btn-primary btn-sm" onclick="quickAddPoints('${e.id}','${e.name.replace(/'/g,"\\'")}')">Pontos</button><button class="btn btn-ghost btn-sm" onclick="${(roleShort[e.role] && !PARTNER_ROOT_ID) ? `masterEditUser('${e.id}')` : `editEmployee('${e.id}')`}" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button><button class="btn btn-ghost btn-sm" onclick="toggleEmployee('${e.id}')">${e.active?'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-danger);vertical-align: middle;" title="Desativar"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>':'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-success);vertical-align: middle;" title="Ativar"><polyline points="20 6 9 17 4 12"></polyline></svg>'}</button><button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="delEmployee('${e.id}','${e.name.replace(/'/g,"\\'")}')" title="Apagar"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-danger);vertical-align: middle;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
      `}
    </div></td></tr>`).join('');
}

function openAddEmployeeModal() {
  if (IS_SUPERVISOR && !PARTNER_ROOT_ID) { showToast('Supervisor não pode criar funcionários.','error'); return; }
  if (PARTNER_ROOT_ID && !canManagePartnerTeam()) { showToast('Sem permissão para cadastrar equipe.','error'); return; }
  const isPartnerTeam = !!PARTNER_ROOT_ID;
  document.getElementById('empModalTitle').textContent = isPartnerTeam ? 'Novo membro da equipe' : 'Novo Funcionário';
  ['editEmpId','empName','empEmail','empMatricula'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('empPassword').value='123456';
  document.getElementById('empBalance').value='0';
  _togglePartnerTeamRoleField(isPartnerTeam);
  const teamSel = document.getElementById('empTeamRole');
  if (isPartnerTeam && teamSel && typeof PartnerPerms !== 'undefined') {
    teamSel.value = 'vendedor';
    _syncEmpDeptFromTeamRole();
  } else {
    document.getElementById('empDept').value = IS_DESENVOLVEDOR ? 'Desenvolvimento' : 'Vendas';
  }
  openModal('addEmployeeModal');
}
async function editEmployee(id) {
  if (IS_SUPERVISOR && !PARTNER_ROOT_ID) { showToast('Supervisor não pode editar funcionários.','error'); return; }
  if (PARTNER_ROOT_ID && !canManagePartnerTeam()) { showToast('Sem permissão para editar equipe.','error'); return; }
  const e=await DB.getUser(id, true); if(!e)return;
  const teamRoot = PARTNER_ROOT_ID;
  if (!IS_MASTER && !((IS_FINANCIAL || IS_RH) && !teamRoot) && e.admin_id !== ADMIN_ID && e.admin_id !== teamRoot) return;
  document.getElementById('empModalTitle').textContent = teamRoot ? 'Editar membro da equipe' : 'Editar Funcionário';
  document.getElementById('editEmpId').value=e.id; document.getElementById('empName').value=e.name;
  document.getElementById('empEmail').value=e.email; document.getElementById('empMatricula').value=e.matricula;
  document.getElementById('empPassword').value=e.password;
  _togglePartnerTeamRoleField(!!teamRoot);
  const teamSel = document.getElementById('empTeamRole');
  if (teamRoot && teamSel) {
    const partnerRoles = (typeof PartnerPerms !== 'undefined' && PartnerPerms.TEAM_ROLES)
      ? PartnerPerms.TEAM_ROLES.map(r => r.value)
      : ['vendedor', 'backoffice', 'operacional', 'sup_backoffice'];
    teamSel.value = partnerRoles.includes(e.role) ? e.role : 'vendedor';
    _syncEmpDeptFromTeamRole();
  } else {
    document.getElementById('empDept').value=e.department;
  }
  document.getElementById('empBalance').value=(e.balance||0).toFixed(2);
  openModal('addEmployeeModal');
}
async function saveEmployee() {
  if (IS_SUPERVISOR && !PARTNER_ROOT_ID) { showToast('Supervisor não pode editar funcionários.','error'); return; }
  if (PARTNER_ROOT_ID && !canManagePartnerTeam()) { showToast('Sem permissão para salvar equipe.','error'); return; }
  const id=document.getElementById('editEmpId').value;
  const pts = parseInt(document.getElementById('empBalance').value)||0;
  let dept = document.getElementById('empDept').value;
  let role = dept === 'Vendas' ? 'vendedor' : 'employee';
  if (PARTNER_ROOT_ID) {
    const teamSel = document.getElementById('empTeamRole');
    role = teamSel?.value || 'vendedor';
    if (role === 'financial') role = 'financeiro';
    dept = typeof PartnerPerms !== 'undefined' ? PartnerPerms.roleDept(role) : dept;
  }
  const teamAdmin = PARTNER_ROOT_ID || (((IS_FINANCIAL || IS_RH) && !PARTNER_ROOT_ID) ? null : ADMIN_ID);
  const data={name:document.getElementById('empName').value.trim(),email:DB.normalizeEmail(document.getElementById('empEmail').value),matricula:document.getElementById('empMatricula').value.trim(),password:document.getElementById('empPassword').value,department:dept,balance:pts,points:pts,role,admin_id:teamAdmin};
  if(!data.name||!data.email){showToast('Nome e e-mail obrigatórios.','warning');return;}
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    showToast('Informe um e-mail válido.', 'warning');
    return;
  }
  showLoading('Salvando...');
  try {
    if (await DB.isEmailTaken(data.email, id || null)) {
      const dup = await DB.getUserByEmail(data.email);
      const quem = dup?.name ? ` (${dup.name})` : '';
      showToast(`Este e-mail já está cadastrado${quem}. Use outro e-mail.`, 'error');
      return;
    }
    if(id){
      await DB.updateUser(id,data);
      showToast('Funcionário atualizado!','success');
    } else {
      await DB.addUser(data);
      showToast(PARTNER_ROOT_ID ? 'Membro da equipe cadastrado!' : 'Funcionário cadastrado!','success');
    }
    closeModal('addEmployeeModal');
    if (typeof invalidateSouBluCaches === 'function') invalidateSouBluCaches();
    if (typeof invalidateClientsListCache === 'function') invalidateClientsListCache();
    if (window.PartnerOps) PartnerOps.invalidate();
    const refreshes = [renderEmployeesTable()];
    if (IS_MASTER || IS_FINANCIAL || IS_RH || IS_GERENTE || IS_DESENVOLVEDOR) refreshes.push(renderDashboard(), populateBalanceSelect());
    await Promise.all(refreshes);
  } catch(err) {
    console.error('[saveEmployee]', err);
    showToast(DB.formatUserDbError ? DB.formatUserDbError(err) : (err.message || 'tente novamente'), 'error');
  } finally { hideLoading(); }
}
async function toggleEmployee(id){
  if ((IS_SUPERVISOR && !PARTNER_ROOT_ID) || !canManagePartnerTeam()) { showToast('Sem permissão para alterar status.','error'); return; }
  if (IS_RH && !confirm(`Alterar status de ${(await DB.getUser(id))?.name}?`)) return;
  const e=await DB.getUser(id);if(!e)return;await DB.updateUser(id,{active:!e.active});await renderEmployeesTable();showToast(`${e.name} ${!e.active?'ativado':'desativado'}.`,'info');}
async function delEmployee(id,name){
  if ((IS_SUPERVISOR && !PARTNER_ROOT_ID) || !canManagePartnerTeam()){showToast('Sem permissão para excluir.','error');return;}
  confirmAction(`Excluir ${name}?`,async()=>{
    showLoading('Excluindo...');
    try{
      await DB.deleteUser(id);
      if (typeof invalidateSouBluCaches === 'function') invalidateSouBluCaches();
      await renderEmployeesTable();
      await renderDashboard();
      if (IS_MASTER||IS_GERENTE||IS_FINANCIAL||IS_RH||IS_DESENVOLVEDOR) await renderMasterPanel();
      showToast(`${name} removido.`,'success');
    }catch(err){
      console.error('[delEmployee]',err);
      showToast('Erro ao excluir: '+(err.message||'tente novamente'),'error');
    }finally{hideLoading();}
  });
}

/* ══════════════════════════════════════════════
   SALDO
══════════════════════════════════════════════ */
async function populateBalanceSelect() {
  if (IS_SUPERVISOR || IS_RH) return;
  if (!document.getElementById('balanceEmployee')) return;
  let rows = [];
  if (IS_MASTER || IS_FINANCIAL || IS_GERENTE || IS_DESENVOLVEDOR) {
    rows = await DB.getAllUsers().catch(() => []);
  } else {
    rows = await DB.getEmployeesByAdmin(ADMIN_ID);
  }
  rows = (rows || [])
    .filter(e => e.active !== false)
    .filter(e => typeof isUserInPartnerNetworkSync !== 'function' || !isUserInPartnerNetworkSync(e))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
  document.getElementById('balanceEmployee').innerHTML =
    `<option value="">Selecione...</option>`+
    rows.map(e => {
      const pts = formatCurrency(userPts(e), e);
      const rl = e.role ? String(e.role) : '–';
      const tag = e.matricula ? e.matricula : (e.email ? e.email.split('@')[0] : e.id.slice(-6));
      return `<option value="${e.id}">${e.name} (${tag}) — ${pts} · ${rl}</option>`;
    }).join('');
}
async function renderBalanceHistory() {
  const box = document.getElementById('balanceHistory');
  if (!box) return;

  // Histórico usa a mesma regra de escopo que dashboard/pedidos (_transactionsForRole).
  let txs = [];
  try {
    txs = (IS_MASTER || IS_GERENTE || IS_FINANCIAL || IS_RH || IS_DIRETORIA)
      ? await DB.getTransactions()
      : await _transactionsForRole();
  } catch (e) {
    console.warn('[renderBalanceHistory]', e);
    txs = [];
  }

  txs = (txs || [])
    .slice()
    .sort((a, b) => new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0))
    .slice(0, 30);

  if (!txs.length) {
    box.innerHTML = '<div class="text-muted text-center" style="padding:20px;">Nenhuma movimentação.</div>';
    return;
  }

  const cache = {};
  box.innerHTML = (await Promise.all(txs.map(async t => {
    if (!cache[t.employee_id]) cache[t.employee_id] = await DB.getUser(t.employee_id);
    const emp = cache[t.employee_id];
    const isCr = t.type === 'credit';
    const metaLine = typeof formatTransactionMetaLine === 'function' ? formatTransactionMetaLine(t.meta) : '';
    const subLinha = `${t.reason || '—'}${metaLine ? ' · ' + metaLine : ''} · ${timeAgo(t.created_at || t.date)}`;
    return `<div class="tx-item"><div class="tx-icon ${isCr ? 'earn' : 'spend'}">${txTypeIcon(t.type)}</div><div class="tx-info"><div class="tx-title">${emp?.name || '–'}</div><div class="tx-date">${subLinha}</div></div><div class="tx-amount ${isCr ? 'earn' : 'spend'}">${isCr ? '+' : '−'}${formatCurrency(t.amount, emp)}</div></div>`;
  }))).join('');
}

/* ══════════════════════════════════════════════
   PRODUTOS
══════════════════════════════════════════════ */
async function renderProductsTable() {
  if (IS_SUPERVISOR || IS_RH) return;
  const prods = await DB.getProducts(IS_MASTER||IS_FINANCIAL ? null : ADMIN_ID);
  const tbody = document.getElementById('productsTbody');
  if(!prods.length){tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--color-text-muted);">Nenhum produto. <button class="btn btn-primary btn-sm" style="margin-left:12px;" onclick="openAddProductModal()">+ Adicionar</button></td></tr>`;return;}
  tbody.innerHTML=prods.map(p=>{
    const img=p.image_url?`<img src="${p.image_url}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;">`:`<span style="font-size:26px;">${p.emoji||''}</span>`;
    return`<tr><td><div style="display:flex;align-items:center;gap:10px;">${img}<div><div style="font-weight:700;font-size:14px;">${p.name}</div><div style="font-size:11px;color:var(--color-text-muted);">${(p.description||'').slice(0,40)}${(p.description||'').length>40?'…':''}</div></div></div></td><td><span class="badge badge-muted">${p.category}</span></td><td><span class="pts-orange" style="font-family:var(--font-display);font-weight:900;">${formatCurrency(p.price)}</span></td><td><span class="${p.stock===0?'text-danger':p.stock<5?'text-warning':'text-success'}" style="font-weight:700;">${p.stock} un.</span></td><td>${p.active?'<span class="badge badge-success">Ativo</span>':'<span class="badge badge-muted">Inativo</span>'}</td><td>${p.featured?'':'–'}</td><td><div style="display:flex;gap:6px;"><button class="btn btn-ghost btn-sm" onclick="editProduct('${p.id}')" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button><button class="btn btn-ghost btn-sm" onclick="toggleProduct('${p.id}')">${p.active?'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-danger);vertical-align: middle;" title="Desativar"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>':'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-success);vertical-align: middle;" title="Ativar"><polyline points="20 6 9 17 4 12"></polyline></svg>'}</button><button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="deleteProduct('${p.id}')" title="Apagar"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-danger);vertical-align: middle;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div></td></tr>`;
  }).join('');
}

function openAddProductModal(){
  _prodImgUrl='';
  document.getElementById('prodModalTitle').textContent='Novo Produto';
  document.getElementById('editProdId').value='';
  ['prodName','prodDesc','prodPrice','prodStock'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('prodEmoji').value='';document.getElementById('prodCategory').value='Tecnologia';document.getElementById('prodFeatured').checked=false;
  document.getElementById('prodImagePreview').style.display='none';document.getElementById('prodImageFile').value='';
  const th=document.getElementById('prodImgThumb');if(th)th.innerHTML='<span style="font-size:32px;"></span>';
  openModal('addProductModal');
}
async function editProduct(id){
  const p=await DB.getProduct(id);if(!p)return;
  _prodImgUrl=p.image_url||'';
  document.getElementById('prodModalTitle').textContent='Editar Produto';
  document.getElementById('editProdId').value=p.id;document.getElementById('prodName').value=p.name;
  document.getElementById('prodDesc').value=p.description;document.getElementById('prodCategory').value=p.category;
  document.getElementById('prodEmoji').value=p.emoji||'';document.getElementById('prodPrice').value=(p.price||0).toFixed(2);
  document.getElementById('prodStock').value=p.stock;document.getElementById('prodFeatured').checked=p.featured;
  document.getElementById('prodImageFile').value='';
  const prev=document.getElementById('prodImagePreview'),th=document.getElementById('prodImgThumb');
  if(_prodImgUrl){prev.src=_prodImgUrl;prev.style.display='block';if(th)th.innerHTML=`<img src="${_prodImgUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;}
  else{prev.style.display='none';if(th)th.innerHTML=`<span style="font-size:32px;">${p.emoji||''}</span>`;}
  openModal('addProductModal');
}
async function handleProductImageUpload(input){
  const file=input.files[0];if(!file)return;
  if(file.size>3*1024*1024){showToast('Máx 3MB.','warning');input.value='';return;}
  showLoading('Enviando imagem...');
  try{
    _prodImgUrl=await uploadImage(file,'product-images');
    const prev=document.getElementById('prodImagePreview'),th=document.getElementById('prodImgThumb');
    prev.src=_prodImgUrl;prev.style.display='block';
    if(th)th.innerHTML=`<img src="${_prodImgUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
    showToast('Imagem carregada!','success');
  }catch(e){console.error(e);showToast('Erro ao enviar.','error');}finally{hideLoading();}
}
function removeProductImage(){_prodImgUrl='';document.getElementById('prodImageFile').value='';document.getElementById('prodImagePreview').style.display='none';const th=document.getElementById('prodImgThumb');const emoji=document.getElementById('prodEmoji')?.value||'';if(th)th.innerHTML=`<span style="font-size:32px;">${emoji}</span>`;}
async function saveProduct(){
  const id=document.getElementById('editProdId').value;
  const data={name:document.getElementById('prodName').value.trim(),description:document.getElementById('prodDesc').value.trim(),category:document.getElementById('prodCategory').value,emoji:document.getElementById('prodEmoji').value||'',image_url:_prodImgUrl,price:parseFloat(document.getElementById('prodPrice').value),points_price:parseFloat(document.getElementById('prodPrice').value),stock:parseInt(document.getElementById('prodStock').value),featured:document.getElementById('prodFeatured').checked,admin_id:ADMIN_ID};
  if(!data.name||isNaN(data.price)||data.price<0||isNaN(data.stock)){showToast('Preencha os campos.','warning');return;}
  showLoading();
  try{
    if(id){await DB.updateProduct(id,data);showToast('Produto atualizado!','success');}
    else{await DB.addProduct(data);showToast('Produto cadastrado!','success');}
    closeModal('addProductModal');await renderProductsTable();await renderDashboard();
  }finally{hideLoading();}
}
async function toggleProduct(id){const p=await DB.getProduct(id);if(!p)return;await DB.updateProduct(id,{active:!p.active});await renderProductsTable();showToast(`${p.name} ${!p.active?'ativado':'desativado'}.`,'info');}
async function deleteProduct(id){
  const p=await DB.getProduct(id);
  if(!p){showToast('Produto não encontrado.','error');return;}
  confirmAction(`Excluir "${p.name}"?`,async()=>{
    showLoading();
    try{
      await DB.deleteProduct(id);
      await renderProductsTable();
      await renderDashboard();
      showToast('Produto removido.','success');
    }catch(e){
      console.error('deleteProduct',e);
      const msg=(e?.message||'').includes('23503')||/foreign key|violates/i.test(e?.message||'')
        ? 'Não foi possível excluir: existem pedidos vinculados a este produto.'
        : 'Erro ao excluir produto. Tente novamente.';
      showToast(msg,'error');
    }finally{hideLoading();}
  });
}

/* ══════════════════════════════════════════════
   PEDIDOS
══════════════════════════════════════════════ */
const STATUS_OPT=['pendente','aprovado','enviado','entregue','cancelado'];
async function renderOrdersTable(){
  invalidateSouBluCaches();
  const q=(document.getElementById('orderSearch')?.value||'').toLowerCase();
  let orders = await _ordersForRole();
  orders = (orders || []).slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  if(q)orders=orders.filter(o=>(o.order_code||'').toLowerCase().includes(q));
  const tbody=document.getElementById('ordersTbody');
  if(!orders.length){tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--color-text-muted);">Nenhum pedido.</td></tr>`;return;}
  const cache={};
  tbody.innerHTML=(await Promise.all(orders.map(async o=>{
    if(!cache[o.employee_id])cache[o.employee_id]=await DB.getUser(o.employee_id);
    const emp=cache[o.employee_id];const items=Array.isArray(o.items)?o.items:(typeof o.items==='string'?JSON.parse(o.items||'[]'):[]);
    return`<tr><td><strong>${o.order_code||o.id}</strong></td><td><div class="employee-avatar-cell">${avatarHtml(emp?.name||'–','avatar-sm',emp?.photo_url||'')}
    <div><div style="font-weight:600;font-size:13px;">${emp?.name||'Desconhecido'}</div><div style="font-size:11px;color:var(--color-text-muted);">${emp?.department||''}</div></div></div></td><td>${items.map(i=>`<span style="font-size:11px;background:var(--color-surface-2);padding:2px 7px;border-radius:4px;margin:2px;display:inline-block;">${i.name} x${i.qty}</span>`).join('')}</td><td><span class="pts-orange" style="font-family:var(--font-display);font-weight:900;">${formatCurrency(o.total_points ?? o.total_price ?? 0)}</span></td><td style="font-size:12px;color:var(--color-text-muted);">${formatDate(o.created_at)}</td><td>${orderStatusBadge(o.status)}</td><td><select style="font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--color-border);" onchange="changeOrderStatus('${o.id}',this.value)">${STATUS_OPT.map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${s[0].toUpperCase()+s.slice(1)}</option>`).join('')}</select><button onclick="deleteOrder('${o.id}')" title="Apagar pedido" style="margin-left:6px;background:none;border:1px solid #ff4d4d;color:#ff4d4d;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px;line-height:1.4;" onmouseover="this.style.background='#ff4d4d';this.style.color='#fff'" onmouseout="this.style.background='none';this.style.color='#ff4d4d'">Apagar</button></td></tr>`;
  }))).join('');
}
async function changeOrderStatus(id,status){await DB.updateOrderStatus(id,status);await renderOrdersTable();await updatePendingBadge();await renderDashboard();showToast(`Pedido → "${status}"`,'success');}
async function deleteOrder(id){if(!confirm('Apagar este pedido? Essa ação não pode ser desfeita.'))return;await DB.deleteOrder(id);await renderOrdersTable();await updatePendingBadge();await renderDashboard();showToast('Pedido apagado.','success');}
async function updatePendingBadge(){const orders=await _ordersForRole();const n=orders.filter(o=>o.status==='pendente').length;const b=document.getElementById('pendingBadge');if(b){b.textContent=n;b.style.display=n>0?'inline':'none';}}

/* ══════════════════════════════════════════════
   SAQUES — Dupla aprovação: Master + Financeiro
══════════════════════════════════════════════ */
async function renderWithdrawalsTable(){
  const wds = (IS_MASTER || IS_FUNDA || IS_FINANCIAL || IS_RH)
    ? await DB.getWithdrawals()
    : await DB.getWithdrawalsByAdmin(ADMIN_ID);
  const tbody=document.getElementById('withdrawalsTbody');if(!tbody)return;
  if(!wds.length){
    tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--color-text-muted);">Nenhum saque solicitado.</td></tr>`;
    return;
  }
  const gwConfigured = !!(window.SOUBLU_CONFIG?.PIX_GATEWAY_URL && window.SOUBLU_CONFIG?.PIX_GATEWAY_BEARER);
  const cache={};
  tbody.innerHTML=(await Promise.all(wds.map(async w=>{
    if(!cache[w.employee_id])cache[w.employee_id]=await DB.getUser(w.employee_id);
    const emp=cache[w.employee_id];
    const mOk = w.approved_by_master;
    const fOk = w.approved_by_financial;

    const empPartner = emp?.admin_id
      ? await DB.getPartnerByUserId(emp.admin_id).catch(() => null)
      : (emp?.role === 'parceiro' ? await DB.getPartnerByUserId(emp.id).catch(() => null) : null);
    const orgBadge = empPartner
      ? `<span class="badge badge-info" style="font-size:10px;display:block;margin-top:4px;">Parceiro</span>`
      : '';

    // Botão Master: só aparece para master/fundador e saque não rejeitado/pago
    const btnMaster = ((IS_MASTER || IS_FUNDA) && !mOk && !['pago','rejeitado'].includes(w.status))
      ? `<button class="btn btn-success btn-sm" style="width:100%;margin-top:4px;font-size:11px;"
           onclick="approveWdMaster('${w.id}')">Aprovar</button>`
      : '';

    // Botão Financeiro: só aparece para financeiro e saque não rejeitado/pago
    const btnFin = (IS_FINANCIAL && !fOk && !['pago','rejeitado'].includes(w.status))
      ? `<button class="btn btn-success btn-sm" style="width:100%;margin-top:4px;font-size:11px;background:#2563eb;border-color:#2563eb;"
           onclick="approveWdFin('${w.id}')">Aprovar</button>`
      : '';

    // Botão rejeitar: master ou financeiro
    const btnReject = (((IS_MASTER || IS_FUNDA) || IS_FINANCIAL) && !['pago','rejeitado'].includes(w.status))
      ? `<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:4px;font-size:11px;color:var(--color-danger);"
           onclick="rejectWd('${w.id}')">Rejeitar</button>`
      : '';

    // Card de aprovação — altura igual sempre com min-height fixo
    const cardStyle = (ok, cor) =>
      `border:1.5px solid ${ok?'var(--color-success)':cor||'var(--color-border)'};
       border-radius:var(--radius-md);padding:8px;text-align:center;
       background:${ok?'rgba(0,179,65,.06)':'var(--color-surface-2)'};
       width:100px;min-height:80px;display:flex;flex-direction:column;
       align-items:center;justify-content:center;gap:2px;`;

    const cardMaster = `
      <div style="${cardStyle(mOk)}"><div style="font-size:10px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Master</div>
        ${mOk
          ? `<span style="font-size:14px;font-weight:700;color:var(--color-success);">Aprovado</span>`
          : `<span style="font-size:14px;font-weight:700;color:var(--color-text-muted);">Pendente</span>`}
        ${btnMaster}
      </div>`;

    const cardFin = `
      <div style="${cardStyle(fOk,'var(--color-info-light)')}"><div style="font-size:10px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Financeiro</div>
        ${fOk
          ? `<span style="font-size:14px;font-weight:700;color:var(--color-success);">Aprovado</span>`
          : `<span style="font-size:14px;font-weight:700;color:var(--color-text-muted);">Pendente</span>`}
        ${btnFin}
      </div>`;

    const receiptBtn = (typeof canDownloadWdReceipt === 'function' && canDownloadWdReceipt(w))
      ? `<button type="button" class="btn btn-outline btn-sm" style="font-size:11px;white-space:nowrap;"
           onclick="downloadWdReceipt('${w.id}')" title="Baixar comprovante">Comprovante</button>`
      : `<span style="font-size:11px;color:var(--color-text-muted);">—</span>`;

    const refreshPixBtn = (gwConfigured && (IS_MASTER || IS_FUNDA || IS_FINANCIAL) && w.approved_by_master && w.approved_by_financial && w.status !== 'rejeitado')
      ? `<button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;margin-top:4px;padding:2px 6px;"
           onclick="refreshWdPixStatus('${w.id}')" title="Consultar status na Efi">↻ Atualizar</button>`
      : '';

    const pixBankCell = `${typeof pixWdStatusBadge === 'function' ? pixWdStatusBadge(w) : '—'}${refreshPixBtn}`;

    return`<tr><td><div class="employee-avatar-cell">
        ${avatarHtml(emp?.name||'–','avatar-sm',emp?.photo_url||'')}
        <div style="font-size:13px;font-weight:600;">${emp?.name||'–'}</div>
        ${orgBadge}
      </div></td><td><span class="pts-orange" style="font-family:var(--font-display);font-weight:900;">
        ${formatCurrency(w.amount, emp)}
      </span></td><td><div style="font-size:12px;"><strong>${w.pix_key_type.toUpperCase()}</strong></div><div style="font-size:12px;color:var(--color-text-muted);">${w.pix_key}</div><div style="font-size:11px;color:var(--color-text-muted);">${w.holder_name}${w.bank_name?' · '+w.bank_name:''}</div></td><td style="font-size:12px;">${formatDate(w.created_at)}</td><td>${wdStatusBadge(w.status)}</td><td>${pixBankCell}</td><td style="text-align:center;">${receiptBtn}</td><td><input type="text" style="font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--color-border);width:110px;"
        placeholder="Observação" id="note_${w.id}" value="${w.admin_note||''}"></td><!-- MASTER + FINANCEIRO lado a lado na mesma célula --><td><div style="display:flex;gap:8px;align-items:flex-start;">
        ${cardMaster}
        ${cardFin}
      </div>
      ${(!['pago','rejeitado'].includes(w.status)&&(IS_MASTER||IS_FINANCIAL))
        ? `<div style="margin-top:6px;">${btnReject}</div>`
        : ''}
    </td></tr>`;
  }))).join('');
}

async function _toastPixAfterApproval(wd) {
  const pix = wd?._pixResult;
  if (!pix || pix.skipped) return;
  if (pix.ok) showToast('PIX enviado com sucesso!','success');
  else showToast('Falha ao enviar PIX: ' + (pix.error || 'erro'),'error', 8000);
}

async function downloadWdReceipt(id) {
  const wd = await DB.getWithdrawalById(id);
  if (!wd) { showToast('Saque não encontrado.', 'error'); return; }
  const emp = await DB.getUser(wd.employee_id).catch(() => null);
  if (typeof downloadWithdrawalReceipt === 'function') downloadWithdrawalReceipt(wd, emp);
  else showToast('Função de comprovante indisponível.', 'error');
}

async function refreshWdPixStatus(id) {
  if (!(IS_MASTER || IS_FINANCIAL)) { showToast('Sem permissão.', 'error'); return; }
  showLoading('Consultando status no banco...');
  try {
    const r = await DB.refreshWithdrawalPixStatus(id);
    await renderWithdrawalsTable();
    if (r?.ok === false && !r?.skipped) {
      showToast(r.error || 'Não foi possível atualizar o status.', 'warning');
    } else if (r?.skipped) {
      showToast('Gateway PIX não configurado — exibindo último status salvo.', 'info');
    } else {
      showToast('Status bancário atualizado.', 'success');
    }
  } catch (e) {
    showToast('Erro ao consultar status: ' + (e.message || e), 'error');
  } finally { hideLoading(); }
}

async function approveWdMaster(id) {
  const note = document.getElementById('note_'+id)?.value||'';
  showLoading('Aprovando...');
  try {
    const wd = await DB.approveWdMaster(id, note);
    if (!wd) { showToast('Saque não encontrado ou falha ao aprovar.', 'error'); return; }
    await renderWithdrawalsTable();
    await updateWithdrawalsBadge();
    let msg = wd?.approved_by_financial
      ? 'Ambas aprovações concluídas.'
      : 'Aprovado pelo Master. Aguardando aprovação do Financeiro.';
    if (wd?.approved_by_financial && typeof PIX_AUTO_ON_APPROVAL !== 'undefined' && PIX_AUTO_ON_APPROVAL) {
      msg += ' Enviando PIX automaticamente…';
    } else if (wd?.approved_by_financial) {
      msg += ' Saque marcado como PAGO!';
    }
    showToast(msg, wd?.approved_by_financial ? 'success' : 'info');
    await _toastPixAfterApproval(wd);
  } catch (e) {
    console.error('[approveWdMaster]', e);
    showToast('Erro ao aprovar saque: ' + (e.message || 'tente novamente'), 'error');
  } finally { hideLoading(); }
}

async function approveWdFin(id) {
  const note = document.getElementById('note_'+id)?.value||'';
  showLoading('Aprovando...');
  try {
    const wd = await DB.approveWdFinancial(id, note);
    if (!wd) { showToast('Saque não encontrado ou falha ao aprovar.', 'error'); return; }
    await renderWithdrawalsTable();
    await updateWithdrawalsBadge();
    let msg = wd?.approved_by_master
      ? 'Ambas aprovações concluídas.'
      : 'Aprovado pelo Financeiro. Aguardando aprovação do Master.';
    if (wd?.approved_by_master && typeof PIX_AUTO_ON_APPROVAL !== 'undefined' && PIX_AUTO_ON_APPROVAL) {
      msg += ' Enviando PIX automaticamente…';
    } else if (wd?.approved_by_master) {
      msg += ' Saque marcado como PAGO!';
    }
    showToast(msg, wd?.approved_by_master ? 'success' : 'info');
    await _toastPixAfterApproval(wd);
  } catch (e) {
    console.error('[approveWdFin]', e);
    showToast('Erro ao aprovar saque: ' + (e.message || 'tente novamente'), 'error');
  } finally { hideLoading(); }
}

async function rejectWd(id) {
  const note = document.getElementById('note_'+id)?.value||'';
  if (!confirm('Rejeitar este saque? O valor em dinheiro será devolvido ao saldo do colaborador.')) return;
  showLoading('Rejeitando e devolvendo pontos...');
  try {
    await DB.rejectWd(id, note);
    await renderWithdrawalsTable();
    await updateWithdrawalsBadge();
    showToast('Saque rejeitado — pontos devolvidos ao funcionário.','info');
  } finally { hideLoading(); }
}

function openPayConfirm(id, note='') {
  const idEl = document.getElementById('payConfirmWdId');
  const noteEl = document.getElementById('payConfirmNote');
  if (idEl) idEl.value = id;
  if (noteEl) noteEl.value = note || document.getElementById('note_' + id)?.value || '';
  openModal('payConfirmOverlay');
}

function cancelPayConfirm() {
  closeModal('payConfirmOverlay');
}

async function confirmPayment() {
  const id = document.getElementById('payConfirmWdId')?.value;
  const note = document.getElementById('payConfirmNote')?.value || '';
  if (!id) { cancelPayConfirm(); return; }
  if (!(IS_MASTER || IS_FINANCIAL)) { showToast('Sem permissão.', 'error'); return; }
  showLoading('Confirmando pagamento...');
  try {
    await DB.markWdPaid(id, note);
    await renderWithdrawalsTable();
    await updateWithdrawalsBadge();
    showToast('Saque marcado como pago!', 'success');
  } catch (e) {
    console.error('[confirmPayment]', e);
    showToast('Erro ao confirmar pagamento.', 'error');
  } finally {
    cancelPayConfirm();
    hideLoading();
  }
}

/* aprovação dupla: ver approveWdMaster / approveWdFin acima */
async function updateWithdrawalsBadge(){const wds=(IS_MASTER||IS_FINANCIAL)?await DB.getWithdrawals():await DB.getWithdrawalsByAdmin(ADMIN_ID);const n=wds.filter(w=>w.status==='solicitado').length;const b=document.getElementById('wdPendingBadge');if(b){b.textContent=n;b.style.display=n>0?'inline':'none';}}

/* ══════════════════════════════════════════════
   RANKING
══════════════════════════════════════════════ */
function _hasGlobalRankingView() {
  return IS_MASTER || IS_FUNDA || IS_GERENTE || IS_FINANCIAL || IS_RH || IS_DESENVOLVEDOR || IS_DIRETORIA;
}

async function _usersForAdminRanking() {
  if (_hasGlobalRankingView()) {
    return (await DB.getAllUsers().catch(() => [])) || [];
  }
  return (await DB.getEmployeesByAdmin(ADMIN_ID).catch(() => [])) || [];
}

async function renderAdminRanking(){
  const raw = await _usersForAdminRanking();
  const emps = raw
    .filter(isRankingParticipant)
    .filter(e => typeof isUserInPartnerNetworkSync !== 'function' || !isUserInPartnerNetworkSync(e))
    .sort((a,b)=>(b.balance||b.points||0)-(a.balance||a.points||0));
  const medals=['#1','#2','#3'],cls=['gold','silver','bronze'];
  const box=document.getElementById('adminRankingList');
  if(!box) return;
  if(!emps.length){box.innerHTML='<div class="text-muted text-center" style="padding:20px;">Nenhum colaborador no ranking.</div>';return;}
  box.innerHTML=emps.map((e,i)=>{
    const addBtn = !IS_SUPERVISOR && CAN_EMPLOYEES_PANEL
      ? `<button class="btn btn-outline btn-sm" onclick="navigateTo('secBalance');setTimeout(()=>{document.getElementById('balanceEmployee').value='${e.id}'},100)">+ Pontos</button>`
      : '';
    return `<div class="ranking-item"><div class="ranking-pos ${cls[i]||''}">${i<3?medals[i]:'#'+(i+1)}</div>
      ${avatarHtml(e.name,'avatar-sm',e.photo_url||'')}
      <div style="flex:1;"><div class="ranking-name">${e.name}</div><div class="ranking-dept">${e.department} · ${e.matricula}</div></div>
      ${addBtn}
    </div>`;
  }).join('');
}


/* ══════════════════════════════════════════════
   FEEDBACK / HISTÓRICO DO FUNCIONÁRIO
   Master, RH, Financeiro e Desenvolvimento
══════════════════════════════════════════════ */

let _feedbackEmpId   = null;
let _feedbackEmpName = '';
let _feedbacks       = [];   // cache local de feedbacks (localStorage fallback)

const FB_KEY = 'soublu_feedbacks';

function _fbLoad()       { try { return JSON.parse(localStorage.getItem(FB_KEY)||'[]'); } catch { return []; } }
function _fbSave(list)   { localStorage.setItem(FB_KEY, JSON.stringify(list)); }
function _fbId()         { return 'fb' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }

async function _employeesForSupervisorPanel() {
  if (IS_MASTER || IS_FINANCIAL || IS_RH) return DB.getAllEmployees();
  if (IS_DESENVOLVEDOR) {
    const all = await DB.getAllEmployees();
    return all.filter(e => e.role === 'desenvolvedor' || e.department === 'Desenvolvimento');
  }
  return DB.getEmployeesByAdmin(ADMIN_ID);
}

async function openFeedbackModal(empId, empName) {
  document.getElementById('fbType').value      = 'elogio';
  document.getElementById('fbTitle').value     = '';
  document.getElementById('fbContent').value   = '';
  document.getElementById('fbPrivate').checked = false;
  onFbTypeChange('elogio');

  if (empId) {
    // Chamado da tabela de funcionários — funcionário já definido
    _feedbackEmpId   = empId;
    _feedbackEmpName = empName;
    document.getElementById('fbEmpName').textContent = empName;
    document.getElementById('fbEmpSelect').style.display = 'none';
  } else {
    // Chamado do botão "Novo" da seção Feedback — mostrar select
    _feedbackEmpId   = null;
    _feedbackEmpName = '';
    document.getElementById('fbEmpName').textContent = '';
    const sel = document.getElementById('fbEmpSelect');
    sel.style.display = '';
    const emps = await _employeesForSupervisorPanel();
    sel.innerHTML = '<option value="">Selecione o funcionário...</option>' +
      emps.filter(e=>e.active).map(e=>`<option value="${e.id}" data-name="${e.name}">${e.name} — ${e.department}</option>`).join('');
    sel.onchange = () => {
      const opt = sel.options[sel.selectedIndex];
      _feedbackEmpId   = sel.value;
      _feedbackEmpName = opt.dataset.name || '';
      document.getElementById('fbEmpName').textContent = _feedbackEmpName;
    };
  }

  openModal('feedbackModal');
}

function onFbTypeChange(val) {
  const warn = document.getElementById('fbAdvert');
  if (warn) warn.style.display = val === 'advertencia' ? '' : 'none';
}

async function saveFeedback() {
  const type    = document.getElementById('fbType').value;
  const title   = document.getElementById('fbTitle').value.trim();
  const content = document.getElementById('fbContent').value.trim();
  const priv    = document.getElementById('fbPrivate').checked;
  if (!_feedbackEmpId) { showToast('Selecione um funcionário.','warning'); return; }
  if (!title || !content) { showToast('Preencha título e descrição.','warning'); return; }

  if (type === 'advertencia') {
    const emp = await DB.getUser(_feedbackEmpId);
    const pts = emp?.points || emp?.balance || 0;
    const msg = ` Aplicar advertência a ${_feedbackEmpName}?

100 pontos serão descontados automaticamente.
Saldo atual: ${pts.toLocaleString('pt-BR')} pts → ${Math.max(0,pts-100).toLocaleString('pt-BR')} pts`;
    if (!confirm(msg)) return;
  }

  showLoading('Registrando...');
  try {
    const entry = {
      id:          _fbId(),
      employee_id: _feedbackEmpId,
      author_id:   ADMIN_ID,
      type, title, content,
      private:     priv,
      created_at:  new Date().toISOString(),
    };

    // Salvar no Supabase se disponível, senão localStorage
    if (SUPABASE_CONFIGURED) {
      try { await supaReq('POST','feedbacks', entry); } catch { _saveFbLocal(entry); }
    } else { _saveFbLocal(entry); }

    // Advertência: descontar 100 pontos
    if (type === 'advertencia') {
      await DB.deductBalance(_feedbackEmpId, 100, `Advertência: ${title}`);
      showToast(` Advertência registrada — 100 pontos descontados de ${_feedbackEmpName}.`,'warning', 6000);
    } else {
      showToast(`${type.charAt(0).toUpperCase()+type.slice(1)} registrado!`,'success');
    }

    closeModal('feedbackModal');
    await renderFeedbackSection();
    if (type === 'advertencia') await renderEmployeesTable();
  } finally { hideLoading(); }
}

function _saveFbLocal(entry) {
  const list = _fbLoad(); list.unshift(entry); _fbSave(list);
}

async function renderFeedbackSection() {
  const box = document.getElementById('feedbackContent');
  if (!box) return;

  // Carregar todos os feedbacks da equipe
  let feedbacks = [];
  if (SUPABASE_CONFIGURED) {
    try { feedbacks = await supaReq('GET','feedbacks',null,'?select=*&order=created_at.desc&limit=100'); }
    catch { feedbacks = _fbLoad(); }
  } else { feedbacks = _fbLoad(); }

  // Filtrar pela equipe do supervisor
  const emps = await _employeesForSupervisorPanel();
  const empIds = new Set(emps.map(e=>e.id));
  feedbacks = feedbacks.filter(f => empIds.has(f.employee_id));

  const empCache = {};
  emps.forEach(e => empCache[e.id] = e);

  if (!feedbacks.length) {
    box.innerHTML = '<div class="text-muted text-center" style="padding:32px;"><div style="font-size:32px;margin-bottom:8px;"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-text-muted);display:inline-block;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></div><div>Nenhum registro ainda.</div></div>';
    return;
  }

  const typeConfig = {
    elogio:      { icon:'', label:'Elogio',      color:'var(--color-success)',  bg:'rgba(0,179,65,.07)',  border:'rgba(0,179,65,.25)'  },
    feedback:    { icon:'', label:'Feedback',    color:'#2563eb',               bg:'rgba(37,99,235,.07)', border:'rgba(37,99,235,.25)'  },
    advertencia: { icon:'!', label:'Advertência', color:'var(--color-warning)',   bg:'rgba(245,158,11,.07)',border:'rgba(245,158,11,.3)'  },
    observacao:  { icon:'', label:'Observação',  color:'var(--color-text-muted)',bg:'var(--color-surface-2)',border:'var(--color-border)'},
  };

  box.innerHTML = feedbacks.map(f => {
    const emp = empCache[f.employee_id];
    const tc  = typeConfig[f.type] || typeConfig.observacao;
    return `
    <div style="border-left:4px solid ${tc.border};background:${tc.bg};border-radius:0 var(--radius-lg) var(--radius-lg) 0;padding:14px 18px;margin-bottom:14px;"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;"><div style="display:flex;align-items:center;gap:10px;">
          ${avatarHtml(emp?.name||'–','avatar-sm',emp?.photo_url||'')}
          <div><span style="font-weight:700;font-size:14px;">${emp?.name||'–'}</span><span style="font-size:11px;color:var(--color-text-muted);margin-left:6px;">${emp?.department||''}</span></div></div><div style="display:flex;align-items:center;gap:8px;"><span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;background:${tc.bg};color:${tc.color};border:1px solid ${tc.border};">${tc.icon ? tc.icon + ' ' : ''}${tc.label}</span>
          ${f.private ? '<span style="font-size:11px;color:var(--color-text-muted);">Privado</span>' : ''}
          <span style="font-size:11px;color:var(--color-text-muted);">${formatDate(f.created_at)}</span></div></div><div style="font-weight:700;font-size:14px;margin-bottom:4px;">${f.title}</div><div style="font-size:13px;color:var(--color-text-secondary);line-height:1.65;">${f.content}</div>
      ${f.type==='advertencia' ? '<div style="margin-top:8px;font-size:12px;font-weight:700;color:var(--color-warning);">−100 pontos descontados automaticamente</div>' : ''}
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   RELATÓRIO DO FUNCIONÁRIO
══════════════════════════════════════════════ */
async function renderReportSection() {
  const box = document.getElementById('reportContent');
  if (!box) return;

  const emps = await _employeesForSupervisorPanel();
  const _rs=document.getElementById('reportEmpSelect'); if(!_rs) return;
  _rs.innerHTML =
    `<option value="">Selecione um funcionário...</option>` +
    emps.filter(e=>e.active).map(e=>`<option value="${e.id}">${e.name} — ${e.department}</option>`).join('');

  box.innerHTML = '<div class="text-muted text-center" style="padding:32px;">Selecione um funcionário acima.</div>';
}

async function generateReport() {
  const empId = document.getElementById('reportEmpSelect')?.value;
  if (!empId) { showToast('Selecione um funcionário.','warning'); return; }
  showLoading('Gerando relatório...');
  try {
    const [emp, txs, orders] = await Promise.all([
      DB.getUser(empId),
      DB.getTransactions(empId),
      DB.getOrdersByEmployee(empId),
    ]);
    if (!emp) { showToast('Funcionário não encontrado.','error'); return; }

    // Feedbacks do funcionário
    let feedbacks = [];
    if (SUPABASE_CONFIGURED) {
      try { feedbacks = await supaReq('GET','feedbacks',null,`?employee_id=eq.${empId}&select=*&order=created_at.desc`); }
      catch { feedbacks = _fbLoad().filter(f=>f.employee_id===empId); }
    } else { feedbacks = _fbLoad().filter(f=>f.employee_id===empId); }

    const pts = emp.points || emp.balance || 0;
    const earned = txs.filter(t=>t.type==='credit').reduce((s,t)=>s+t.amount,0);
    const spent  = txs.filter(t=>t.type==='debit').reduce((s,t)=>s+t.amount,0);
    const advertencias = feedbacks.filter(f=>f.type==='advertencia').length;
    const elogios      = feedbacks.filter(f=>f.type==='elogio').length;

    const typeConfig = {
      elogio:'', feedback:'', advertencia:'!', observacao:'',
    };

    const _rc=document.getElementById('reportContent'); if(!_rc) return;
    _rc.innerHTML = `
      <!-- Cabeçalho do funcionário --><div style="display:flex;align-items:center;gap:20px;padding:20px;background:linear-gradient(135deg,var(--color-primary-dark),var(--color-primary));border-radius:var(--radius-xl);color:#fff;margin-bottom:20px;">
        ${avatarHtml(emp.name,'avatar-lg',emp.photo_url||'')}
        <div><div style="font-family:var(--font-display);font-size:22px;font-weight:900;">${emp.name}</div><div style="opacity:.85;">${emp.department} · Matrícula: ${emp.matricula}</div><div style="opacity:.85;">${emp.email}</div></div><div style="margin-left:auto;text-align:right;"><div style="font-size:12px;opacity:.8;">Saldo atual</div><div style="font-family:var(--font-display);font-size:28px;font-weight:900;">${pts.toLocaleString('pt-BR')}</div><div style="font-size:12px;opacity:.8;">pontos</div></div></div><!-- Stats --><div class="stat-grid" style="margin-bottom:20px;">${[
      statCardHtml({ icon: 'trendUp', color: 'green', label: 'Total Ganho', value: `${earned.toLocaleString('pt-BR')} pts`, valueStyle: 'font-size:18px;' }),
      statCardHtml({ icon: 'trendDown', color: 'orange', label: 'Total Gasto', value: `${spent.toLocaleString('pt-BR')} pts`, valueStyle: 'font-size:18px;' }),
      statCardHtml({ icon: 'orders', color: 'yellow', label: 'Pedidos', value: orders.length }),
      statCardHtml({ icon: 'feedback', color: advertencias > 0 ? 'orange' : 'blue', label: 'Feedbacks', value: `${feedbacks.length} <small style="font-size:12px;">(${elogios} elogios / ${advertencias} advert.)</small>` }),
    ].join('')}</div><!-- Histórico de feedbacks --><div class="card card-padded" style="margin-bottom:16px;"><h3 style="font-family:var(--font-display);font-weight:800;margin-bottom:16px;">Histórico de Feedbacks</h3>
        ${feedbacks.length ? feedbacks.map(f=>`
          <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--color-border);"><span style="font-size:18px;flex-shrink:0;">${typeConfig[f.type]||''}</span><div style="flex:1;"><div style="font-weight:700;font-size:13px;">${f.title}</div><div style="font-size:12px;color:var(--color-text-muted);">${f.content}</div></div><span style="font-size:11px;color:var(--color-text-muted);white-space:nowrap;">${formatDate(f.created_at)}</span></div>`).join('')
          : '<div class="text-muted text-center" style="padding:12px;">Nenhum feedback registrado.</div>'}
      </div><!-- Últimas transações --><div class="card card-padded"><h3 style="font-family:var(--font-display);font-weight:800;margin-bottom:16px;">Últimas Movimentações</h3>
        ${txs.slice(0,10).map(t=>{
          const isCr = t.type==='credit';
          return `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--color-border);"><div style="width:32px;height:32px;border-radius:50%;background:${isCr?'rgba(0,179,65,.12)':'rgba(220,38,38,.1)'};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;">${isCr?'↑':'↓'}</div><div style="flex:1;"><div style="font-size:13px;font-weight:600;">${t.reason}</div><div style="font-size:11px;color:var(--color-text-muted);">${formatDate(t.created_at)}</div></div><span style="font-weight:800;color:${isCr?'var(--color-success)':'var(--color-danger)'};">${isCr?'+':'−'}${(t.amount||0).toLocaleString('pt-BR')} pts</span></div>`;
        }).join('') || '<div class="text-muted text-center" style="padding:12px;">Sem movimentações.</div>'}
      </div>`;
  } finally { hideLoading(); }
}

/* Helper: pedidos por funcionário */
if (!DB.getOrdersByEmployee) {
  DB.getOrdersByEmployee = async function(empId) {
    const all = await this.getOrders();
    return all.filter(o=>o.employee_id===empId);
  };
}

/* ============================================================
   VER COMO FUNCIONÁRIO — abre direto em nova aba (modo demo)
   ============================================================ */
async function openViewAsModal() {
  try {
    const employees = await DB.getAllEmployees();
    const ativo = employees.find(e => e.role === 'vendedor' && e.active !== false)
      || employees.find(e => e.role === 'employee' && e.active !== false);
    if (!ativo) {
      alert('Nenhum funcionário cadastrado para visualizar.');
      return;
    }
    window.open(`${Auth.employeePageHref()}?preview=${encodeURIComponent(ativo.id)}`, '_blank');
  } catch (err) {
    alert('Erro ao abrir visualização: ' + (err.message || err));
  }
}

// Mantida apenas por compatibilidade com possíveis chamadas antigas
function doViewAs() { openViewAsModal(); }

let _clientsTableInflight = null;
let _clientsListCache = null;
let _clientsListCacheTs = 0;
const _CLIENTS_CACHE_MS = 20000;

async function _supervisorNameMap() {
  let users = Array.isArray(_allUsersCache) && _allUsersCache.length ? _allUsersCache : null;
  if (!users) {
    users = await DB.getAllUsers().catch(() => []);
    if (users.length) _allUsersCache = users;
  }
  const map = new Map();
  (users || []).forEach(u => { if (u?.id) map.set(String(u.id), u.name || '—'); });
  return map;
}

async function _partnerExcludeSupervisorIds() {
  if (!window.PartnerOps?._getIndex) return new Set();
  const index = await PartnerOps._getIndex();
  const set = new Set();
  index.forEach(e => { (e.allIds || []).forEach(id => set.add(String(id))); });
  return set;
}

async function renderClientsTable(force = false) {
  if (_clientsTableInflight) return _clientsTableInflight;
  _clientsTableInflight = _renderClientsTableBody(force);
  try {
    return await _clientsTableInflight;
  } finally {
    _clientsTableInflight = null;
  }
}

async function _renderClientsTableBody(force = false) {
  const tbody = document.getElementById('clientsTbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--color-text-muted);">Carregando clientes…</td></tr>';

  const now = Date.now();
  if (!force && _clientsListCache && (now - _clientsListCacheTs) < _CLIENTS_CACHE_MS) {
    _paintClientsTable(tbody, _clientsListCache.rows, _clientsListCache.nameMap);
    return;
  }

  try {
    let teamIds = null;
    const clientsProm = (async () => {
      if (PARTNER_ROOT_ID) {
        return DB.getClients({ partnerRootId: PARTNER_ROOT_ID, pageSize: 500 }) || [];
      }
      if (IS_SUPERVISOR) {
        const rootId = ADMIN_ID;
        const team = await DB.getTeamMemberIds(rootId).catch(() => []);
        teamIds = [...new Set([rootId, ADMIN_ID, window.USER_ADMIN_ID, ...team].filter(Boolean))];
        return DB.getClients({ supervisorIds: teamIds, pageSize: 400 }) || [];
      }
      return DB.getClients({ pageSize: 400 }) || [];
    })();

    const excludeProm = PARTNER_ROOT_ID
      ? Promise.resolve(null)
      : ((window.CAN_PARTNER_OPS_HUB && window.PartnerOps)
        ? _partnerExcludeSupervisorIds()
        : Promise.resolve(null));

    const [clientsRaw, nameMap, excludeIds] = await Promise.all([
      clientsProm,
      _supervisorNameMap(),
      excludeProm,
    ]);

    let clients = clientsRaw || [];
    if (excludeIds?.size) {
      clients = clients.filter(c => !excludeIds.has(String(c.supervisorId || c.supervisor_id || '')));
    }

    _clientsListCache = { rows: clients, nameMap };
    _clientsListCacheTs = Date.now();
    _paintClientsTable(tbody, clients, nameMap);
  } catch (err) {
    console.warn('[renderClientsTable]', err);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--color-danger);">Erro ao carregar clientes. Tente F5 ou verifique a conexão.</td></tr>';
  }
}

function _paintClientsTable(tbody, clients, nameMap) {
  if (!clients.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">Nenhum cliente cadastrado</td></tr>';
    return;
  }
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  tbody.innerHTML = clients.map(client => {
    const sid = String(client.supervisorId || client.supervisor_id || '');
    const supervisorName = nameMap.get(sid) || '—';
    const cpf = esc(client.cpf);
    return `<tr><td><strong>${esc(supervisorName)}</strong></td><td>${esc(client.name) || '-'}</td><td>${cpf || '-'}</td><td>${esc(client.phone1) || '-'}</td><td>${esc(client.email) || '-'}</td><td>${esc(client.rg) || '-'}</td><td style="display:flex;gap:6px;"><button class="btn btn-outline btn-sm" onclick="editClientAdmin('${cpf}')"> Editar</button><button class="btn btn-ghost btn-sm" onclick="viewClientDetails('${cpf}')"> Ver</button></td></tr>`;
  }).join('');
}

function invalidateClientsListCache() {
  _clientsListCache = null;
  _clientsListCacheTs = 0;
}
window.invalidateClientsListCache = invalidateClientsListCache;

async function editClientAdmin(cpf) {
  const client = await DB.get('clients', cpf);
  if (!client) { showToast('Cliente não encontrado.', 'error'); return; }

  const fields = ['clientCpf','clientName','clientPhone1','clientPhone2','clientRg','clientCivil','clientAddress','clientEmail','clientMother','clientFather'];
  const values = {
    clientCpf: client.cpf, clientName: client.name, clientPhone1: client.phone1||'',
    clientPhone2: client.phone2||'', clientRg: client.rg||'', clientCivil: client.civilState||'',
    clientAddress: client.address||'', clientEmail: client.email||'',
    clientMother: client.motherName||'', clientFather: client.fatherName||''
  };
  fields.forEach(f => { const el = document.getElementById(f); if (el) el.value = values[f] || ''; });

  // Guarda CPF original para update
  const modal = document.getElementById('clientModal');
  if (modal) {
    modal.dataset.editCpf = cpf;
    modal.classList.add('open');
  }
}

async function viewClientDetails(cpf) {
  const client = await DB.get('clients', cpf);
  if (!client) { showToast('Cliente não encontrado.','error'); return; }
  const lines = [
    `Nome: ${client.name}`, `CPF: ${client.cpf}`, `RG: ${client.rg||'—'}`,
    `Telefone: ${client.phone1||'—'}`, `Estado Civil: ${client.civilState||'—'}`,
    `Endereço: ${client.address||'—'}`, `Email: ${client.email||'—'}`,
    `Mãe: ${client.motherName||'—'}`, `Pai: ${client.fatherName||'—'}`
  ];
  alert(lines.join('\n'));
}

function openClientModalAdmin() {
  // Abre o modal de novo cliente (igual ao dos vendedores)
  if (window.Clients && window.Clients.openModal) {
    Clients.openModal();
  } else {
    alert('Erro: Modal de cliente não carregado');
  }
}

function openProposalModalAdmin() {
  // Abre o modal de nova proposta (igual ao dos vendedores)
  if (window.Proposals && window.Proposals.openModal) {
    Proposals.openModal();
  } else {
    alert('Erro: Modal de proposta não carregado');
  }
}
