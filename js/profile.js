/* =============================================
   SOU + BLU – Perfil do colaborador (compartilhado)
   Usado em employee.html e admin.html (Meu Perfil)
   ============================================= */

var currentUser = null;

/** Usuário da área do colaborador (respeita ?preview= para admin visualizando vendedor). */
async function resolveEmployeeUser() {
  if (window.__PREVIEW_USER_ID__) {
    return await DB.getUser(window.__PREVIEW_USER_ID__);
  }
  return await Auth.getCurrentUser();
}
window.resolveEmployeeUser = resolveEmployeeUser;

async function openWithdrawalModal() {
  currentUser = await resolveEmployeeUser();
  if (typeof userCanSacarPix === 'function') {
    const ok = await userCanSacarPix(currentUser);
    if (!ok) {
      showToast('Saque PIX não liberado para este perfil. Contate o parceiro ou o administrador.', 'warning');
      return;
    }
  }
  const bal = typeof userWalletBalance === 'function'
    ? userWalletBalance(currentUser)
    : (currentUser.points || currentUser.balance || 0);
  const balEl = document.getElementById('withdrawBalance');
  if (balEl) balEl.textContent = formatCurrency(bal, currentUser);
  const moneyWallet = typeof userUsesMoneyWallet === 'function' && userUsesMoneyWallet(currentUser);
  const saved = JSON.parse(localStorage.getItem('soublu_pix_' + currentUser.id) || '{}');
  if (saved.pix_key_type) {
    const typeEl = document.getElementById('pixKeyType');
    if (typeEl) typeEl.value = saved.pix_key_type;
    document.querySelectorAll('.pix-key-type-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('onclick')?.includes("'" + saved.pix_key_type + "'"));
    });
  }
  if (saved.pix_key)     document.getElementById('pixKey').value = saved.pix_key;
  if (saved.holder_name) document.getElementById('pixHolderName').value = saved.holder_name;
  if (saved.bank_name)   document.getElementById('pixBankName').value = saved.bank_name;
  const amtEl = document.getElementById('withdrawAmount');
  if (amtEl) {
    amtEl.value = '';
    if (moneyWallet) {
      amtEl.min = '0.01';
      amtEl.step = '0.01';
      amtEl.placeholder = 'Ex: 100,00';
    } else {
      amtEl.min = '1';
      amtEl.step = '1';
      amtEl.placeholder = 'Ex: 1000';
    }
  }
  openModal('withdrawalModal');
}

