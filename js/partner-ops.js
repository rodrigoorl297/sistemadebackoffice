/* SOU + BLU – Gestão de Parceiros (operacional / master vê rede de parceiros) */

const PartnerOps = {
  _indexCache: null,
  _indexTs: 0,
  _CACHE_MS: 60000,
  _selectedPartnerId: '',
  _propPage: 1,
  _propPageSize: 25,

  async _getIndex(force) {
    const now = Date.now();
    if (!force && this._indexCache && (now - this._indexTs) < this._CACHE_MS) {
      return this._indexCache;
    }
    const [partners, users] = await Promise.all([
      DB.getPartners().catch(() => []),
      DB.getAllUsers().catch(() => []),
    ]);
    const roles = DB.PARTNER_TEAM_ROLES || ['vendedor', 'backoffice', 'operacional', 'rh', 'financeiro', 'financial', 'employee'];
    const index = (partners || []).map(p => {
      const rootId = p.user_id;
      const u = users.find(x => x.id === rootId);
      const team = users.filter(x => x.admin_id === rootId && roles.includes(x.role));
      const allIds = new Set([rootId, ...team.map(t => t.id)]);
      return {
        partner: p,
        rootId,
        user: u,
        team,
        allIds,
        razao: p.razao_social || u?.name || 'Parceiro',
      };
    }).filter(x => x.rootId);
    this._indexCache = index;
    this._indexTs = now;
    return index;
  },

  _proposalBelongsToIndex(p, entry) {
    const ids = typeof DB._proposalVendorIds === 'function'
      ? DB._proposalVendorIds(p)
      : [p.vendorId, p.vendor_id, p.employee_id];
    return ids.some(id => id && entry.allIds.has(String(id)));
  },

  async filterOnlyPartnerProposals(proposals, partnerRootId) {
    const index = await this._getIndex();
    if (!partnerRootId) {
      return (proposals || []).filter(p => index.some(e => this._proposalBelongsToIndex(p, e)));
    }
    const entry = index.find(e => e.rootId === partnerRootId);
    if (!entry) return [];
    return (proposals || []).filter(p => this._proposalBelongsToIndex(p, entry));
  },

  async filterExcludePartnerProposals(proposals) {
    const index = await this._getIndex();
    if (!index.length) return proposals || [];
    return (proposals || []).filter(p => !index.some(e => this._proposalBelongsToIndex(p, e)));
  },

  async filterPartnerClients(clients, partnerRootId) {
    const index = await this._getIndex();
    const entries = partnerRootId ? index.filter(e => e.rootId === partnerRootId) : index;
    if (!entries.length) return [];
    return (clients || []).filter(c => {
      const sid = c.supervisorId || c.supervisor_id;
      return entries.some(e => e.allIds.has(sid));
    });
  },

  async filterExcludePartnerClients(clients) {
    const index = await this._getIndex();
    if (!index.length) return clients || [];
    return (clients || []).filter(c => {
      const sid = c.supervisorId || c.supervisor_id;
      return !index.some(e => e.allIds.has(sid));
    });
  },

  invalidate() {
    this._indexCache = null;
    this._indexTs = 0;
  },

  async renderPanel() {
    const box = document.getElementById('partnerOpsContent');
    if (!box) return;
    box.innerHTML = '<div class="card card-padded" style="text-align:center;color:var(--color-text-muted);">Carregando parceiros...</div>';

    const index = await this._getIndex(true);
    const sel = document.getElementById('partnerOpsPartnerFilter');
    if (sel) {
      const cur = this._selectedPartnerId || sel.value || '';
      sel.innerHTML = '<option value="">Todos os parceiros</option>' +
        index.map(e => `<option value="${e.rootId}">${e.razao}</option>`).join('');
      sel.value = cur;
      this._selectedPartnerId = cur;
    }

    if (!index.length) {
      box.innerHTML = `<div class="card card-padded" style="text-align:center;padding:40px;color:var(--color-text-muted);">
        Nenhum parceiro cadastrado. O Master pode cadastrar em <strong>Parceiros</strong>.
      </div>`;
      return;
    }

    const filtered = this._selectedPartnerId
      ? index.filter(e => e.rootId === this._selectedPartnerId)
      : index;

    let totalProps = 0;
    let totalClients = 0;
    const rawProps = await DB.getProposals().catch(() => []);
    const rows = Array.isArray(rawProps) ? rawProps : (rawProps?.items || []);
    const allClients = await DB.getClients({ pageSize: 500 }).catch(() => []);

    const cards = await Promise.all(filtered.map(async (e) => {
      const props = await this.filterOnlyPartnerProposals(rows, e.rootId);
      const clis = await this.filterPartnerClients(allClients, e.rootId);
      totalProps += props.length;
      totalClients += clis.length;
      const op = e.team.filter(t => t.role === 'operacional' || t.role === 'backoffice');
      return `
        <div class="card card-padded" style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
            <div>
              <div style="font-family:var(--font-display);font-weight:800;font-size:16px;">${e.razao}</div>
              <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px;">
                CNPJ ${e.partner.cnpj || '—'} · Equipe: ${e.team.length}
                ${op.length ? ` · Operacional parceiro: ${op.map(t => t.name).join(', ')}` : ' · <em>Sem operacional na equipe</em>'}
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <span class="badge badge-info">${props.length} propostas</span>
              <span class="badge badge-muted">${clis.length} clientes</span>
            </div>
          </div>
        </div>`;
    }));

    box.innerHTML = `
      <div class="stat-grid" style="margin-bottom:var(--space-md);grid-template-columns:repeat(3,1fr);">
        <div class="stat-card"><div class="stat-info"><div class="stat-label">Parceiros</div><div class="stat-value">${filtered.length}</div></div></div>
        <div class="stat-card"><div class="stat-info"><div class="stat-label">Propostas (rede)</div><div class="stat-value">${totalProps}</div></div></div>
        <div class="stat-card"><div class="stat-info"><div class="stat-label">Clientes (rede)</div><div class="stat-value">${totalClients}</div></div></div>
      </div>
      ${cards.join('')}`;
  },

  onPartnerFilterChange() {
    const sel = document.getElementById('partnerOpsPartnerFilter');
    this._selectedPartnerId = sel?.value || '';
    this._propPage = 1;
    this.renderPanel();
  },

  onTab(tab) {
    document.querySelectorAll('[data-partner-ops-tab]').forEach(btn => {
      btn.classList.toggle('btn-primary', btn.dataset.partnerOpsTab === tab);
      btn.classList.toggle('btn-outline', btn.dataset.partnerOpsTab !== tab);
    });
    document.getElementById('partnerOpsTabResumo').style.display = tab === 'resumo' ? '' : 'none';
    document.getElementById('partnerOpsTabPropostas').style.display = tab === 'propostas' ? '' : 'none';
    document.getElementById('partnerOpsTabClientes').style.display = tab === 'clientes' ? '' : 'none';
    if (tab === 'propostas') this.renderProposalsTable();
    if (tab === 'clientes') this.renderClientsTable();
  },

  async renderProposalsTable() {
    const tbody = document.getElementById('partnerOpsProposalsTbody');
    if (!tbody) return;
    const q = (document.getElementById('partnerOpsPropSearch')?.value || '').toLowerCase();
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:24px;">Carregando...</td></tr>';

    const raw = await DB.getProposals().catch(() => []);
    let proposals = (Array.isArray(raw) ? raw : []).map(p => (window.Proposals && Proposals._normProposal) ? Proposals._normProposal(p) : p);
    proposals = await this.filterOnlyPartnerProposals(proposals, this._selectedPartnerId);
    const index = await this._getIndex();

    if (q) {
      proposals = proposals.filter(p => {
        const blob = [p.numero, p.id, p.clientName, p.clientCpf, p.vendorName, p.product, p.status].join(' ').toLowerCase();
        return blob.includes(q);
      });
    }

    proposals.sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0));

    const total = proposals.length;
    const start = (this._propPage - 1) * this._propPageSize;
    const page = proposals.slice(start, start + this._propPageSize);

    if (!page.length) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--color-text-muted);">Nenhuma proposta de parceiro.</td></tr>`;
      const pag = document.getElementById('partnerOpsProposalsPagination');
      if (pag) pag.innerHTML = '';
      return;
    }

    const fmtR = v => v != null && v !== '' ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—';
    const partnerName = (p) => {
      for (const e of index) {
        if (this._proposalBelongsToIndex(p, e)) return e.razao;
      }
      return '—';
    };

    tbody.innerHTML = page.map(p => {
      const badge = p.status === 'Pago' ? 'badge-success' : p.status === 'Cancelado' ? 'badge-danger' : 'badge-warning';
      const safeId = String(p.id).replace(/'/g, "\\'");
      return `<tr>
        <td><span class="badge badge-info" style="font-size:10px;">${partnerName(p)}</span></td>
        <td><strong>${p.numero || p.id}</strong></td>
        <td>${p.vendorName || '—'}</td>
        <td>${p.clientName || '—'}<div style="font-size:11px;color:var(--color-text-muted);">${p.clientCpf || ''}</div></td>
        <td>${p.product || '—'}</td>
        <td>${p.convenio || '—'}</td>
        <td>${p.protocolo || '—'}</td>
        <td>${fmtR(p.valor)}</td>
        <td>${fmtR(p.valorFinal)}</td>
        <td>${(p.createdAt || p.created_at || '').slice(0, 10)}</td>
        <td><span class="badge ${badge}">${p.status || '—'}</span></td>
        <td style="white-space:nowrap;">
          <button type="button" class="btn btn-outline btn-sm" onclick="Proposals.openAdminViewModal('${safeId}')">Ver</button>
          <button type="button" class="btn btn-primary btn-sm" onclick="Proposals.openAdminModal('${safeId}')">Editar</button>
        </td>
      </tr>`;
    }).join('');

    const pag = document.getElementById('partnerOpsProposalsPagination');
    if (pag && window.Proposals && Proposals._renderPagination) {
      PartnerOps._propListMeta = { page: PartnerOps._propPage, pageSize: PartnerOps._propPageSize, total };
      Proposals._renderPagination('partnerOpsProposalsPagination', PartnerOps._propListMeta, 'PartnerOps.setPropPage');
    }
  },

  setPropPage(n) {
    PartnerOps._propPage = Math.max(1, parseInt(n, 10) || 1);
    PartnerOps.renderProposalsTable();
  },

  async renderClientsTable() {
    const tbody = document.getElementById('partnerOpsClientsTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;">Carregando...</td></tr>';

    const [allClients, users, index] = await Promise.all([
      DB.getClients({ pageSize: 500 }).catch(() => []),
      DB.getAllUsers().catch(() => []),
      this._getIndex(),
    ]);

    let clients = await this.filterPartnerClients(allClients, this._selectedPartnerId);
    const q = (document.getElementById('partnerOpsClientSearch')?.value || '').toLowerCase();
    if (q) {
      clients = clients.filter(c => [c.name, c.cpf, c.email, c.phone1].join(' ').toLowerCase().includes(q));
    }

    if (!clients.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--color-text-muted);">Nenhum cliente de parceiro.</td></tr>';
      return;
    }

    tbody.innerHTML = clients.map(client => {
      const sup = users.find(e => e.id === (client.supervisorId || client.supervisor_id));
      let parceiroLabel = '—';
      for (const e of index) {
        if (e.allIds.has(client.supervisorId || client.supervisor_id)) {
          parceiroLabel = e.razao;
          break;
        }
      }
      return `<tr>
        <td><span class="badge badge-info" style="font-size:10px;">${parceiroLabel}</span><br><small>${sup?.name || '—'}</small></td>
        <td>${client.name || '—'}</td>
        <td>${client.cpf || '—'}</td>
        <td>${client.phone1 || '—'}</td>
        <td>${client.email || '—'}</td>
        <td>${client.rg || '—'}</td>
        <td style="display:flex;gap:6px;">
          <button class="btn btn-outline btn-sm" onclick="editClientAdmin('${client.cpf}')">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="viewClientDetails('${client.cpf}')">👁️</button>
        </td>
      </tr>`;
    }).join('');
  },
};
