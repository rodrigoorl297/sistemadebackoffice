// Atualiza label com nome do arquivo e botão de visualização
function updateFileLabel(inputId, labelId) {
  const input = document.getElementById(inputId);
  const label = document.getElementById(labelId);
  if (!input || !label) return;
  const f = input.files && input.files[0];
  if (f) {
    const url = URL.createObjectURL(f);
    label.innerHTML =
      `<span style="color:var(--color-success);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;display:inline-block;vertical-align:middle;" title="${f.name}">${f.name}</span>` +
      `<a href="${url}" target="_blank" title="Visualizar" style="margin-left:6px;font-size:18px;text-decoration:none;vertical-align:middle;">👁</a>`;
  } else {
    label.innerHTML = '<span style="color:#999;">-</span>';
  }
}

window.Clients = {
  init: function() {
    // bind events if needed
  },

  openModal: function() {
    try {
      const fields = [
        'clientCpf', 'clientName', 'clientPhone1', 'clientPhone2', 
        'clientRg', 'clientCivil', 'clientAddress', 'clientEmail', 
        'clientMother', 'clientFather', 'clientRgFront', 'clientRgBack', 'clientAddressDoc'
      ];
      
      fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.value = '';
      });

      ['clientRgFrontLabel', 'clientRgBackLabel', 'clientAddressDocLabel'].forEach(id => {
        const lbl = document.getElementById(id);
        if (lbl) { lbl.textContent = '-'; lbl.style.color = '#999'; }
      });

      const modal = document.getElementById('clientModal');
      if (modal) {
        modal.classList.add('open');
      } else {
        alert("Erro: O formulário de cliente não foi encontrado.");
      }
    } catch (e) {
      alert("Erro ao abrir formulário: " + e.message);
    }
  },

  readFileAsBase64: function(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  },

  save: async function() {
    try {
      const cpfStr = document.getElementById('clientCpf').value;
      const cpf = cpfStr.replace(/\D/g, '');
      const name = document.getElementById('clientName').value;

      if (!cpf || cpf.length !== 11) {
        alert("Por favor, digite um CPF válido com 11 dígitos.");
        return;
      }
      if (!name) {
        alert("Por favor, digite o nome completo.");
        return;
      }

      // Validar documentos obrigatórios
      const rgFrontFile = document.getElementById('clientRgFront').files[0];
      const rgBackFile = document.getElementById('clientRgBack').files[0];
      const addressFile = document.getElementById('clientAddressDoc').files[0];

      if (!rgFrontFile) {
        alert("⚠️ RG Frente é obrigatório!");
        return;
      }
      if (!rgBackFile) {
        alert("⚠️ RG Verso é obrigatório!");
        return;
      }
      if (!addressFile) {
        alert("⚠️ Comprovante de Endereço é obrigatório!");
        return;
      }

      // Change button text
      const saveBtn = document.querySelector('#clientModal .btn-primary');
      let oldText = 'Salvar Cliente';
      if (saveBtn) {
        oldText = saveBtn.innerText;
        saveBtn.innerText = 'Salvando...';
        saveBtn.disabled = true;
      }

      const documents = {
        rgFront: rgFrontFile ? { name: rgFrontFile.name, size: rgFrontFile.size, type: rgFrontFile.type } : null,
        rgBack: rgBackFile ? { name: rgBackFile.name, size: rgBackFile.size, type: rgBackFile.type } : null,
        address: addressFile ? { name: addressFile.name, size: addressFile.size, type: addressFile.type } : null
      };

      const clientData = {
        id: cpf,
        cpf: cpf,
        name: name,
        supervisorId: Auth.getSession().id,
        phone1: document.getElementById('clientPhone1').value,
        phone2: document.getElementById('clientPhone2').value,
        rg: document.getElementById('clientRg').value,
        civilState: document.getElementById('clientCivil').value,
        address: document.getElementById('clientAddress').value,
        email: document.getElementById('clientEmail').value,
        motherName: document.getElementById('clientMother').value,
        fatherName: document.getElementById('clientFather').value,
        documents: documents,
        updatedAt: new Date().toISOString()
      };

      const modal = document.getElementById('clientModal');
      const editCpf = modal?.dataset?.editCpf;
      if (editCpf && editCpf !== cpf) {
        try { await DB.delete('clients', editCpf); } catch(e) {}
      }
      if (modal) delete modal.dataset.editCpf;

      try {
        await DB.save('clients', clientData);
      } catch (e) {
        console.warn('Erro ao salvar em Supabase, tentando localStorage:', e.message);
        if (DB._lget && DB._lset) {
          const clients = DB._lget(DB.LK.clients) || [];
          const idx = clients.findIndex(c => c.id === cpf);
          if (idx >= 0) clients[idx] = clientData;
          else clients.push(clientData);
          DB._lset(DB.LK.clients, clients);
        }
      }
      
      if (saveBtn) { saveBtn.innerText = oldText; saveBtn.disabled = false; }
      alert("Cliente salvo com sucesso!");
      document.getElementById('clientModal').classList.remove('open');
      if (typeof invalidateClientsListCache === 'function') invalidateClientsListCache();
      if (typeof renderClientsTable === 'function') await renderClientsTable(true);
      else await this.renderEmployeeList();
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar cliente: " + e.message);
      const saveBtn = document.querySelector('#clientModal .btn-primary');
      if (saveBtn) { saveBtn.innerText = 'Salvar Cliente'; saveBtn.disabled = false; }
    }
  },

  renderEmployeeList: async function() {
    try {
      const listEl = document.getElementById('clientsList');
      if (!listEl) return;

      const user = typeof Auth !== 'undefined' ? await Auth.getCurrentUser() : null;
      const clients = await DB.getClients({
        supervisorId: user?.id,
        pageSize: 100,
      }) || [];
      
      if (clients.length === 0) {
        listEl.innerHTML = '<p>Nenhum cliente cadastrado.</p>';
        return;
      }

      let html = '';
      clients.forEach(c => {
          html += `
            <div class="card" style="padding: 16px; margin-bottom: 12px; display:flex; gap: 16px; align-items:center;">
               ${typeof avatarHtml === 'function' ? avatarHtml(c.name, 'avatar-md') : ''}
               <div style="flex:1;">
                 <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 4px;">
                    <strong style="font-size:16px; font-weight:700;">${c.name}</strong>
                 </div>
                 <div style="font-size:14px; margin-bottom:2px;">CPF: ${c.cpf} &nbsp;|&nbsp; RG: ${c.rg || 'Não informado'}</div>
                 <div style="color: var(--color-text-muted); font-size: 13px;">Celular: ${c.phone1 || 'Não informado'} &nbsp;|&nbsp; Email: ${c.email || 'Não informado'}</div>
               </div>
            </div>
          `;
      });
      listEl.innerHTML = html;
    } catch (e) {
      console.error("Erro ao listar clientes", e);
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('clientsList')) {
        Clients.renderEmployeeList();
    }
});