async function renderProfile() {
  const profileHeader = document.getElementById('profileHeader');
  if (!profileHeader) return;

  try {
    currentUser = await resolveEmployeeUser();
    if (!currentUser) return;

    const needProposals = !!document.getElementById('propDashboard');
    const txLimit = 20;
    const proposalQuery = needProposals && typeof DB.getProposals === 'function'
      ? DB.getProposals(currentUser.id, currentUser).catch(() => [])
      : Promise.resolve([]);
    const [txs, orders, proposalRows] = await Promise.all([
      DB.getTransactions(currentUser.id).catch(() => []),
      DB.getOrders(currentUser.id).catch(() => []),
      proposalQuery,
    ]);
    const allProposals = Array.isArray(proposalRows) ? proposalRows : (proposalRows?.items || []);
    const myProposals = (allProposals || []).filter(p =>
      typeof DB._matchProposalToVendor === 'function'
        ? DB._matchProposalToVendor(p, currentUser)
        : String(p.vendorId || p.vendor_id || p.employee_id) === String(currentUser.id)
    );
    const txList = (txs || []).slice(0, txLimit);
    const earned = txList.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
    const spent = txList.filter(t => t.type !== 'credit').reduce((s, t) => s + t.amount, 0);
    const canSacar = ['vendedor', 'employee', 'backoffice', 'supervisor', 'parceiro'].includes(currentUser.role)
      && (typeof userCanSacarPix === 'function' ? await userCanSacarPix(currentUser) : true);
    const walletBal = typeof userWalletBalance === 'function'
      ? userWalletBalance(currentUser)
      : (currentUser.points ?? currentUser.balance ?? 0);
    const moneyWallet = typeof userUsesMoneyWallet === 'function' && userUsesMoneyWallet(currentUser);
    const walletLabel = moneyWallet ? 'saldo disponível (R$)' : 'pontos disponíveis';
    const fmtBal = formatCurrency(walletBal, currentUser);
    const photo = currentUser.photo_url || currentUser.photo || '';
    const photoHtml = photo
      ? `<img src="${photo}" class="profile-avatar" style="object-fit:cover;cursor:pointer;" onclick="document.getElementById('profilePhotoInput').click()">`
      : `<div class="profile-avatar" style="cursor:pointer;" onclick="document.getElementById('profilePhotoInput').click()" title="Alterar foto">${getInitials(currentUser.name)}</div>`;
    profileHeader.innerHTML = `
    <div style="position:relative;flex-shrink:0;">${photoHtml}</div>
    <div style="flex:1;min-width:0;">
      <div class="profile-name">${currentUser.name}</div>
      <div class="profile-meta">${currentUser.department} · Matrícula ${currentUser.matricula}</div>
      <div class="profile-meta">${currentUser.email}</div>
      <input type="file" id="profilePhotoInput" accept="image/*" style="display:none" onchange="uploadProfilePhoto(this)">
    </div>
    <div class="profile-coins">
      <button type="button" class="btn btn-outline btn-sm" style="margin-bottom:8px;" onclick="openChangePasswordModal()">Alterar senha</button>
      <div class="big-points">${fmtBal}</div>
      <p>${walletLabel}</p>
      ${canSacar ? `<button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="openWithdrawalModal()">Sacar via PIX</button>
      <p style="font-size:11px;color:var(--color-text-muted);margin-top:8px;max-width:220px;">Aprovação e envio do PIX: Financeiro e Master SOU+BLU.</p>` : ''}
    </div>`;

    const toggleBlock = document.getElementById('ptsToggleBlock');
    if (toggleBlock) {
      toggleBlock.innerHTML = '';
      toggleBlock.style.display = 'none';
    }

    const txBox = document.getElementById('txList');
    if (txBox) {
      txBox.innerHTML = !(txs || []).length
        ? '<div class="text-muted text-center" style="padding:20px;">Nenhuma movimentação.</div>'
        : txList.map(t => {
          const isCr = t.type === 'credit';
          const metaLine = typeof formatTransactionMetaLine === 'function' ? formatTransactionMetaLine(t.meta) : '';
          const fmtTx = formatCurrency(t.amount, currentUser);
          return `<div class="tx-item"><div class="tx-icon ${isCr ? 'earn' : 'spend'}">${txTypeIcon(t.type)}</div><div class="tx-info"><div class="tx-title">${t.reason || '–'}</div>${metaLine ? `<div class="tx-date" style="font-size:12px;color:var(--color-text-muted);">${metaLine}</div>` : ''}<div class="tx-date">${formatDateTime(t.created_at || t.date)}</div></div><div class="tx-amount ${isCr ? 'earn' : 'spend'}">${isCr ? '+' : '−'}${fmtTx}</div></div>`;
        }).join('');
    }

    const profileStats = document.getElementById('profileStats');
    if (profileStats) {
      profileStats.innerHTML = `
    ${statCardHtml({ icon: 'trendUp', color: 'green', label: 'Total Recebido', value: formatCurrency(earned, currentUser), valueStyle: 'font-size:18px;' })}
    ${statCardHtml({ icon: 'trendDown', color: 'orange', label: 'Total Utilizado', value: formatCurrency(spent, currentUser), valueStyle: 'font-size:18px;' })}
    ${statCardHtml({ icon: 'orders', color: 'yellow', label: 'Pedidos', value: (orders || []).length, valueStyle: 'font-size:18px;' })}`;
    }

    const propDash = document.getElementById('propDashboard');
    const roles = ['vendedor', 'backoffice', 'supervisor', 'master', 'admin', 'operacional'];
    if (propDash && roles.includes(currentUser.role) && myProposals.length >= 0) {
      propDash.style.display = 'block';
      await _renderPropDashboard(myProposals);
    }
  } catch (err) {
    console.error('[renderProfile]', err);
    showToast('Erro ao carregar perfil: ' + (err.message || 'tente novamente'), 'error');
  }
}

