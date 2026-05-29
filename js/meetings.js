/* =============================================
   SOU + BLU — Reuniões / Termo de ciência da ata
   Quem agenda: supervisor e perfis equivalentes ao menu Feedbacks (master, RH, etc.)
   ============================================= */

(function () {
  const MEETING_TERM_TITLE = 'Termo de ciência e Declaração de ata de reunião';

  const MEETING_TERM_BODY_HTML = `
<p style="margin-bottom:14px;font-weight:700;">DECLARAÇÃO — Pelo presente instrumento, o Declarante afirma que:</p>
<ol style="margin:0;padding-left:20px;line-height:1.55;">
<li>Teve acesso integral ao teor da Ata de Reunião supracitada, tendo lido e compreendido todos os seus itens, deliberações e anexos, se houver;</li>
<li>Confirma a veracidade das informações nela registradas, reconhecendo que o documento reflete fielmente os fatos e as decisões ocorridas durante o ato;</li>
<li>Manifesta sua plena e irrevogável concordância com todas as cláusulas, obrigações e prazos estabelecidos na referida ata, nada tendo a opor ou ressalvar no presente momento;</li>
<li>Reconhece que as deliberações constantes na ata passam a produzir efeitos jurídicos e administrativos imediatos, vinculando as partes envolvidas conforme o acordado.</li>
</ol>
<p style="margin-top:16px;font-style:italic;">Por ser a expressão da verdade, firmo o presente termo para que produza seus efeitos legais.</p>
`;

  function meetingsScopeMaster(role) {
    const r = String(role || '');
    return ['master', 'fundador', 'gerente', 'financeiro', 'financial', 'rh', 'desenvolvedor'].includes(r);
  }
  function canScheduleMeetings(role) {
    const r = String(role || '');
    return meetingsScopeMaster(r) || ['supervisor', 'sup_backoffice', 'ouvidoria', 'gerencia', 'admin'].includes(r);
  }

  function _getMeetingUserId() {
    if (window.currentUser?.id) return String(window.currentUser.id);
    if (typeof Auth !== 'undefined' && Auth.getSession()?.id) return String(Auth.getSession().id);
    return '';
  }

  /** Badge no menu + toast quando chega convocação nova. */
  window.updateMeetingsBadge = async function updateMeetingsBadge() {
    if (!window.DB) return 0;
    const uid = _getMeetingUserId();
    if (!uid) return 0;
    let pending = 0;
    try {
      pending = await DB.countPendingMeetingInvites(uid);
    } catch (e) {
      console.warn('[Meetings] badge:', e);
      return 0;
    }
    document.querySelectorAll('#meetingsBadge, .meetings-badge').forEach(b => {
      b.textContent = pending;
      b.style.display = pending > 0 ? 'inline' : 'none';
    });
    if (pending > 0) {
      document.querySelectorAll('.meetings-nav').forEach(el => { el.style.display = ''; });
    }
    return pending;
  };

  function _toastNewMeetings(list, uid) {
    if (!list.length || typeof showToast !== 'function') return;
    const key = `soublu_meetings_seen_${uid}`;
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { seen = []; }
    const seenSet = new Set(seen.map(String));
    const fresh = list.filter(m => !seenSet.has(String(m.id)));
    if (!fresh.length) return;
    fresh.slice(0, 3).forEach(m => {
      showToast(`📅 Nova convocação: ${m.subject || 'Reunião'}`, 'info', 7000);
    });
    list.forEach(m => seenSet.add(String(m.id)));
    localStorage.setItem(key, JSON.stringify([...seenSet].slice(-120)));
  }

  function ensureMeetingTermOverlay() {
    if (document.getElementById('meetingTermFullscreen')) return;

    document.body.insertAdjacentHTML(
      'beforeend',
      `
<div class="term-fullscreen" id="meetingTermFullscreen" aria-hidden="true">
  <div class="term-card" style="max-width:620px;">
    <div class="term-header">
      <h2>📜 ${MEETING_TERM_TITLE}</h2>
      <p id="meetingTermSubtitle">Leia até o final para confirmar sua ciência.</p>
    </div>
    <div class="term-progress-bar"><div class="term-progress-fill" id="meetingTermProgressFill"></div></div>
    <div class="term-scroll-area" id="meetingTermScrollArea">
      <div id="meetingTermMeetingSummary" style="margin-bottom:18px;padding:14px;border-radius:var(--radius-md);background:var(--color-surface-2);font-size:14px;line-height:1.55;"></div>
      <div id="meetingTermLegalBody" style="font-size:14px;line-height:1.55;color:var(--color-text);">${MEETING_TERM_BODY_HTML}</div>
    </div>
    <div class="term-footer">
      <div class="term-scroll-hint" id="meetingTermScrollHint"><span class="arrow">↓</span> Role até o final para habilitar a confirmação</div>
      <label class="term-checkbox-row" id="meetingTermCheckLabel">
        <input type="checkbox" id="meetingTermFinalCheck" disabled/>
        <span>Declaro que li e compreendi integralmente o termo acima e manifesto minha ciência e concordância.</span>
      </label>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
        <button type="button" class="btn btn-ghost" id="meetingTermCancelBtn">Cancelar</button>
        <button type="button" class="btn btn-primary" id="meetingTermConfirmBtn" disabled>Confirmar ciência</button>
      </div>
    </div>
  </div>
</div>`
    );

    const ov = document.getElementById('meetingTermFullscreen');
    document.getElementById('meetingTermCancelBtn').onclick = () => {
      ov.classList.remove('open');
      ov.setAttribute('aria-hidden', 'true');
      window.__meetingTermPendingId = null;
    };
  }

  let _mTGHandler = null;
  let _mChHandler = null;

  function wireMeetingTermScroll() {
    const area = document.getElementById('meetingTermScrollArea');
    const fill = document.getElementById('meetingTermProgressFill');
    const hint = document.getElementById('meetingTermScrollHint');
    const checkLbl = document.getElementById('meetingTermCheckLabel');
    const checkInp = document.getElementById('meetingTermFinalCheck');
    const confirmBtn = document.getElementById('meetingTermConfirmBtn');

    if (_mTGHandler) area.removeEventListener('scroll', _mTGHandler);
    if (_mChHandler) checkInp.removeEventListener('change', _mChHandler);

    let unlocked = false;

    _mTGHandler = function () {
      const { scrollTop, scrollHeight, clientHeight } = area;
      const scrollable = scrollHeight - clientHeight;
      const pct = scrollable <= 0 ? 100 : Math.min(100, Math.round((scrollTop / scrollable) * 100));
      fill.style.width = pct + '%';
      if (pct >= 95 && !unlocked) {
        unlocked = true;
        hint.classList.add('hidden');
        checkLbl.classList.add('unlocked');
        checkInp.disabled = false;
      }
    };

    _mChHandler = function () {
      confirmBtn.disabled = !checkInp.checked;
    };

    area.addEventListener('scroll', _mTGHandler, { passive: true });
    checkInp.addEventListener('change', _mChHandler);

    requestAnimationFrame(() => {
      const { scrollHeight, clientHeight } = area;
      if (scrollHeight <= clientHeight) {
        unlocked = true;
        hint.classList.add('hidden');
        checkLbl.classList.add('unlocked');
        checkInp.disabled = false;
      }
    });
  }

  function _normSearch(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  const MEET_ROLE_LABELS = {
    vendedor: 'Vendedor',
    employee: 'Funcionário',
    backoffice: 'Backoffice',
    sup_backoffice: 'Sup. Backoffice',
    supervisor: 'Supervisor',
    desenvolvedor: 'Desenvolvedor',
    rh: 'RH',
    gerente: 'Gerente',
    gerencia: 'Gerência',
    financeiro: 'Financeiro',
    financial: 'Financeiro',
    operacional: 'Operacional',
    juridico: 'Jurídico',
    diretoria: 'Diretoria',
    ouvidoria: 'Ouvidoria',
    master: 'Master',
    fundador: 'Fundador',
  };

  function _escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function _escapeAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  async function loadMeetingParticipantOptions(adminId, scopeMaster) {
    if (!window.DB) return [];
    const roles = new Set(DB.MEETING_PARTICIPANT_ROLES || []);
    try {
      const list = scopeMaster
        ? await DB.getMeetingParticipants(null)
        : await DB.getMeetingParticipants(adminId);
      return (list || []).filter(u => !roles.size || roles.has(u.role));
    } catch (e) {
      console.warn('[Meetings] participantes:', e);
      return [];
    }
  }

  function _participantSearchKey(u) {
    return _normSearch([u.name, u.matricula, u.email, u.department, MEET_ROLE_LABELS[u.role] || u.role].join(' '));
  }

  function _renderMeetingParticipantCheckboxes(participants) {
    if (!participants.length) {
      return `<div class="text-muted text-center" style="padding:20px;">Nenhum colaborador ativo disponível.</div>`;
    }
    return participants
      .map(v => {
        const tag = [v.matricula, v.department].filter(Boolean).join(' · ');
        const roleLbl = MEET_ROLE_LABELS[v.role] || v.role || 'Colaborador';
        const searchKey = _participantSearchKey(v);
        return `
<label class="meet-part-row" data-search="${searchKey.replace(/"/g, '')}"
  style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--color-border);cursor:pointer;">
  <input type="checkbox" class="meet-part-cb" value="${_escapeHtml(v.id)}" style="width:18px;height:18px;flex-shrink:0;"/>
  <div style="flex:1;min-width:0;">
    <div style="font-weight:700;font-size:14px;">${_escapeHtml(v.name)}</div>
    ${tag ? `<div style="font-size:12px;color:var(--color-text-muted);">${_escapeHtml(tag)}</div>` : ''}
  </div>
  <span class="badge badge-muted" style="font-size:10px;">${_escapeHtml(roleLbl)}</span>
</label>`;
      })
      .join('');
  }

  function _filterMeetingParticipants() {
    const list = document.getElementById('meetParticipantsList');
    const search = document.getElementById('meetPartSearch');
    if (!list || !search) return;
    const tokens = _normSearch(search.value.trim()).split(/\s+/).filter(Boolean);
    const rows = list.querySelectorAll('.meet-part-row');
    let visible = 0;
    rows.forEach(row => {
      const key = row.getAttribute('data-search') || '';
      const show = !tokens.length || tokens.every(t => key.includes(t));
      row.style.display = show ? 'flex' : 'none';
      if (show) visible++;
    });
    const empty = document.getElementById('meetPartSearchEmpty');
    if (empty) {
      empty.style.display = rows.length && tokens.length && visible === 0 ? 'block' : 'none';
    }
    const visEl = document.getElementById('meetPartVisibleCount');
    if (visEl) {
      visEl.textContent = tokens.length ? `${visible} visível(is) na busca` : '';
    }
  }

  function _wireMeetingParticipantPicker() {
    const list = document.getElementById('meetParticipantsList');
    const search = document.getElementById('meetPartSearch');
    const countEl = document.getElementById('meetPartCount');
    if (!list) return;

    const updateCount = () => {
      const n = list.querySelectorAll('.meet-part-cb:checked').length;
      const total = list.querySelectorAll('.meet-part-cb').length;
      if (countEl) countEl.textContent = `${n} de ${total}`;
    };

    list.querySelectorAll('.meet-part-cb').forEach(cb => {
      cb.addEventListener('change', updateCount);
    });

    list.querySelectorAll('.meet-part-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.classList.contains('meet-part-cb')) return;
        const cb = row.querySelector('.meet-part-cb');
        if (cb) {
          cb.checked = !cb.checked;
          updateCount();
        }
      });
    });

    document.getElementById('meetPartSelectAll')?.addEventListener('click', () => {
      list.querySelectorAll('.meet-part-cb').forEach(cb => { cb.checked = true; });
      updateCount();
    });
    document.getElementById('meetPartSelectVisible')?.addEventListener('click', () => {
      list.querySelectorAll('.meet-part-row').forEach(row => {
        if (row.style.display === 'none') return;
        const cb = row.querySelector('.meet-part-cb');
        if (cb) cb.checked = true;
      });
      updateCount();
    });
    document.getElementById('meetPartClearAll')?.addEventListener('click', () => {
      list.querySelectorAll('.meet-part-cb').forEach(cb => { cb.checked = false; });
      updateCount();
    });

    search?.addEventListener('input', _filterMeetingParticipants);
    search?.addEventListener('search', _filterMeetingParticipants);
    search?.addEventListener('keyup', _filterMeetingParticipants);

    updateCount();
  }

  function _getSelectedMeetingParticipants() {
    const list = document.getElementById('meetParticipantsList');
    if (!list) return [];
    return Array.from(list.querySelectorAll('.meet-part-cb:checked')).map(cb => cb.value).filter(Boolean);
  }

  /** Painel admin — convocar e listar (+ convocações recebidas no topo) */
  window.renderMeetingsAdmin = async function renderMeetingsAdmin() {
    const root = document.getElementById('meetingsAdminRoot');
    if (!window.DB || typeof Auth === 'undefined') return;

    const session = Auth.getSession();
    const adminId = session?.id;
    const scopeMaster = meetingsScopeMaster(session?.role);
    const canSchedule = canScheduleMeetings(session?.role);

    if (typeof _cacheDel === 'function') _cacheDel('meetings');

    await renderMeetingsEmployee({ rootId: 'meetingsMyInvitesRoot', userId: adminId, heading: 'Suas convocações' });
    await updateMeetingsBadge();

    if (!root) return;
    if (!canSchedule) {
      root.innerHTML = '';
      return;
    }

    const participants = await loadMeetingParticipantOptions(adminId, scopeMaster);
    const meetings = await DB.listMeetingsForAdmin(adminId, scopeMaster);
    const usersById = {};
    try {
      const allNeed = new Set();
      meetings.forEach(m => {
        allNeed.add(m.created_by);
        (m.participant_ids || []).forEach(id => allNeed.add(id));
      });
      for (const id of allNeed) {
        if (!id) continue;
        const u = await DB.getUser(id);
        if (u) usersById[id] = u.name || id;
      }
    } catch (e) {
      console.warn('[Meetings] nomes:', e);
    }

    const partOpts = _renderMeetingParticipantCheckboxes(
      participants.filter(u => u.active !== false)
    );

    root.innerHTML = `
<div class="card card-padded" style="margin-bottom:var(--space-lg);">
  <h3 style="font-family:var(--font-display);font-weight:800;margin:0 0 16px;">Convocar reunião</h3>
  <div class="form-row">
    <div class="form-group" style="flex:2;">
      <label>Assunto / pauta</label>
      <textarea id="meetSubject" rows="3" placeholder="Descreva o tema da reunião e o que será tratado na ata…"></textarea>
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label>Data e horário</label>
      <input type="datetime-local" id="meetScheduled"/>
    </div>
    <div class="form-group" style="flex:2;">
      <label>Participantes — marque todos que devem comparecer</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;align-items:center;">
        <input type="search" id="meetPartSearch" placeholder="Buscar nome, matrícula, e-mail ou setor…" autocomplete="off"
          style="flex:1;min-width:180px;padding:8px 12px;border:1px solid var(--color-border);border-radius:var(--radius-md);"/>
        <button type="button" class="btn btn-ghost btn-sm" id="meetPartSelectAll">✓ Marcar todos</button>
        <button type="button" class="btn btn-ghost btn-sm" id="meetPartSelectVisible">✓ Marcar filtrados</button>
        <button type="button" class="btn btn-ghost btn-sm" id="meetPartClearAll">✕ Limpar</button>
      </div>
      <div id="meetParticipantsList" style="max-height:280px;overflow-y:auto;border:1.5px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);">
        ${partOpts}
        <div id="meetPartSearchEmpty" class="text-muted text-center" style="display:none;padding:16px;font-size:13px;">Nenhum participante encontrado para esta busca.</div>
      </div>
      <p class="form-hint" style="margin-top:8px;"><strong id="meetPartCount">0 de 0</strong> selecionado(s) <span id="meetPartVisibleCount" style="color:var(--color-text-muted);"></span> · Do <strong>gerente para baixo</strong>${scopeMaster ? ' (toda a empresa)' : ' (sua equipe)'}. Fundador, master, financeiro, RH e diretoria não entram na lista.</p>
    </div>
  </div>
  <button type="button" class="btn btn-primary" id="meetCreateBtn">📅 Criar convocação</button>
</div>

<div class="card card-padded">
  <h3 style="font-family:var(--font-display);font-weight:800;margin:0 0 16px;">Reuniões cadastradas</h3>
  <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th>Assunto</th>
          <th>Quando</th>
          <th>Convocado por</th>
          <th>Participantes</th>
          <th>Ciência</th>
        </tr>
      </thead>
      <tbody id="meetingsAdminTbody"></tbody>
    </table>
  </div>
</div>`;

    _wireMeetingParticipantPicker();

    const tbody = document.getElementById('meetingsAdminTbody');
    if (!meetings.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center;padding:24px;">Nenhuma reunião cadastrada.</td></tr>`;
    } else {
      tbody.innerHTML = meetings
        .map(m => {
          const when = m.scheduled_at ? formatDateTime(m.scheduled_at) : '—';
          const creator = usersById[m.created_by] || m.created_by || '—';
          const parts = (m.participant_ids || [])
            .map(pid => usersById[pid] || pid)
            .join(', ') || '—';
          const ack = m.acknowledgements || {};
          const total = (m.participant_ids || []).length;
          const ok = (m.participant_ids || []).filter(pid => ack[String(pid)]).length;
          const ackCell =
            total === 0
              ? '—'
              : `<strong>${ok}/${total}</strong> participante(s)<br><span style="font-size:11px;color:var(--color-text-muted);">confirmaram ciência</span>`;
          return `<tr>
<td><strong>${String(m.subject || '').replace(/</g, '&lt;')}</strong></td>
<td>${when}</td>
<td>${String(creator).replace(/</g, '&lt;')}</td>
<td style="max-width:240px;font-size:13px;">${String(parts).replace(/</g, '&lt;')}</td>
<td>${ackCell}</td>
</tr>`;
        })
        .join('');
    }

    document.getElementById('meetCreateBtn').onclick = async () => {
      const subject = document.getElementById('meetSubject').value.trim();
      const dt = document.getElementById('meetScheduled').value;
      const participant_ids = _getSelectedMeetingParticipants();

      if (!participant_ids.length) {
        showToast('Marque pelo menos um participante.', 'warning');
        return;
      }

      showLoading('Salvando…');
      try {
        await DB.createMeeting({
          subject,
          scheduled_at: dt ? new Date(dt).toISOString() : new Date().toISOString(),
          participant_ids,
          created_by: adminId,
        });
        showToast('Reunião cadastrada. Os participantes verão em Reuniões no menu.', 'success');
        if (typeof _cacheDel === 'function') _cacheDel('meetings');
        await renderMeetingsAdmin();
        await updateMeetingsBadge();
      } catch (e) {
        showToast(e.message || 'Não foi possível salvar.', 'error');
      } finally {
        hideLoading();
      }
    };
  };

  /** Convocações recebidas — área do funcionário e painel admin */
  window.renderMeetingsEmployee = async function renderMeetingsEmployee(opts = {}) {
    const rootId = opts.rootId || 'meetingsEmployeeRoot';
    const root = document.getElementById(rootId);
    if (!root || !window.DB) return;

    const uid = String(opts.userId || _getMeetingUserId());
    if (!uid) return;

    if (typeof _cacheDel === 'function') _cacheDel('meetings');
    const list = await DB.listMeetingsForParticipant(uid);
    _toastNewMeetings(list, uid);

    const heading = opts.heading || 'Minhas convocações';
    let html = '';
    if (!list.length) {
      if (opts.hideWhenEmpty && rootId === 'meetingsMyInvitesRoot') {
        root.innerHTML = '';
        return;
      }
      html = `<div class="empty-state" style="padding:32px;"><div class="empty-icon">📅</div><h4>Nenhuma convocação</h4><p class="text-muted">Quando você for incluído em uma reunião, ela aparecerá aqui.</p></div>`;
    } else {
      html = `<h3 style="font-family:var(--font-display);font-weight:800;margin:0 0 14px;">${heading}</h3><div style="display:flex;flex-direction:column;gap:14px;">`;
      for (const m of list) {
        let organizer = '—';
        try {
          const ou = await DB.getUser(m.created_by);
          organizer = ou?.name || m.created_by;
        } catch (_) {
          organizer = m.created_by;
        }
        const when = m.scheduled_at ? formatDateTime(m.scheduled_at) : '—';
        const ack = (m.acknowledgements || {})[uid];
        const status = ack
          ? `<span class="badge badge-success">Ciência registrada — ${formatDateTime(ack)}</span>`
          : `<span class="badge badge-warning">Aguardando sua ciência</span>`;
        const btn = ack
          ? ''
          : `<button type="button" class="btn btn-primary btn-sm" data-meeting-open="${String(m.id).replace(/"/g, '&quot;')}">Registrar ciência do termo</button>`;

        html += `
<div class="card card-padded" style="border-left:4px solid var(--color-primary);">
  <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:flex-start;">
    <div>
      <h4 style="margin:0 0 8px;font-family:var(--font-display);">${String(m.subject || 'Reunião').replace(/</g, '&lt;')}</h4>
      <div style="font-size:13px;color:var(--color-text-muted);line-height:1.5;">
        <div>📆 <strong>${when}</strong></div>
        <div>👤 Convocado por: <strong>${String(organizer).replace(/</g, '&lt;')}</strong></div>
      </div>
    </div>
    <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
      ${status}
      ${btn}
    </div>
  </div>
</div>`;
      }
      html += `</div>`;
      if (rootId === 'meetingsMyInvitesRoot') {
        html = `<div class="card card-padded" style="border-left:4px solid var(--color-warning);">${html}</div>`;
      }
    }

    root.innerHTML = html;

    root.querySelectorAll('[data-meeting-open]').forEach(btn => {
      btn.addEventListener('click', () => openMeetingTermModal(btn.getAttribute('data-meeting-open')));
    });

    await updateMeetingsBadge();
  };

  async function openMeetingTermModal(meetingId) {
    ensureMeetingTermOverlay();
    const mtg = await DB.getMeeting(meetingId);
    if (!mtg) {
      showToast('Reunião não encontrada.', 'error');
      return;
    }
    const uid = _getMeetingUserId();
    if (!(mtg.participant_ids || []).map(String).includes(uid)) {
      showToast('Você não é participante desta reunião.', 'warning');
      return;
    }
    if ((mtg.acknowledgements || {})[uid]) {
      showToast('Ciência já registrada.', 'info');
      return;
    }

    const organizerEl = document.getElementById('meetingTermMeetingSummary');
    let organizer = mtg.created_by;
    try {
      const ou = await DB.getUser(mtg.created_by);
      organizer = ou?.name || organizer;
    } catch (_) {}
    const when = mtg.scheduled_at ? formatDateTime(mtg.scheduled_at) : '—';

    organizerEl.innerHTML = `
<strong>Assunto:</strong> ${String(mtg.subject || '').replace(/</g, '&lt;')}<br/>
<strong>Data/hora:</strong> ${when}<br/>
<strong>Convocação:</strong> ${String(organizer).replace(/</g, '&lt;')}
`;

    const ov = document.getElementById('meetingTermFullscreen');
    const fill = document.getElementById('meetingTermProgressFill');
    const hint = document.getElementById('meetingTermScrollHint');
    const checkLbl = document.getElementById('meetingTermCheckLabel');
    const checkInp = document.getElementById('meetingTermFinalCheck');
    const confirmBtn = document.getElementById('meetingTermConfirmBtn');
    const area = document.getElementById('meetingTermScrollArea');

    fill.style.width = '0%';
    hint.classList.remove('hidden');
    checkLbl.classList.remove('unlocked');
    checkInp.checked = false;
    checkInp.disabled = true;
    confirmBtn.disabled = true;
    area.scrollTop = 0;

    window.__meetingTermPendingId = meetingId;

    ov.classList.add('open');
    ov.setAttribute('aria-hidden', 'false');

    wireMeetingTermScroll();

    confirmBtn.onclick = async () => {
      if (!checkInp.checked) return;
      const mid = window.__meetingTermPendingId;
      if (!mid) return;
      showLoading('Registrando…');
      try {
        await DB.acknowledgeMeeting(mid, uid);
        showToast('Ciência registrada com sucesso.', 'success');
        ov.classList.remove('open');
        ov.setAttribute('aria-hidden', 'true');
        window.__meetingTermPendingId = null;
        if (typeof _cacheDel === 'function') _cacheDel('meetings');
        await renderMeetingsEmployee();
        const adminInvites = document.getElementById('meetingsMyInvitesRoot');
        if (adminInvites && typeof renderMeetingsEmployee === 'function') {
          await renderMeetingsEmployee({ rootId: 'meetingsMyInvitesRoot', userId: uid, heading: 'Suas convocações' });
        }
        await updateMeetingsBadge();
      } catch (e) {
        showToast(e.message || 'Falha ao registrar.', 'error');
      } finally {
        hideLoading();
      }
    };
  }
})();
