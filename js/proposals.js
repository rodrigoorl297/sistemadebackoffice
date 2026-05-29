window.Proposals = {
  init: function() {
    this._initAnexoFolderDelegation();
    this._initStaticProposalSelects();
    if (document.getElementById('propAnexosFolders')) {
      this.initAnexoFolders();
    }
  },

  /** Entidades por convênio — todos os estados (UF) + principais municípios. */
  _CONVENIO_ENTIDADES: {
    FEDERAL: ['SIAPE', 'INSS', 'EXÉRCITO', 'MARINHA', 'AERONÁUTICA'],
    ESTADUAL: [
      'GOV AC', 'GOV AL', 'GOV AP', 'GOV AM', 'GOV BA', 'GOV CE', 'GOV DF', 'GOV ES',
      'GOV GO', 'GOV MA', 'GOV MT', 'GOV MS', 'GOV MG', 'GOV PA', 'GOV PB', 'GOV PR',
      'GOV PE', 'GOV PI', 'GOV RJ', 'GOV RN', 'GOV RS', 'GOV RO', 'GOV RR', 'GOV SC',
      'GOV SP', 'GOV SE', 'GOV TO',
    ],
    MUNICIPAL: [
      'PREF SP', 'PREF RJ', 'PREF BH', 'PREF SÃO LUIS', 'PREF CAMPO GRANDE', 'PREF CURITIBA',
      'PREF POA', 'PREF RECIFE', 'PREF SALVADOR', 'PREF FORTALEZA', 'PREF BRASÍLIA', 'PREF MANAUS',
      'PREF BELÉM', 'PREF GOIÂNIA', 'PREF VITÓRIA', 'PREF FLORIANÓPOLIS', 'PREF NATAL',
      'PREF JOÃO PESSOA', 'PREF MACEIÓ', 'PREF TERESINA', 'PREF ARACAJU', 'PREF CUIABÁ',
      'PREF PORTO VELHO', 'PREF RIO BRANCO', 'PREF MACAPÁ', 'PREF BOA VISTA', 'PREF PALMAS',
    ],
  },

  /** Situações disponíveis para o vendedor marcar na proposta. */
  _VENDOR_SITUACOES: [
    { v: 'Em Andamento', l: 'Em Andamento' },
    { v: 'Digitação', l: 'Digitação' },
    { v: 'AG. BOLETO', l: 'Aguardando boleto' },
    { v: 'PROPOSTA DIGITADA', l: 'Proposta digitada' },
    { v: 'AG. ASS TERMO', l: 'Aguardando assinatura do termo' },
    { v: 'AG. VÍDEO', l: 'Aguardando vídeo' },
    { v: 'AG. ASS PROPOSTA', l: 'Aguardando assinatura da proposta' },
    { v: 'BOLETO VALIDADO', l: 'Boleto validado' },
    { v: 'AG. QUITAÇÃO', l: 'Aguardando quitação' },
    { v: 'BOLETO QUITADO', l: 'Boleto quitado' },
    { v: 'AG. LIBERAÇÃO MARGEM', l: 'Aguardando liberação de margem' },
    { v: 'AVERBADO', l: 'Averbado' },
    { v: 'PAGO', l: 'Pago' },
    { v: 'Pendenciado', l: 'Pendenciado' },
    { v: 'Cancelado', l: 'Cancelado' },
  ],

  _getConvenioEntidadesMap: function() {
    return this._CONVENIO_ENTIDADES;
  },

  _vendorSituacaoOptionsHtml: function(selected) {
    const sel = String(selected || '');
    let html = '<option value="">Selecione</option>';
    (this._VENDOR_SITUACOES || []).forEach(o => {
      const val = o.v || o;
      const lbl = o.l || o.v || o;
      html += `<option value="${this._escAttr(val)}"${sel === val ? ' selected' : ''}>${this._escHtml(lbl)}</option>`;
    });
    return html;
  },

  _initStaticProposalSelects: function() {
    ['propEtapaVendedor', 'empPropEtapa'].forEach(id => {
      const el = document.getElementById(id);
      if (!el || el.dataset.situLoaded) return;
      const cur = el.value;
      el.innerHTML = this._vendorSituacaoOptionsHtml(cur);
      el.dataset.situLoaded = '1';
    });
  },

  _fillEntidadeSelect: function(selectId, convenio, currentValue) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const conv = String(convenio || '').toUpperCase();
    const map = this._getConvenioEntidadesMap();
    const opts = map[conv] || [];
    const current = currentValue != null ? currentValue : sel.value;
    sel.innerHTML = '<option value="">Selecione a Entidade</option>' +
      opts.map(o => `<option value="${this._escAttr(o)}">${this._escHtml(o)}</option>`).join('');
    if (current) {
      if (!opts.includes(current)) {
        sel.insertAdjacentHTML('beforeend',
          `<option value="${this._escAttr(current)}">${this._escHtml(current)}</option>`);
      }
      sel.value = current;
    }
  },

  _adminList: { page: 1, pageSize: 25, total: 0, vendorId: '', statusFilter: '' },
  _employeeList: { page: 1, pageSize: 20, total: 0 },
  _employeeEditCache: {},
  _adminEditCache: {},
  _searchDebounce: null,

  _tabelaPct: { NORMAL:1, FLEX1:.85, FLEX2:.70, FLEX3:.55, FLEX4:.40, FLEX5:.20, S:1 },

  /** DB.getProposals devolve um array — o UI antigo esperava { items, total }; normaliza aqui. */
  _rowsFromProposalQuery: function(result) {
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.items)) return result.items;
    return [];
  },

  /** Escopo para listar vendedores no filtro/modal de proposta (Master/financeiro = todos). */
  _proposalVendorScopeAdmin: function(session) {
    const r = session?.role || '';
    const globalRoles = ['master', 'fundador', 'desenvolvedor', 'gerente', 'financeiro', 'financial', 'rh', 'diretoria'];
    if (globalRoles.includes(r)) return null;
    if (typeof window !== 'undefined' && window.PARTNER_ROOT_ID) return window.PARTNER_ROOT_ID;
    if (r === 'supervisor' || r === 'sup_backoffice' || r === 'parceiro') return session?.id || null;
    return session?.adminId || session?.id || null;
  },

  /** Mantém só propostas da equipe do parceiro (vendedores vinculados). Master não usa. */
  _filterProposalsToPartnerOrg: async function(proposals) {
    const rootId = typeof window !== 'undefined' ? window.PARTNER_ROOT_ID : null;
    if (!rootId || !Array.isArray(proposals)) return proposals;
    const team = await DB.getPartnerTeam(rootId).catch(() => []);
    const teamIds = new Set(team.map(v => v.id));
    teamIds.add(rootId);
    return proposals.filter(p => {
      const ids = typeof DB._proposalVendorIds === 'function'
        ? DB._proposalVendorIds(p)
        : [p.vendorId, p.vendor_id, p.employee_id, p.vendorId];
      return ids.some(id => id && teamIds.has(String(id)));
    });
  },

  /** Gestão interna: remove propostas de qualquer organização parceira. */
  _filterProposalsExcludePartnerOrg: async function(proposals) {
    const rootId = typeof window !== 'undefined' ? window.PARTNER_ROOT_ID : null;
    if (rootId || !Array.isArray(proposals)) return proposals;
    if (typeof window.PartnerOps === 'undefined') return proposals;
    return PartnerOps.filterExcludePartnerProposals(proposals);
  },

  _matchesVendorIdFilter: function(p, vendorId) {
    const want = String(vendorId || '').trim();
    if (!want) return true;
    if (typeof DB !== 'undefined' && DB && typeof DB._proposalVendorIds === 'function') {
      return DB._proposalVendorIds(p).some(v => String(v).trim() === want);
    }
    return [p.employee_id, p.vendorId, p.vendor_id]
      .map(v => String(v || '').trim())
      .includes(want);
  },

  _matchesStatusFilter: function(p, status) {
    const want = String(status || '').trim().toLowerCase();
    if (!want) return true;
    const pStatus = String(p.status || '').trim().toLowerCase();
    const pStatusOp = String(p.statusOp || p.status_op || '').trim().toLowerCase();
    
    const match = (val) => {
      if (val === want) return true;
      if (want === 'ag. boleto' && (val === 'ag. boleto' || val === 'aguardando boleto')) return true;
      if (want === 'ag. ass termo' && (val === 'ag. ass termo' || val === 'aguardando assinatura do termo')) return true;
      if (want === 'ag. vídeo' && (val === 'ag. vídeo' || val === 'aguardando vídeo' || val === 'ag. video' || val === 'aguardando video')) return true;
      if (want === 'ag. ass proposta' && (val === 'ag. ass proposta' || val === 'aguardando assinatura da proposta')) return true;
      if (want === 'ag. quitação' && (val === 'ag. quitação' || val === 'aguardando quitação' || val === 'ag. quitacao' || val === 'aguardando quitacao')) return true;
      if (want === 'ag. liberação margem' && (val === 'ag. liberação margem' || val === 'aguardando liberação margem' || val === 'ag. liberacao margem' || val === 'aguardando liberacao margem')) return true;
      if (want === 'digitação' && (val === 'digitação' || val === 'digitacao')) return true;
      if (want === 'pendenciado' && (val === 'pendenciado' || val === 'pendente')) return true;
      return false;
    };
    
    return match(pStatus) || match(pStatusOp);
  },

  _matchesProposalQuickSearch: function(p, query) {
    const n = String(query || '').trim().toLowerCase();
    if (!n) return true;
    const blob = [
      p.numero, p.id,
      p.clientName, p.client_name, p.clientCpf, p.client_cpf,
      p.product, p.convenio, p.entidade,
      p.vendorName, p.vendor_name,
      p.protocolo, p.matricula, p.status,
    ]
      .map(x => (x != null ? String(x) : '')).join(' ')
      .toLowerCase();
    return blob.includes(n);
  },

  _folderRootId: 'propAnexosFolders',
  _folderPrefix: 'prop',
  _folderDynamicSlots: {},
  _customFolders: [],

  _setFolderContext: function(rootId, prefix) {
    this._folderRootId = rootId || 'propAnexosFolders';
    this._folderPrefix = prefix || 'prop';
  },

  _resolveAnexoRootFromEl: function(el) {
    const root = el?.closest?.('#empPropAnexosFolders, #propAnexosFolders, #managePropAnexosFolders');
    if (!root) return null;
    const cfg = {
      empPropAnexosFolders: ['empPropAnexosFolders', 'empProp'],
      managePropAnexosFolders: ['managePropAnexosFolders', 'manageProp'],
      propAnexosFolders: ['propAnexosFolders', 'prop'],
    }[root.id];
    if (cfg) this._setFolderContext(cfg[0], cfg[1]);
    return root;
  },

  _initAnexoFolderDelegation: function() {
    if (this._anexoDelegationWired) return;
    this._anexoDelegationWired = true;
    document.addEventListener('click', (e) => {
      const fileBtn = e.target.closest('.prop-folder__btn');
      if (fileBtn) {
        e.preventDefault();
        this._resolveAnexoRootFromEl(fileBtn);
        fileBtn.parentElement?.querySelector('input[type="file"]')?.click();
        return;
      }
      const addBtn = e.target.closest('.prop-folder__add');
      if (addBtn) {
        e.preventDefault();
        this._resolveAnexoRootFromEl(addBtn);
        const folder = addBtn.closest('.prop-folder');
        if (!folder) return;
        if (folder.dataset.folderKey) this.addFolderSlot(folder.dataset.folderKey);
        else if (folder.dataset.customId) this.addCustomFolderSlot(folder.dataset.customId);
        return;
      }
      const removeBtn = e.target.closest('.prop-folder__remove');
      if (removeBtn) {
        e.preventDefault();
        this._resolveAnexoRootFromEl(removeBtn);
        const folder = removeBtn.closest('.prop-folder');
        if (folder?.dataset.customId) this.removeCustomFolder(folder.dataset.customId);
      }
    });
    document.addEventListener('change', (e) => {
      const inp = e.target.closest?.('.prop-folder__input');
      if (!inp?.id) return;
      this._resolveAnexoRootFromEl(inp);
      this._labelFile(inp.id, inp.id + 'Label');
    });
  },

  _getFolderDefs: function() {
    const p = this._folderPrefix || 'prop';
    return [
      {
        key: 'identidade',
        titulo: '🪪 Documento de Identidade',
        initialSlots: [
          { id: p + 'DocIdentidadeFrente', grupo: 'identidade_frente', label: 'Frente' },
          { id: p + 'DocIdentidadeVerso', grupo: 'identidade_verso', label: 'Verso' },
        ],
        idPrefix: p + 'DocIdentidade',
        grupoPrefix: 'identidade_',
      },
      {
        key: 'contracheque',
        titulo: '📋 Contracheque',
        idPrefix: p + 'CC',
        grupoPrefix: 'contracheque_',
      },
      {
        key: 'boleto',
        titulo: '💳 Boleto de Quitação',
        idPrefix: p + 'Bol',
        grupoPrefix: 'boleto_',
      },
      {
        key: 'extrato',
        titulo: '📄 Extrato de Consignação',
        idPrefix: p + 'Ext',
        grupoPrefix: 'extrato_',
      },
    ];
  },

  _initDynamicFolderSlots: function() {
    this._folderDynamicSlots = {};
    this._getFolderDefs().forEach(def => {
      if (def.initialSlots) {
        this._folderDynamicSlots[def.key] = def.initialSlots.map(s => ({ ...s }));
      } else {
        this._folderDynamicSlots[def.key] = [{
          id: def.idPrefix + '1',
          grupo: def.grupoPrefix + '1',
        }];
      }
    });
  },

  _nextFolderSlot: function(def) {
    const slots = this._folderDynamicSlots[def.key] || [];
    const n = slots.length + 1;
    if (def.initialSlots && n <= def.initialSlots.length) {
      return { ...def.initialSlots[n - 1] };
    }
    return {
      id: def.idPrefix + n,
      grupo: def.grupoPrefix + n,
    };
  },

  _folderSlotRowHtml: function(inputId, labelText) {
    const safeId = this._escAttr(inputId);
    const lblId = inputId + 'Label';
    const sub = labelText
      ? `<span class="prop-folder__slot-label">${this._escHtml(labelText)}</span>`
      : '';
    return `<div class="prop-folder__slot">
      ${sub}
      <input type="file" id="${safeId}" class="form-control prop-folder__input" accept="image/*,.pdf">
      <button type="button" class="btn btn-outline btn-sm prop-folder__btn" title="Selecionar arquivo">📁</button>
      <span id="${lblId}" class="prop-file-label">-</span>
    </div>`;
  },

  _buildFolderSlotsHtml: function(folderKey) {
    const slots = this._folderDynamicSlots[folderKey] || [];
    return slots.map((s, idx) =>
      `<div class="prop-folder__slot-wrap" data-slot="${idx + 1}">` +
      this._folderSlotRowHtml(s.id, s.label) + '</div>'
    ).join('');
  },

  _appendSlotToFolderEl: function(folderEl, slot, slotIndex) {
    if (!folderEl || !slot) return;
    const slotsEl = folderEl.querySelector('.prop-folder__slots');
    if (!slotsEl) return;
    const wrap = document.createElement('div');
    wrap.className = 'prop-folder__slot-wrap';
    wrap.dataset.slot = String(slotIndex);
    wrap.innerHTML = this._folderSlotRowHtml(slot.id, slot.label);
    slotsEl.appendChild(wrap);
  },

  _renderAnexoFolders: function() {
    const root = document.getElementById(this._folderRootId);
    if (!root) return;

    this._customFolders.forEach(cf => {
      const el = document.getElementById(cf.nameInputId);
      if (el) cf.name = el.value;
    });

    let html = '';
    this._getFolderDefs().forEach(def => {
      html += `<div class="prop-folder" data-folder-key="${this._escAttr(def.key)}">
        <div class="prop-folder__header">
          <span class="prop-folder__title">${def.titulo}</span>
        </div>
        <div class="prop-folder__slots">${this._buildFolderSlotsHtml(def.key)}</div>
        <button type="button" class="btn btn-ghost btn-sm prop-folder__add">+ Adicionar arquivo</button>
      </div>`;
    });

    this._customFolders.forEach(cf => {
      html += this._buildCustomFolderHtml(cf);
    });

    root.innerHTML = html;
  },

  initAnexoFolders: function() {
    if (!this._folderDynamicSlots || !Object.keys(this._folderDynamicSlots).length) {
      this._initDynamicFolderSlots();
    }
    this._renderAnexoFolders();
  },

  resetAnexoFolders: function() {
    this._customFolders = [];
    this._initDynamicFolderSlots();
    this._renderAnexoFolders();
  },

  addFolderSlot: function(folderKey) {
    const def = this._getFolderDefs().find(d => d.key === folderKey);
    if (!def) return;
    if (!this._folderDynamicSlots[folderKey]) this._initDynamicFolderSlots();
    const slot = this._nextFolderSlot(def);
    this._folderDynamicSlots[folderKey].push(slot);
    const root = document.getElementById(this._folderRootId);
    const folder = root?.querySelector(`.prop-folder[data-folder-key="${folderKey}"]`);
    this._appendSlotToFolderEl(folder, slot, this._folderDynamicSlots[folderKey].length);
  },

  _buildCustomFolderHtml: function(cf) {
    const slotsHtml = cf.slots.map((s, idx) =>
      `<div class="prop-folder__slot-wrap" data-slot="${idx + 1}">` +
      this._folderSlotRowHtml(s.id) + '</div>'
    ).join('');
    return `<div class="prop-folder prop-folder--custom" data-custom-id="${this._escAttr(cf.id)}">
      <div class="prop-folder__header">
        <input type="text" class="form-control prop-folder__custom-name" id="${this._escAttr(cf.nameInputId)}" placeholder="Nome da pasta" value="${this._escAttr(cf.name || '')}">
        <button type="button" class="btn btn-ghost btn-sm prop-folder__remove" title="Remover pasta">✕</button>
      </div>
      <div class="prop-folder__slots">${slotsHtml}</div>
      <button type="button" class="btn btn-ghost btn-sm prop-folder__add">+ Adicionar arquivo</button>
    </div>`;
  },

  addCustomFolder: function(fromEl) {
    if (fromEl) {
      const prev = fromEl.previousElementSibling;
      if (prev?.id && /AnexosFolders$/.test(prev.id)) this._resolveAnexoRootFromEl(prev);
      else this._resolveAnexoRootFromEl(fromEl);
    }
    const root = document.getElementById(this._folderRootId);
    if (!root) return;
    const p = this._folderPrefix || 'prop';
    const id = String(Date.now()) + '_' + (this._customFolders.length + 1);
    const cf = {
      id,
      name: '',
      nameInputId: p + 'CustomName_' + id,
      slots: [{ id: p + 'Custom_' + id + '_1', grupo: 'custom_' + id + '_1' }],
    };
    this._customFolders.push(cf);
    root.insertAdjacentHTML('beforeend', this._buildCustomFolderHtml(cf));
  },

  removeCustomFolder: function(customId) {
    this._customFolders = this._customFolders.filter(cf => cf.id !== customId);
    const root = document.getElementById(this._folderRootId);
    root?.querySelector(`.prop-folder[data-custom-id="${customId}"]`)?.remove();
  },

  addCustomFolderSlot: function(customId) {
    const cf = this._customFolders.find(c => c.id === customId);
    if (!cf) return;
    const p = this._folderPrefix || 'prop';
    const nameEl = document.getElementById(cf.nameInputId);
    if (nameEl) cf.name = nameEl.value;
    const n = cf.slots.length + 1;
    const slot = { id: p + 'Custom_' + cf.id + '_' + n, grupo: 'custom_' + cf.id + '_' + n };
    cf.slots.push(slot);
    const root = document.getElementById(this._folderRootId);
    const folder = root?.querySelector(`.prop-folder[data-custom-id="${customId}"]`);
    this._appendSlotToFolderEl(folder, slot, n);
  },

  _getAllAnexoFieldDefs: function() {
    const list = [];
    Object.keys(this._folderDynamicSlots || {}).forEach(key => {
      (this._folderDynamicSlots[key] || []).forEach(s => list.push({ id: s.id, grupo: s.grupo }));
    });
    this._customFolders.forEach(cf => {
      cf.slots.forEach(s => list.push({ id: s.id, grupo: s.grupo, customNameId: cf.nameInputId }));
    });
    return list;
  },

  _collectAttachments: async function(proposalId) {
    if (!proposalId) throw new Error('ID da proposta é obrigatório para anexos.');
    const getFile = id => document.getElementById(id)?.files?.[0];
    const attachments = {};
    const defs = this._getAllAnexoFieldDefs();
    await Promise.all(defs.map(async ({ id, grupo, customNameId }) => {
      const f = getFile(id);
      if (!f) return;
      if (f.size > 25 * 1024 * 1024) {
        throw new Error(`"${f.name}" excede 25 MB.`);
      }
      attachments[grupo] = await (window.DB || DB).uploadProposalFile(f, proposalId, grupo);
      attachments[grupo + '_nome'] = f.name;
      if (customNameId) {
        const folderName = (document.getElementById(customNameId)?.value || '').trim();
        if (folderName) attachments[grupo + '_pasta'] = folderName;
      }
    }));
    return attachments;
  },

  _isVendedorRole: function(role) {
    return role === 'vendedor';
  },

  _labelEtapaVendedor: function(val) {
    const hit = (this._VENDOR_SITUACOES || []).find(o => o.v === val);
    if (hit) return hit.l;
    return val || '—';
  },

  /** Situação do vendedor — só em status/statusOp no banco (sem coluna etapaVendedor). */
  _vendorStage: function(p) {
    if (!p) return '';
    return String(p.statusOp || p.status_op || p.status || '').trim();
  },

  _getProposalSearchQuery: function() {
    return (document.getElementById('proposalSearch')?.value || '').toLowerCase().trim();
  },

  _onProposalSearchInput: function() {
    clearTimeout(this._searchDebounce);
    this._searchDebounce = setTimeout(() => {
      this._adminList.page = 1;
      this.renderAdminList();
    }, 350);
  },

  _getAdminVendorFilter: function() {
    const headerSel = document.getElementById('proposalVendorFilterHeader');
    if (headerSel) {
      const val = headerSel.value;
      return val === 'todos' ? '' : val;
    }
    const pageSel = document.getElementById('proposalVendorFilter');
    if (pageSel) {
      const val = pageSel.value;
      return val === 'todos' ? '' : val;
    }
    return this._adminList.vendorId || '';
  },

  onAdminVendorFilter: function() {
    const val = this._getAdminVendorFilter();
    this._adminList.vendorId = val;
    this._adminList.page = 1;
    
    // Sincroniza se ambos existirem na tela
    const headerSel = document.getElementById('proposalVendorFilterHeader');
    const pageSel = document.getElementById('proposalVendorFilter');
    if (headerSel && pageSel) {
      if (val === '') {
        headerSel.value = '';
        pageSel.value = '';
      } else {
        if (headerSel.value !== val) headerSel.value = val;
        if (pageSel.value !== val) pageSel.value = val;
      }
    }
    this.renderAdminList();
  },

  _getAdminStatusFilter: function() {
    const sel = document.getElementById('proposalStatusFilterHeader');
    if (sel) {
      const val = sel.value;
      return val === 'todos' ? '' : val;
    }
    return this._adminList.statusFilter || '';
  },

  onAdminStatusFilter: function() {
    this._adminList.statusFilter = this._getAdminStatusFilter();
    this._adminList.page = 1;
    this.renderAdminList();
  },

  adminSetPage: function(page) {
    this._adminList.page = Math.max(1, page);
    this.renderAdminList();
  },

  employeeSetPage: function(page) {
    this._employeeList.page = Math.max(1, page);
    this.renderEmployeeList();
  },

  _renderPagination: function(containerId, meta, goFn) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const { page, pageSize, total } = meta;
    const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
    if (total <= pageSize && totalPages <= 1) {
      el.innerHTML = total > 0
        ? `<span class="list-pagination__info">${total} proposta${total !== 1 ? 's' : ''}</span>`
        : '';
      return;
    }
    const from = total ? (page - 1) * pageSize + 1 : 0;
    const to = Math.min(page * pageSize, total);
    el.innerHTML = `
      <div class="list-pagination">
        <button type="button" class="btn btn-outline btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="${goFn}(${page - 1})">← Anterior</button>
        <span class="list-pagination__info">Página ${page} de ${totalPages} · ${from}–${to} de ${total}</span>
        <button type="button" class="btn btn-outline btn-sm" ${page >= totalPages ? 'disabled' : ''} onclick="${goFn}(${page + 1})">Próxima →</button>
      </div>`;
  },

  _initAdminProposalFilters: async function() {
    const selHeader = document.getElementById('proposalVendorFilterHeader');
    const selPage = document.getElementById('proposalVendorFilter');
    if ((selHeader && selHeader.dataset.loaded) || (selPage && selPage.dataset.loaded)) return;
    try {
      const session = Auth.getSession();
      const scopeAdmin = this._proposalVendorScopeAdmin(session);
      const vendors = await DB.getVendorsForSelect(scopeAdmin);
      
      if (selHeader) {
        selHeader.innerHTML = '<option value="">VENDEDOR</option>' +
          '<option value="todos">TODOS OS VENDEDORES</option>' +
          (vendors || []).map(v => `<option value="${this._escAttr(v.id)}">${this._escHtml(v.name.toUpperCase())}</option>`).join('');
        if (this._adminList.vendorId) selHeader.value = this._adminList.vendorId;
        selHeader.dataset.loaded = '1';
      }
      
      if (selPage) {
        selPage.innerHTML = '<option value="">Todos os vendedores</option>' +
          '<option value="todos">Todos os vendedores</option>' +
          (vendors || []).map(v => `<option value="${this._escAttr(v.id)}">${this._escHtml(v.name)}</option>`).join('');
        if (this._adminList.vendorId) selPage.value = this._adminList.vendorId;
        selPage.dataset.loaded = '1';
      }
    } catch (e) {
      console.warn('[Proposals] vendor filter:', e);
    }
  },

  _escHtml: function(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _escAttr: function(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/'/g, '&#39;')
      .replace(/"/g, '&quot;');
  },

  _escUrlAttr: function(s) {
    return String(s ?? '').replace(/"/g, '&quot;');
  },

  _parseAttachments: function(att) {
    if (!att) return {};
    if (typeof att === 'string') {
      try { return JSON.parse(att) || {}; } catch { return {}; }
    }
    return att;
  },

  _proposalSaveErrorMsg: function(err) {
    const msg = String(err?.message || err || '');
    if (msg.includes('57014') || /statement timeout/i.test(msg)) {
      return 'Tempo esgotado ao salvar. Anexos grandes devem ir ao Storage — use Ctrl+F5 e tente de novo. Confira o bucket "proposal-attachments" no Supabase.';
    }
    if (/payload too large|413|entity too large/i.test(msg)) {
      return 'Anexo muito grande para salvar de uma vez. Use PDF menor (até 25 MB) ou envie um arquivo por vez.';
    }
    return msg || 'Não foi possível salvar a proposta.';
  },

  _attachmentViewerCache: [],
  _lastAttachmentBlobUrl: null,

  _normalizeAttachmentUrl: function(val) {
    if (val == null || val === '') return '';
    if (typeof val === 'string') {
      const s = val.trim();
      if (!s) return '';
      if (/^(https?:\/\/|data:)/i.test(s)) return s;
      if (/^[A-Za-z0-9+/=\s-]+$/.test(s.replace(/\s/g, '')) && s.length > 80) {
        return 'data:application/octet-stream;base64,' + s.replace(/\s/g, '');
      }
      return '';
    }
    if (typeof val === 'object') {
      const nested = val.url || val.path || val.src || val.href || val.publicUrl || val.public_url || val.signedUrl || val.signed_url;
      if (nested) return this._normalizeAttachmentUrl(nested);
    }
    return '';
  },

  _isValidAttachmentUrl: function(url) {
    if (!url || typeof url !== 'string') return false;
    const s = url.trim();
    return /^https?:\/\//i.test(s) || /^data:/i.test(s);
  },

  _dataUrlToBlobUrl: function(dataUrl) {
    const parts = String(dataUrl).split(',');
    if (parts.length < 2) throw new Error('Invalid data URL');
    const header = parts[0];
    const mimeMatch = header.match(/data:([^;]+)/i);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const binary = atob(parts.slice(1).join(','));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  },

  _toDisplayUrl: function(url) {
    if (!url || !String(url).startsWith('data:')) return url;
    if (String(url).length < 500000) return url;
    try {
      return this._dataUrlToBlobUrl(url);
    } catch {
      return url;
    }
  },

  _revokeAttachmentBlobUrl: function() {
    if (this._lastAttachmentBlobUrl) {
      try { URL.revokeObjectURL(this._lastAttachmentBlobUrl); } catch { /* ignore */ }
      this._lastAttachmentBlobUrl = null;
    }
  },

  openAttachment: function(cacheIdxOrUrl, nome) {
    let url = '';
    let name = nome || 'Anexo';

    if (typeof cacheIdxOrUrl === 'number') {
      const item = this._attachmentViewerCache?.[cacheIdxOrUrl];
      if (!item) {
        alert('Anexo indisponível.');
        return;
      }
      url = item.url;
      name = item.nome || name;
    } else {
      url = this._normalizeAttachmentUrl(cacheIdxOrUrl);
    }

    if (!this._isValidAttachmentUrl(url)) {
      alert('Anexo indisponível ou inválido.');
      return;
    }

    const modal = document.getElementById('attachmentViewerModal');
    const displayUrl = this._toDisplayUrl(url);

    this._revokeAttachmentBlobUrl();
    if (displayUrl !== url && String(displayUrl).startsWith('blob:')) {
      this._lastAttachmentBlobUrl = displayUrl;
    }

    if (!modal) {
      const w = window.open(displayUrl, '_blank', 'noopener,noreferrer');
      if (!w) alert('Não foi possível abrir o anexo. Verifique se pop-ups estão permitidos.');
      return;
    }

    const titleEl = document.getElementById('attachmentViewerTitle');
    const bodyEl = document.getElementById('attachmentViewerBody');
    const openExtEl = document.getElementById('attachmentViewerOpenExternal');
    if (titleEl) titleEl.textContent = name;
    if (openExtEl) {
      openExtEl.onclick = () => {
        const w = window.open(displayUrl, '_blank', 'noopener,noreferrer');
        if (!w) alert('Não foi possível abrir em nova aba.');
      };
    }

    const safeDisplay = this._escUrlAttr(displayUrl);
    const safeName = this._escHtml(name);

    if (bodyEl) {
      if (this._isImageUrl(url, name)) {
        bodyEl.innerHTML = `<img src="${safeDisplay}" alt="${safeName}" style="max-width:100%;max-height:70vh;display:block;margin:0 auto;border-radius:8px;object-fit:contain;"/>`;
      } else {
        bodyEl.innerHTML = `<iframe src="${safeDisplay}" title="${safeName}" style="width:100%;height:70vh;border:0;border-radius:8px;background:#fff;"></iframe>`;
      }
    }

    if (typeof openModal === 'function') openModal('attachmentViewerModal');
    else modal.classList.add('open');
  },

  closeAttachmentViewer: function() {
    this._revokeAttachmentBlobUrl();
    const bodyEl = document.getElementById('attachmentViewerBody');
    if (bodyEl) bodyEl.innerHTML = '';
    if (typeof closeModal === 'function') closeModal('attachmentViewerModal');
    else document.getElementById('attachmentViewerModal')?.classList.remove('open');
  },

  _isImageUrl: function(url, nome) {
    if (!url) return false;
    if (String(url).startsWith('data:image/')) return true;
    const ref = ((nome || '') + ' ' + String(url).split('?')[0]).toLowerCase();
    return /\.(jpe?g|png|gif|webp|jfif|bmp|heic)(\?|$)/i.test(ref);
  },

  _isPdfUrl: function(url, nome) {
    if (!url) return false;
    if (String(url).startsWith('data:application/pdf')) return true;
    const ref = ((nome || '') + ' ' + String(url).split('?')[0]).toLowerCase();
    return /\.pdf(\?|$)/i.test(ref);
  },

  _renderAttachmentPreview: function(doc, cacheIdx) {
    const url = doc.url || '';
    const nome = doc.nome || ('Anexo ' + (cacheIdx + 1));
    if (!this._isValidAttachmentUrl(url)) {
      return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:120px;height:150px;border-radius:10px;border:2px dashed var(--color-border);background:var(--color-surface-2);color:var(--color-text-muted);font-size:11px;padding:8px;text-align:center;flex-shrink:0;" title="Anexo inválido">
        <span style="font-size:24px;margin-bottom:4px;">⚠️</span>
        <span>inválido</span>
      </div>`;
    }
    const safePreview = this._escUrlAttr(url);
    const safeNome = this._escHtml(nome);
    const box = 'display:block;width:120px;height:150px;border-radius:10px;border:2px solid var(--color-success);overflow:hidden;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08);flex-shrink:0;cursor:pointer;';
    const click = `role="button" tabindex="0" onclick="Proposals.openAttachment(${cacheIdx})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();Proposals.openAttachment(${cacheIdx});}"`;

    if (this._isImageUrl(url, nome)) {
      return `<div ${click} style="${box}" title="${safeNome} — clique para ampliar">
        <img src="${safePreview}" alt="${safeNome}" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;" loading="lazy"/>
      </div>`;
    }
    if (this._isPdfUrl(url, nome)) {
      return `<div ${click} style="${box}position:relative;" title="${safeNome} — clique para abrir">
        <embed src="${safePreview}#toolbar=0&navpanes=0" type="application/pdf" style="width:100%;height:100%;pointer-events:none;border:0;"/>
        <span style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.65);color:#fff;font-size:9px;padding:4px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;">📄 ${safeNome}</span>
      </div>`;
    }
    return `<div ${click} style="${box}display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--color-primary);padding:8px;text-align:center;" title="${safeNome}">
      <span style="font-size:28px;margin-bottom:6px;">📎</span>
      <span style="font-size:10px;line-height:1.2;word-break:break-word;">${safeNome}</span>
    </div>`;
  },

  _proposalCreatedAt: function(p) {
    return p.createdAt || p.created_at || '';
  },

  _normProposal: function(p) {
    if (!p) return p;
    return {
      ...p,
      vendorName: p.vendorName || p.vendor_name || '',
      clientName: p.clientName || p.client_name || '',
      clientCpf: p.clientCpf || p.client_cpf || '',
      valorFinal: p.valorFinal ?? p.valor_final ?? null,
      createdAt: p.createdAt || p.created_at || null,
      vendorId: p.vendorId || p.vendor_id || p.employee_id || '',
      employee_id: p.employee_id || p.vendorId || p.vendor_id || '',
      statusOp: p.statusOp || p.status_op || p.status || '',
      protocolo: p.protocolo || p.numero_protocolo || '',
      senhaContracheque: p.senhaContracheque || p.senha_contracheque || '',
      senhaConsignacao: p.senhaConsignacao || p.senha_consignacao || '',
      compraDivida: p.compraDivida || p.compra_divida || '',
      bancoComprado: p.bancoComprado || p.banco_comprado || '',
      solicitouBoleto: p.solicitouBoleto || p.solicitou_boleto || '',
      dataSolicitacao: p.dataSolicitacao || p.data_solicitacao || '',
      protocoloBacen: p.protocoloBacen || p.protocolo_bacen || '',
      dataSolicitacaoBacen: p.dataSolicitacaoBacen || p.data_solicitacao_bacen || '',
      posVenda: p.posVenda || p.pos_venda || '',
    };
  },

  _proposalVendorId: function(p) {
    return p?.vendorId || p?.vendor_id || p?.employee_id || '';
  },

  _ownsProposal: function(proposal, user) {
    if (!proposal || !user?.id) return false;
    if (typeof DB._matchProposalToVendor === 'function' && DB._matchProposalToVendor(proposal, user)) return true;
    return String(this._proposalVendorId(proposal)) === String(user.id);
  },

  _propDateStr: function(p) {
    const raw = p?.createdAt || p?.created_at;
    if (!raw) return '—';
    try { return new Date(raw).toLocaleDateString('pt-BR'); } catch { return '—'; }
  },

  _matchProposalSearch: function(p, q) {
    if (!q) return true;
    const etapaLabel = this._vendorStage(p) ? this._labelEtapaVendedor(this._vendorStage(p)) : '';
    const haystack = [
      p.id, p.numero, p.clientName, p.clientCpf, p.vendorName,
      p.product, p.convenio, p.entidade, p.status, p.statusOp,
      etapaLabel, p.matricula, p.protocolo
    ].filter(Boolean).join(' ').toLowerCase();
    if (haystack.includes(q)) return true;
    const qDigits = q.replace(/\D/g, '');
    if (qDigits) {
      const cpfDigits = String(p.clientCpf || '').replace(/\D/g, '');
      const matriculaDigits = String(p.matricula || '').replace(/\D/g, '');
      if (cpfDigits.includes(qDigits) || matriculaDigits.includes(qDigits)) return true;
    }
    return false;
  },

  _isSupervisorOrAbove: function(role) {
    return ['supervisor', 'sup_backoffice', 'parceiro', 'backoffice', 'operacional', 'master', 'gerente', 'financeiro', 'financial', 'rh', 'admin'].includes(role || '');
  },

  _canPickVendor: function(role) {
    return this._isSupervisorOrAbove(role);
  },

  _canEditNumeroValor: function(role) {
    return this._isSupervisorOrAbove(role);
  },

  _isMaster: function() {
    return typeof Auth !== 'undefined' && Auth.isMaster();
  },

  /** Master ou supervisor (incl. sup. backoffice) podem excluir propostas. */
  _canDeleteProposal: function() {
    if (this._isMaster()) return true;
    const role = typeof Auth !== 'undefined' && Auth.getSession()?.role;
    return role === 'supervisor' || role === 'sup_backoffice';
  },

  _fmtClientBlock: function(client, proposal) {
    if (!client) {
      return `<p style="color:var(--color-text-muted);margin:0;">Cadastro completo do cliente não encontrado no sistema (CPF ${proposal?.clientCpf || '—'}).</p>`;
    }
    const row = (label, val) => val ? `<div><strong>${label}:</strong> ${val}</div>` : '';
    return [
      row('Nome completo', client.name),
      row('CPF', client.cpf || client.id),
      row('RG', client.rg),
      row('Celular', client.phone1),
      row('Celular 2', client.phone2),
      row('E-mail', client.email),
      row('Estado civil', client.civilState),
      row('Endereço', client.address),
      row('Nome da mãe', client.motherName),
      row('Nome do pai', client.fatherName),
    ].filter(Boolean).join('');
  },

  _applyVendedorFormRules: function() {
    const anexosSec = document.getElementById('propAnexosSection');
    if (anexosSec) anexosSec.style.display = '';
    const anexosTitle = document.getElementById('propAnexosTitle');
    if (anexosTitle) anexosTitle.textContent = '📎 Documentos (opcional)';
    const numeroRow = document.getElementById('propNumeroValorRow');
    if (numeroRow) numeroRow.style.display = '';
    const etapaRow = document.getElementById('propEtapaVendedorRow');
    if (etapaRow) etapaRow.style.display = '';
  },

  calcValorFinal: function() {
    // usado apenas quando o formulário mostra o campo tabela visivelmente
    const valor  = parseFloat(document.getElementById('propValor')?.value) || 0;
    const tabela = document.getElementById('propTabela')?.value || 'NORMAL';
    const pct    = this._tabelaPct[tabela] ?? 1;
    const final  = valor * pct;
    const desconto = valor - final;
    const dispEl = document.getElementById('propValorFinalDisplay');
    if (dispEl) dispEl.value = final > 0 ? 'R$ ' + final.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '';
    const descEl = document.getElementById('propDesconto');
    if (descEl) descEl.value = desconto.toFixed(2);
  },

  _labelFile: function(inputId, labelId) {
    const inp = document.getElementById(inputId);
    const lbl = document.getElementById(labelId);
    if (!inp || !lbl) return;
    const f = inp.files[0];
    if (!f) {
      lbl.innerHTML = '<span style="color:#999;">-</span>';
      return;
    }
    // cria URL temporária para visualização
    const url = URL.createObjectURL(f);
    lbl.innerHTML =
      `<span style="color:var(--color-success);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;display:inline-block;vertical-align:middle;" title="${f.name}">${f.name}</span>` +
      `<a href="${url}" target="_blank" title="Visualizar" style="margin-left:6px;font-size:18px;text-decoration:none;vertical-align:middle;">👁</a>`;
  },

  updateAnexosLabel: function() {},  // compatibilidade

  calcAdminValorFinal: function() {
    const fmtR = v => 'R$ ' + parseFloat(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
    const bruto  = parseFloat(document.getElementById('managePropValorBruto')?.value?.replace(/[^\d,]/g,'').replace(',','.')) || 0;
    const tabela = document.getElementById('managePropTabela')?.value || '';
    const pct    = tabela ? (this._tabelaPct[tabela] ?? 1) : null;
    const finalV = pct !== null ? parseFloat((bruto * pct).toFixed(2)) : null;
    const desconto = finalV !== null ? parseFloat((bruto - finalV).toFixed(2)) : null;

    const calcEl = document.getElementById('managePropValorFinalCalc');
    const infoEl = document.getElementById('managePropTabelaInfo');

    if (calcEl) calcEl.value = finalV !== null ? fmtR(finalV) : '';
    if (infoEl && tabela && pct !== null) {
      const pctLabel = Math.round(pct * 100);
      infoEl.innerHTML = `<span style="color:#3b82f6;font-weight:600;">Tabela ${tabela} = ${pctLabel}% do valor</span>
        &nbsp;·&nbsp; Desconto: <strong>${fmtR(desconto)}</strong>
        &nbsp;·&nbsp; Valor Final: <strong style="color:var(--color-success);">${fmtR(finalV)}</strong>`;
    } else if (infoEl) {
      infoEl.innerHTML = '<span style="color:var(--color-text-muted);">Selecione uma tabela para calcular o valor final.</span>';
    }
  },

  updateEntidades: function() {
    const conv = document.getElementById('propConvenio')?.value;
    this._fillEntidadeSelect('propEntidade', conv);
  },

  openModal: function() {
    try {
      const container = document.getElementById('propFormContainer');
      if (!container) {
        alert('Erro: O formulário de proposta não foi encontrado.');
        return;
      }
      container.style.display = 'block';
      const ids = ['propCpf','propNumero','propValor','propDesconto','propValorFinalDisplay','propObs',
                   'propMatricula','propSenhaContracheque','propSenhaConsignacao',
                   'propBancoComprado','propProtocolo','propProtocoloBacen','propFases','propHistoryNote'];
      ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      const tabEl = document.getElementById('propTabela'); if (tabEl) tabEl.value = '';
      this._setFolderContext('propAnexosFolders', 'prop');
      this.resetAnexoFolders();
      ['propProduct','propConvenio','propEntidade','propCompraDivida','propSolicitouBoleto',
       'propBacen','propAssinouTermo','propStatusOp','propPosVenda','propNuvidio','propEtapaVendedor'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      const area = document.getElementById('propFormArea');
      if (area) area.style.display = 'none';
      const fileEl = document.getElementById('filePaystub');
      if (fileEl) fileEl.value = '';

      // Mostrar seção operacional para roles com permissão
      this._toggleOperacionalSection();
      this.initAnexoFolders();
      this._initStaticProposalSelects();
      this._applyVendedorFormRules();
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch(e) {
      alert("Erro ao abrir formulário: " + e.message);
    }
  },

  _toggleOperacionalSection: function() {
    const sec = document.getElementById('propOperacionalSection');
    if (!sec) return;
    const s = (typeof Auth !== 'undefined') ? Auth.getSession() : null;
    const opRoles = ['master','operacional','backoffice','supervisor','admin'];
    if (s && opRoles.includes(s.role)) {
      sec.style.display = 'block';
    } else {
      sec.style.display = 'none';
    }
  },

  searchCpf: async function() {
    try {
      const cpfStr = document.getElementById('propCpf').value;
      const cpf = cpfStr.replace(/\D/g, '');
      if (cpf.length !== 11) {
        alert("Por favor, digite um CPF válido.");
        return;
      }
      
      const btn = event.target || document.querySelector('#propFormContainer .btn-primary');
      const oldText = btn ? btn.innerText : 'Buscar Cliente';
      if(btn) btn.innerText = 'Buscando...';

      // Procura na coleção local
      const client = await DB.get('clients', cpf);
      
      if(btn) btn.innerText = oldText;

      if (client) {
        let summary = `<strong>Nome:</strong> ${client.name}<br>
                       <strong>CPF:</strong> ${client.cpf || cpf}<br>
                       <strong>RG:</strong> ${client.rg || '—'}<br>
                       <strong>Celular:</strong> ${client.phone1 || 'Não informado'}<br>
                       <strong>Celular 2:</strong> ${client.phone2 || '—'}<br>
                       <strong>E-mail:</strong> ${client.email || 'Não informado'}<br>
                       <strong>Endereço:</strong> ${client.address || '—'}`;
        document.getElementById('propClientSummary').innerHTML = summary;
        document.getElementById('propClientName').value = client.name;
        document.getElementById('propFormArea').style.display = 'block';
        this._setFolderContext('propAnexosFolders', 'prop');
        this.initAnexoFolders();
        this._applyVendedorFormRules();
      } else {
        alert("Cliente não encontrado. Por favor, vá na aba 'Clientes' e cadastre o cliente primeiro.");
        document.getElementById('propFormArea').style.display = 'none';
      }
    } catch (e) {
      alert("Erro ao buscar cliente: " + e.message);
    }
  },

  // Helper to read file as Base64
  readFileAsBase64: function(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  },

  submit: async function() {
    try {
      const user = Auth.getSession();
      if (!user) return;

      const cpf = document.getElementById('propCpf').value.replace(/\D/g, '');
      const name = document.getElementById('propClientName').value;

      if (!cpf || !name) {
        alert("Busque o cliente primeiro.");
        return;
      }

      const role = user.role || '';
      const isVendedor = this._isVendedorRole(role);
      const etapaVendedor = (document.getElementById('propEtapaVendedor')?.value || '').trim();

      const saveBtn = document.querySelector('#propFormArea .btn-primary');
      let oldText = 'Enviar Proposta';
      if (saveBtn) {
        oldText = saveBtn.innerText;
        saveBtn.innerText = 'Enviando...';
        saveBtn.disabled = true;
      }

      let attachments = {};
      const proposalId = 'PROP-' + Date.now();
      try {
        attachments = await this._collectAttachments(proposalId);
      } catch (e) {
        alert(e.message || "Erro ao enviar anexo. Use PDFs menores ou menos arquivos por vez.");
        if (saveBtn) { saveBtn.innerText = oldText; saveBtn.disabled = false; }
        return;
      }

      const gv = id => document.getElementById(id)?.value || '';
      const valor      = parseFloat(gv('propValor')) || 0;
      // Tabela e valor final são definidos pelo Financeiro durante análise
      const tabela     = '';       // aguardando financeiro
      const valorFinal = valor;   // provisório até análise
      const desconto   = 0;
      const statusInicial = isVendedor
        ? (etapaVendedor || 'Em Andamento')
        : (gv('propStatusOp') || 'Em Andamento');

      const proposal = {
        id: proposalId,
        employee_id: user.id,
        numero: gv('propNumero'),
        vendorId: user.id,
        vendor_id: user.id,
        vendorName: user.name,
        vendor_name: user.name,
        clientCpf: cpf,
        clientName: name,
        matricula: gv('propMatricula'),
        senhaContracheque: gv('propSenhaContracheque'),
        senhaConsignacao: gv('propSenhaConsignacao'),
        product: gv('propProduct'),
        convenio: gv('propConvenio'),
        entidade: gv('propEntidade'),
        obs: gv('propObs'),
        tabela: tabela,
        valor: valor,
        desconto: desconto,
        valorFinal: valorFinal,
        // Campos operacionais
        compraDivida: gv('propCompraDivida'),
        bancoComprado: gv('propBancoComprado'),
        solicitouBoleto: gv('propSolicitouBoleto'),
        protocolo: gv('propProtocolo'),
        dataSolicitacao: gv('propDataSolicitacao'),
        bacen: gv('propBacen'),
        protocoloBacen: gv('propProtocoloBacen'),
        dataSolicitacaoBacen: gv('propDataSolicitacaoBacen'),
        assinou: gv('propAssinouTermo'),
        statusOp: statusInicial,
        posVenda: gv('propPosVenda'),
        nuvidio: gv('propNuvidio'),
        fases: gv('propFases'),
        attachments: attachments,
        status: statusInicial,
        history: [{
          date: new Date().toISOString(),
          actorName: user.name,
          action: 'Proposta Criada',
          note: gv('propObs')
        }],
        createdAt: new Date().toISOString()
      };

      await DB.save('proposals', proposal);
      
      if (saveBtn) { saveBtn.innerText = oldText; saveBtn.disabled = false; }
      alert("Proposta enviada com sucesso!");
      
      // Limpa formulário
      document.getElementById('propFormContainer').style.display = 'none';
      
      if (document.getElementById('manageProposalsTbody')) {
        this._adminList.page = 1;
        await this.renderAdminList();
      }
      else {
        this._employeeList.page = 1;
        await this.renderEmployeeList();
      }
    } catch(e) {
      console.error(e);
      const msg = String(e.message || e);
      const friendly = msg.includes('57014') || msg.includes('statement timeout')
        ? 'Tempo esgotado ao salvar. Os anexos são enviados ao Storage — recarregue (Ctrl+F5) e tente de novo. Se persistir, crie o bucket "proposal-attachments" no Supabase.'
        : msg.includes('etapaVendedor') || msg.includes('PGRST204')
        ? 'Erro ao enviar proposta: campo inválido no servidor. Recarregue a página (Ctrl+F5) e tente novamente.'
        : 'Erro ao enviar proposta: ' + msg;
      alert(friendly);
      const saveBtn = document.querySelector('#propFormArea .btn-primary');
      if (saveBtn) { saveBtn.innerText = 'Enviar Proposta'; saveBtn.disabled = false; }
    }
  },

  renderEmployeeList: async function() {
    const listEl = document.getElementById('proposalsList');
    if (!listEl) return;

    const user = Auth.getSession();
    if (!user?.id) return;

    listEl.innerHTML = '<p style="color:var(--color-text-muted);">Carregando propostas...</p>';

    try {
      const me = await DB.getUser(user.id).catch(() => null);
      const vendorUser = { id: user.id, name: me?.name || user.name || '' };

      const raw = await DB.getProposals(user.id, vendorUser);
      let proposals = this._rowsFromProposalQuery(raw)
        .map(p => this._normProposal(p))
        .filter(p => this._ownsProposal(p, vendorUser));

      proposals.sort((a, b) => new Date(this._proposalCreatedAt(b) || 0) - new Date(this._proposalCreatedAt(a) || 0));

      this._employeeList.total = proposals.length;
      const startEmp = (this._employeeList.page - 1) * this._employeeList.pageSize;
      proposals = proposals.slice(startEmp, startEmp + this._employeeList.pageSize);

      if (proposals.length === 0) {
        listEl.innerHTML = '<p style="color:var(--color-text-muted);">Nenhuma proposta cadastrada.</p>';
        this._renderPagination('employeeProposalsPagination', this._employeeList, 'Proposals.employeeSetPage');
        return;
      }

      const fmtR = v => v != null && v !== '' ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '—';
      let html = '';
      proposals.forEach(p => {
        let badgeClass = 'badge-muted';
        if (p.status === 'Em Andamento') badgeClass = 'badge-info';
        if (p.status === 'Digitação') badgeClass = 'badge-accent';
        if (p.status === 'AG. BOLETO') badgeClass = 'badge-warning';
        if (p.status === 'Pago') badgeClass = 'badge-success';
        if (p.status === 'Cancelado') badgeClass = 'badge-danger';
        if (p.status === 'Pendenciado') badgeClass = 'badge-warning';

        const etapaLabel = this._vendorStage(p) ? this._labelEtapaVendedor(this._vendorStage(p)) : '';
        const safeId = this._escAttr(p.id);
        html += `
          <div class="card" style="padding: 16px; margin-bottom: 12px;">
             <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 8px;">
                <div>
                  <strong style="font-size:16px;">${p.numero || p.id}</strong>
                  ${p.numero ? `<span style="font-size:11px;color:var(--color-text-muted);margin-left:8px;">(${p.id})</span>` : ''}
                </div>
                <span class="badge ${badgeClass}">${etapaLabel || p.status}</span>
             </div>
             <div style="margin-bottom:4px; font-size:14px;"><strong>Cliente:</strong> ${p.clientName} (CPF: ${p.clientCpf})</div>
             <div style="font-size:14px;"><strong>Produto:</strong> ${this._escHtml(p.product || '—')} | <strong>Convênio:</strong> ${this._escHtml(p.convenio || '—')} | <strong>Entidade:</strong> ${this._escHtml(p.entidade || '—')}${etapaLabel ? ` | <strong>Situação:</strong> ${this._escHtml(etapaLabel)}` : ''}</div>
             ${p.protocolo ? `<div style="font-size:14px;margin-top:4px;"><strong>Nº Protocolo:</strong> ${this._escHtml(p.protocolo)}</div>` : ''}
             <div style="display:flex; gap:20px; margin-top:10px; background:var(--color-surface-2); padding:10px; border-radius:8px; flex-wrap:wrap;">
               <div style="font-size:13px;"><span style="color:var(--color-text-muted);">Valor Proposta</span><br><strong>${fmtR(p.valor)}</strong></div>
               <div style="font-size:13px;"><span style="color:var(--color-text-muted);">Desconto</span><br><strong style="color:var(--color-danger);">− ${fmtR(p.desconto)}</strong></div>
               <div style="font-size:13px;"><span style="color:var(--color-text-muted);">Valor Final</span><br><strong style="color:var(--color-success);">${fmtR(p.valorFinal)}</strong></div>
             </div>
             <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; flex-wrap:wrap; gap:8px;">
               <div style="font-size: 12px; color: var(--color-text-muted);">Criada em: ${this._propDateStr(p)}</div>
               <div style="display:flex; gap:6px;">
                 <button type="button" class="btn btn-outline btn-sm" onclick="Proposals.openEmployeeViewModal('${safeId}')">Ver</button>
                 <button type="button" class="btn btn-primary btn-sm" onclick="Proposals.openEmployeeModal('${safeId}')">Editar</button>
               </div>
             </div>
          </div>
        `;
      });
      listEl.innerHTML = html;
      this._renderPagination('employeeProposalsPagination', this._employeeList, 'Proposals.employeeSetPage');
    } catch (e) {
      console.error('[Proposals] renderEmployeeList:', e);
      listEl.innerHTML = '<p style="color:var(--color-danger);">Erro ao carregar propostas. Recarregue a página.</p>';
    }
  },

  renderAdminList: async function() {
    const tbody = document.getElementById('manageProposalsTbody');
    if (!tbody) return;

    const emptyMsg = (q) => `<tr><td colspan="11" style="text-align:center;color:var(--color-text-muted);padding:24px;">${q ? 'Nenhuma proposta encontrada para esta busca.' : 'Nenhuma proposta cadastrada.'}</td></tr>`;

    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--color-text-muted);padding:24px;">Carregando propostas...</td></tr>';

    try {
      const q = this._getProposalSearchQuery();
      const session = Auth.getSession();
      const isVendorSession = session?.role === 'vendedor';
      let vendorId = this._getAdminVendorFilter();
      if (isVendorSession) vendorId = session.id;
      this._adminList.vendorId = vendorId;

      const statusFilter = this._getAdminStatusFilter();
      this._adminList.statusFilter = statusFilter;

      // Sincroniza classes active nos filtros do cabeçalho
      const headerVendor = document.getElementById('proposalVendorFilterHeader');
      if (headerVendor) {
        if (vendorId && vendorId !== 'todos') headerVendor.classList.add('filter-active');
        else headerVendor.classList.remove('filter-active');
      }
      const headerStatus = document.getElementById('proposalStatusFilterHeader');
      if (headerStatus) {
        if (statusFilter && statusFilter !== 'todos') headerStatus.classList.add('filter-active');
        else headerStatus.classList.remove('filter-active');
      }

      const vendorFilterEl = document.getElementById('proposalVendorFilter');
      if (vendorFilterEl) {
        vendorFilterEl.disabled = isVendorSession;
        if (isVendorSession) vendorFilterEl.style.display = 'none';
        else vendorFilterEl.style.display = '';
      }

      const vendorFilterHeaderEl = document.getElementById('proposalVendorFilterHeader');
      if (vendorFilterHeaderEl) {
        vendorFilterHeaderEl.disabled = isVendorSession;
        if (isVendorSession) vendorFilterHeaderEl.style.display = 'none';
        else vendorFilterHeaderEl.style.display = '';
      }

      const partnerRoot = !isVendorSession && typeof window !== 'undefined' ? window.PARTNER_ROOT_ID : null;
      const propOpts = partnerRoot ? { partnerRootId: partnerRoot } : {};
      const [, rawRows] = await Promise.all([
        this._initAdminProposalFilters(),
        isVendorSession
          ? DB.getProposals(session.id, { id: session.id, name: session.name })
          : DB.getProposals(null, null, propOpts),
      ]);

      let proposals = this._rowsFromProposalQuery(rawRows).map(p => this._normProposal(p));
      if (isVendorSession) {
        proposals = proposals.filter(p => this._ownsProposal(p, { id: session.id, name: session.name }));
      } else if (!partnerRoot) {
        proposals = await this._filterProposalsToPartnerOrg(proposals);
      }
      if (!window.PARTNER_ROOT_ID) {
        proposals = await this._filterProposalsExcludePartnerOrg(proposals);
      }
      proposals = proposals.filter(p => this._matchesVendorIdFilter(p, vendorId || ''));
      proposals = proposals.filter(p => this._matchesStatusFilter(p, statusFilter || ''));
      proposals = proposals.filter(p => this._matchesProposalQuickSearch(p, q));

      proposals.sort((a, b) => new Date(this._proposalCreatedAt(b) || 0) - new Date(this._proposalCreatedAt(a) || 0));

      this._adminList.total = proposals.length;
      const startAd = (this._adminList.page - 1) * this._adminList.pageSize;
      proposals = proposals.slice(startAd, startAd + this._adminList.pageSize);

      if (proposals.length === 0) {
        tbody.innerHTML = emptyMsg(q || vendorId);
        this._renderPagination('proposalsPagination', this._adminList, 'Proposals.adminSetPage');
        return;
      }

      const fmtR = v => v != null && v !== '' ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '—';
      const canDelete = this._canDeleteProposal();
      let html = '';
      proposals.forEach(p => {
        let badgeClass = 'badge-muted';
        if (p.status === 'Em Andamento') badgeClass = 'badge-info';
        if (p.status === 'Digitação') badgeClass = 'badge-accent';
        if (p.status === 'AG. BOLETO') badgeClass = 'badge-warning';
        if (p.status === 'Pago') badgeClass = 'badge-success';
        if (p.status === 'Cancelado') badgeClass = 'badge-danger';
        if (p.status === 'Pendenciado') badgeClass = 'badge-warning';

        const etapaLabel = this._vendorStage(p) ? this._labelEtapaVendedor(this._vendorStage(p)) : '';
        const safeId = this._escAttr(p.id);
        const safeLabel = this._escAttr(p.numero || p.clientName || p.id);
        html += `<tr>
            <td><strong>${p.numero || p.id}</strong></td>
            <td>${p.vendorName || '—'}</td>
            <td>${p.clientName || '—'} <div style="font-size:11px;color:var(--color-text-muted);">${p.clientCpf || ''}</div></td>
            <td>${p.product || '—'}${etapaLabel ? ` <div style="font-size:11px;color:var(--color-text-muted);">${etapaLabel}</div>` : ''}</td>
            <td>${p.convenio || '—'} <div style="font-size:11px;color:var(--color-text-muted);">${p.entidade || ''}</div></td>
            <td>${p.protocolo ? this._escHtml(p.protocolo) : '—'}</td>
            <td>${fmtR(p.valor)}</td>
            <td><strong style="color:var(--color-success);">${fmtR(p.valorFinal)}</strong></td>
            <td>${this._propDateStr(p)}</td>
            <td><span class="badge ${badgeClass}">${etapaLabel || p.status || '—'}</span></td>
            <td style="white-space:nowrap;">
              <div style="display:flex;gap:6px;flex-wrap:nowrap;">
                <button type="button" class="btn btn-outline btn-sm" onclick="Proposals.openAdminViewModal('${safeId}')">Ver</button>
                <button type="button" class="btn btn-primary btn-sm" onclick="Proposals.openAdminModal('${safeId}')">Editar</button>
                ${canDelete ? `<button type="button" class="btn btn-danger btn-sm" onclick="Proposals.masterDeleteProposal('${safeId}', '${safeLabel}')">Excluir</button>` : ''}
              </div>
            </td>
          </tr>`;
      });
      tbody.innerHTML = html;
      this._renderPagination('proposalsPagination', this._adminList, 'Proposals.adminSetPage');
    } catch (e) {
      console.error('[Proposals] renderAdminList:', e);
      const msg = (e && e.message) ? String(e.message).slice(0, 200) : 'Erro desconhecido';
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--color-danger);padding:24px;">Erro ao carregar propostas.<br><small style="opacity:.85;">${this._escHtml(msg)}</small><br><button type="button" class="btn btn-outline btn-sm" style="margin-top:10px;" onclick="Proposals.renderAdminList()">Tentar novamente</button></td></tr>`;
    }
  },

  updateEmployeeEntidades: function() {
    const conv = document.getElementById('empPropConvenio')?.value;
    const cur = document.getElementById('empPropEntidade')?.value;
    this._fillEntidadeSelect('empPropEntidade', conv, cur);
  },

  _attachmentKeysForGroup: function(att, prefix, seedItems) {
    const items = (seedItems || []).map(i => ({ ...i, legado: i.legado || [] }));
    const seen = new Set(items.map(i => i.key));
    Object.keys(att || {}).forEach(k => {
      if (k.endsWith('_nome') || k.endsWith('_pasta')) return;
      if (k.startsWith(prefix) && !seen.has(k)) {
        seen.add(k);
        items.push({ key: k, legado: [] });
      }
    });
    return items;
  },

  _renderProposalAttachments: function(proposal, attEl) {
    if (!attEl) return;
    const att = this._parseAttachments(proposal.attachments);
    this._attachmentViewerCache = [];
    const grupos = [
      { titulo: '🪪 Documento de Identidade', prefix: 'identidade_', seed: [
        {key:'identidade_frente', label:'Frente', legado:['identidade','arquivo_1']},
        {key:'identidade_verso', label:'Verso', legado:[]},
      ]},
      { titulo: '📋 Contracheque', prefix: 'contracheque_', seed: [
        {key:'contracheque_1', legado:['paystub']},
      ]},
      { titulo: '💳 Boleto de Quitação', prefix: 'boleto_', seed: [
        {key:'boleto_1', legado:['boleto1']}, {key:'boleto_2', legado:['boleto2']},
      ]},
      { titulo: '📄 Extrato de Consignação', prefix: 'extrato_', seed: [
        {key:'extrato_1', legado:['extrato1']}, {key:'extrato_2', legado:['extrato2']},
      ]},
    ];
    const _resolve = (item) => {
      const tryKey = (k) => {
        if (att[k] == null || att[k] === '') return null;
        const url = this._normalizeAttachmentUrl(att[k]);
        if (!this._isValidAttachmentUrl(url)) return null;
        return { url, nome: att[k + '_nome'] || item.label || item.key || k };
      };
      let doc = tryKey(item.key);
      if (doc) return doc;
      for (const lk of (item.legado || [])) {
        doc = tryKey(lk);
        if (doc) return doc;
      }
      return null;
    };
    let html = '<div style="display:flex;flex-direction:column;gap:14px;width:100%;margin-top:8px;">';
    grupos.forEach(g => {
      const itens = this._attachmentKeysForGroup(att, g.prefix, g.seed);
      html += `<div>
        <div style="font-size:12px;font-weight:700;color:var(--color-text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">${g.titulo}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">`;
      let algum = false;
      itens.forEach((item) => {
        const doc = _resolve(item);
        if (!doc) return;
        algum = true;
        const cacheIdx = this._attachmentViewerCache.length;
        this._attachmentViewerCache.push({ url: doc.url, nome: doc.nome });
        html += this._renderAttachmentPreview(doc, cacheIdx);
      });
      if (!algum) html += `<span style="font-size:12px;color:var(--color-text-muted);align-self:center;">Nenhum arquivo</span>`;
      html += `</div></div>`;
    });

    const customGroupIds = new Set();
    Object.keys(att).forEach(k => {
      if (!k.startsWith('custom_') || k.endsWith('_nome') || k.endsWith('_pasta')) return;
      const m = k.match(/^custom_(.+)_(\d+)$/);
      if (m) customGroupIds.add(m[1]);
    });
    customGroupIds.forEach(groupId => {
      const keys = Object.keys(att).filter(k =>
        k.startsWith('custom_' + groupId + '_') && !k.endsWith('_nome') && !k.endsWith('_pasta')
      ).sort();
      const titulo = att['custom_' + groupId + '_1_pasta'] || att[keys[0] + '_pasta'] || '📁 Pasta extra';
      html += `<div>
        <div style="font-size:12px;font-weight:700;color:var(--color-text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">${this._escHtml(titulo)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">`;
      let algumCustom = false;
      keys.forEach(key => {
        const doc = _resolve({ key, legado: [] });
        if (!doc) return;
        algumCustom = true;
        const cacheIdx = this._attachmentViewerCache.length;
        this._attachmentViewerCache.push({ url: doc.url, nome: doc.nome });
        html += this._renderAttachmentPreview(doc, cacheIdx);
      });
      if (!algumCustom) html += `<span style="font-size:12px;color:var(--color-text-muted);">Nenhum arquivo</span>`;
      html += `</div></div>`;
    });

    html += '</div>';
    attEl.innerHTML = html;
  },

  _applyEmployeeModalMode: function(viewOnly) {
    const modal = document.getElementById('employeeProposalModal');
    if (!modal) return;
    const title = document.getElementById('employeeProposalTitle');
    if (title) title.textContent = viewOnly ? 'Visualizar Proposta' : 'Editar Proposta';
    const editBlock = document.getElementById('empPropEditFields');
    if (editBlock) editBlock.style.display = viewOnly ? 'none' : '';
    const saveBtn = document.getElementById('empPropSaveBtn');
    if (saveBtn) saveBtn.style.display = viewOnly ? 'none' : '';
    const cancelBtn = document.getElementById('empPropCancelBtn');
    if (cancelBtn) cancelBtn.textContent = viewOnly ? 'Fechar' : 'Cancelar';
    modal.querySelectorAll('#empPropEditFields input, #empPropEditFields select, #empPropEditFields textarea').forEach(el => {
      if (el.type === 'file' && viewOnly) { el.disabled = true; return; }
      if (el.type === 'file' && !viewOnly) { el.disabled = false; return; }
      if (viewOnly) {
        if (el.tagName === 'SELECT') el.disabled = true;
        else el.readOnly = true;
      } else {
        el.disabled = false;
        el.readOnly = false;
      }
    });
  },

  openEmployeeViewModal: function(id) {
    return this.openEmployeeModal(id, true);
  },

  openEmployeeModal: async function(id, viewOnly) {
    viewOnly = !!viewOnly;
    const user = Auth.getSession();
    if (!user?.id) return;

    const modal = document.getElementById('employeeProposalModal');
    this._applyEmployeeModalMode(viewOnly);
    modal?.classList.add('open');

    const attEl = document.getElementById('empPropAttachments');
    const histEl = document.getElementById('empPropHistoryList');
    if (attEl) attEl.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px;">Carregando anexos...</p>';
    if (histEl) histEl.innerHTML = '<p style="color:var(--color-text-muted);">Carregando...</p>';

    if (typeof showLoading === 'function') showLoading('Carregando proposta...');

    try {
      const raw = await DB.getProposal(id);
      const proposal = this._normProposal(raw);
      if (!proposal) {
        alert('Proposta não encontrada.');
        modal?.classList.remove('open');
        return;
      }
      if (!this._ownsProposal(proposal, user)) {
        alert('Você só pode visualizar ou editar suas próprias propostas.');
        modal?.classList.remove('open');
        return;
      }

      const cpf = String(proposal.clientCpf || '').replace(/\D/g, '');
      const client = cpf ? await DB.getClientByCpf(cpf) : null;

      const sv = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val ?? ''; };
      sv('empPropId', proposal.id);

      const detailEl = document.getElementById('empPropClientDetail');
      if (detailEl) {
        detailEl.style.display = '';
        detailEl.innerHTML = '<strong style="display:block;margin-bottom:8px;">Dados cadastrais do cliente</strong>' +
          this._fmtClientBlock(client, proposal);
      }

      const fmtR = v => v != null && v !== '' ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '—';
      const etapaLabel = this._vendorStage(proposal) ? this._labelEtapaVendedor(this._vendorStage(proposal)) : '';
      const infoEl = document.getElementById('empPropClientInfo');
      if (infoEl) {
        infoEl.innerHTML = `
          <strong>Cliente:</strong> ${this._escHtml(proposal.clientName)} (CPF: ${this._escHtml(proposal.clientCpf)})<br>
          <strong>Produto:</strong> ${this._escHtml(proposal.product || '—')} / ${this._escHtml(proposal.convenio || '—')} / ${this._escHtml(proposal.entidade || '—')}<br>
          <strong>Nº Proposta:</strong> ${this._escHtml(proposal.numero || '—')} &nbsp;|&nbsp;
          <strong>Valor:</strong> ${fmtR(proposal.valor)} &nbsp;|&nbsp;
          <strong>Valor Final:</strong> <span style="color:var(--color-success);font-weight:700;">${fmtR(proposal.valorFinal)}</span><br>
          ${proposal.protocolo ? `<strong>Nº Protocolo:</strong> ${this._escHtml(proposal.protocolo)}<br>` : ''}
          ${etapaLabel ? `<strong>Situação:</strong> ${this._escHtml(etapaLabel)}<br>` : ''}
          <strong>Status:</strong> ${this._escHtml(proposal.status || '—')}<br>
          <strong>Obs:</strong> ${this._escHtml(proposal.obs || '—')}
        `;
      }

      sv('empPropMatricula', proposal.matricula);
      sv('empPropSenhaCC', proposal.senhaContracheque);
      sv('empPropSenhaConsig', proposal.senhaConsignacao);
      sv('empPropProduct', proposal.product);
      sv('empPropConvenio', proposal.convenio);
      this.updateEmployeeEntidades();
      sv('empPropEntidade', proposal.entidade);
      const etapaSel = document.getElementById('empPropEtapa');
      if (etapaSel) {
        etapaSel.innerHTML = this._vendorSituacaoOptionsHtml(this._vendorStage(proposal));
      } else {
        sv('empPropEtapa', this._vendorStage(proposal));
      }
      sv('empPropProtocolo', proposal.protocolo);
      sv('empPropObs', proposal.obs);

      const uploadSec = document.getElementById('empPropAnexosUpload');
      if (uploadSec) uploadSec.style.display = viewOnly ? 'none' : '';
      if (!viewOnly) {
        this._setFolderContext('empPropAnexosFolders', 'empProp');
        this.resetAnexoFolders();
        this._initStaticProposalSelects();
      }

      let histHtml = '';
      (proposal.history || []).forEach(h => {
        histHtml += `
          <div class="card" style="padding:12px;margin-bottom:10px;border-left:4px solid var(--color-primary);">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px;">
              <strong>${this._escHtml(h.actorName)}</strong>
              <span style="color:var(--color-text-muted)">${new Date(h.date).toLocaleString()}</span>
            </div>
            <div style="font-size:14px;"><strong>${this._escHtml(h.action)}</strong></div>
            ${h.note ? `<div style="margin-top:6px;font-size:14px;background:var(--color-surface-2);padding:8px;border-radius:4px;">${this._escHtml(h.note)}</div>` : ''}
          </div>`;
      });
      if (histEl) histEl.innerHTML = histHtml || '<p style="color:var(--color-text-muted);">Sem histórico.</p>';

      this._employeeEditCache[id] = { ...proposal };

      if (typeof hideLoading === 'function') hideLoading();

      DB.getProposalAttachments(id).then(attRow => {
        if (!attRow?.attachments) {
          if (attEl) attEl.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px;">Nenhum anexo.</p>';
          return;
        }
        proposal.attachments = attRow.attachments;
        if (this._employeeEditCache[id]) this._employeeEditCache[id].attachments = attRow.attachments;
        this._renderProposalAttachments(proposal, attEl);
      }).catch(err => {
        console.warn('[openEmployeeModal] anexos:', err);
        if (attEl) attEl.innerHTML = '<p style="color:var(--color-danger);font-size:13px;">Erro ao carregar anexos.</p>';
      });
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar proposta: ' + (e.message || 'tente novamente'));
      modal?.classList.remove('open');
      if (typeof hideLoading === 'function') hideLoading();
    }
  },

  employeeSave: async function() {
    const user = Auth.getSession();
    if (!user?.id) return;
    const gv = id => document.getElementById(id)?.value?.trim() || '';
    const id = gv('empPropId');
    let proposal = this._employeeEditCache[id] ? { ...this._employeeEditCache[id] } : await DB.getProposal(id);
    if (!proposal) return;
    if (!proposal.attachments) {
      const attRow = await DB.getProposalAttachments(id);
      if (attRow?.attachments != null) proposal.attachments = attRow.attachments;
    }
    const norm = this._normProposal(proposal);
    if (!this._ownsProposal(norm, user)) {
      alert('Você só pode editar suas próprias propostas.');
      return;
    }

    const matricula = gv('empPropMatricula');
    const senhaCC = gv('empPropSenhaCC');
    const senhaConsig = gv('empPropSenhaConsig');
    const product = gv('empPropProduct');
    const etapa = gv('empPropEtapa');

    const saveBtn = document.getElementById('empPropSaveBtn');
    const oldText = saveBtn?.innerText || 'Salvar';
    if (saveBtn) { saveBtn.innerText = 'Salvando...'; saveBtn.disabled = true; }

    proposal.matricula = matricula;
    proposal.senhaContracheque = senhaCC;
    proposal.senhaConsignacao = senhaConsig;
    proposal.product = gv('empPropProduct');
    proposal.convenio = gv('empPropConvenio');
    proposal.entidade = gv('empPropEntidade');
    proposal.protocolo = gv('empPropProtocolo');
    proposal.obs = gv('empPropObs');
    if (etapa) {
      proposal.statusOp = etapa;
      proposal.status = etapa;
    }

    this._setFolderContext('empPropAnexosFolders', 'empProp');
    const att = this._parseAttachments(proposal.attachments);
    try {
      const uploaded = await this._collectAttachments(id);
      Object.assign(att, uploaded);
      proposal.attachments = att;
    } catch (e) {
      console.error('[employeeSave] anexo', e);
      alert('Erro ao processar anexo: ' + (e.message || 'tente de novo. Arquivos muito grandes podem falhar no modo local.'));
      if (saveBtn) { saveBtn.innerText = oldText; saveBtn.disabled = false; }
      return;
    }

    proposal.history = proposal.history || [];
    proposal.history.push({
      date: new Date().toISOString(),
      actorName: user.name,
      action: 'Proposta atualizada pelo vendedor',
      note: proposal.obs || ''
    });

    if (typeof showLoading === 'function') showLoading('Salvando proposta…');
    try {
      await DB.saveProposal(proposal);
      delete this._employeeEditCache[id];
      if (typeof showToast === 'function') showToast('Proposta atualizada!', 'success');
      else alert('Proposta atualizada!');
      closeModal('employeeProposalModal');
      await this.renderEmployeeList();
    } catch (e) {
      console.error('[employeeSave]', e);
      alert('Erro ao salvar proposta: ' + this._proposalSaveErrorMsg(e));
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
      if (saveBtn) { saveBtn.innerText = oldText; saveBtn.disabled = false; }
    }
  },

  openAdminViewModal: function(id) {
    return this.openAdminModal(id, true);
  },

  _applyManageModalMode: function(viewOnly) {
    const modal = document.getElementById('manageProposalModal');
    if (!modal) return;

    const title = document.getElementById('manageProposalTitle');
    if (title) title.textContent = viewOnly ? 'Visualizar Proposta' : 'Atualizar Proposta';

    const body = modal.querySelector('.modal-body');
    if (body) {
      const alwaysReadonly = ['managePropValorBruto', 'managePropValorFinalCalc'];
      body.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.type === 'hidden') return;
        if (viewOnly) {
          if (el.tagName === 'SELECT') el.disabled = true;
          else el.readOnly = true;
        } else {
          el.disabled = false;
          el.readOnly = alwaysReadonly.includes(el.id);
        }
      });
    }

    if (viewOnly) {
      document.querySelectorAll('.backoffice-edit-block').forEach(el => { el.style.display = 'none'; });
      const vb = document.getElementById('managePropVendorBlock');
      if (vb) vb.style.display = 'none';
    }

    const saveBtn = modal.querySelector('.modal-footer .btn-primary');
    if (saveBtn) saveBtn.style.display = viewOnly ? 'none' : '';
    const cancelBtn = modal.querySelector('.modal-footer .btn-ghost');
    if (cancelBtn) cancelBtn.textContent = viewOnly ? 'Fechar' : 'Cancelar';
    const delBtn = document.getElementById('managePropDeleteBtn');
    if (delBtn) delBtn.style.display = this._canDeleteProposal() ? '' : 'none';
  },

    openAdminModal: async function(id, viewOnly) {
    viewOnly = !!viewOnly;
    const modal = document.getElementById('manageProposalModal');
    const attEl = document.getElementById('managePropAttachments');
    if (attEl) attEl.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px;">Carregando anexos...</p>';
    if (typeof showLoading === 'function') showLoading('Carregando proposta...');

    try {
    const raw = await DB.getProposal(id);
    const proposal = this._normProposal(raw);
    if (!proposal) return;

    const sv = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };

    sv('managePropId', proposal.id);

    const user = Auth.getSession();
    const role = user?.role || '';
    const canEditProp = this._canEditNumeroValor(role);
    const canPickVendor = this._canPickVendor(role);

    document.querySelectorAll('.backoffice-edit-block').forEach(el => {
      el.style.display = canEditProp ? '' : 'none';
    });

    const vendorBlock = document.getElementById('managePropVendorBlock');
    if (vendorBlock) vendorBlock.style.display = canPickVendor ? '' : 'none';

    if (canPickVendor) {
      const vendorSel = document.getElementById('managePropVendor');
      if (vendorSel) {
        const scopeAdmin = this._proposalVendorScopeAdmin(user);
        let vendors = await DB.getVendorsForSelect(scopeAdmin).catch(() => []);

        const vid = proposal.vendorId || proposal.employee_id || '';
        if (vid && !vendors.some(v => v.id === vid)) {
          const current = await DB.getUser(vid).catch(() => null);
          if (current) vendors = [current, ...vendors];
        }

        vendors.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        vendorSel.innerHTML = vendors.length
          ? vendors.map(v => `<option value="${v.id}">${v.name || v.email || v.id}</option>`).join('')
          : '<option value="">Nenhum vendedor encontrado</option>';
        if (vid && vendors.some(v => v.id === vid)) vendorSel.value = vid;
        else if (vendors.length) vendorSel.selectedIndex = 0;
      }
    }
    sv('managePropNumeroEdit', proposal.numero);
    const valEl = document.getElementById('managePropValorEdit');
    if (valEl) valEl.value = proposal.valor || '';

    const client = proposal.clientCpf ? await DB.getClientByCpf(String(proposal.clientCpf).replace(/\D/g, '')) : null;
    const detailEl = document.getElementById('managePropClientDetail');
    if (detailEl) {
      detailEl.style.display = '';
      detailEl.innerHTML = '<strong style="display:block;margin-bottom:8px;">Dados cadastrais do cliente</strong>' + this._fmtClientBlock(client, proposal);
    }

    const fmtR = v => v != null && v !== '' ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '—';
    let clientInfo = `
      <strong>Cliente:</strong> ${proposal.clientName} (CPF: ${proposal.clientCpf})<br>
      <strong>Vendedor:</strong> ${canPickVendor ? '<span id="managePropVendorName">' + (proposal.vendorName || '—') + '</span>' : (proposal.vendorName || '—')}<br>
      <strong>Produto:</strong> ${proposal.product || '—'} / ${proposal.convenio || '—'} / ${proposal.entidade || '—'}<br>
      <strong>Nº Proposta:</strong> ${proposal.numero || '—'} &nbsp;|&nbsp;
      <strong>Valor Bruto:</strong> ${fmtR(proposal.valor)} &nbsp;|&nbsp;
      <strong>Tabela:</strong> ${proposal.tabela
        ? `<span style="background:#3b82f620;color:#3b82f6;padding:1px 7px;border-radius:99px;font-weight:700;">${proposal.tabela}</span>`
        : `<span style="background:#f59e0b20;color:#f59e0b;padding:1px 7px;border-radius:99px;font-weight:700;">⏳ Aguardando análise</span>`}
      &nbsp;|&nbsp;
      <strong>Valor Final:</strong> <span style="color:var(--color-success);font-weight:700;">${proposal.tabela ? fmtR(proposal.valorFinal) : '—'}</span><br>
      ${proposal.matricula ? `<strong>Matrícula:</strong> ${proposal.matricula} &nbsp;|&nbsp; <strong>Senha Contracheque:</strong> ${proposal.senhaContracheque || '—'} &nbsp;|&nbsp; <strong>Senha Consignação:</strong> ${proposal.senhaConsignacao || '—'}<br>` : ''}
      ${proposal.protocolo ? `<strong>Nº Protocolo:</strong> ${proposal.protocolo}<br>` : ''}
      ${this._vendorStage(proposal) ? `<strong>Situação (vendedor):</strong> ${this._labelEtapaVendedor(this._vendorStage(proposal))}<br>` : ''}
      <strong>Obs:</strong> ${proposal.obs || '—'}
    `;
    const infoEl = document.getElementById('managePropClientInfo');
    if (infoEl) infoEl.innerHTML = clientInfo;

    // Seção Tabela/Financeiro
    const fmtRaw = v => v != null && v !== '' ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR',{minimumFractionDigits:2}) : '';
    const brutoEl = document.getElementById('managePropValorBruto');
    if (brutoEl) brutoEl.value = fmtRaw(proposal.valor);
    const tabAdmEl = document.getElementById('managePropTabela');
    if (tabAdmEl) tabAdmEl.value = proposal.tabela || '';
    // dispara cálculo visual
    setTimeout(() => this.calcAdminValorFinal(), 50);

    sv('managePropDivida', proposal.compraDivida);
    sv('managePropBanco', proposal.bancoComprado);
    sv('managePropBoleto', proposal.solicitouBoleto || proposal.solicitacaoBoleto);
    sv('managePropValor', proposal.valor);
    sv('managePropProtocolo', proposal.protocolo);
    sv('managePropDataSol', proposal.dataSolicitacao);
    sv('managePropBacen', proposal.bacen);
    sv('managePropProtBacen', proposal.protocoloBacen);
    sv('managePropDataBacen', proposal.dataSolicitacaoBacen);
    sv('managePropAssinou', proposal.assinou);
    sv('managePropStatusOp', proposal.statusOp || proposal.status);
    sv('managePropPosVenda', proposal.posVenda);
    sv('managePropNuvidio', proposal.nuvidio);
    sv('managePropFases', proposal.fases);
    sv('managePropStatus', proposal.status);
    sv('managePropHistoryNote', '');

    let histHtml = '';
    if (proposal.history) {
      proposal.history.forEach(h => {
        histHtml += `
          <div class="card" style="padding: 12px; margin-bottom: 10px; border-left: 4px solid var(--color-primary);">
            <div style="display:flex; justify-content:space-between; margin-bottom: 4px; font-size: 13px;">
              <strong>${h.actorName}</strong>
              <span style="color:var(--color-text-muted)">${new Date(h.date).toLocaleString()}</span>
            </div>
            <div style="font-size:14px;"><strong>${h.action}</strong></div>
            ${h.note ? `<div style="margin-top: 6px; font-size:14px; background: var(--color-surface-2); padding: 8px; border-radius: 4px;">${h.note}</div>` : ''}
          </div>
        `;
      });
    }
    document.getElementById('managePropHistoryList').innerHTML = histHtml;

    this._adminEditCache[id] = { ...proposal };
    const adminUploadSec = document.getElementById('managePropAnexosUpload');
    if (adminUploadSec) adminUploadSec.style.display = viewOnly ? 'none' : '';
    if (!viewOnly) {
      this._setFolderContext('managePropAnexosFolders', 'manageProp');
      this.resetAnexoFolders();
    }
    this._applyManageModalMode(viewOnly);
    modal?.classList.add('open');
    if (typeof hideLoading === 'function') hideLoading();

    DB.getProposalAttachments(id).then(attRow => {
      if (!attRow?.attachments) {
        if (attEl) attEl.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px;">Nenhum anexo.</p>';
        return;
      }
      proposal.attachments = attRow.attachments;
      if (this._adminEditCache[id]) this._adminEditCache[id].attachments = attRow.attachments;
      this._renderProposalAttachments(proposal, attEl);
    }).catch(err => {
      console.warn('[openAdminModal] anexos:', err);
      if (attEl) attEl.innerHTML = '<p style="color:var(--color-danger);font-size:13px;">Erro ao carregar anexos.</p>';
    });
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar proposta: ' + (e.message || 'tente novamente'));
      modal?.classList.remove('open');
      if (typeof hideLoading === 'function') hideLoading();
    }
  },

  adminSave: async function() {
    const user = Auth.getSession();
    const gv = id => document.getElementById(id)?.value || '';
    const id = gv('managePropId');
    let proposal = this._adminEditCache[id] ? { ...this._adminEditCache[id] } : await DB.getProposal(id);
    if (!proposal) return;
    if (!proposal.attachments) {
      const attRow = await DB.getProposalAttachments(id);
      if (attRow?.attachments != null) proposal.attachments = attRow.attachments;
    }

    const role = user?.role || '';

    // Vendedor responsável (supervisor+)
    if (this._canPickVendor(role)) {
      const vendorSel = document.getElementById('managePropVendor');
      if (vendorSel && vendorSel.value) {
        proposal.vendorId = vendorSel.value;
        proposal.vendor_id = vendorSel.value;
        proposal.employee_id = vendorSel.value;
        const opt = vendorSel.options[vendorSel.selectedIndex];
        if (opt) {
          proposal.vendorName = opt.textContent.trim();
          proposal.vendor_name = opt.textContent.trim();
        }
      }
    }

    // ── Nº e Valor editados por supervisor+ ──────────────────────────
    if (this._canEditNumeroValor(role)) {
      const novoNumero = gv('managePropNumeroEdit');
      const novoValor  = document.getElementById('managePropValorEdit')?.value;
      if (novoNumero) proposal.numero = novoNumero;
      if (novoValor !== '' && novoValor != null && !isNaN(parseFloat(novoValor))) {
        proposal.valor = parseFloat(novoValor);
        if (!proposal.tabela) proposal.valorFinal = proposal.valor;
      }
    }

    // ── Tabela / Valor Final (definido pelo Financeiro) ──────────────
    const novaTabela = gv('managePropTabela');
    if (novaTabela) {
      const pct = this._tabelaPct[novaTabela] ?? 1;
      proposal.tabela     = novaTabela;
      proposal.valorFinal = parseFloat(((proposal.valor||0) * pct).toFixed(2));
      proposal.desconto   = parseFloat(((proposal.valor||0) - proposal.valorFinal).toFixed(2));
    }

    proposal.compraDivida    = gv('managePropDivida');
    proposal.bancoComprado   = gv('managePropBanco');
    proposal.solicitouBoleto = gv('managePropBoleto');
    proposal.protocolo       = gv('managePropProtocolo');
    proposal.dataSolicitacao = gv('managePropDataSol');
    proposal.bacen           = gv('managePropBacen');
    proposal.protocoloBacen  = gv('managePropProtBacen');
    proposal.dataSolicitacaoBacen = gv('managePropDataBacen');
    proposal.assinou         = gv('managePropAssinou');
    proposal.statusOp        = gv('managePropStatusOp');
    proposal.posVenda        = gv('managePropPosVenda');
    proposal.nuvidio         = gv('managePropNuvidio');
    proposal.fases           = gv('managePropFases');

    const oldStatus = proposal.status;
    const newStatus = gv('managePropStatus') || proposal.status;
    proposal.status = newStatus;
    
    const note = gv('managePropHistoryNote');
    
    if (newStatus !== oldStatus || note || novaTabela) {
       proposal.history = proposal.history || [];
       let action = 'Atualização operacional';
       if (newStatus !== oldStatus) action = `Status: [${oldStatus}] → [${newStatus}]`;
       if (novaTabela && novaTabela !== (proposal._prevTabela || '')) {
         const pctLabel = Math.round((this._tabelaPct[novaTabela]??1)*100);
         action += ` | Tabela definida: ${novaTabela} (${pctLabel}%) → Valor Final: R$ ${proposal.valorFinal?.toLocaleString('pt-BR',{minimumFractionDigits:2})||'0,00'}`;
       }
       proposal.history.push({
         date: new Date().toISOString(),
         actorName: user.name,
         action,
         note: note
       });
    }

    this._setFolderContext('managePropAnexosFolders', 'manageProp');
    try {
      const att = this._parseAttachments(proposal.attachments);
      const uploaded = await this._collectAttachments(id);
      Object.assign(att, uploaded);
      proposal.attachments = att;
    } catch (e) {
      console.error('[adminSave] anexo', e);
      alert('Erro ao processar anexo: ' + (e.message || 'tente de novo. Arquivos muito grandes podem falhar no modo local.'));
      return;
    }

    if (typeof showLoading === 'function') showLoading('Salvando…');
    try {
      await DB.saveProposal(proposal);
      delete this._adminEditCache[id];
      if (typeof showToast === 'function') showToast('Proposta atualizada!', 'success');
      else alert('Proposta atualizada!');
      const modal = document.getElementById('manageProposalModal');
      if (modal) modal.classList.remove('open');
      await this.renderAdminList();
    } catch (e) {
      console.error('[adminSave]', e);
      alert('Erro ao salvar proposta: ' + this._proposalSaveErrorMsg(e));
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  },

  masterDeleteFromModal: function() {
    const id = document.getElementById('managePropId')?.value;
    if (!id) return;
    this.masterDeleteProposal(id, document.getElementById('managePropNumeroEdit')?.value || id, true);
  },

  masterDeleteProposal: async function(id, label, fromModal) {
    if (!this._canDeleteProposal()) {
      alert('Sem permissão para excluir propostas.');
      return;
    }
    const nome = label || id;
    if (!confirm(`Excluir a proposta "${nome}" permanentemente?\n\nEsta ação não pode ser desfeita.`)) return;

    if (typeof showLoading === 'function') showLoading('Excluindo proposta...');
    try {
      await DB.deleteProposal(id);
      delete this._adminEditCache[id];
      delete this._employeeEditCache[id];
      if (fromModal) closeModal('manageProposalModal');
      if (typeof showToast === 'function') showToast('Proposta excluída.', 'success');
      await this.renderAdminList();
    } catch (e) {
      console.error('[masterDeleteProposal]', e);
      alert('Erro ao excluir proposta: ' + (e.message || 'tente novamente'));
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (window.Proposals) {
    Proposals._initAnexoFolderDelegation();
    Proposals._initStaticProposalSelects();
    if (document.getElementById('propAnexosFolders')) {
      Proposals._setFolderContext('propAnexosFolders', 'prop');
      Proposals.initAnexoFolders();
      Proposals._applyVendedorFormRules();
    }
  }
});
