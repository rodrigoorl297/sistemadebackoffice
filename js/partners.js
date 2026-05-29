/* ==========================================================
   SOU + BLU – Permissões de Parceiros [OTIMIZADO]
   ========================================================== */

const PartnerPerms = {
  DEFAULT: {
    cadastrar_cliente: true,
    cadastrar_proposta: true,
    visualizar_propostas: true,
    abrir_chamados_operacional: true,
    simulador: true,
    cadastrar_funcionario: true,
    sacar_pix: true,
    conta_credito_proposta: false,
    conta_debito_proposta: false,
    conta_adiantamento_motivo: false,
    treinamentos: false,
  },

  LABELS: {
    cadastrar_cliente: 'Cadastrar cliente',
    cadastrar_proposta: 'Cadastrar proposta',
    visualizar_propostas: 'Visualizar propostas',
    abrir_chamados_operacional: 'Abrir chamados nos itens (operacional)',
    simulador: 'Simulador',
    cadastrar_funcionario: 'Cadastrar equipe (vendedor, backoffice, operacional, sup. backoffice)',
    sacar_pix: 'Sacar via PIX (aprovação Master + Financeiro SOU+BLU)',
    conta_credito_proposta: 'Conta corrente — Crédito proposta',
    conta_debito_proposta: 'Conta corrente — Débito proposta',
    conta_adiantamento_motivo: 'Conta corrente — Adiantamento (motivo)',
    treinamentos: 'Treinamentos',
  },

  merge(perms) {
    return { ...this.DEFAULT, ...(perms || {}) };
  },

  can(perms, key) {
    return !!this.merge(perms)[key];
  },

  readForm(containerId) {
    const root = document.getElementById(containerId);
    const out = { ...this.DEFAULT };
    if (!root) return out;
    
    // Otimização: Uso do .dataset para maior performance de leitura no DOM
    root.querySelectorAll('[data-partner-perm]').forEach(el => {
      const key = el.dataset.partnerPerm;
      if (key && key in out) out[key] = el.checked;
    });
    
    return out;
  },

  fillForm(containerId, perms) {
    const root = document.getElementById(containerId);
    if (!root) return;
    
    const p = this.merge(perms);
    root.querySelectorAll('[data-partner-perm]').forEach(el => {
      const key = el.dataset.partnerPerm;
      if (key && key in p) el.checked = !!p[key];
    });
  },

  // Emojis removidos para manter o padrão corporativo
  TEAM_ROLES: [
    { value: 'vendedor', label: 'Vendedor', dept: 'Vendas' },
    { value: 'backoffice', label: 'Backoffice / Operacional', dept: 'Operacional' },
    { value: 'operacional', label: 'Operacional', dept: 'Operacional' },
    { value: 'sup_backoffice', label: 'Supervisor Backoffice (equipe)', dept: 'Operacional' },
    { value: 'rh', label: 'RH', dept: 'RH' },
    { value: 'financeiro', label: 'Financeiro', dept: 'Financeiro' },
  ],

  fillTeamRoleSelect(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = this.TEAM_ROLES.map(r => `<option value="${r.value}">${r.label}</option>`).join('');
  },

  roleDept(role) {
    return this.TEAM_ROLES.find(x => x.value === role)?.dept || 'Vendas';
  },

  renderCheckboxesHtml() {
    const groups = [
      ['cadastrar_cliente', 'cadastrar_proposta', 'visualizar_propostas', 'abrir_chamados_operacional', 'simulador', 'cadastrar_funcionario', 'sacar_pix'],
      ['conta_credito_proposta', 'conta_debito_proposta', 'conta_adiantamento_motivo', 'treinamentos'],
    ];
    
    return groups.map((keys, gi) => `
      <div class="partner-perms-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin-top:${gi ? '14px' : '0'};">
        ${keys.map(k => `
          <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" data-partner-perm="${k}" style="margin-top:3px;"/>
            <span>${this.LABELS[k] || k}</span>
          </label>`).join('')}
      </div>`).join('');
  },
};