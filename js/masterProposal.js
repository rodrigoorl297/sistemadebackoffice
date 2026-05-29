/* ==========================================================
   SOU + BLU – Master Proposal Manager v3 [OTIMIZADO]
   ========================================================== */

// Reuso do utilitário de CPF (idealmente centralizado em utils.js, mas mantido aqui para independência do módulo)
const CPFUtils = {
  isValid(cpf) {
    cpf = cpf.replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    let sum = 0, rest;
    for (let i = 1; i <= 9; i++) sum += parseInt(cpf.substring(i-1, i)) * (11 - i);
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    if (rest !== parseInt(cpf.substring(9, 10))) return false;
    sum = 0;
    for (let i = 1; i <= 10; i++) sum += parseInt(cpf.substring(i-1, i)) * (12 - i);
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    return rest === parseInt(cpf.substring(10, 11));
  }
};

window.masterProposalManager = {
  init() {
    // Reset da Interface
    const formArea = document.getElementById('masterPropFormArea');
    if (formArea) formArea.style.display = 'none';
    
    const fields = [
      'masterPropCpf', 'masterPropProduct', 'masterPropConvenio', 
      'masterPropEntidade', 'masterPropObs', 'masterPropClientName'
    ];
    
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const summary = document.getElementById('masterPropClientSummary');
    if (summary) summary.innerHTML = '';
  },

  async searchCpf() {
    const cpfInput = document.getElementById('masterPropCpf');
    const cpf = cpfInput.value.replace(/\D/g, '');
    
    if (!CPFUtils.isValid(cpf)) {
      return showToast("Por favor, digite um CPF válido.", 'warning');
    }
    
    const btn = event.target;
    const oldText = btn.innerText;
    
    // Proteção UI: Impede múltiplos cliques
    btn.innerText = 'Buscando...';
    btn.disabled = true;

    try {
      const client = await DB.get('clients', cpf);
      const formArea = document.getElementById('masterPropFormArea');
      
      if (client) {
        document.getElementById('masterPropClientSummary').innerHTML = `
          <strong>Nome:</strong> ${client.name}<br>
          <strong>Celular:</strong> ${client.phone1 || 'Não informado'}<br>
          <strong>Email:</strong> ${client.email || 'Não informado'}
        `;
        document.getElementById('masterPropClientName').value = client.name;
        formArea.style.display = 'block';
        showToast("Cliente encontrado!", 'success');
      } else {
        formArea.style.display = 'none';
        showToast("Cliente não encontrado. Cadastre-o primeiro.", 'warning');
      }
    } catch (e) {
      console.error(e);
      showToast("Erro ao buscar cliente: " + e.message, 'error');
    } finally {
      // Restaura o botão
      btn.innerText = oldText;
      btn.disabled = false;
    }
  },

  async submit() {
    const user = Auth.getSession();
    if (!user) return showToast("Erro de autenticação. Faça login novamente.", 'error');

    const cpf = document.getElementById('masterPropCpf').value.replace(/\D/g, '');
    const name = document.getElementById('masterPropClientName').value;
    const product = document.getElementById('masterPropProduct').value;
    const convenio = document.getElementById('masterPropConvenio').value;
    const entidade = document.getElementById('masterPropEntidade').value;
    const obs = document.getElementById('masterPropObs').value;
    
    if (!cpf || !name || !product) {
      return showToast("Preencha os campos obrigatórios (CPF, Cliente, Produto).", 'warning');
    }

    const saveBtn = document.querySelector('#masterPropFormArea .btn-primary');
    const oldText = saveBtn.innerText;
    
    saveBtn.innerText = 'Enviando...';
    saveBtn.disabled = true;

    try {
      const proposal = {
        id: `PROP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        vendorId: user.id,
        vendorName: user.name,
        clientCpf: cpf,
        clientName: name,
        product,
        convenio,
        entidade,
        obs,
        attachments: {},
        status: 'Em Andamento',
        history: [{
          date: new Date().toISOString(),
          actorName: user.name,
          action: 'Proposta Criada pelo Master',
          note: obs
        }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await DB.save('proposals', proposal);
      
      showToast(`Proposta cadastrada! ID: ${proposal.id}`, 'success');
      this.init();
      
      // Atualiza a lista na UI se o objeto Proposals existir
      if (window.Proposals?.renderAdminList) {
        await window.Proposals.renderAdminList();
      }
    } catch(e) {
      console.error(e);
      showToast("Erro ao enviar proposta: " + e.message, 'error');
    } finally {
      if (saveBtn) { 
        saveBtn.innerText = oldText; 
        saveBtn.disabled = false; 
      }
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  if (window.masterProposalManager) {
    window.masterProposalManager.init();
  }
});