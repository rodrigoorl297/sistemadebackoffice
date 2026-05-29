/* SOU + BLU — Treinamentos (tutoriais, palestras, prova, penalidade, notas RH) */
(function () {
  const VENDOR_ROLES = new Set(['vendedor', 'employee']);
  const MANAGE_ROLES = new Set([
    'master', 'fundador', 'desenvolvedor', 'gerente', 'gerencia', 'admin',
    'financeiro', 'financial', 'supervisor', 'sup_backoffice', 'parceiro',
    'rh', 'backoffice', 'operacional', 'juridico', 'diretoria', 'ouvidoria',
  ]);
  const RH_REPORT_ROLES = new Set(['master', 'fundador', 'rh', 'gerente', 'gerencia']);

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDt(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR'); } catch { return '—'; }
  }

  function sessionRole() {
    return String(Auth.getSession()?.role || '').trim().toLowerCase();
  }

  function canManage(role) {
    const r = role || sessionRole();
    return MANAGE_ROLES.has(r) && !VENDOR_ROLES.has(r);
  }

  function canRhReport(role) {
    const r = role || sessionRole();
    return RH_REPORT_ROLES.has(r);
  }

  function audienceMatch(training, user) {
    const roles = training.audience_roles || ['*'];
    if (roles.includes('*')) return true;
    const ur = String(user?.role || '').trim().toLowerCase();
    return roles.map(x => String(x).trim().toLowerCase()).includes(ur);
  }

  async function partnerRootForUser(user) {
    if (!user?.id) return null;
    if (String(user.role || '').toLowerCase() === 'parceiro') return user.id;
    return DB.getPartnerRootForUser(user.id).catch(() => null);
  }

  async function trainingsForUser(user) {
    const root = await partnerRootForUser(user);
    const all = await DB.getTrainings({ partnerRootId: root, activeOnly: true });
    return all.filter(t => audienceMatch(t, user));
  }

  function statusLabel(st, passed, deadline) {
    if (st === 'passed' || passed) return '<span class="badge badge-success">Aprovado</span>';
    if (st === 'penalized') return '<span class="badge badge-danger">Penalizado</span>';
    if (st === 'failed') return '<span class="badge badge-danger">Reprovado</span>';
    if (deadline && new Date(deadline) < new Date()) {
      return '<span class="badge badge-warning">Prazo expirado</span>';
    }
    return '<span class="badge badge-muted">Pendente</span>';
  }

  const Trainings = {
    canManage,
    canRhReport,

    /** Penaliza quem não concluiu no prazo (uma vez por treinamento). */
    async applyDeadlinesForUser(user) {
      if (!user?.id) return;
      const list = await trainingsForUser(user);
      const now = Date.now();
      for (const tr of list) {
        if (!tr.deadline_at || !tr.penalty_points) continue;
        if (new Date(tr.deadline_at).getTime() >= now) continue;
        const att = await DB.getTrainingAttempt(tr.id, user.id);
        if (att?.passed || att?.status === 'penalized') continue;
        if (att?.status === 'passed') continue;
        await DB.saveTrainingAttempt({
          ...(att || {}),
          training_id: tr.id,
          user_id: user.id,
          status: 'penalized',
          passed: false,
          score: att?.score ?? 0,
          penalized_at: new Date().toISOString(),
        });
        try {
          await DB.applyTrainingPenalty(user.id, tr.id, tr.penalty_points, tr.title);
          if (typeof showToast === 'function') {
            showToast(`Penalidade: −${tr.penalty_points} pts — treinamento "${tr.title}" (prazo vencido).`, 'warning', 9000);
          }
        } catch (e) {
          console.warn('[Trainings] penalidade', e);
        }
      }
    },

    async updateBadge() {
      const uid = Auth.getSession()?.id;
      if (!uid) return 0;
      const user = await DB.getUser(uid).catch(() => null);
      if (!user) return 0;
      await this.applyDeadlinesForUser(user);
      const list = await trainingsForUser(user);
      let pending = 0;
      for (const tr of list) {
        const att = await DB.getTrainingAttempt(tr.id, uid);
        if (!att?.passed) pending++;
      }
      document.querySelectorAll('#trainingsBadge, .trainings-badge').forEach(b => {
        b.textContent = pending;
        b.style.display = pending > 0 ? 'inline' : 'none';
      });
      return pending;
    },

    ensureUi() {
      if (document.getElementById('secTrainings')) return;
      const nav = document.querySelector('.sidebar-nav');
      const main = document.querySelector('.page-content');
      if (!nav || !main) return;
      const profBtn = nav.querySelector('[data-section="secProfile"]');
      if (profBtn) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item trainings-nav';
        btn.dataset.section = 'secTrainings';
        btn.innerHTML = '<span class="nav-icon">📚</span><span class="nav-label">Treinamentos</span><span class="nav-badge trainings-badge" id="trainingsBadge" style="display:none;">0</span>';
        profBtn.parentNode.insertBefore(btn, profBtn);
      }
      const sec = document.createElement('section');
      sec.className = 'section';
      sec.id = 'secTrainings';
      sec.innerHTML = '<div id="trainingsRoot"></div>';
      const profSec = document.getElementById('secProfile');
      if (profSec) main.insertBefore(sec, profSec);
      else main.appendChild(sec);
    },

    async renderEmployee() {
      this.ensureUi();
      const root = document.getElementById('trainingsRoot');
      if (!root) return;
      const user = await Auth.getCurrentUser();
      if (!user) return;
      await this.applyDeadlinesForUser(user);
      const list = await trainingsForUser(user);
      if (!list.length) {
        root.innerHTML = '<div class="empty-state"><h4>Nenhum treinamento disponível</h4><p>Aguarde novas convocações da gestão ou RH.</p></div>';
        return;
      }
      const cards = await Promise.all(list.map(async tr => {
        const att = await DB.getTrainingAttempt(tr.id, user.id);
        const dl = tr.deadline_at ? fmtDt(tr.deadline_at) : 'Sem prazo';
        const kind = tr.kind === 'palestra' ? 'Palestra' : 'Tutorial';
        return `<div class="card card-padded" style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div><span class="badge badge-muted">${kind}</span>
              <h4 style="margin:8px 0 4px;">${esc(tr.title)}</h4>
              <p style="font-size:13px;color:var(--color-text-muted);margin:0;">Prazo: ${dl} · Nota mínima: ${tr.passing_score}% · Penalidade: ${tr.penalty_points || 0} pts</p>
            </div>
            <div style="text-align:right;">${statusLabel(att?.status, att?.passed, tr.deadline_at)}
              ${att?.score != null ? `<div style="font-size:13px;margin-top:6px;">Nota: <strong>${att.score}%</strong></div>` : ''}
              <button type="button" class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="Trainings.openTake('${esc(tr.id)}')">${att?.passed ? 'Rever' : 'Iniciar / Prova'}</button>
            </div>
          </div>
        </div>`;
      }));
      root.innerHTML = `<div class="page-header"><div class="page-header-text"><h2>Treinamentos</h2><p>Tutoriais, palestras e prova integrados ao SOU+BLU</p></div></div>${cards.join('')}`;
      await this.updateBadge();
    },

    async renderAdminManage() {
      const root = document.getElementById('trainingsAdminRoot');
      if (!root) return;
      const s = Auth.getSession();
      const partnerRoot = window.PARTNER_ROOT_ID || (s?.role === 'parceiro' ? s.id : await DB.getPartnerRootForUser(s.id));
      const list = await DB.getTrainings({ partnerRootId: partnerRoot });
      root.innerHTML = `
        <div class="page-header">
          <div class="page-header-text"><h2>Gestão de Treinamentos</h2><p>Cadastre tutoriais, palestras e prova para a equipe</p></div>
          <button type="button" class="btn btn-primary" onclick="Trainings.openEditor()">+ Novo treinamento</button>
        </div>
        <div class="card card-padded">
          <div class="table-wrap"><table class="data-table"><thead><tr>
            <th>Título</th><th>Tipo</th><th>Prazo</th><th>Nota mín.</th><th>Penalidade</th><th>Ativo</th><th></th>
          </tr></thead><tbody id="trainingsAdminTbody"></tbody></table></div>
        </div>`;
      const tb = document.getElementById('trainingsAdminTbody');
      if (!list.length) {
        tb.innerHTML = '<tr><td colspan="7" class="text-muted text-center">Nenhum treinamento cadastrado.</td></tr>';
        return;
      }
      tb.innerHTML = list.map(tr => `<tr>
        <td><strong>${esc(tr.title)}</strong></td>
        <td>${tr.kind === 'palestra' ? 'Palestra' : 'Tutorial'}</td>
        <td>${fmtDt(tr.deadline_at)}</td>
        <td>${tr.passing_score}%</td>
        <td>${tr.penalty_points || 0} pts</td>
        <td>${tr.active ? 'Sim' : 'Não'}</td>
        <td>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Trainings.openEditor('${esc(tr.id)}')">Editar</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Trainings.remove('${esc(tr.id)}')">Excluir</button>
        </td>
      </tr>`).join('');
    },

    async renderRhReport() {
      const root = document.getElementById('trainingsRhRoot');
      if (!root) return;
      const partnerRoot = window.PARTNER_ROOT_ID || null;
      const trainings = await DB.getTrainings({ partnerRootId: partnerRoot });
      let attempts = await DB.getTrainingAttempts({});
      const users = await DB.getAllUsers().catch(() => []);
      if (partnerRoot) {
        const team = await DB.getPartnerTeam(partnerRoot).catch(() => []);
        const ids = new Set(team.map(u => u.id));
        ids.add(partnerRoot);
        attempts = attempts.filter(a => ids.has(a.user_id));
      }
      const byId = Object.fromEntries(users.map(u => [u.id, u]));
      root.innerHTML = `
        <div class="page-header"><div class="page-header-text"><h2>Notas — Treinamentos (RH)</h2><p>Controle de aproveitamento e penalidades</p></div></div>
        <div class="card card-padded"><div class="table-wrap"><table class="data-table"><thead><tr>
          <th>Colaborador</th><th>Treinamento</th><th>Nota</th><th>Status</th><th>Concluído em</th><th>Penalizado</th>
        </tr></thead><tbody id="trainingsRhTbody"></tbody></table></div></div>`;
      const tb = document.getElementById('trainingsRhTbody');
      const rows = attempts.map(a => {
        const u = byId[a.user_id];
        const tr = trainings.find(t => t.id === a.training_id);
        return { a, u, tr };
      }).filter(r => r.tr);
      if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="6" class="text-muted text-center">Sem tentativas registradas.</td></tr>';
        return;
      }
      tb.innerHTML = rows.map(({ a, u, tr }) => `<tr>
        <td>${esc(u?.name || a.user_id)}<br><small class="text-muted">${esc(u?.role || '')}</small></td>
        <td>${esc(tr.title)}</td>
        <td><strong>${a.score ?? '—'}%</strong></td>
        <td>${statusLabel(a.status, a.passed, tr.deadline_at)}</td>
        <td>${fmtDt(a.completed_at)}</td>
        <td>${a.penalized_at ? fmtDt(a.penalized_at) : '—'}</td>
      </tr>`).join('');
    },

    openEditor(id) {
      const isEdit = !!id;
      document.getElementById('trainingModalTitle').textContent = isEdit ? 'Editar treinamento' : 'Novo treinamento';
      document.getElementById('trainingEditId').value = id || '';
      if (!isEdit) {
        document.getElementById('trnTitle').value = '';
        document.getElementById('trnKind').value = 'tutorial';
        document.getElementById('trnDesc').value = '';
        document.getElementById('trnContent').value = '';
        document.getElementById('trnVideo').value = '';
        document.getElementById('trnResource').value = '';
        document.getElementById('trnDeadline').value = '';
        document.getElementById('trnPassing').value = '70';
        document.getElementById('trnPenalty').value = '50';
        document.getElementById('trnAudience').value = '*';
        document.getElementById('trnQuestionsJson').value = '[]';
        document.getElementById('trnActive').checked = true;
        openModal('trainingModal');
        return;
      }
      DB.getTraining(id).then(tr => {
        if (!tr) return;
        document.getElementById('trnTitle').value = tr.title || '';
        document.getElementById('trnKind').value = tr.kind || 'tutorial';
        document.getElementById('trnDesc').value = tr.description || '';
        document.getElementById('trnContent').value = tr.content_body || '';
        document.getElementById('trnVideo').value = tr.video_url || '';
        document.getElementById('trnResource').value = tr.resource_url || '';
        document.getElementById('trnDeadline').value = tr.deadline_at ? tr.deadline_at.slice(0, 16) : '';
        document.getElementById('trnPassing').value = String(tr.passing_score ?? 70);
        document.getElementById('trnPenalty').value = String(tr.penalty_points ?? 0);
        document.getElementById('trnAudience').value = (tr.audience_roles || ['*']).join(', ');
        document.getElementById('trnQuestionsJson').value = JSON.stringify(tr.questions || [], null, 2);
        document.getElementById('trnActive').checked = tr.active !== false;
        openModal('trainingModal');
      });
    },

    async saveEditor() {
      const s = Auth.getSession();
      if (!canManage(s?.role)) { showToast('Sem permissão.', 'error'); return; }
      let questions = [];
      try {
        questions = JSON.parse(document.getElementById('trnQuestionsJson').value || '[]');
        if (!Array.isArray(questions)) throw new Error('questions deve ser array');
      } catch (e) {
        alert('JSON das perguntas inválido. Ex.: [{"q":"Pergunta?","options":["A","B"],"correct":0}]');
        return;
      }
      const audRaw = document.getElementById('trnAudience').value.trim();
      const audience_roles = audRaw === '*' || !audRaw
        ? ['*']
        : audRaw.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
      const id = document.getElementById('trainingEditId').value || undefined;
      const partnerRoot = window.PARTNER_ROOT_ID || (s.role === 'parceiro' ? s.id : null);
      const row = {
        id,
        title: document.getElementById('trnTitle').value.trim(),
        kind: document.getElementById('trnKind').value,
        description: document.getElementById('trnDesc').value.trim(),
        content_body: document.getElementById('trnContent').value.trim(),
        video_url: document.getElementById('trnVideo').value.trim(),
        resource_url: document.getElementById('trnResource').value.trim(),
        deadline_at: document.getElementById('trnDeadline').value
          ? new Date(document.getElementById('trnDeadline').value).toISOString()
          : null,
        passing_score: parseInt(document.getElementById('trnPassing').value, 10) || 70,
        penalty_points: parseInt(document.getElementById('trnPenalty').value, 10) || 0,
        audience_roles,
        questions,
        active: document.getElementById('trnActive').checked,
        created_by: s.id,
        partner_root_id: partnerRoot || null,
      };
      if (!row.title) { showToast('Informe o título.', 'warning'); return; }
      showLoading('Salvando...');
      try {
        await DB.saveTraining(row);
        closeModal('trainingModal');
        showToast('Treinamento salvo!', 'success');
        await this.renderAdminManage();
        if (document.getElementById('trainingsRoot')) await this.renderEmployee();
      } catch (e) {
        alert('Erro ao salvar: ' + (e.message || e));
      } finally { hideLoading(); }
    },

    async remove(id) {
      if (!confirm('Excluir este treinamento e todas as notas?')) return;
      await DB.deleteTraining(id);
      showToast('Treinamento excluído.', 'success');
      await this.renderAdminManage();
    },

    async openTake(trainingId) {
      const tr = await DB.getTraining(trainingId);
      const user = await Auth.getCurrentUser();
      if (!tr || !user) return;
      window.__trnTake = { training: tr, user };
      const body = document.getElementById('trainingTakeBody');
      const kind = tr.kind === 'palestra' ? 'Palestra' : 'Tutorial';
      let html = `<h3>${esc(tr.title)}</h3><p class="badge badge-muted">${kind}</p>`;
      if (tr.description) html += `<p>${esc(tr.description)}</p>`;
      if (tr.content_body) html += `<div style="margin:12px 0;padding:12px;background:var(--color-surface-2);border-radius:8px;white-space:pre-wrap;">${esc(tr.content_body)}</div>`;
      if (tr.video_url) html += `<p><a href="${esc(tr.video_url)}" target="_blank" rel="noopener">▶ Assistir vídeo</a></p>`;
      if (tr.resource_url) html += `<p><a href="${esc(tr.resource_url)}" target="_blank" rel="noopener">📎 Material de apoio</a></p>`;
      const qs = tr.questions || [];
      if (qs.length) {
        html += '<hr style="margin:20px 0;"><h4>Prova</h4>';
        qs.forEach((item, i) => {
          const opts = (item.options || []).map((o, j) =>
            `<label style="display:block;margin:6px 0;"><input type="radio" name="trnQ${i}" value="${j}"/> ${esc(o)}</label>`
          ).join('');
          html += `<div class="form-group"><label><strong>${i + 1}.</strong> ${esc(item.q || item.question)}</label>${opts}</div>`;
        });
      } else {
        html += '<p class="text-muted">Sem prova — clique em concluir para registrar participação.</p>';
      }
      body.innerHTML = html;
      openModal('trainingTakeModal');
    },

    async submitTake() {
      const pack = window.__trnTake;
      if (!pack) return;
      const { training: tr, user } = pack;
      const qs = tr.questions || [];
      const answers = [];
      let correct = 0;
      qs.forEach((item, i) => {
        const picked = document.querySelector(`input[name="trnQ${i}"]:checked`);
        const idx = picked ? parseInt(picked.value, 10) : -1;
        answers.push(idx);
        const ok = parseInt(item.correct ?? item.correctIndex ?? 0, 10);
        if (idx === ok) correct++;
      });
      const score = qs.length ? Math.round((correct / qs.length) * 100) : 100;
      const passed = score >= (tr.passing_score || 70);
      const pastDeadline = tr.deadline_at && new Date(tr.deadline_at) < new Date();
      let status = passed ? 'passed' : 'failed';
      if (pastDeadline && !passed) status = 'failed';

      await DB.saveTrainingAttempt({
        training_id: tr.id,
        user_id: user.id,
        score,
        passed,
        status,
        answers,
        completed_at: new Date().toISOString(),
      });

      if (!passed && tr.penalty_points > 0 && pastDeadline) {
        await DB.applyTrainingPenalty(user.id, tr.id, tr.penalty_points, tr.title);
        await DB.saveTrainingAttempt({
          training_id: tr.id,
          user_id: user.id,
          score,
          passed: false,
          status: 'penalized',
          answers,
          penalized_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        });
      } else if (!passed && tr.penalty_points > 0) {
        showToast(`Reprovado (${score}%). Você pode tentar novamente antes do prazo.`, 'warning', 8000);
      }

      closeModal('trainingTakeModal');
      if (passed) showToast(`Aprovado! Nota: ${score}%`, 'success');
      else if (status !== 'penalized') showToast(`Nota: ${score}% — mínimo ${tr.passing_score}%`, 'error');

      if (document.getElementById('trainingsRoot')) await this.renderEmployee();
      if (document.getElementById('trainingsAdminRoot')) await this.renderAdminManage();
      await this.updateBadge();
    },

    ensureAdminSections() {
      const main = document.querySelector('.page-content');
      if (!main || document.getElementById('secTrainingsManage')) return;
      const wrap = document.createElement('section');
      wrap.className = 'section';
      wrap.id = 'secTrainingsManage';
      wrap.innerHTML = '<div id="trainingsAdminRoot"></div>';
      main.appendChild(wrap);
      const rh = document.createElement('section');
      rh.className = 'section';
      rh.id = 'secTrainingsRh';
      rh.innerHTML = '<div id="trainingsRhRoot"></div>';
      main.appendChild(rh);
    },

    wireAdminNav() {
      const nav = document.querySelector('.sidebar-nav');
      if (!nav || document.getElementById('navTrainingsManage')) return;
      const gestaoLabel = [...nav.querySelectorAll('.sidebar-section-label')].find(l => l.textContent.trim().toUpperCase() === 'GESTÃO');
      const insertAfter = gestaoLabel || nav.querySelector('#navManageProposals') || nav.firstChild;
      const mk = (id, sec, label, cls) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `nav-item ${cls}`;
        b.id = id;
        b.dataset.section = sec;
        b.innerHTML = `<span class="nav-icon">📚</span><span class="nav-label">${label}</span>`;
        return b;
      };
      const manage = mk('navTrainingsManage', 'secTrainingsManage', 'Treinamentos', 'trainings-manage-nav');
      const rh = mk('navTrainingsRh', 'secTrainingsRh', 'Notas RH', 'trainings-rh-nav');
      const mine = mk('navTrainingsCollab', 'secTrainings', 'Meus treinamentos', 'trainings-collab-nav');
      if (insertAfter?.nextSibling) {
        insertAfter.parentNode.insertBefore(manage, insertAfter.nextSibling);
        manage.after(rh);
        rh.after(mine);
      } else {
        nav.appendChild(manage);
        nav.appendChild(rh);
        nav.appendChild(mine);
      }
    },

    initAdmin() {
      this.ensureAdminSections();
      this.ensureUi();
      this.wireAdminNav();
      const role = sessionRole();
      document.querySelectorAll('.trainings-manage-nav').forEach(el => {
        el.style.display = canManage(role) ? '' : 'none';
      });
      document.querySelectorAll('.trainings-rh-nav').forEach(el => {
        el.style.display = canRhReport(role) ? '' : 'none';
      });
      document.querySelectorAll('.trainings-collab-nav').forEach(el => {
        el.style.display = '';
      });
    },
  };

  window.Trainings = Trainings;
  window.updateTrainingsBadge = () => Trainings.updateBadge();

  function ensureModals() {
    if (document.getElementById('trainingModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
<div class="modal-overlay" id="trainingModal"><div class="modal" style="max-width:640px;"><div class="modal-header">
  <h3 id="trainingModalTitle">Treinamento</h3><button type="button" class="modal-close" onclick="closeModal('trainingModal')"></button></div>
<div class="modal-body" style="max-height:70vh;overflow-y:auto;">
  <input type="hidden" id="trainingEditId"/>
  <div class="form-group"><label>Título *</label><input type="text" id="trnTitle" class="form-control"/></div>
  <div class="form-row"><div class="form-group"><label>Tipo</label>
    <select id="trnKind" class="form-control"><option value="tutorial">Tutorial</option><option value="palestra">Palestra</option></select></div>
  <div class="form-group"><label>Prazo final</label><input type="datetime-local" id="trnDeadline" class="form-control"/></div></div>
  <div class="form-row"><div class="form-group"><label>Nota mínima (%)</label><input type="number" id="trnPassing" class="form-control" min="0" max="100" value="70"/></div>
  <div class="form-group"><label>Penalidade (pontos BLU)</label><input type="number" id="trnPenalty" class="form-control" min="0" value="50"/></div></div>
  <div class="form-group"><label>Público (papéis, vírgula ou * para todos)</label>
    <input type="text" id="trnAudience" class="form-control" placeholder="vendedor, backoffice ou *"/></div>
  <div class="form-group"><label>Resumo</label><textarea id="trnDesc" class="form-control" rows="2"></textarea></div>
  <div class="form-group"><label>Conteúdo / roteiro</label><textarea id="trnContent" class="form-control" rows="4"></textarea></div>
  <div class="form-group"><label>URL do vídeo (opcional)</label><input type="url" id="trnVideo" class="form-control" placeholder="https://..."/></div>
  <div class="form-group"><label>Link material (PDF/slide)</label><input type="url" id="trnResource" class="form-control"/></div>
  <div class="form-group"><label>Perguntas (JSON)</label>
    <textarea id="trnQuestionsJson" class="form-control" rows="6" placeholder='[{"q":"Pergunta?","options":["A","B","C"],"correct":0}]'></textarea>
    <small class="text-muted">correct = índice da alternativa correta (0 = primeira)</small></div>
  <label><input type="checkbox" id="trnActive" checked/> Ativo</label>
</div><div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('trainingModal')">Cancelar</button>
  <button type="button" class="btn btn-primary" onclick="Trainings.saveEditor()">Salvar</button>
</div></div></div>
<div class="modal-overlay" id="trainingTakeModal"><div class="modal" style="max-width:600px;"><div class="modal-header">
  <h3>Treinamento</h3><button type="button" class="modal-close" onclick="closeModal('trainingTakeModal')"></button></div>
<div class="modal-body" id="trainingTakeBody" style="max-height:65vh;overflow-y:auto;"></div>
<div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('trainingTakeModal')">Fechar</button>
  <button type="button" class="btn btn-primary" onclick="Trainings.submitTake()">Enviar prova</button>
</div></div></div>`);
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureModals();
    setTimeout(() => Trainings.ensureUi(), 100);
  });
})();