async function _renderPropDashboard(proposals) {
  const fmtR = v => v != null ? 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : 'R$ 0,00';
  const now = new Date();
  const mesAtual = now.getMonth();
  const anoAtual = now.getFullYear();

  const doMes = proposals.filter(p => {
    const d = new Date(p.createdAt || p.created_at || 0);
    return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
  });

  const totalFinalMes = doMes.reduce((s, p) => s + (parseFloat(p.valorFinal || p.valor) || 0), 0);
  const totalGeral = proposals.reduce((s, p) => s + (parseFloat(p.valorFinal || p.valor) || 0), 0);

  const meRef = currentUser || await resolveEmployeeUser();
  const meUser = meRef || (Auth.getSession()?.id ? await DB.getUser(Auth.getSession().id).catch(() => null) : null);
  const meusPontos = meUser ? (meUser.points || meUser.balance || 0) : 0;

  const propKpis = document.getElementById('propKpis');
  if (propKpis && typeof statKpiHtml === 'function') {
    propKpis.innerHTML = [
      statKpiHtml({ icon: 'proposals', colorClass: 'blue', label: 'Propostas no Mês', value: doMes.length, valueColor: '#3b82f6' }),
      statKpiHtml({ icon: 'billing', colorClass: 'green', label: 'Valor Final Mês', value: fmtR(totalFinalMes), valueColor: '#10b981' }),
      statKpiHtml({ icon: 'chart', colorClass: 'teal', label: 'Total Faturado', value: fmtR(totalGeral), valueColor: '#06b6d4' }),
      statKpiHtml({ icon: 'trophy', colorClass: 'yellow', label: 'Meus Pontos', value: meusPontos.toLocaleString('pt-BR'), valueColor: '#f59e0b' }),
    ].join('');
  }

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(anoAtual, mesAtual - i, 1);
    months.push({ label: d.toLocaleString('pt-BR', { month: 'short' }), m: d.getMonth(), y: d.getFullYear() });
  }
  const countByMonth = months.map(m => ({
    ...m,
    count: proposals.filter(p => {
      const d = new Date(p.createdAt || p.created_at || 0);
      return d.getMonth() === m.m && d.getFullYear() === m.y;
    }).length,
  }));
  const maxCount = Math.max(...countByMonth.map(m => m.count), 1);
  const chartMes = document.getElementById('chartMes');
  if (chartMes) {
    chartMes.innerHTML = countByMonth.map(m => {
      const pct = Math.round((m.count / maxCount) * 100);
      const isNow = m.m === mesAtual && m.y === anoAtual;
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
      <div style="font-size:11px;font-weight:700;color:${isNow ? 'var(--color-primary)' : 'var(--color-text-muted)'};">${m.count || ''}</div>
      <div style="width:100%;background:var(--color-surface-2);border-radius:6px 6px 0 0;height:120px;display:flex;align-items:flex-end;">
        <div style="width:100%;height:${Math.max(pct, 4)}%;background:${isNow ? 'var(--color-primary)' : 'var(--color-border)'};border-radius:6px 6px 0 0;transition:height .4s;"></div>
      </div>
      <div style="font-size:10px;color:var(--color-text-muted);text-transform:uppercase;">${m.label}</div>
    </div>`;
    }).join('');
  }

  const statusColors = {
    'Em Andamento': '#3b82f6', 'AG. BOLETO': '#f59e0b', 'AG. VÍDEO': '#8b5cf6',
    'PROPOSTA DIGITADA': '#06b6d4', 'AVERBADO': '#10b981', 'PAGO': '#22c55e',
    'Cancelado': '#ef4444', 'Pendenciado': '#f97316', 'AG. ASS TERMO': '#6366f1',
    'AG. QUITAÇÃO': '#14b8a6', 'BOLETO QUITADO': '#84cc16', 'AG. LIBERAÇÃO MARGEM': '#a855f7',
  };
  const statusCount = {};
  proposals.forEach(p => {
    const s = p.statusOp || p.status || 'Em Andamento';
    statusCount[s] = (statusCount[s] || 0) + 1;
  });
  const totalProp = proposals.length || 1;
  const chartStatus = document.getElementById('chartStatus');
  if (chartStatus) {
    chartStatus.innerHTML = !proposals.length
      ? '<div style="color:var(--color-text-muted);font-size:13px;padding:20px 0;">Nenhuma proposta ainda.</div>'
      : Object.entries(statusCount).sort((a, b) => b[1] - a[1]).map(([s, n]) => {
        const pct = Math.round((n / totalProp) * 100);
        const cor = statusColors[s] || '#64748b';
        return `<div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
            <span style="font-weight:600;">${s}</span>
            <span style="color:var(--color-text-muted);">${n} (${pct}%)</span>
          </div>
          <div style="background:var(--color-surface-2);border-radius:4px;height:8px;overflow:hidden;">
            <div style="height:8px;width:${pct}%;background:${cor};border-radius:4px;transition:width .4s;"></div>
          </div>
        </div>`;
      }).join('');
  }

  const mesNome = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  const listTitle = document.getElementById('propListTitle');
  if (listTitle) listTitle.textContent = `Propostas de ${mesNome} (${doMes.length})`;

  const listEl = document.getElementById('propListMes');
  if (!listEl) return;
  if (!doMes.length) {
    listEl.innerHTML = '<div style="color:var(--color-text-muted);font-size:13px;padding:16px 0;text-align:center;">Nenhuma proposta este mês.</div>';
    return;
  }
  doMes.sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at));
  listEl.innerHTML = doMes.map(p => {
    const statusCor = { PAGO: '#22c55e', AVERBADO: '#10b981', Cancelado: '#ef4444', Pendenciado: '#f97316' }[p.statusOp || p.status] || '#3b82f6';
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--color-border);">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;">${p.numero || p.id}</div>
        <div style="font-size:12px;color:var(--color-text-muted);">${p.clientName || '—'} · ${p.product || '—'} / ${p.convenio || '—'}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:13px;font-weight:800;color:var(--color-success);">${fmtR(p.valorFinal || p.valor)}</div>
        <div style="font-size:11px;color:var(--color-text-muted);">${fmtR(p.valor)} ${parseFloat(p.desconto || 0) > 0 ? '- desc.' : ''}</div>
      </div>
      <div style="background:${statusCor}18;color:${statusCor};padding:3px 9px;border-radius:99px;font-size:11px;font-weight:700;white-space:nowrap;">${p.statusOp || p.status || '—'}</div>
    </div>`;
  }).join('');
}

