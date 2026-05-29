/* withdrawal flow */
let _wdIsFirst  = false;   // é o 1º saque?
let _termFaceAlreadyDone = false; // 1º saque: face já feita antes do termo
let _docFrontB64 = '';
let _docBackB64  = '';
let _faceHashCapturado = '';

/* ── PIX key selector ── */
function selectPixType(type, btn) {
  document.querySelectorAll('.pix-key-type-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('pixKeyType').value = type;
  const labels       = {cpf:'CPF',cnpj:'CNPJ',email:'E-mail',phone:'Celular',random:'Chave Aleatória'};
  const placeholders = {cpf:'000.000.000-00',cnpj:'00.000.000/0001-00',email:'seu@email.com',phone:'+55 11 99999-9999',random:'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'};
  document.getElementById('pixKeyLabel').textContent = labels[type];
  document.getElementById('pixKey').placeholder = placeholders[type];
}

/* ── PASSO 1 → próximo passo ── */
async function goToTermStep() {
  const rawAmt    = document.getElementById('withdrawAmount').value;
  const pixKey    = document.getElementById('pixKey').value.trim();
  const holderName= document.getElementById('pixHolderName').value.trim();
  const pixType   = document.getElementById('pixKeyType').value;

  const moneyWallet = typeof userUsesMoneyWallet === 'function' && userUsesMoneyWallet(currentUser);
  const bal = typeof userWalletBalance === 'function' ? userWalletBalance(currentUser) : (currentUser.points || 0);
  const amt = moneyWallet
    ? (typeof parseMoneyAmount === 'function' ? parseMoneyAmount(rawAmt) : parseFloat(rawAmt))
    : Math.max(0, Math.floor(Number(rawAmt)));
  if (!amt || amt <= 0) {
    showToast(moneyWallet ? 'Informe o valor em reais.' : 'Informe a quantidade de pontos.', 'warning');
    return;
  }
  if (!pixKey)                { showToast('Informe sua chave PIX.','warning'); return; }
  if (!holderName)            { showToast('Informe o nome do titular.','warning'); return; }
  const tol = moneyWallet ? 0.001 : 0;
  if (amt > bal + tol) {
    showToast(`Saldo insuficiente. Disponível: ${formatCurrency(bal, currentUser)}.`, 'error');
    return;
  }

  // Usuário de teste: pular documento e facial, ir direto ao termo
  if (currentUser.face_hash === 'SKIP') {
    _wdIsFirst = false;
    closeModal('withdrawalModal');
    openTermScreen(amt, pixType, pixKey, holderName);
    return;
  }

  // Verificar se é o 1º saque
  try { _wdIsFirst = await DB.isFirstWithdrawal(currentUser.id); } catch { _wdIsFirst = false; }

  closeModal('withdrawalModal');

  if (_wdIsFirst) {
    // 1º saque: vai para cadastro de documento primeiro
    _termFaceAlreadyDone = false;
    _docFrontB64 = '';
    _docBackB64  = '';
    document.getElementById('docFrontImg').style.display = 'none';
    document.getElementById('docFrontImg').src = '';
    document.getElementById('docFrontPlaceholder').style.display = '';
    document.getElementById('docFrontPreviewWrap').style.borderColor = 'var(--color-border)';
    document.getElementById('docFrontPreviewWrap').style.borderStyle = 'dashed';
    const fst = document.getElementById('docFrontStatus'); if(fst) fst.style.display='none';
    document.getElementById('docBackImg').style.display  = 'none';
    document.getElementById('docBackImg').src = '';
    document.getElementById('docBackPlaceholder').style.display  = '';
    document.getElementById('docBackPreviewWrap').style.borderColor = 'var(--color-border)';
    document.getElementById('docBackPreviewWrap').style.borderStyle = 'dashed';
    const bst = document.getElementById('docBackStatus'); if(bst) bst.style.display='none';
    // Scroll para o topo da área de documento
    const dc = document.getElementById('docContent'); if(dc) dc.scrollTop = 0;
    document.getElementById('docTypeValue').value = 'rg';
    selectDocType('rg');
    document.getElementById('docScreen').classList.add('open');
  } else {
    // Demais saques: vai direto para o termo
    _termFaceAlreadyDone = false;
    openTermScreen(amt, pixType, pixKey, holderName);
  }
}

/* ── Documento ── */
function selectDocType(type) {
  document.getElementById('docTypeValue').value = type;
  document.getElementById('docTypeRG').className  = type==='rg'  ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
  document.getElementById('docTypeCNH').className = type==='cnh' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
}

function previewDoc(side, input) {
  const file = input.files[0]; if (!file) return;
  if (file.size > 5*1024*1024) { showToast('Imagem muito grande. Máx 5MB.','warning'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const b64 = e.target.result;
    if (side === 'front') {
      _docFrontB64 = b64;
      document.getElementById('docFrontImg').src = b64;
      document.getElementById('docFrontImg').style.display = '';
      document.getElementById('docFrontPlaceholder').style.display = 'none';
      const st = document.getElementById('docFrontStatus');
      if (st) st.style.display = '';
      // Borda verde para indicar sucesso
      document.getElementById('docFrontPreviewWrap').style.borderColor = 'var(--color-success)';
      document.getElementById('docFrontPreviewWrap').style.borderStyle = 'solid';
    } else {
      _docBackB64 = b64;
      document.getElementById('docBackImg').src = b64;
      document.getElementById('docBackImg').style.display = '';
      document.getElementById('docBackPlaceholder').style.display = 'none';
      const st = document.getElementById('docBackStatus');
      if (st) st.style.display = '';
      document.getElementById('docBackPreviewWrap').style.borderColor = 'var(--color-success)';
      document.getElementById('docBackPreviewWrap').style.borderStyle = 'solid';
    }
  };
  reader.readAsDataURL(file);
}

function closeDocScreen() {
  document.getElementById('docScreen').classList.remove('open');
  openModal('withdrawalModal');
}

function goToFaceStepFromDoc() {
  if (!_docFrontB64) { showToast('Envie a frente do documento.','warning'); return; }
  if (!_docBackB64)  { showToast('Envie o verso do documento.','warning'); return; }
  // Documento OK — vai para reconhecimento facial (1º saque: face será cadastrada)
  document.getElementById('docScreen').classList.remove('open');
  // Atualizar título do face screen para indicar cadastro
  document.querySelector('#faceScreen .term-header h2').textContent = '📸 Cadastro de Biometria Facial';
  document.querySelector('#faceScreen .term-header p').textContent  = 'Esta é sua biometria de segurança. Será usada para verificar sua identidade em todos os saques futuros.';
  _faceHashCapturado = '';
  document.getElementById('faceScreen').classList.add('open');
  _faceDone = false;
  resetFaceUI();
  startCamera();
}

/* ── Termo ── */
function openTermScreen(amount, pixType, pixKey, holderName) {
  const amtDisp = typeof parseMoneyAmount === 'function' ? parseMoneyAmount(amount) : amount;
  document.getElementById('termAmount').textContent    = formatCurrency(amtDisp, currentUser);
  document.getElementById('termPixSummary').textContent = `PIX ${pixType.toUpperCase()} — ${pixKey}`;
  document.getElementById('termHolder').innerHTML      = `Titular: <strong>${holderName}</strong>`;
  document.getElementById('termFinalCheck').checked    = false;
  document.getElementById('termFinalCheck').disabled   = true;
  document.getElementById('termConfirmBtn').disabled   = true;
  document.getElementById('termProgressFill').style.width = '0%';
  document.getElementById('termScrollHint').classList.remove('hidden');
  document.getElementById('termCheckLabel').classList.remove('unlocked');
  document.getElementById('termScrollArea').scrollTop = 0;
  const confirmBtn = document.getElementById('termConfirmBtn');
  if (_termFaceAlreadyDone) {
    confirmBtn.textContent = 'Confirmar e Enviar Saque ✓';
  } else {
    confirmBtn.textContent = 'Confirmar e Verificar Identidade 📸';
  }
  document.getElementById('termFullscreen').classList.add('open');
  setupTermScroll();
}

function confirmTermStep() {
  if (_termFaceAlreadyDone) {
    document.getElementById('termFullscreen').classList.remove('open');
    executeWithdrawal();
    return;
  }
  goToFaceStep();
}

// Controle de scroll do termo — sem clonar DOM
let _termScrollUnlocked = false;
let _termScrollHandler  = null;
let _termCheckHandler   = null;

function setupTermScroll() {
  const area       = document.getElementById('termScrollArea');
  const fill       = document.getElementById('termProgressFill');
  const hint       = document.getElementById('termScrollHint');
  const checkLbl   = document.getElementById('termCheckLabel');
  const checkInp   = document.getElementById('termFinalCheck');
  const confirmBtn = document.getElementById('termConfirmBtn');

  // Remover listeners anteriores sem clonar DOM
  if (_termScrollHandler) area.removeEventListener('scroll', _termScrollHandler);
  if (_termCheckHandler)  checkInp.removeEventListener('change', _termCheckHandler);

  _termScrollUnlocked = false;

  _termScrollHandler = function() {
    const { scrollTop, scrollHeight, clientHeight } = area;
    // Evitar divisão por zero quando conteúdo não é maior que container
    const scrollable = scrollHeight - clientHeight;
    const pct = scrollable <= 0
      ? 100
      : Math.min(100, Math.round((scrollTop / scrollable) * 100));
    fill.style.width = pct + '%';
    if (pct >= 95 && !_termScrollUnlocked) {
      _termScrollUnlocked = true;
      hint.classList.add('hidden');
      checkLbl.classList.add('unlocked');
      checkInp.disabled = false;
      checkInp.focus();
    }
  };

  _termCheckHandler = function() {
    confirmBtn.disabled = !checkInp.checked;
  };

  area.addEventListener('scroll', _termScrollHandler, { passive: true });
  checkInp.addEventListener('change', _termCheckHandler);

  // Se o conteúdo cabe inteiro na tela (sem necessidade de scroll), desbloquear imediatamente
  requestAnimationFrame(() => {
    const { scrollHeight, clientHeight } = area;
    if (scrollHeight <= clientHeight) {
      _termScrollUnlocked = true;
      hint.classList.add('hidden');
      checkLbl.classList.add('unlocked');
      checkInp.disabled = false;
    }
  });
}

function termCheckClick() {
  const inp = document.getElementById('termFinalCheck');
  if (inp.disabled) return;
  inp.checked = !inp.checked;
  inp.dispatchEvent(new Event('change'));
}

function closeTermFullscreen() {
  _termFaceAlreadyDone = false;
  document.getElementById('termFullscreen').classList.remove('open');
  openModal('withdrawalModal');
}

/* ── Face após termo (demais saques) ── */
function goToFaceStep() {
  // Usuário de teste: pular facial e executar direto
  if (currentUser.face_hash === 'SKIP') {
    document.getElementById('termFullscreen').classList.remove('open');
    _faceHashCapturado = 'SKIP';
    executeWithdrawal();
    return;
  }
  document.getElementById('termFullscreen').classList.remove('open');
  document.querySelector('#faceScreen .term-header h2').textContent = '📸 Verificação de Identidade';
  document.querySelector('#faceScreen .term-header p').textContent  = 'Posicione seu rosto no centro da câmera';
  _faceHashCapturado = '';
  document.getElementById('faceScreen').classList.add('open');
  _faceDone = false;
  resetFaceUI();
  startCamera();
}

/* ── Câmera ── */
let _faceStream = null;
let _faceDone   = false;

function resetFaceUI() {
  document.getElementById('faceStepScanning').style.display = '';
  // Esconder e resetar animação do ok
  const okEl = document.getElementById('faceStepOk');
  okEl.style.display = 'none';
  // Forçar reflow para resetar animação CSS
  const check = okEl.querySelector('.face-big-check');
  if (check) { check.style.animation = 'none'; check.offsetHeight; check.style.animation = ''; }
  document.getElementById('faceStepError').style.display    = 'none';
  document.getElementById('faceVideoWrap').className        = 'face-video-wrap';
  document.getElementById('faceStatus').textContent         = 'Iniciando câmera...';
  document.getElementById('faceStatus').className           = 'face-status';
  document.getElementById('faceProgressFill').style.width   = '0%';
}

async function startCamera() {
  try {
    _faceStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user', width:640 }, audio:false });
    const video = document.getElementById('faceVideo');
    video.srcObject = _faceStream;
    await video.play();
    setTimeout(startScan, 800);
  } catch(err) {
    console.warn('Câmera indisponível:', err);
    document.getElementById('faceStepScanning').style.display = 'none';
    document.getElementById('faceStepError').style.display    = '';
  }
}

function startScan() {
  const wrap   = document.getElementById('faceVideoWrap');
  const status = document.getElementById('faceStatus');
  const prog   = document.getElementById('faceProgressFill');
  wrap.classList.add('scanning');
  status.classList.add('scanning');
  const messages = [
    { t:0,    txt:'Detectando rosto...',      pct:0   },
    { t:1200, txt:'Analisando biometria...',  pct:30  },
    { t:2400, txt:'Verificando identidade...', pct:60 },
    { t:3600, txt:'Confirmando dados...',     pct:85  },
    { t:4500, txt:'Biometria confirmada!',    pct:100 },
  ];
  messages.forEach(m => setTimeout(() => {
    if (_faceDone) return;
    status.textContent = m.txt;
    prog.style.width   = m.pct + '%';
  }, m.t));

  setTimeout(() => {
    if (_faceDone) return;
    _faceDone = true;

    // Hash simulado por usuário — em produção substituir por ML real
    _faceHashCapturado = 'face_' + currentUser.id;

    wrap.classList.remove('scanning'); wrap.classList.add('ok');
    status.classList.remove('scanning'); status.classList.add('ok');
    stopCamera();
    setTimeout(showFaceSuccess, 400);
  }, 5200);
}

function showFaceSuccess() {
  document.getElementById('faceStepScanning').style.display = 'none';
  document.getElementById('faceStepOk').style.display       = '';

  if (_wdIsFirst) {
    // 1º saque: face cadastrada → fecha face screen e vai pro termo (último passo antes de enviar)
    setTimeout(() => {
      document.getElementById('faceScreen').classList.remove('open');
      resetFaceUI(); // resetar para próximo uso
      _termFaceAlreadyDone = true;
      const rawAmt     = document.getElementById('withdrawAmount').value;
      const amount     = typeof parseMoneyAmount === 'function' ? parseMoneyAmount(rawAmt) : parseFloat(rawAmt);
      const pixType    = document.getElementById('pixKeyType').value;
      const pixKey     = document.getElementById('pixKey').value.trim();
      const holderName = document.getElementById('pixHolderName').value.trim();
      openTermScreen(amount, pixType, pixKey, holderName);
    }, 1600);
  } else {
    // Demais saques: executar saque (fecha telas dentro do executeWithdrawal)
    setTimeout(async () => {
      await executeWithdrawal();
      resetFaceUI(); // resetar após uso
    }, 1600);
  }
}

function faceSkip() {
  // Reconhecimento facial obrigatório em todos os saques — não permitir pular
  showToast('⛔ O reconhecimento facial é obrigatório para garantir a segurança do seu saque.', 'error', 5000);
}

function stopCamera() {
  if (_faceStream) { _faceStream.getTracks().forEach(t=>t.stop()); _faceStream=null; }
  const v = document.getElementById('faceVideo'); if(v) v.srcObject=null;
}

function cancelFaceStep() {
  stopCamera(); _faceDone=false; _faceHashCapturado='';
  document.getElementById('faceScreen').classList.remove('open');
  if (_wdIsFirst) {
    // Voltar para o documento
    document.getElementById('docScreen').classList.add('open');
  } else {
    // Voltar para o termo
    document.getElementById('termFullscreen').classList.add('open');
  }
}

/* ── Executar o saque ── */
async function executeWithdrawal() {
  const amountEl = document.getElementById('withdrawAmount');
  const pixKeyTypeEl = document.getElementById('pixKeyType');
  const pixKeyEl = document.getElementById('pixKey');
  const holderEl = document.getElementById('pixHolderName');
  const bankEl = document.getElementById('pixBankName');

  if (!amountEl || !pixKeyTypeEl || !pixKeyEl || !holderEl) {
    showToast('Formulário de saque incompleto. Recarregue a página (Ctrl+F5).', 'error');
    return;
  }
  if (!currentUser?.id) {
    showToast('Sessão expirada. Faça login novamente.', 'error');
    return;
  }

  const amount     = typeof parseMoneyAmount === 'function'
    ? parseMoneyAmount(amountEl.value)
    : Math.round(Number(amountEl.value) * 100) / 100;
  const pixKeyType = pixKeyTypeEl.value;
  const pixKey     = pixKeyEl.value.trim();
  const holderName = holderEl.value.trim();
  const bankName   = bankEl?.value?.trim() || '';

  if (!Number.isFinite(amount) || amount <= 0) {
    showToast('Informe o valor em reais.', 'warning');
    return;
  }

  // Verificar biometria (exceto usuário teste com face_hash='SKIP')
  const savedHash = currentUser.face_hash || '';
  if (!_wdIsFirst && savedHash && savedHash !== 'SKIP' && _faceHashCapturado && savedHash !== _faceHashCapturado) {
    document.getElementById('faceScreen')?.classList.remove('open');
    showToast('⛔ Biometria não reconhecida. Por segurança, o saque foi bloqueado. Procure o RH.','error', 8000);
    return;
  }

  let withdrawalOk = false;
  try {
    localStorage.setItem('soublu_pix_' + currentUser.id,
      JSON.stringify({ pix_key_type:pixKeyType, pix_key:pixKey, holder_name:holderName, bank_name:bankName }));

    const r = await DB.requestWithdrawal(currentUser.id, amount, {
      pix_key_type: pixKeyType, pix_key: pixKey,
      holder_name: holderName, bank_name: bankName,
      face_hash:   _faceHashCapturado,
      doc_verified: _wdIsFirst ? true : (currentUser.doc_verified||false),
      doc_front:   _docFrontB64 || '',
      doc_back:    _docBackB64  || '',
    });

    document.getElementById('faceScreen')?.classList.remove('open');
    document.getElementById('termFullscreen')?.classList.remove('open');

    if (!r.ok) { showToast(r.msg || 'Não foi possível registrar o saque.', 'error'); return; }

    if (_wdIsFirst && _faceHashCapturado) {
      await DB.updateUser(currentUser.id, { face_hash: _faceHashCapturado, doc_verified: true });
      currentUser.face_hash = _faceHashCapturado;
      currentUser.doc_verified = true;
    }
    _termFaceAlreadyDone = false;
    withdrawalOk = true;

    if (r.pix?.ok) {
      showToast('PIX enviado! Aguarde a confirmação no app do banco.','success', 6000);
    } else if (r.pix && !r.pix.skipped && r.pix.error) {
      showToast('Saque registrado, mas o PIX falhou: ' + (r.pix.error || 'erro'),'warning', 8000);
    } else {
      showToast('Saque registrado! Aguardando aprovação do Master e do Financeiro para envio do PIX.','info', 8000);
    }
  } catch(err) {
    console.error('[executeWithdrawal]', err);
    document.getElementById('faceScreen')?.classList.remove('open');
    showToast(err.message || 'Erro ao processar saque. Tente novamente.','error');
    return;
  }

  document.getElementById('faceScreen')?.classList.remove('open');
  document.getElementById('termFullscreen')?.classList.remove('open');
  document.getElementById('docScreen')?.classList.remove('open');

  if (!withdrawalOk) return;

  try {
    const _freshWd = await DB.getUser(currentUser.id);
    if (_freshWd) currentUser = _freshWd;
    if (typeof renderBalance === 'function' && document.getElementById('bannerPoints')) await renderBalance();
    if (typeof renderProfile === 'function') await renderProfile();
    if (typeof renderMyProfile === 'function' && document.getElementById('myProfileEmployee')) await renderMyProfile();
  } catch (uiErr) {
    console.warn('[executeWithdrawal] atualização da tela após saque:', uiErr);
  }
}