window.Tickets = {
  departments: ['Financeiro', 'RH', 'Operacional', 'Supervisão', 'Ouvidoria', 'Desenvolvimento'],
  subjects: {
    'Financeiro': ['Alteração dados bancários', 'Representação de pagamentos', 'Contestação pontuação', 'Outros assuntos'],
    'RH': ['Contra cheque', 'Atestado médico', 'Alteração de dados', 'Pedido de demissão', 'Outros assuntos'],
    'Operacional': ['Dúvidas', 'Status proposta', 'Atuação proposta', 'Cancelamento proposta', 'Representação pagamento', 'Solicitação Boleto', 'Averbação proposta', 'Solicitação novo link', 'Solicitação de novo contato', 'Solicitação link chamada vídeo'],
    'Supervisão': ['Solicitação Treinamento', 'Justificativa de Falta', 'Parcial 12:00', 'Fechamento'],
    'Ouvidoria': ['Sugestão', 'Reclamação'],
    'Desenvolvimento': ['Bug ou erro na plataforma', 'Nova funcionalidade / melhoria', 'Acesso e permissões', 'Outros']
  },
  init: function() {
    this.populateDepts();
  },

  populateDepts: function() {
    const deptSelect = document.getElementById('ticketDept');
    if (!deptSelect) return;
    
    const user = Auth.getSession();
    
    let html = '<option value="">Selecione o Departamento</option>';
    this.departments.forEach(dept => {
        if (typeof Auth.canOpenTicketTo === 'function' && Auth.canOpenTicketTo(dept)) {
            html += '<option value="'+dept+'">'+dept+'</option>';
        } else if (typeof Auth.canOpenTicketTo !== 'function') {
            html += '<option value="'+dept+'">'+dept+'</option>';
        }
    });
    deptSelect.innerHTML = html;
  },

  updateSubjects: function() {
    const dept = document.getElementById('ticketDept').value;
    const subjectSelect = document.getElementById('ticketSubject');
    if (!subjectSelect) return;
    
    let html = '<option value="">Selecione o Assunto</option>';
    if (dept && this.subjects[dept]) {
        this.subjects[dept].forEach(sub => {
           html += '<option value="'+sub+'">'+sub+'</option>';
        });
    }
    subjectSelect.innerHTML = html;
  },

  readFileAsBase64: function(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  },

  submit: async function() {
    const user = Auth.getSession();
    const dept = document.getElementById('ticketDept').value;
    const subject = document.getElementById('ticketSubject').value;
    const desc = document.getElementById('ticketDesc').value;
    
    if (!dept || !subject || !desc) {
      alert("Preencha departamento, assunto e descrição.");
      return;
    }
    
    let attachment = null;
    const file = document.getElementById('ticketFile').files[0];
    if (file) {
      try {
         attachment = await this.readFileAsBase64(file);
      } catch(e) {
         alert("Erro ao anexar arquivo.");
         return;
      }
    }

    const ticket = {
      id: 'TKT-' + Date.now(),
      openedById: user.id,
      openedByName: user.name,
      openedByDept: user.department,
      targetDept: dept,
      subject: subject,
      status: 'aberto', 
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      thread: [
        {
           senderName: user.name,
           senderRole: user.role,
           message: desc,
           attachment: attachment,
           date: new Date().toISOString()
        }
      ]
    };

    await DB.save('tickets', ticket);
    alert("Chamado aberto com sucesso!");
    
    document.getElementById('ticketDept').value = '';
    document.getElementById('ticketSubject').value = '';
    document.getElementById('ticketDesc').value = '';
    document.getElementById('ticketFile').value = '';
    
    this.renderEmployeeList();
  },

  renderEmployeeList: async function() {
    const listEl = document.getElementById('ticketsList');
    if (!listEl) return;
    
    const user = Auth.getSession();
    const tickets = await DB.list('tickets') || [];
    
    const myTickets = tickets.filter(t => t.openedById === user.id);
    
    if (myTickets.length === 0) {
      listEl.innerHTML = '<p>Nenhum chamado aberto.</p>';
      return;
    }
    
    myTickets.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    
    let html = '';
    myTickets.forEach(t => {
        let statusColor = '#3b82f6';
        if(t.status === 'em_andamento') statusColor = '#f59e0b';
        if(t.status === 'resolvido') statusColor = '#10b981';
        
        let statusText = t.status === 'em_andamento' ? 'Em Andamento' : 
                         t.status === 'resolvido' ? 'Resolvido' : 'Aberto';

        html += `
          <div style="border:1px solid var(--color-border); border-radius: var(--radius-md); padding: 15px; margin-bottom: 10px;">
             <div style="display:flex; justify-content: space-between; margin-bottom: 10px;">
                <strong>${t.id} - Para: ${t.targetDept}</strong>
                <span style="background:${statusColor}; color:white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">${statusText}</span>
             </div>
             <div><strong>Assunto:</strong> ${t.subject}</div>
             <div style="font-size: 13px; margin-top: 8px;"><em>Última atualização: ${new Date(t.updatedAt).toLocaleString()}</em></div>
             <div style="margin-top: 10px;">
               <button class="btn btn-outline btn-sm" onclick="Tickets.openModal('${t.id}')">Ver Detalhes/Responder</button>
             </div>
          </div>
        `;
    });
    listEl.innerHTML = html;
  },

  renderAdminList: async function() {
    const tbody = document.getElementById('manageTicketsTbody');
    if (!tbody) return;
    
    const user = Auth.getSession();
    const tickets = await DB.list('tickets') || [];
    
    let filteredTickets = tickets.filter(t => {
       if (typeof Auth.canReplyToTicket === 'function') {
           return Auth.canReplyToTicket(t.targetDept);
       }
       return true;
    });
    
    filteredTickets.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    
    let html = '';
    filteredTickets.forEach(t => {
        let statusColor = '#3b82f6';
        if(t.status === 'em_andamento') statusColor = '#f59e0b';
        if(t.status === 'resolvido') statusColor = '#10b981';
        
        let statusText = t.status === 'em_andamento' ? 'Em Andamento' : 
                         t.status === 'resolvido' ? 'Resolvido' : 'Aberto';

        html += `
          <tr>
            <td>${t.id}</td>
            <td>${t.openedByName} (${t.openedByDept || 'N/A'})</td>
            <td>${t.targetDept} - ${t.subject}</td>
            <td>${new Date(t.createdAt).toLocaleDateString()}</td>
            <td><span style="background:${statusColor}; color:white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">${statusText}</span></td>
            <td>
               <button class="btn btn-outline btn-sm" onclick="Tickets.openModal('${t.id}')">Tratar</button>
            </td>
          </tr>
        `;
    });
    tbody.innerHTML = html;
  },

  openModal: async function(id) {
    const ticket = await DB.get('tickets', id);
    if (!ticket) return;

    document.getElementById('manageTicketId').value = ticket.id;
    
    let infoHtml = `
      <strong>De:</strong> ${ticket.openedByName} (${ticket.openedByDept})<br>
      <strong>Para (Depto):</strong> ${ticket.targetDept}<br>
      <strong>Assunto:</strong> ${ticket.subject}<br>
      <strong>Criado em:</strong> ${new Date(ticket.createdAt).toLocaleString()}
    `;
    document.getElementById('manageTicketInfo').innerHTML = infoHtml;
    
    if (document.getElementById('manageTicketStatus')) {
        document.getElementById('manageTicketStatus').value = ticket.status;
    }
    document.getElementById('manageTicketReply').value = '';

    let threadHtml = '';
    if (ticket.thread) {
       ticket.thread.forEach(msg => {
          let attHtml = '';
          if (msg.attachment) {
             attHtml = '<div style="margin-top: 5px;"><a href="'+msg.attachment+'" target="_blank" style="font-size: 12px; color: var(--color-primary); text-decoration: underline;">Ver Anexo</a></div>';
          }
          
          let align = (msg.senderName === ticket.openedByName) ? 'text-align: left;' : 'text-align: right; background: #e0f2fe;';
          
          threadHtml += `
            <div style="border-bottom: 1px solid #ccc; padding: 10px; margin-bottom: 5px; border-radius: 4px; ${align}">
               <div style="font-size: 12px; color: var(--color-text-muted);"><strong>${msg.senderName}</strong> em ${new Date(msg.date).toLocaleString()}</div>
               <div style="margin-top: 5px;">${msg.message}</div>
               ${attHtml}
            </div>
          `;
       });
    }
    document.getElementById('manageTicketThread').innerHTML = threadHtml;

    document.getElementById('manageTicketModal').classList.add('open');
  },

  reply: async function() {
    const user = Auth.getSession();
    const id = document.getElementById('manageTicketId').value;
    const ticket = await DB.get('tickets', id);
    if (!ticket) return;

    const replyText = document.getElementById('manageTicketReply').value;
    let newStatus = ticket.status;
    if (document.getElementById('manageTicketStatus')) {
        newStatus = document.getElementById('manageTicketStatus').value;
    }

    if (!replyText && newStatus === ticket.status) {
       alert("Digite uma resposta ou altere o status.");
       return;
    }

    ticket.status = newStatus;
    ticket.updatedAt = new Date().toISOString();

    if (replyText) {
       ticket.thread = ticket.thread || [];
       ticket.thread.push({
         senderName: user.name,
         senderRole: user.role,
         message: replyText,
         attachment: null,
         date: new Date().toISOString()
       });
    }

    await DB.save('tickets', ticket);
    alert('Chamado atualizado!');
    document.getElementById('manageTicketModal').classList.remove('open');
    
    if (document.getElementById('manageTicketsTbody')) {
       this.renderAdminList();
    }
    if (document.getElementById('ticketsList')) {
       this.renderEmployeeList();
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
    Tickets.init();
    if (document.getElementById('ticketsList')) {
        Tickets.renderEmployeeList();
    }
    if (document.getElementById('manageTicketsTbody')) {
        Tickets.renderAdminList();
    }
});