async function saveShowPoints(val) {
  if (typeof isUserInPartnerNetworkSync === 'function' && isUserInPartnerNetworkSync(currentUser)) return;
  const role = currentUser?.role || Auth.getSession()?.role || '';
  if (typeof participatesInVendorRanking === 'function' && !participatesInVendorRanking(role)) return;
  await DB.updateUser(currentUser.id, { show_points: val });
  currentUser = await resolveEmployeeUser();
  if (currentUser) currentUser.show_points = val;

  const checkbox = document.getElementById('toggleShowPoints');
  if (checkbox) checkbox.checked = val;

  const slider = document.querySelector('.pts-toggle-slider');
  if (slider) {
    slider.style.background = val ? 'var(--color-primary)' : 'var(--color-border)';
    const knob = slider.querySelector('span');
    if (knob) knob.style.left = val ? '26px' : '4px';
  }

  if (document.getElementById('rankingList') && typeof renderRanking === 'function') {
    await renderRanking();
  }
  showToast(val ? '🏆 Seus pontos agora aparecem no ranking.' : '🔒 Seus pontos estão ocultos no ranking.', 'info');
}

function openChangePasswordModal() {
  ['profilePwdCurrent', 'profilePwdNew', 'profilePwdConfirm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  openModal('changePasswordModal');
}

async function uploadProfilePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { showToast('Imagem muito grande. Máx: 3MB.', 'warning'); return; }
  showLoading('Salvando foto...');
  try {
    const url = await uploadImage(file, 'profile-photos', currentUser.id);
    const updated = await DB.updateUser(currentUser.id, { photo_url: url });
    currentUser = updated || await DB.getUser(currentUser.id) || currentUser;
    if (typeof renderAdminSidebar === 'function') renderAdminSidebar(currentUser);
    if (typeof renderSidebar === 'function') renderSidebar();
    await renderProfile();
    showToast('Foto atualizada.', 'success');
  } catch (e) {
    console.error(e);
    showToast('Erro ao salvar foto.', 'error');
  } finally {
    hideLoading();
  }
}

async function saveProfilePassword() {
  const current = document.getElementById('profilePwdCurrent')?.value || '';
  const pwd = document.getElementById('profilePwdNew')?.value || '';
  const pwd2 = document.getElementById('profilePwdConfirm')?.value || '';
  if (!current) { showToast('Informe sua senha atual.', 'warning'); return; }
  if (!pwd) { showToast('Informe a nova senha.', 'warning'); return; }
  if (pwd.length < 4) { showToast('Nova senha: mínimo 4 caracteres.', 'warning'); return; }
  if (pwd !== pwd2) { showToast('As senhas não coincidem.', 'error'); return; }

  const me = await Auth.getCurrentUser();
  if (!me) { showToast('Sessão expirada. Faça login novamente.', 'error'); return; }
  if (!(await DB.verifyCurrentPassword(me.id, current))) { showToast('Senha atual incorreta.', 'error'); return; }

  showLoading('Alterando senha...');
  try {
    await DB.updateUser(me.id, { password: pwd });
    document.getElementById('profilePwdCurrent').value = '';
    document.getElementById('profilePwdNew').value = '';
    document.getElementById('profilePwdConfirm').value = '';
    closeModal('changePasswordModal');
    showToast('Senha alterada com sucesso!', 'success');
  } catch (e) {
    console.error(e);
    showToast('Erro ao alterar senha.', 'error');
  } finally {
    hideLoading();
  }
}
